import { Module } from '@nestjs/common';
import { EmailServiceController } from './email-service.controller.retry-demo';
import { EmailServiceService } from './email-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import {
  BINDING_KEY,
  EXCHANGE,
  QUEUE,
  RETRY_CONFIG,
} from '@libs/common';

/**
 * ============================================================
 * Module cho bài demo: Retry 3 lần rồi đẩy vào DLQ
 * ============================================================
 *
 * Kiến trúc queue:
 *
 *   [email_service.direct] ──bind──> [email_service.queue]  (main queue)
 *   [retry.direct]         ──bind──> [email.retry.1]        (TTL 5s,  DLX → email_service.direct)
 *   [retry.direct]         ──bind──> [email.retry.2]        (TTL 15s, DLX → email_service.direct)
 *   [retry.direct]         ──bind──> [email.retry.3]        (TTL 30s, DLX → email_service.direct)
 *   [dlx.direct]           ──bind──> [email_service.dlq]    (dead letter queue)
 *
 * Luồng message khi lỗi:
 *   main queue → (lỗi) → retry.1 → (5s) → main queue
 *             → (lỗi) → retry.2 → (15s) → main queue
 *             → (lỗi) → retry.3 → (30s) → main queue
 *             → (lỗi) → DLQ
 *
 * ⚠️ LƯU Ý: Phải xóa các queue cũ trên Management UI trước khi chạy
 *    vì arguments (TTL, DLX) không thể thay đổi trên queue đã tồn tại.
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
          prefetchCount: 5,

          // Khai báo exchanges
          exchanges: [
            // Exchange chính cho email service
            {
              name: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
              type: EXCHANGE.EMAIL_SERVICE_DIRECT.type,
              options: { durable: true },
            },
            // Exchange cho DLQ
            {
              name: EXCHANGE.DLX_EXCHANGE.name,
              type: EXCHANGE.DLX_EXCHANGE.type,
              options: { durable: true },
            },
            // Exchange cho retry queues
            {
              name: EXCHANGE.RETRY_EXCHANGE.name,
              type: EXCHANGE.RETRY_EXCHANGE.type,
              options: { durable: true },
            },
          ],

          // ====================================================
          // Khai báo retry queues (không có consumer)
          // Mỗi retry queue có:
          //   - TTL (x-message-ttl): thời gian chờ trước khi retry
          //   - DLX trỏ về email_service.direct: hết TTL → message
          //     tự động quay lại main queue
          // ====================================================
          queues: [
            // Retry queue 1: chờ 5s rồi retry
            {
              name: QUEUE.EMAIL_RETRY_1.name,
              createQueueIfNotExists: true,
              options: {
                durable: true,
                arguments: {
                  'x-message-ttl': RETRY_CONFIG.QUEUES[0].ttl,
                  'x-dead-letter-exchange': EXCHANGE.EMAIL_SERVICE_DIRECT.name,
                  'x-dead-letter-routing-key': BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
                },
              },
              exchange: EXCHANGE.RETRY_EXCHANGE.name,
              routingKey: BINDING_KEY.EMAIL_RETRY_1,
            },
            // Retry queue 2: chờ 15s rồi retry
            {
              name: QUEUE.EMAIL_RETRY_2.name,
              createQueueIfNotExists: true,
              options: {
                durable: true,
                arguments: {
                  'x-message-ttl': RETRY_CONFIG.QUEUES[1].ttl,
                  'x-dead-letter-exchange': EXCHANGE.EMAIL_SERVICE_DIRECT.name,
                  'x-dead-letter-routing-key': BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
                },
              },
              exchange: EXCHANGE.RETRY_EXCHANGE.name,
              routingKey: BINDING_KEY.EMAIL_RETRY_2,
            },
            // Retry queue 3: chờ 30s rồi retry
            {
              name: QUEUE.EMAIL_RETRY_3.name,
              createQueueIfNotExists: true,
              options: {
                durable: true,
                arguments: {
                  'x-message-ttl': RETRY_CONFIG.QUEUES[2].ttl,
                  'x-dead-letter-exchange': EXCHANGE.EMAIL_SERVICE_DIRECT.name,
                  'x-dead-letter-routing-key': BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
                },
              },
              exchange: EXCHANGE.RETRY_EXCHANGE.name,
              routingKey: BINDING_KEY.EMAIL_RETRY_3,
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
