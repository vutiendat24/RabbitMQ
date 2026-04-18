import { Controller, Get } from '@nestjs/common';
import { EmailServiceService } from './email-service.service';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, BINDING_KEY, QUEUE } from '@libs/common';

@Controller()
export class EmailServiceController {
  constructor(private readonly emailServiceService: EmailServiceService) {}

  @Get()
  getHello(): string {
    return this.emailServiceService.getHello();
  }
  @RabbitSubscribe({
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
    queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
  })
  sendEmail(msg: any) {
    console.log("mo phong gui email den user")
      console.log("mo phong gui email den user")
      console.log("mo phong gui email den user")
  }
}
