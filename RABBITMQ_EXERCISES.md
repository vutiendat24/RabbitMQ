# 🐇 RabbitMQ - Bài Tập Thực Hành

> **Stack:** NestJS + `@golevelup/nestjs-rabbitmq` | **RabbitMQ Management UI:** http://localhost:15672

---

## Bài 1: Message mất khi Consumer crash

### Ngữ cảnh

User đặt hàng → `order-service` publish message → `email-service` nhận để gửi email xác nhận. `email-service` crash giữa chừng → message mất, user không nhận email.

### Nguyên nhân

RabbitMQ mặc định **auto-ack**: message bị xóa khỏi queue ngay khi gửi tới consumer, dù consumer chưa xử lý xong.

### Cách demo

**Bước 1:** Tạo consumer cố tình crash giữa chừng:

```typescript
@RabbitSubscribe({
  exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
  routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
  queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
})
async sendEmail(msg: any) {
  console.log('Nhận message:', msg);
  // Giả lập crash trước khi hoàn thành
  throw new Error('SMTP connection failed!');
}
```

**Bước 2:** Publish 5 message từ `user-service`, quan sát trên Management UI:
- Tab Queues → `email_service.queue` → message biến mất dù consumer lỗi

**Bước 3:** Fix bằng manual ack:

```typescript
import { Nack } from '@golevelup/nestjs-rabbitmq';

@RabbitSubscribe({
  exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
  routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
  queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
})
async sendEmail(msg: any) {
  try {
    console.log('Gửi email:', msg);
    // await sendEmailAPI(msg);
    
    // Return bình thường → thư viện tự động ack
    return;
  } catch (error) {
    // return Nack(true) → message quay lại queue
    return new Nack(true);
  }
}
```

**Bước 4:** Publish lại 5 message, kill process `email-service` giữa chừng (`Ctrl+C`).
- Vào Management UI → message vẫn còn trong queue (trạng thái Unacked → Ready)

### Kiểm chứng

- Vào Management UI → tab Queues → cột **Ready** và **Unacked**
- Kill `email-service` → message **Unacked** chuyển về **Ready**
- Restart `email-service` → message được xử lý lại

---

## Bài 2: Consumer quá tải (Backpressure)

### Ngữ cảnh

Marketing gửi 10.000 email cùng lúc. `email-service` nhận hết tất cả, mỗi message gọi SMTP mất 2s. Memory tăng liên tục → OOM crash.

### Nguyên nhân

RabbitMQ push message tới consumer không giới hạn. Consumer nhận nhiều hơn khả năng xử lý.

### Cách demo

**Bước 1:** Tạo consumer xử lý chậm (giả lập gửi email mất 2s):

```typescript
@RabbitSubscribe({
  exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
  routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
  queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
})
async sendEmail(msg: any) {
  console.log(`[${new Date().toISOString()}] Bắt đầu gửi email:`, msg.to);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Giả lập 2s
  console.log(`[${new Date().toISOString()}] Gửi xong:`, msg.to);
  // Return bình thường → thư viện tự động ack
}
```

**Bước 2:** Publish 100 message liên tục:

```typescript
@Post('bulk-email')
async sendBulkEmail() {
  for (let i = 0; i < 100; i++) {
    await this.amqpConnection.publish(
      EXCHANGE.EMAIL_SERVICE_DIRECT.name,
      BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
      { to: `user${i}@test.com`, subject: `Email ${i}` },
    );
  }
  return { sent: 100 };
}
```

**Bước 3:** Quan sát console → tất cả 100 message được nhận gần như đồng thời.

**Bước 4:** Fix bằng prefetch:

```typescript
// Trong module config
RabbitMQModule.forRootAsync({
  useFactory: (configService: ConfigService) => ({
    ...RabbitMQModuleConfig({ exchanges: [...], queues: [...] }, configService),
    prefetchCount: 5, // Chỉ nhận tối đa 5 message chưa ack
  }),
  inject: [ConfigService],
})
```

**Bước 5:** Restart, publish lại 100 message → console cho thấy chỉ xử lý 5 message cùng lúc.

### Kiểm chứng

- Vào Management UI → tab Queues → cột **Unacked** luôn ≤ 5
- Log console: message được xử lý tuần tự theo batch 5

---

## Bài 3: Poison Message - Dead Letter Queue

### Ngữ cảnh

