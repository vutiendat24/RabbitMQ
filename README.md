# 🐇 RabbitMQ — Demo Retry Message với Dead Letter Queue

Dự án này demo cơ chế **retry message** trong RabbitMQ: mỗi message lỗi được retry tối đa 3 lần với thời gian chờ tăng dần (5s → 15s → 30s), sau đó đẩy vào DLQ.

> **Stack:** NestJS monorepo + `@golevelup/nestjs-rabbitmq` + Docker Compose

---

## 📐 Kiến trúc

```
                          ┌──────────────────────────────────────────────────┐
                          │              RabbitMQ Broker                     │
                          │                                                  │
  order-service           │   email_service.direct (exchange)                │
  POST /test-retry ──────►│        │                                         │
                          │        ▼                                         │
                          │   email_service.queue (main queue)               │
                          │        │                                         │
                          │        ▼                                         │
                          │   email-service consumer                         │
                          │        │                                         │
                          │   ┌────┴────┐                                    │
                          │   │ Thành   │ Thất bại                           │
                          │   │ công    │ (retry < 3)                        │
                          │   │         │                                    │
                          │   ▼         ▼                                    │
                          │  ACK    retry.direct (exchange)                  │
                          │  (xong)     │                                    │
                          │        ┌────┼────┐                               │
                          │        ▼    ▼    ▼                               │
                          │    retry.1 retry.2 retry.3                       │
                          │    TTL 5s  TTL 15s TTL 30s                       │
                          │        │    │    │                               │
                          │        └────┼────┘                               │
                          │             │ (hết TTL → DLX tự đẩy             │
                          │             │  về email_service.direct)          │
                          │             ▼                                    │
                          │        Quay lại main queue                       │
                          │             │                                    │
                          │        Thất bại (retry >= 3)                     │
                          │             │                                    │
                          │             ▼                                    │
                          │        dlx.direct (exchange)                     │
                          │             │                                    │
                          │             ▼                                    │
                          │        email_service.dlq 💀                      │
                          └──────────────────────────────────────────────────┘
```

---

## 🚀 Các bước thực hiện

### Bước 1: Khởi động RabbitMQ

```bash
docker compose up rabbitmq -d
```

Chờ RabbitMQ healthy, truy cập Management UI: http://localhost:15672 (admin/admin)

### Bước 2: Xóa queue cũ (nếu có)

> ⚠️ **BẮT BUỘC** nếu đã chạy bài demo trước đó.
> RabbitMQ không cho phép thay đổi arguments (TTL, DLX) của queue đã tồn tại.

Vào Management UI → tab **Queues** → xóa các queue sau (nếu có):
- `email_service.queue`
- `email_service.dlq`
- `email.retry.1`, `email.retry.2`, `email.retry.3`

### Bước 3: Chạy services

```bash
docker compose up --build
```

Hoặc chạy thủ công (nếu dev local):

```bash
# Terminal 1 — order-service (port 3002)
npx nest start order-service --watch

# Terminal 2 — email-service (port 3001)
npx nest start email-service --watch
```

### Bước 4: Gửi message test

**Gửi 1 email:**

```bash
curl -X POST http://localhost:3002/test-retry
```

**Gửi 5 email cùng lúc (khuyến nghị — thấy rõ retry hơn):**

```bash
curl -X POST http://localhost:3002/test-retry-batch
```

### Bước 5: Quan sát kết quả

#### Console email-service

```
[23:40:01] 📩 Nhận message (lần thử: 1/4) — nva@gmail.com
  ✅ GỬI EMAIL THÀNH CÔNG                      ← may mắn, qua ngay

[23:40:01] 📩 Nhận message (lần thử: 1/4) — ttb@yahoo.com
  ❌ Lỗi SMTP: 503 Service Unavailable
  🔄 Retry 1/3 → chờ 5s rồi thử lại           ← lỗi, chờ retry

  ... (5s sau) ...

[23:40:06] 📩 Nhận message (lần thử: 2/4) — ttb@yahoo.com
  ✅ GỬI EMAIL THÀNH CÔNG
  🎉 Thành công sau 1 lần retry!                ← retry thành công!

  ... (nếu message xui, retry 3 lần vẫn lỗi) ...

💀💀💀💀💀
[DLQ] Email không gửi được sau 4 lần thử
[DLQ] Tới: lvc@outlook.com
[DLQ] → Cần xử lý thủ công                     ← vào DLQ
```

#### Management UI

Quan sát tab **Queues** — message di chuyển giữa các queue:

