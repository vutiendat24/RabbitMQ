import { Controller, Get } from '@nestjs/common';
import { EmailServiceService } from './email-service.service';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, BINDING_KEY, QUEUE } from '@libs/common';
import { ConsumeMessage } from 'amqplib';

@Controller()
export class EmailServiceController {
  constructor(private readonly emailServiceService: EmailServiceService) { }

  @Get()
  getHello(): string {
    return this.emailServiceService.getHello();
  }

  // handle  DLQ event
  @RabbitSubscribe({
    exchange: EXCHANGE.DLX_EXCHANGE.name,
    routingKey: BINDING_KEY.EMAIL_DLQ,
    queue: QUEUE.EMAIL_SERVICE_DLQ.name,
  })
  async handleDeadLetter(msg: any) {
    console.error('[DLQ] Message lỗi:', JSON.stringify(msg));
    // Lưu vào DB hoặc gửi alert
  }

  @RabbitSubscribe({
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
    queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
    queueOptions: {
      deadLetterExchange: EXCHANGE.DLX_EXCHANGE.name,
      deadLetterRoutingKey: BINDING_KEY.EMAIL_DLQ,
    }
  })
  async sendEmail(msg: any, amqpMsg: ConsumeMessage) {
    try {
      if (!msg.to || !msg.to.includes('@')) {
        throw new Error('Invalid email');
      }
      // ... gửi email
      console.log('✅ Gửi email tới:', msg.to);
      return; // Return bình thường → thư viện tự động ack
    } catch (error) {
      console.log('❌ Reject message → chuyển vào DLQ');
      return new Nack(false); // requeue=false → đẩy vào DLX
    }
  }
}
