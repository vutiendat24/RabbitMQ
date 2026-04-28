# 🐇 RabbitMQ - Bài Tập Thực Hành

Dự án này là một monorepo NestJS kết hợp RabbitMQ (`@golevelup/nestjs-rabbitmq`), dùng để demo các lỗi thường gặp trong Message Queue và cách khắc phục.

---

## 🚀 Cách chạy dự án

1. **Khởi động toàn bộ (RabbitMQ + Order Service + Email Service):**
   ```bash
   docker compose up --build
   ```
   *Quá trình này sẽ khởi chạy:*
   - RabbitMQ Management UI: [http://localhost:15672](http://localhost:15672) (User/Pass: `admin`/`admin`)
   - Order Service: `http://localhost:3002`
   - Email Service: `http://localhost:3001` (Chạy ẩn dưới dạng Consumer)

2. **Gửi lệnh test (Tạo 5 đơn hàng):**
   ```bash
   curl -X POST http://localhost:3002/orders/place-batch
   ```

---

## 🎯 Bài 1: Message mất khi Consumer crash (Hoặc bị Loop vô hạn)

### Ngữ cảnh
- `order-service` gửi message báo có đơn hàng mới.
- `email-service` nhận message để gửi email nhưng bị lỗi (Crash, đứt mạng SMTP...).

### ❌ Lỗi 1: Mất dữ liệu (Auto-ack hoặc `Nack(false)`)
- Theo mặc định, nếu không cấu hình gì, RabbitMQ dùng **auto-ack**, khi lỗi xảy ra message sẽ bị vứt đi luôn.
- Trong `email-service.controller.ts`, tôi đã giả lập bằng cách trả về `return new Nack(false)`.
- **Hậu quả:** Trên RabbitMQ, message biến mất khỏi Queue. Người dùng không bao giờ nhận được email.

### ❌ Lỗi 2: Vòng lặp vô hạn (Infinite Loop với `Nack(true)`)
- Để chống mất dữ liệu, chúng ta gọi **Manual Ack** và trả về `return new Nack(true)` khi gặp lỗi (nằm trong file `email-service.controller.fixed.ts`).
- **Hậu quả:** Message được giữ lại nhưng lập tức bị đẩy trả về Consumer. Consumer tiếp tục chạy lỗi và tiếp tục trả về. Quá trình này lặp lại hàng nghìn lần mỗi giây gây treo CPU (Infinite Loop).

### ✅ Bài học rút ra
Không bao giờ dùng `requeue=true` một cách mù quáng cho những lỗi không thể tự phục hồi ngay lập tức. 

Để giải quyết bài toán này mà không bị Loop vô hạn, chúng ta sẽ chuyển sang **Bài 3: Dead Letter Queue (DLQ)** và **Bài 5: Retry Exponential Backoff**.
