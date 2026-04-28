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


  @RabbitSubscribe({
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
    queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
  })
  async sendEmail(msg: any, amqpMsg: ConsumeMessage): Promise<void | Nack> {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Giả lập 2s
    console.log(`[${new Date().toISOString()}] Gửi xong:`, msg.to);
  }
}
