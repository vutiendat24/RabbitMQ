import { ConfigService } from '@nestjs/config';

interface ExchangeConfig {
  name: string;
  type: string;
  options?: { durable?: boolean };
}

interface QueueBindingConfig {
  queue: string;
  durable: boolean;
  exchange: string;
  routingKey: string;
}

export interface ServiceRabbitMQConfig {
  exchanges: ExchangeConfig[];
  queues: QueueBindingConfig[];
}

export function RabbitMQModuleConfig(
  config: ServiceRabbitMQConfig,
  configService: ConfigService,   // Inject ConfigService to access environment variables
) {
  return {
    uri: configService.get<string>('RABBITMQ_URL', 'amqp://admin:admin@localhost:5672'),
    exchanges: config.exchanges.map((ex) => ({
      name: ex.name,
      type: ex.type,
      options: ex.options ?? { durable: true },
    })),
    connectionInitOptions: {
      wait: true,
      timeout: configService.get<number>('RABBITMQ_TIMEOUT', 10000),
    },
    enableControllerDiscovery: true,
  };
}