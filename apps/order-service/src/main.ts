import { NestFactory } from '@nestjs/core';
import { OrderServiceModule } from './order-service.module';
import { ConfigService } from '@nestjs/config';
async function bootstrap() {
  const app = await NestFactory.create(OrderServiceModule);
  const configService = app.get(ConfigService)
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Order service is running on port ${port}`);
}
bootstrap();
