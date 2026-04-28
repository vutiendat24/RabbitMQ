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
    for (let i = 0; i < 100; i++) {
      await this.amqpConnection.publish(
        EXCHANGE.EMAIL_SERVICE_DIRECT.name,
        BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
        { to: `user${i}@test.com`, subject: `Email ${i}` },
      );
    }
    return { sent: 100 };
  }
}
