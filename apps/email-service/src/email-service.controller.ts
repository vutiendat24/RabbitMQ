import { Controller, Get } from '@nestjs/common';
import { EmailServiceService } from './email-service.service';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, BINDING_KEY, QUEUE } from '@libs/common';

@Controller()
export class EmailServiceController {
  constructor(private readonly emailServiceService: EmailServiceService) {}

  @Get()
  getHello(): string {
    return this.emailServiceService.getHello();
  }

  /**
   * ============================================================
   * BÀI 1 - PHẦN 1: DEMO LỖI - Auto-ack (mặc định)
   * ============================================================
   * 
   * Vấn đề: @golevelup/nestjs-rabbitmq mặc định auto-ack khi handler
   * return void. Khi handler throw error → library mặc định nack KHÔNG
   * requeue → message bị xóa khỏi queue → MESSAGE MẤT VĨNH VIỄN!
   * 
   * Cách test:
   * 1. Start email-service:  nest start email-service --watch
   * 2. Start order-service:  nest start order-service --watch
   * 3. POST http://localhost:3000/orders/place-batch
   * 4. Quan sát console email-service → throw error cho mỗi message
   * 5. Vào Management UI (http://localhost:15672)
   *    → Tab Queues → email_service.queue → message = 0 (đã mất!)
   * 
   * Kết quả: 5 đơn hàng đã đặt, 0 email được gửi, 0 message còn trong queue.
   * User KHÔNG nhận được email xác nhận!
   */
  @RabbitSubscribe({
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
    queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
  })
  async sendEmail(msg: any) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Email Service] 📩 Nhận message đơn hàng: ${msg.orderId}`);
    console.log(`[Email Service] 📧 Email tới: ${msg.email}`);
    console.log(`[Email Service] 📦 Sản phẩm: ${msg.product}`);
    console.log(`[Email Service] ⏳ Đang kết nối SMTP server...`);

    // Giả lập crash - SMTP connection failed giữa chừng
    // Trả về Nack(false) để mô phỏng việc Message bị xóa hẳn (không requeue)
    // Thực tế nếu throw Error() ở một số cấu hình, RabbitMQ sẽ requeue gây ra LOOP VÔ HẠN.
    console.error('💥 SMTP connection failed! Message bị loại bỏ khỏi queue (MẤT DỮ LIỆU)!');
    return new Nack(false);
  }
}
