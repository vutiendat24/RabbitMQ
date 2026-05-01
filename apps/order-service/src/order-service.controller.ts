import { Controller, Get, Post } from '@nestjs/common';
import { OrderServiceService } from './order-service.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, BINDING_KEY } from '@libs/common';

@Controller()
export class OrderServiceController {
  constructor(
    private readonly orderServiceService: OrderServiceService,
    private readonly amqpConnection: AmqpConnection,
  ) { }

  @Get()
  getHello(): string {
    return this.orderServiceService.getHello();
  }

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

  /**
   * Test Retry Demo — gửi 1 email
   * POST http://localhost:3002/test-retry
   *
   * SMTP server giả lập lỗi tạm thời với tỷ lệ giảm dần:
   *   Lần 1: 70% lỗi | Lần 2: 50% | Lần 3: 30% | Lần 4: 10%
   * → Đa số message thành công sau 1-2 retry
   * → Chỉ message "xui" mới vào DLQ
   */
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

  /**
   * Test Retry Demo — gửi 5 email cùng lúc
   * POST http://localhost:3002/test-retry-batch
   *
   * Gửi 5 message → quan sát:
   *   - Một số thành công ngay lần đầu
   *   - Một số cần 1-2 lần retry
   *   - Có thể 1 message vào DLQ (nếu xui)
   */
  @Post('test-retry-batch')
  async testRetryBatch() {
    const customers = [
      { name: 'Nguyễn Văn A', email: 'nva@gmail.com' },
      { name: 'Trần Thị B', email: 'ttb@yahoo.com' },
      { name: 'Lê Văn C', email: 'lvc@outlook.com' },
      { name: 'Phạm Thị D', email: 'ptd@hotmail.com' },
      { name: 'Hoàng Văn E', email: 'hve@company.vn' },
    ];

    const orders :any[]= [];
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
