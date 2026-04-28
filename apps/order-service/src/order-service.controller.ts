import { Controller, Get, Post } from '@nestjs/common';
import { OrderServiceService } from './order-service.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, BINDING_KEY } from '@libs/common';

@Controller()
export class OrderServiceController {
  constructor(
    private readonly orderServiceService: OrderServiceService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  @Get()
  getHello(): string {
    return this.orderServiceService.getHello();
  }

  /**
   * Bài 1: Publish 5 message đặt hàng → email-service xử lý
   * POST http://localhost:3000/orders/place-batch
   */
  @Post('orders/place-batch')
  async placeBatchOrders() {
    const orders: any[] = [];

    for (let i = 1; i <= 5; i++) {
      const order = {
        orderId: `ORD-${Date.now()}-${i}`,
        userId: `user-${i}`,
        email: `user${i}@example.com`,
        product: `Sản phẩm ${i}`,
        amount: i * 100000,
        createdAt: new Date().toISOString(),
      };

      await this.amqpConnection.publish(
        EXCHANGE.EMAIL_SERVICE_DIRECT.name,
        BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
        order,
      );

      console.log(`[Order Service] ✅ Đã publish đơn hàng: ${order.orderId}`);
      orders.push(order);
    }

    return {
      message: `Đã publish ${orders.length} đơn hàng`,
      orders: orders.map((o: { orderId: any; email: any; }) => ({ orderId: o.orderId, email: o.email })),
    };
  }

  /**
   * Publish 1 message đơn lẻ
   * POST http://localhost:3000/orders/place
   */
  @Post('orders/place')
  async placeOrder() {
    const order = {
      orderId: `ORD-${Date.now()}`,
      userId: 'user-1',
      email: 'user1@example.com',
      product: 'Laptop Dell XPS 15',
      amount: 35000000,
      createdAt: new Date().toISOString(),
    };

    await this.amqpConnection.publish(
      EXCHANGE.EMAIL_SERVICE_DIRECT.name,
      BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
      order,
    );

    console.log(`[Order Service] ✅ Đã publish đơn hàng: ${order.orderId}`);

    return {
      message: 'Đã publish đơn hàng',
      order: { orderId: order.orderId, email: order.email },
    };
  }
}