Một số email address không hợp lệ (`abc@invalid`), gửi email luôn fail. Message bị `nack(requeue=true)` → quay lại queue → lỗi lại → lặp vô hạn.

### Nguyên nhân

Không có cơ chế tách message lỗi vĩnh viễn ra khỏi queue chính.

### Cách demo

**Bước 1:** Thêm DLX/DLQ vào constants:

```typescript
// rabbitmq.constants.ts - thêm vào
export const EXCHANGE = {
  // ... existing
  DLX_EXCHANGE: { name: 'dlx.direct', type: 'direct' },
};

export const QUEUE = {
  // ... existing
  EMAIL_SERVICE_DLQ: { name: 'email_service.dlq', durable: true },
};

export const BINDING_KEY = {
  // ... existing
  EMAIL_DLQ: 'email_service.dlq',
};
```

**Bước 2:** Cấu hình queue chính trỏ DLX:

```typescript
// email-service.module.ts
queues: [
  {
    queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
    durable: true,
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
    // ⚠️ Lưu ý: cần xóa queue cũ trên Management UI rồi restart
    // vì không thể thay đổi arguments của queue đã tồn tại
    options: {
      deadLetterExchange: EXCHANGE.DLX_EXCHANGE.name,
      deadLetterRoutingKey: BINDING_KEY.EMAIL_DLQ,
    },
  },
],
```

**Bước 3:** Tạo consumer cho DLQ:

```typescript
@RabbitSubscribe({
  exchange: EXCHANGE.DLX_EXCHANGE.name,
  routingKey: BINDING_KEY.EMAIL_DLQ,
  queue: QUEUE.EMAIL_SERVICE_DLQ.name,
})
async handleDeadLetter(msg: any) {
  console.error('[DLQ] Message lỗi:', JSON.stringify(msg));
  // Lưu vào DB hoặc gửi alert
}
```

**Bước 4:** Consumer chính reject message lỗi (không requeue):

```typescript
import { Nack } from '@golevelup/nestjs-rabbitmq';

async sendEmail(msg: any) {
  try {
    if (!msg.to || !msg.to.includes('@')) {
      throw new Error('Invalid email');
    }
    // ... gửi email
    
    // Return bình thường → thư viện tự động ack
    return;
  } catch (error) {
    console.log('Reject message → chuyển vào DLQ');
    return new Nack(false); // requeue=false → đẩy vào DLX
  }
}
```

**Bước 5:** Publish message với email không hợp lệ:

```typescript
await this.amqpConnection.publish(exchange, routingKey, {
  to: 'invalid-email',
  subject: 'Test DLQ',
});
```

### Kiểm chứng

- Management UI → `email_service.queue`: message biến mất (không lặp vô hạn)
- Management UI → `email_service.dlq`: message xuất hiện ở đây
- Console log: `[DLQ] Message lỗi: ...`

---

## Bài 4: Message bị xử lý trùng lặp (Idempotency)

### Ngữ cảnh

Consumer xử lý xong message "trừ tiền 100k" nhưng ack bị timeout do network. RabbitMQ tưởng chưa xử lý → requeue → consumer xử lý lại → **trừ tiền 2 lần**.

### Nguyên nhân

RabbitMQ chỉ đảm bảo **at-least-once**, không phải exactly-once. Consumer phải tự xử lý trùng lặp.

### Cách demo

**Bước 1:** Tạo biến đếm giả lập "trừ tiền":

```typescript
@Controller()
export class EmailServiceController {
  private balance = 1000000; // 1 triệu
  private processedIds = new Set<string>();

  @RabbitSubscribe({
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
    queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
  })
  async processPayment(msg: any, amqpMsg: ConsumeMessage) {
    const messageId = amqpMsg.properties.messageId;

    // KHÔNG có idempotency check → trừ tiền trùng
    this.balance -= msg.amount;
    console.log(`Trừ ${msg.amount}, còn lại: ${this.balance}`);

    // Giả lập ack chậm - 50% timeout
    await new Promise(resolve => setTimeout(resolve, 3000));
    // Return bình thường → thư viện tự động ack
  }
}
```

**Bước 2:** Publish message với `messageId`:

```typescript
import { v4 as uuidv4 } from 'uuid';

@Post('payment')
async makePayment() {
  const messageId = uuidv4();
  await this.amqpConnection.publish(
    EXCHANGE.USER_SERVICE_DIRECT.name,
    BINDING_KEY.USER_SERVICE_CREATE_USER,
    { amount: 100000, userId: 'user-1' },
    { messageId, persistent: true },
  );
  return { messageId };
}
```

