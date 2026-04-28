import { NestFactory } from '@nestjs/core';
import { EmailServiceModule } from './email-service.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(EmailServiceModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);

  await app.listen(port);
  console.log(`Email service is running on port ${port}`);
}
bootstrap();
