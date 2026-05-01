import { Controller, Get } from '@nestjs/common';
import { EmailServiceService } from './email-service.service';
import { RabbitSubscribe, Nack, AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, BINDING_KEY, QUEUE, RETRY_CONFIG } from '@libs/common';
import { ConsumeMessage } from 'amqplib';

/**
 * ============================================================
 * DEMO THỰC TẾ: Retry gửi email khi SMTP server lỗi tạm thời
 * ============================================================
 *
 * Kịch bản thực tế:
 *   - SMTP server đôi khi bị quá tải, trả về lỗi 503
 *   - Lần retry đầu: 70% vẫn lỗi (server chưa phục hồi)
 *   - Lần retry 2: 40% lỗi
 *   - Lần retry 3: 10% lỗi
 *   → Đa số message sẽ thành công sau 1-2 lần retry
 *   → Chỉ message "xui" mới vào DLQ
 *
 * Test:
 *   POST http://localhost:3002/test-retry       → gửi 1 message
 *   POST http://localhost:3002/test-retry-batch  → gửi 5 message (thấy rõ hơn)
 */
@Controller()
export class EmailServiceController {
  constructor(
    private readonly emailServiceService: EmailServiceService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  @Get()
  getHello(): string {
    return this.emailServiceService.getHello();
  }

  // =====================================================
  // GIẢ LẬP SMTP SERVER — tỷ lệ lỗi giảm dần theo retry
  // =====================================================
  private simulateSmtpSend(to: string, retryCount: number): boolean {
    // Tỷ lệ lỗi giảm dần — mô phỏng server phục hồi dần
    const failRates = [0.7, 0.5, 0.3, 0.1];
    const failRate = failRates[retryCount] ?? 0.1;
    const random = Math.random();

    if (random < failRate) {
      // Giả lập các lỗi thực tế từ SMTP server
      const errors = [
        '503 Service Unavailable - Server quá tải',
        '421 Connection timed out - Không kết nối được SMTP',
        '451 Temporary failure - Thử lại sau',
      ];
      const error = errors[Math.floor(Math.random() * errors.length)];
      throw new Error(error);
    }

    return true; // Gửi thành công
  }

  // =====================================================
  // CONSUMER CHÍNH: Xử lý gửi email với retry logic
  // =====================================================
  @RabbitSubscribe({
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
    queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
    queueOptions: {
      durable: true,
    },
  })
  async sendEmail(msg: any, amqpMsg: ConsumeMessage) {
    const retryCount = (amqpMsg.properties.headers?.['x-retry-count'] || 0) as number;
    const timestamp = new Date().toLocaleTimeString('vi-VN');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${timestamp}] 📩 Nhận message (lần thử: ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES + 1})`);
    console.log(`  📧 Tới: ${msg.to}`);
    console.log(`  📋 Đơn hàng: ${msg.orderId}`);

    try {
      // Gọi "SMTP server" — có thể thành công hoặc thất bại
      this.simulateSmtpSend(msg.to, retryCount);

      // ✅ THÀNH CÔNG — không cần retry nữa
      console.log(`  ✅ GỬI EMAIL THÀNH CÔNG tới ${msg.to}`);
      if (retryCount > 0) {
        console.log(`  🎉 Thành công sau ${retryCount} lần retry!`);
      }

      // return void → thư viện tự ack → message bị xóa khỏi queue
      return;

    } catch (error) {
      console.error(`  ❌ Lỗi SMTP: ${error.message}`);

      if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
        // =======================================
        // CÒN LƯỢT RETRY → đẩy vào retry queue
        // =======================================
        const retryInfo = RETRY_CONFIG.QUEUES[retryCount];
        console.log(`  🔄 Retry ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES} → chờ ${retryInfo.ttl / 1000}s rồi thử lại`);

        await this.amqpConnection.publish(
          EXCHANGE.RETRY_EXCHANGE.name,
          retryInfo.routingKey,
          msg,
          {
            headers: { 'x-retry-count': retryCount + 1 },
            persistent: true,
          },
        );

        // ack message cũ — message mới đã vào retry queue
        return;

      } else {
        // =======================================
        // HẾT RETRY → đẩy vào DLQ
        // =======================================
        console.log(`  💀 Đã thử ${RETRY_CONFIG.MAX_RETRIES + 1} lần — CHUYỂN VÀO DLQ`);

        await this.amqpConnection.publish(
          EXCHANGE.DLX_EXCHANGE.name,
          BINDING_KEY.EMAIL_DLQ,
          {
            ...msg,
            _retryInfo: {
              totalAttempts: retryCount + 1,
              finalError: error.message,
              failedAt: new Date().toISOString(),
            },
          },
          { persistent: true },
        );

        return;
      }
    }
  }

  // =====================================================
  // CONSUMER DLQ: Xử lý message chết
  // =====================================================
  @RabbitSubscribe({
    exchange: EXCHANGE.DLX_EXCHANGE.name,
    routingKey: BINDING_KEY.EMAIL_DLQ,
    queue: QUEUE.EMAIL_SERVICE_DLQ.name,
  })
  async handleDeadLetter(msg: any) {
    console.log(`\n${'💀'.repeat(20)}`);
    console.log(`[DLQ] Email không gửi được sau ${msg._retryInfo?.totalAttempts || '?'} lần thử`);
    console.log(`[DLQ] Tới: ${msg.to} | Đơn hàng: ${msg.orderId}`);
    console.log(`[DLQ] Lỗi: ${msg._retryInfo?.finalError || 'N/A'}`);
    console.log(`[DLQ] → Cần xử lý thủ công: gửi lại hoặc thông báo admin`);
    console.log(`${'💀'.repeat(20)}\n`);

    // Thực tế:
    // - Lưu vào bảng failed_emails trong DB
    // - Gửi notification cho admin qua Slack
    // - Hiển thị trên dashboard để retry thủ công
    return;
  }
}