**Bước 3:** Publish 1 message, rồi **kill consumer trước khi ack** (Ctrl+C trong 3s delay) → restart → message xử lý lại → balance bị trừ 2 lần.

**Bước 4:** Fix với idempotency check:

```typescript
async processPayment(msg: any, amqpMsg: ConsumeMessage) {
  const messageId = amqpMsg.properties.messageId;

  // Check idempotency
  if (this.processedIds.has(messageId)) {
    console.log(`[SKIP] Message ${messageId} đã xử lý rồi`);
    return; // Thư viện tự động ack
  }

  this.balance -= msg.amount;
  this.processedIds.add(messageId);
  console.log(`Trừ ${msg.amount}, còn lại: ${this.balance}`);
  // Return bình thường → thư viện tự động ack
}
```

### Kiểm chứng

- Không có idempotency: balance bị trừ nhiều lần cho cùng 1 message
- Có idempotency: log `[SKIP]` xuất hiện, balance chỉ trừ 1 lần

---

## Bài 5: Retry với Exponential Backoff

### Ngữ cảnh

API gửi email trả 503. Retry ngay → vẫn 503. Cần đợi 1s, rồi 5s, rồi 30s. Sau 3 lần → chuyển DLQ.

### Nguyên nhân

Không có cơ chế delay giữa các lần retry. Retry ngay lập tức gây thêm load cho service đang lỗi.

### Cách demo

**Bước 1:** Tạo 3 retry queue với TTL tăng dần (mỗi queue expire sẽ đẩy message về queue chính qua DLX):

```typescript
// rabbitmq.constants.ts
export const QUEUE = {
  // ... existing
  EMAIL_RETRY_1: { name: 'email.retry.1', durable: true }, // TTL 1s
  EMAIL_RETRY_2: { name: 'email.retry.2', durable: true }, // TTL 5s
  EMAIL_RETRY_3: { name: 'email.retry.3', durable: true }, // TTL 30s
};
```

**Bước 2:** Khai báo retry queues (mỗi queue có TTL, DLX trỏ về exchange chính):

```typescript
// Tạo qua Management UI hoặc code:
// Queue: email.retry.1
//   x-message-ttl: 1000
//   x-dead-letter-exchange: email_service.direct
//   x-dead-letter-routing-key: email_service.send_email
//
// Queue: email.retry.2
//   x-message-ttl: 5000
//   x-dead-letter-exchange: email_service.direct
//   x-dead-letter-routing-key: email_service.send_email
//
// Queue: email.retry.3
//   x-message-ttl: 30000
//   x-dead-letter-exchange: email_service.direct
//   x-dead-letter-routing-key: email_service.send_email
```

**Bước 3:** Consumer đếm retry và route tới đúng retry queue:

```typescript
async sendEmail(msg: any, amqpMsg: ConsumeMessage) {
  const retryCount = (amqpMsg.properties.headers?.['x-retry-count'] || 0) as number;
  const retryQueues = ['email.retry.1', 'email.retry.2', 'email.retry.3'];
  const maxRetries = 3;

  try {
    // Giả lập API fail
    if (Math.random() < 0.8) throw new Error('SMTP 503');

    console.log('Gửi email thành công!');
    // Không lỗi → thư viện tự động ack
  } catch (error) {
    // Đã catch error → hàm kết thúc bình thường → message hiện tại tự động ack (xóa khỏi queue)

    if (retryCount >= maxRetries) {
      console.log(`[DLQ] Hết retry (${retryCount}/${maxRetries})`);
      // Publish vào DLQ
      await this.amqpConnection.publish('dlx.direct', 'email_service.dlq', msg);
    } else {
      console.log(`[RETRY ${retryCount + 1}] Đợi rồi thử lại...`);
      // Publish vào retry queue tương ứng
      await this.amqpConnection.publish(
        '', // default exchange
        retryQueues[retryCount],
        msg,
        { headers: { 'x-retry-count': retryCount + 1 } },
      );
    }
  }
}
```

**Bước 4:** Publish 1 message, quan sát console:

```
[RETRY 1] Đợi rồi thử lại...    → message vào email.retry.1
(1s sau)
[RETRY 2] Đợi rồi thử lại...    → message vào email.retry.2
(5s sau)
[RETRY 3] Đợi rồi thử lại...    → message vào email.retry.3
(30s sau)
[DLQ] Hết retry (3/3)
```

