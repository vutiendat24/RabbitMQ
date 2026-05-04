import { Controller, Get } from '@nestjs/common';
import { EmailServiceService } from './email-service.service';
import { RabbitSubscribe, Nack, AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, BINDING_KEY, QUEUE } from '@libs/common';
import { ConsumeMessage } from 'amqplib';

/**
 * ============================================================
 * DEMO: Message bị xử lý trùng lặp (Idempotency)
 * ============================================================
 *
 * VẤN ĐỀ:
 *   Consumer xử lý xong "trừ tiền 100k" nhưng ack bị timeout.
 *   RabbitMQ tưởng chưa xử lý → requeue → consumer xử lý lại
 *   → TRỪA TIỀN 2 LẦN!
 *
 * CÁCH DEMO:
 *   1. POST http://localhost:3002/payment         → gửi 1 lệnh trừ tiền
 *   2. POST http://localhost:3002/payment-batch   → gửi 3 lệnh trừ tiền
 *   3. GET  http://localhost:3001/balance          → xem số dư hiện tại
 *   4. POST http://localhost:3002/simulate-redelivery → gửi message rồi giả lập redelivery
 *
 * KỊCH BẢN 1 — Không có idempotency (mặc định):
 *   - Gọi /simulate-redelivery → cùng 1 messageId bị xử lý 2 lần → balance trừ 2 lần
 *
 * KỊCH BẢN 2 — Bật idempotency:
 *   - Set IDEMPOTENCY_ENABLED=true (sửa biến bên dưới)
 *   - Gọi /simulate-redelivery → lần 2 bị SKIP → balance chỉ trừ 1 lần
 *
 * ⚡ Toggle: Đổi IDEMPOTENCY_ENABLED = true/false để so sánh
 */
@Controller()
export class EmailServiceController {
  // ===========================================================
  // ⚡ TOGGLE: Đổi thành true để bật idempotency check
  // ===========================================================
  private readonly IDEMPOTENCY_ENABLED = false;

  // Giả lập tài khoản ngân hàng
  private balance = 1_000_000; // 1 triệu VNĐ
  private transactionLog: Array<{
    messageId: string;
    amount: number;
    balanceAfter: number;
    time: string;
    action: 'DEDUCTED' | 'SKIPPED';
  }> = [];

  // Danh sách messageId đã xử lý (production: dùng Redis hoặc DB)
  private processedIds = new Set<string>();

  constructor(
    private readonly emailServiceService: EmailServiceService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  // ===========================================================
  // API: Xem số dư và lịch sử giao dịch
  // ===========================================================
  @Get()
  getHello(): string {
    return `💰 Idempotency Demo | Balance: ${this.balance.toLocaleString()}đ | Idempotency: ${this.IDEMPOTENCY_ENABLED ? 'ON ✅' : 'OFF ❌'}`;
  }

  @Get('balance')
  getBalance() {
    return {
      balance: this.balance,
      balanceFormatted: `${this.balance.toLocaleString()}đ`,
      idempotencyEnabled: this.IDEMPOTENCY_ENABLED,
      processedMessageIds: Array.from(this.processedIds),
      transactionLog: this.transactionLog,
    };
  }

  @Get('reset')
  resetBalance() {
    this.balance = 1_000_000;
    this.processedIds.clear();
    this.transactionLog = [];
    console.log(`\n${'🔄'.repeat(20)}`);
    console.log(`[RESET] Balance = 1,000,000đ | processedIds cleared`);
    console.log(`${'🔄'.repeat(20)}\n`);
    return {
      message: 'Reset thành công',
      balance: this.balance,
      balanceFormatted: '1,000,000đ',
    };
  }

  // ===========================================================
  // CONSUMER: Xử lý thanh toán — trừ tiền
  // ===========================================================
  @RabbitSubscribe({
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
    queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
    queueOptions: {
      durable: true,
    },
  })
  async processPayment(msg: any, amqpMsg: ConsumeMessage) {
    const messageId = amqpMsg.properties.messageId || 'unknown';
    const redelivered = amqpMsg.fields.redelivered;
    const timestamp = new Date().toLocaleTimeString('vi-VN');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${timestamp}] 💳 Nhận lệnh thanh toán`);
    console.log(`  📋 Message ID : ${messageId}`);
    console.log(`  💰 Số tiền    : ${(msg.amount || 0).toLocaleString()}đ`);
    console.log(`  👤 User       : ${msg.userId}`);
    console.log(`  🔁 Redelivered: ${redelivered ? 'CÓ ⚠️ (message bị giao lại)' : 'Không'}`);
    console.log(`  🛡️  Idempotency: ${this.IDEMPOTENCY_ENABLED ? 'BẬT ✅' : 'TẮT ❌'}`);

    // ===========================================================
    // IDEMPOTENCY CHECK — chỉ chạy khi IDEMPOTENCY_ENABLED = true
    // ===========================================================
    if (this.IDEMPOTENCY_ENABLED) {
      if (this.processedIds.has(messageId)) {
        console.log(`\n  🛡️  [IDEMPOTENCY] Message ${messageId} ĐÃ XỬ LÝ RỒI!`);
        console.log(`  ⏭️  SKIP — không trừ tiền lần nữa`);
        console.log(`  💰 Balance giữ nguyên: ${this.balance.toLocaleString()}đ`);

        this.transactionLog.push({
          messageId,
          amount: msg.amount,
          balanceAfter: this.balance,
          time: timestamp,
          action: 'SKIPPED',
        });

        // Ack message (return void) — nhưng KHÔNG xử lý lại
        return;
      }
    }

    // ===========================================================
    // XỬ LÝ THANH TOÁN — trừ tiền
    // ===========================================================
    const balanceBefore = this.balance;
    this.balance -= msg.amount;

    console.log(`\n  💸 TRỪA TIỀN: ${balanceBefore.toLocaleString()}đ - ${msg.amount.toLocaleString()}đ = ${this.balance.toLocaleString()}đ`);

    if (redelivered && !this.IDEMPOTENCY_ENABLED) {
      console.log(`  ⚠️  CẢNH BÁO: Đây là message redelivered và KHÔNG có idempotency check!`);
      console.log(`  ⚠️  → Tiền đã bị trừ LẦN THỨ 2 cho cùng 1 giao dịch!`);
    }

    // Lưu messageId vào danh sách đã xử lý
    this.processedIds.add(messageId);

    this.transactionLog.push({
      messageId,
      amount: msg.amount,
      balanceAfter: this.balance,
      time: timestamp,
      action: 'DEDUCTED',
    });

    // ===========================================================
    // GIẢ LẬP ACK CHẬM — để demo redelivery
    // Nếu msg.simulateSlowAck = true → delay 5s trước khi ack
    // Trong thời gian này, nếu kill process → message bị requeue
    // ===========================================================
    if (msg.simulateSlowAck) {
      console.log(`\n  ⏳ Giả lập ack chậm (5 giây)...`);
      console.log(`  💡 Kill process (Ctrl+C) trong lúc này để tạo redelivery!`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log(`  ✅ Ack thành công (không bị kill)`);
    }

    console.log(`${'='.repeat(60)}\n`);

    // Return void → thư viện tự động ack
    return;
  }
}
