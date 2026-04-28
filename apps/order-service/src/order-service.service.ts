import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderServiceService {
  getHello(): string {
    return 'Hello World!';
  }


  handleOrderCreated(msg: any) {
    console.log('Gửi email:', msg);
  }
}