### Kiểm chứng

- Management UI → xem message di chuyển qua các retry queue
- Console log: timestamp giữa các retry tăng dần (1s → 5s → 30s)
- Sau 3 retry → message nằm trong DLQ

---

## Bài 6: Request-Reply (RPC) qua RabbitMQ

### Ngữ cảnh

`user-service` cần hỏi `email-service`: "Email này có hợp lệ không?" trước khi tạo user. Cần response chứ không phải fire-and-forget.

### Nguyên nhân

RabbitMQ mặc định là one-way. Cần pattern riêng cho request-response.

### Cách demo

**Bước 1:** Tạo RPC handler ở `email-service`:

```typescript
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';

@RabbitRPC({
  exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
  routingKey: 'email_service.verify_email',
  queue: 'email_service.verify_queue',
})
async verifyEmail(msg: { email: string }) {
  console.log('Verify email:', msg.email);

  // Giả lập validate
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email);

  // Return value = response gửi về caller
  return { valid: isValid, email: msg.email };
}
```

**Bước 2:** Gọi RPC từ `user-service`:

```typescript
@Post('create')
async createUser(@Body() body: { email: string; name: string }) {
  // Gọi RPC - chờ response từ email-service
  const result = await this.amqpConnection.request<{ valid: boolean }>({
    exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
    routingKey: 'email_service.verify_email',
    payload: { email: body.email },
    timeout: 5000,
  });

  if (!result.valid) {
    throw new BadRequestException('Email không hợp lệ');
  }

  return { message: `User ${body.name} created`, email: body.email };
}
```

**Bước 3:** Test:

```bash
# Email hợp lệ
curl -X POST http://localhost:3000/create \
  -H "Content-Type: application/json" \
  -d '{"email": "test@gmail.com", "name": "Dat"}'
# → { "message": "User Dat created" }

# Email không hợp lệ
curl -X POST http://localhost:3000/create \
  -H "Content-Type: application/json" \
  -d '{"email": "invalid", "name": "Dat"}'
# → 400 Bad Request: Email không hợp lệ

# Test timeout: tắt email-service rồi gọi
# → 500 Error sau 5s
```

### Kiểm chứng

- Management UI → xuất hiện queue `amq.rabbitmq.reply-to` (auto-created)
- Response trả về đúng `{ valid: true/false }`
- Tắt `email-service` → timeout sau 5s

---

## Bài 7: Priority Queue

### Ngữ cảnh

Marketing gửi 50.000 newsletter vào queue. User đặt hàng cần email xác nhận → phải xếp sau 50.000 newsletter → đợi 30 phút.

### Nguyên nhân

Queue mặc định FIFO, không phân biệt độ ưu tiên.

### Cách demo

**Cách A - Hai queue riêng (đơn giản):**

**Bước 1:** Tạo 2 queue:

```typescript
export const QUEUE = {
  EMAIL_HIGH: { name: 'email.queue.high', durable: true },
  EMAIL_LOW: { name: 'email.queue.low', durable: true },
};
```

**Bước 2:** 2 consumer với prefetch khác nhau:

```typescript
// High priority - prefetch cao, xử lý nhanh
@RabbitSubscribe({
  queue: 'email.queue.high',
  // ...
  queueOptions: { channel: 'high-priority' },
})
async sendUrgentEmail(msg: any) { /* ... */ }

// Low priority - prefetch thấp, xử lý chậm
@RabbitSubscribe({
  queue: 'email.queue.low',
  // ...
  queueOptions: { channel: 'low-priority' },
})
async sendMarketingEmail(msg: any) { /* ... */ }
```

**Cách B - Priority queue (nâng cao):**

**Bước 1:** Tạo queue với `x-max-priority` (phải tạo mới, xóa queue cũ):

```typescript
@RabbitSubscribe({
  exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
  routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
  queue: 'email.priority.queue',
  queueOptions: {
    durable: true,
    arguments: { 'x-max-priority': 10 },
  },
})
async sendEmail(msg: any) {
  console.log(`[Priority] Gửi email: ${msg.subject}`);
}
```

**Bước 2:** Publish với priority khác nhau:

```typescript
// Newsletter - priority thấp
await this.amqpConnection.publish(exchange, routingKey,
  { to: 'user@test.com', subject: 'Newsletter #123' },
  { priority: 1 },
);

// Order confirmation - priority cao
await this.amqpConnection.publish(exchange, routingKey,
  { to: 'user@test.com', subject: 'Xác nhận đơn hàng #456' },
  { priority: 9 },
);
```

