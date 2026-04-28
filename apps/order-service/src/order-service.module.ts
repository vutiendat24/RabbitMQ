import { Module } from '@nestjs/common';
import { OrderServiceController } from './order-service.controller';
import { OrderServiceService } from './order-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, RabbitMQModuleConfig } from '@libs/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/order-service/src/.env',
    }),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return RabbitMQModuleConfig(
          {
            exchanges: [
              {
                name: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
                type: EXCHANGE.EMAIL_SERVICE_DIRECT.type,
                options: { durable: true },
              },
            ],
            queues: [],
          },
          configService,
        );
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [OrderServiceController],
  providers: [OrderServiceService],
})
export class OrderServiceModule {}
