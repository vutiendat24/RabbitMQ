import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { BINDING_KEY, EXCHANGE, getRabbitMQModuleConfig, QUEUE } from '@libs/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return getRabbitMQModuleConfig(
          {
            exchanges: [
              { name: EXCHANGE.USER_SERVICE_DIRECT.name, type: EXCHANGE.USER_SERVICE_DIRECT.type, options: { durable: true } },
            ],
            queues: [
              {
                queue: QUEUE.USER_SERVICE_CREATE_USER_QUEUE.name,
                durable: QUEUE.USER_SERVICE_CREATE_USER_QUEUE.durable,
                exchange: EXCHANGE.USER_SERVICE_DIRECT.name,
                routingKey: BINDING_KEY.USER_SERVICE_CREATE_USER,
              },
              {
                queue: QUEUE.USER_SERVICE_UPDATE_USER_QUEUE.name,
                durable: QUEUE.USER_SERVICE_UPDATE_USER_QUEUE.durable,
                exchange: EXCHANGE.USER_SERVICE_DIRECT.name,
                routingKey: BINDING_KEY.USER_SERVICE_UPDATE_USER,
              },
              {
                queue: QUEUE.USER_SERVICE_DELETE_USER_QUEUE.name,
                durable: QUEUE.USER_SERVICE_DELETE_USER_QUEUE.durable,
                exchange: EXCHANGE.USER_SERVICE_DIRECT.name,
                routingKey: BINDING_KEY.USER_SERVICE_DELETE_USER,
              },

            ],
          },
          configService,
        );
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
