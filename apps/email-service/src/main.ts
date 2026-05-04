import { NestFactory } from '@nestjs/core';
// ⚠️ Đổi import sang module idempotency-demo
// Để quay lại module cũ: import EmailServiceModule từ './email-service.module'
// Để dùng retry-demo: import từ './email-service.module.retry-demo'
import { EmailServiceModule } from './email-service.module.idempotency-demo';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(EmailServiceModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);

  await app.listen(port);
  console.log(`Email service is running on port ${port}`);
  console.log(`💳 Idempotency Demo: Tránh xử lý trùng lặp khi message bị redelivery`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  http://localhost:${port}/          → Trạng thái`);
  console.log(`   GET  http://localhost:${port}/balance   → Xem số dư + lịch sử`);
  console.log(`   GET  http://localhost:${port}/reset     → Reset về 1,000,000đ`);
}
bootstrap();
