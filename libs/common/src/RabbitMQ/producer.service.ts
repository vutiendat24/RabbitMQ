import { AmqpConnection } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";


@Injectable()
export class RabbitMQProducerService {
    constructor(readonly amqpConnection: AmqpConnection) {}
    
    async publish(exchange: string, routingKey: string, message: any) {
        await this.amqpConnection.publish(exchange, routingKey, message);
    }
}
