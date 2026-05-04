import { Module } from '@nestjs/common';
import { EmailServiceController } from './email-service.controller';
import { EmailServiceService } from './email-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import {
  BINDING_KEY,
  EXCHANGE,
  QUEUE,
} from '@libs/common';

/**
 * ============================================================
 * Module cho bài demo: Idempotency — tránh xử lý trùng lặp
 * ============================================================
 *
 * Kịch bản:
 *   - order-service publish message "trừ tiền 100k"
 *   - email-service (đóng vai payment consumer) nhận và xử lý
 *   - Consumer xử lý xong nhưng ack bị timeout (network)
 *   - RabbitMQ tưởng chưa xử lý → requeue → consumer xử lý lại
 *   - Kết quả: TRỪA TIỀN 2 LẦN!
 *
 * Fix: Dùng messageId + Set để check trùng (production dùng Redis/DB)
 *
 * ⚠️ LƯU Ý: Phải xóa queue cũ trên Management UI trước khi chạy
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/email-service/src/.env',
    }),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          uri: configService.get<string>('RABBITMQ_URL', 'amqp://admin:admin@localhost:5672'),
          connectionInitOptions: {
            wait: true,
            timeout: configService.get<number>('RABBITMQ_TIMEOUT', 10000),
          },
          enableControllerDiscovery: true,
          prefetchCount: 1, // Xử lý từng message một để dễ demo

          // Khai báo exchanges
          exchanges: [
            {
              name: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
              type: EXCHANGE.EMAIL_SERVICE_DIRECT.type,
              options: { durable: true },
            },
            {
              name: EXCHANGE.DLX_EXCHANGE.name,
              type: EXCHANGE.DLX_EXCHANGE.type,
              options: { durable: true },
            },
          ],
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [EmailServiceController],
  providers: [EmailServiceService],
})
export class EmailServiceModule {}