**Bước 3:** Publish 100 newsletter (priority=1) trước, rồi 1 order email (priority=9). Quan sát consumer xử lý order email trước.

### Kiểm chứng

- Tạm dừng consumer → publish 50 newsletter + 1 order email
- Start consumer → order email được xử lý đầu tiên
- Management UI → Queue Features hiển thị `Pri`

---

## Bài 8: Delayed Message

### Ngữ cảnh

Sau khi user đặt hàng, gửi email khảo sát sau **1 phút** (demo thay cho 24h). Không muốn dùng `setTimeout` hay cron job.

### Nguyên nhân

RabbitMQ deliver message ngay lập tức. Cần trick TTL + DLX để tạo delay.

### Cách demo

**Bước 1:** Tạo delay queue (message vào đây sẽ tự expire sau TTL → đẩy qua DLX vào queue chính):

```typescript
// Tạo qua Management UI:
// Queue: email.delay.60s
//   x-message-ttl: 60000        (60 giây)
//   x-dead-letter-exchange: email_service.direct
//   x-dead-letter-routing-key: email_service.send_email
//
// Bind queue này với exchange (hoặc dùng default exchange)
```

**Bước 2:** Publish vào delay queue:

```typescript
@Post('order')
async createOrder(@Body() body: any) {
  // Xử lý đơn hàng...

  // Schedule email khảo sát sau 60s
  await this.amqpConnection.publish(
    '', // default exchange
    'email.delay.60s', // publish thẳng vào delay queue
    {
      to: body.email,
      subject: 'Bạn hài lòng với đơn hàng?',
      scheduledAt: new Date().toISOString(),
    },
    { persistent: true },
  );

  console.log(`[${new Date().toISOString()}] Đã schedule email sau 60s`);
  return { message: 'Order created, survey email scheduled' };
}
```

**Bước 3:** Consumer nhận email sau 60s:

```typescript
@RabbitSubscribe({
  exchange: EXCHANGE.EMAIL_SERVICE_DIRECT.name,
  routingKey: BINDING_KEY.EMAIL_SERVICE_SEND_EMAIL,
  queue: QUEUE.EMAIL_SERVICE_QUEUE.name,
})
async sendEmail(msg: any) {
  console.log(`[${new Date().toISOString()}] Gửi email khảo sát:`, msg.subject);
  console.log(`Scheduled lúc: ${msg.scheduledAt}`);
}
```

### Kiểm chứng

- Publish message → Management UI: message nằm trong `email.delay.60s`
- Sau 60s → message biến mất khỏi delay queue, xuất hiện ở `email_service.queue`
- Console log: timestamp chênh lệch đúng ~60s

---

## 📊 Tổng hợp

| Bài | Vấn đề | Giải pháp | Keyword để tìm hiểu thêm |
|-----|--------|-----------|---------------------------|
| 1 | Message mất khi crash | Manual Ack + Durable + Persistent | `manual acknowledgment rabbitmq` |
| 2 | Consumer quá tải | Prefetch Count (QoS) | `rabbitmq prefetch qos` |
| 3 | Poison message lặp vô hạn | Dead Letter Exchange/Queue | `rabbitmq dead letter exchange` |
| 4 | Xử lý trùng lặp | Idempotency Key | `idempotent consumer pattern` |
| 5 | Retry thông minh | TTL Queue Chain + Backoff | `rabbitmq retry exponential backoff` |
| 6 | Request-Response | RPC Pattern (Reply Queue) | `rabbitmq rpc pattern` |
| 7 | Ưu tiên message | Priority Queue / Multi Queue | `rabbitmq priority queue` |
| 8 | Gửi message trễ | TTL + DLX = Delayed Message | `rabbitmq delayed message ttl dlx` |

### Thứ tự học

```
Bài 1 (Ack) → Bài 2 (Prefetch) → Bài 3 (DLQ) → Bài 5 (Retry)
                                                       ↓
                   Bài 6 (RPC) ← Bài 4 (Idempotency) ←┘
                                                       ↓
                                  Bài 7 (Priority) → Bài 8 (Delay)
```

> ⚠️ **Lưu ý quan trọng:** Khi thay đổi arguments của queue (thêm DLX, priority...), bạn phải **xóa queue cũ** trên Management UI rồi restart service. RabbitMQ không cho phép thay đổi arguments của queue đã tồn tại.
