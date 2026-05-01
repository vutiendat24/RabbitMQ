import { NestFactory } from '@nestjs/core';
// ⚠️ Đổi import sang module retry-demo
// Để quay lại module cũ, import EmailServiceModule từ './email-service.module'
import { EmailServiceModule } from './email-service.module.retry-demo';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(EmailServiceModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);

  await app.listen(port);
  console.log(`Email service is running on port ${port}`);
  console.log(`🔄 Retry Demo: 3 lần retry → DLQ`);
}
bootstrap();