| Thời điểm | `email_service.queue` | `email.retry.1` | `email.retry.2` | `email.retry.3` | `email_service.dlq` |
|---|---|---|---|---|---|
| 0s | 5 messages | 0 | 0 | 0 | 0 |
| 1s | 0 | 2-3 (lỗi) | 0 | 0 | 0 |
| 6s | 2-3 (retry) | 0 | 0-1 | 0 | 0 |
| 21s | 0-1 | 0 | 0 | 0-1 | 0 |
| 51s | 0 | 0 | 0 | 0 | 0-1 |

---

## 📁 Cấu trúc code

### Constants — `libs/common/src/RabbitMQ/rabbitmq.constants.ts`

```typescript
// Exchange cho retry
RETRY_EXCHANGE: { name: 'retry.direct', type: 'direct' }

// 3 retry queues với TTL tăng dần
EMAIL_RETRY_1: { name: 'email.retry.1' }  // 5s
EMAIL_RETRY_2: { name: 'email.retry.2' }  // 15s
EMAIL_RETRY_3: { name: 'email.retry.3' }  // 30s

// Config retry
RETRY_CONFIG = {
    MAX_RETRIES: 3,
    QUEUES: [
        { queue: 'email.retry.1', routingKey: 'email.retry.1', ttl: 5000 },
        { queue: 'email.retry.2', routingKey: 'email.retry.2', ttl: 15000 },
        { queue: 'email.retry.3', routingKey: 'email.retry.3', ttl: 30000 },
    ],
};
```

### Module — `apps/email-service/src/email-service.module.retry-demo.ts`

Khai báo 3 exchanges và 3 retry queues:

```typescript
// Mỗi retry queue có 3 arguments quan trọng:
{
  name: 'email.retry.1',
  options: {
    arguments: {
      'x-message-ttl': 5000,                                    // ① Sống được 5s
      'x-dead-letter-exchange': 'email_service.direct',          // ② Hết hạn → đẩy vào exchange này
      'x-dead-letter-routing-key': 'email_service.send_email',   // ③ Với routing key này
    },
  },
  exchange: 'retry.direct',        // Bind với retry exchange
  routingKey: 'email.retry.1',     // Để consumer publish vào đúng queue
}
```

### Controller — `apps/email-service/src/email-service.controller.retry-demo.ts`

```typescript
async sendEmail(msg, amqpMsg) {
  const retryCount = amqpMsg.properties.headers?.['x-retry-count'] || 0;

  try {
    this.simulateSmtpSend(msg.to, retryCount);  // Gọi SMTP (có thể lỗi)
    return;  // ✅ Thành công → ack

  } catch (error) {
    if (retryCount < 3) {
      // Còn lượt → publish vào retry queue tương ứng
      const retryInfo = RETRY_CONFIG.QUEUES[retryCount];
      await this.amqpConnection.publish(
        'retry.direct', retryInfo.routingKey, msg,
        { headers: { 'x-retry-count': retryCount + 1 } },
      );
      return;  // ack message cũ

    } else {
      // Hết lượt → publish vào DLQ
      await this.amqpConnection.publish('dlx.direct', 'email_service.dlq', msg);
      return;  // ack message cũ
    }
  }
}
```

---

## ❓ Giải thích cơ chế

### Tại sao cần retry queue riêng thay vì `Nack(requeue=true)`?

| | `Nack(requeue=true)` | Retry queue với TTL |
|---|---|---|
| Delay giữa các lần retry | ❌ Không — retry ngay lập tức | ✅ Có — 5s, 15s, 30s |
| Đếm số lần retry | ❌ Không thể | ✅ Qua header `x-retry-count` |
| Giới hạn retry | ❌ Lặp vô hạn | ✅ Tối đa 3 lần |
| Ảnh hưởng queue chính | ❌ Nghẽn toàn bộ | ✅ Không ảnh hưởng |

### Message quay lại main queue bằng cách nào?

Retry queue **không có consumer**. Message nằm chờ đến khi hết TTL → RabbitMQ tự động dùng DLX (Dead Letter Exchange) đẩy message về `email_service.direct` → routing vào `email_service.queue` → consumer `sendEmail()` nhận lại.

### SMTP giả lập hoạt động ra sao?

```
Lần thử 1: 70% lỗi  (SMTP server đang quá tải)
Lần thử 2: 50% lỗi  (server bắt đầu phục hồi)
Lần thử 3: 30% lỗi  (gần ổn định)
Lần thử 4: 10% lỗi  (đã ổn định)
```

→ Đa số email sẽ gửi thành công sau 1-2 lần retry. Chỉ những email "xui" (lỗi cả 4 lần) mới vào DLQ.

---

## 🔄 Chuyển về code cũ (bài DLQ đơn giản)

Sửa `apps/email-service/src/main.ts`:

```diff
-import { EmailServiceModule } from './email-service.module.retry-demo';
+import { EmailServiceModule } from './email-service.module';
```
