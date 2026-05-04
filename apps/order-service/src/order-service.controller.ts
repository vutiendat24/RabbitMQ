import { Controller, Get, Post, Body } from '@nestjs/common';
import { OrderServiceService } from './order-service.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, BINDING_KEY } from '@libs/common';
import { randomUUID } from 'crypto';

/**
 * ============================================================
 * Order Service Controller
 * ============================================================
 *
 * Bài 4: Idempotency Demo
 *
 * Endpoints mới:
 *   POST /payment              → Gửi 1 lệnh trừ tiền (có messageId)
 *   POST /payment-batch        → Gửi 3 lệnh trừ tiền (3 messageId khác nhau)
 *   POST /simulate-redelivery  → Gửi 1 message rồi gửi lại với CÙNG messageId
 *                                 → Giả lập tình huống RabbitMQ redeliver
 */
@Controller()
export class OrderServiceController {
  constructor(
    private readonly orderServiceService: OrderServiceService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  @Get()
  getHello(): string {
    return this.orderServiceService.getHello();
  }

  // ===========================================================
  // BÀI 4: IDEMPOTENCY DEMO
  // ===========================================================

  /**
   * Gửi 1 lệnh thanh toán (trừ 100,000đ)
   * POST http://localhost:3002/payment
   */
  @Post('payment')
  async makePayment(@Body() body?: { amount?: number; userId?: string }) {
    const messageId = randomUUID();
    const amount = body?.amount || 100_000;
    const userId = body?.userId || 'user-1';

    await this.amqpConnection.publish(
      EXCHANGE.EMAIL_SERVICE_DIRECT.name,
      BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
      {
        amount,
        userId,
        description: `Thanh toán đơn hàng ORD-${Date.now()}`,
      },
      {
        messageId,
        persistent: true,
      },
    );

    console.log(`📤 [Payment] Gửi lệnh trừ ${amount.toLocaleString()}đ | messageId: ${messageId}`);
    return {
      status: 'sent',
      messageId,
      amount,
      userId,
      note: 'Kiểm tra balance tại GET http://localhost:3001/balance',
    };
  }

  /**
   * Gửi 3 lệnh thanh toán khác nhau
   * POST http://localhost:3002/payment-batch
   */
  @Post('payment-batch')
  async makePaymentBatch() {
    const payments = [
      { amount: 100_000, userId: 'user-1', description: 'Mua sách NestJS' },
      { amount: 200_000, userId: 'user-1', description: 'Mua khóa học RabbitMQ' },
      { amount: 50_000, userId: 'user-1', description: 'Mua sticker laptop' },
    ];

    const results: any[] = [];

    for (const payment of payments) {
      const messageId = randomUUID();
      await this.amqpConnection.publish(
        EXCHANGE.EMAIL_SERVICE_DIRECT.name,
        BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
        payment,
        {
          messageId,
          persistent: true,
        },
      );
      results.push({ messageId, ...payment });
    }

    console.log(`📤 [Payment] Gửi ${payments.length} lệnh thanh toán`);
    return {
      status: 'sent',
      count: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      payments: results,
      note: 'Kiểm tra balance tại GET http://localhost:3001/balance',
    };
  }

  /**
   * ⭐ TRỌNG TÂM BÀI 4: Giả lập redelivery
   *
   * Gửi CÙNG 1 message (cùng messageId) 2 LẦN liên tiếp
   * → Giả lập tình huống RabbitMQ redeliver message khi ack timeout
   *
   * Kết quả:
   *   - Không có idempotency: balance bị trừ 200,000đ (2 lần × 100,000đ)
   *   - Có idempotency:       balance chỉ trừ 100,000đ (lần 2 bị SKIP)
   *
   * POST http://localhost:3002/simulate-redelivery
   */
  @Post('simulate-redelivery')
  async simulateRedelivery(@Body() body?: { amount?: number }) {
    const messageId = randomUUID();
    const amount = body?.amount || 100_000;

    const message = {
      amount,
      userId: 'user-1',
      description: `Thanh toán ORD-${Date.now()}`,
    };

    console.log(`\n${'⚡'.repeat(25)}`);
    console.log(`[SIMULATE] Giả lập redelivery với messageId: ${messageId}`);
    console.log(`[SIMULATE] Gửi lần 1...`);

    // LẦN 1: Gửi message bình thường
    await this.amqpConnection.publish(
      EXCHANGE.EMAIL_SERVICE_DIRECT.name,
      BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
      message,
      {
        messageId,
        persistent: true,
      },
    );

    // Đợi 2s để consumer xử lý xong lần 1
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`[SIMULATE] Gửi lần 2 (cùng messageId — giả lập redelivery)...`);

    // LẦN 2: Gửi LẠI với CÙNG messageId → giả lập redelivery
    await this.amqpConnection.publish(
      EXCHANGE.EMAIL_SERVICE_DIRECT.name,
      BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
      message,
      {
        messageId, // ← CÙNG messageId!
        persistent: true,
      },
    );

    console.log(`[SIMULATE] Đã gửi 2 lần với messageId: ${messageId}`);
    console.log(`${'⚡'.repeat(25)}\n`);

    return {
      status: 'simulated',
      messageId,
      amount,
      sentTimes: 2,
      expectedWithoutIdempotency: `Balance trừ ${(amount * 2).toLocaleString()}đ (2 lần)`,
      expectedWithIdempotency: `Balance trừ ${amount.toLocaleString()}đ (lần 2 bị SKIP)`,
      checkBalance: 'GET http://localhost:3001/balance',
    };
  }

