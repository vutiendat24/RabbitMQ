import { Module } from '@nestjs/common';
import { EmailServiceController } from './email-service.controller';
import { EmailServiceService } from './email-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { BINDING_KEY, EXCHANGE, RabbitMQModuleConfig, QUEUE } from '@libs/common';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/email-service/src/.env',
    }),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return RabbitMQModuleConfig(
          {
            exchanges: [
              { name: EXCHANGE.EMAIL_SERVICE_DIRECT.name, type: EXCHANGE.EMAIL_SERVICE_DIRECT.type, options: { durable: true } },
            ],
            queues: [
              {
                queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
                durable: QUEUE.EMAIL_SERVICE_QUEUE.durable,
                exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
                routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
              },
            ],
          },
          configService,
        );
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [EmailServiceController],
  providers: [EmailServiceService],
})
export class EmailServiceModule { }