  // ===========================================================
  // ENDPOINTS CŨ (giữ lại từ bài trước)
  // ===========================================================

  @Post('bulk-email')
  async sendBulkEmail() {
    for (let i = 0; i < 10; i++) {
      await this.amqpConnection.publish(
        EXCHANGE.EMAIL_SERVICE_DIRECT.name,
        BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
        {
          to: 'invalid-email',
          subject: 'Test DLQ'
        },
      );
    }
    return { sent: 10 };
  }

  @Post('test-retry')
  async testRetry() {
    const message = {
      to: 'customer@company.com',
      subject: 'Xác nhận đơn hàng',
      body: 'Cảm ơn bạn đã đặt hàng!',
      orderId: `ORD-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    await this.amqpConnection.publish(
      EXCHANGE.EMAIL_SERVICE_DIRECT.name,
      BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
      message,
    );

    console.log(`📤 [Order] Gửi email xác nhận cho đơn ${message.orderId}`);
    return { status: 'sent', orderId: message.orderId };
  }

  @Post('test-retry-batch')
  async testRetryBatch() {
    const customers = [
      { name: 'Nguyễn Văn A', email: 'nva@gmail.com' },
      { name: 'Trần Thị B', email: 'ttb@yahoo.com' },
      { name: 'Lê Văn C', email: 'lvc@outlook.com' },
      { name: 'Phạm Thị D', email: 'ptd@hotmail.com' },
      { name: 'Hoàng Văn E', email: 'hve@company.vn' },
    ];

    const orders: any[] = [];
    for (const customer of customers) {
      const message = {
        to: customer.email,
        subject: `Xác nhận đơn hàng - ${customer.name}`,
        body: `Chào ${customer.name}, đơn hàng của bạn đã được xác nhận!`,
        orderId: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        customerName: customer.name,
        createdAt: new Date().toISOString(),
      };

      await this.amqpConnection.publish(
        EXCHANGE.EMAIL_SERVICE_DIRECT.name,
        BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
        message,
      );

      orders.push(message.orderId);
    }

    console.log(`📤 [Order] Gửi ${customers.length} email xác nhận`);
    return {
      status: 'sent',
      count: customers.length,
      orders,
      note: 'Quan sát console email-service — một số sẽ retry, đa số thành công',
    };
  }
}
