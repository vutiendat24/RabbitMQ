# 🐇 RabbitMQ - Bài Tập Thực Hành

Dự án này là một monorepo NestJS kết hợp RabbitMQ (`@golevelup/nestjs-rabbitmq`), dùng để demo các lỗi thường gặp trong Message Queue và cách khắc phục.



## 🎯 Bài 3: Cách ly Message Lỗi (Poison Message & Dead Letter Queue)

### Ngữ cảnh
Gửi 100 email lỗi (chứa email không hợp lệ) từ `order-service` sang `email-service`:
```bash
curl -X POST http://localhost:3002/bulk-email
```
Code xử lý tại `email-service` kiểm tra thấy email không có dấu `@` nên báo lỗi. 
Nếu không có cơ chế xử lý tốt, message sẽ bị từ chối (Nack), chui ngược vào đầu hàng chờ, rồi ngay lập tức lại được lấy ra xử lý, lại gặp lỗi... tạo thành vòng lặp vô hạn làm nghẽn toàn bộ hàng đợi và làm tê liệt CPU của ứng dụng.

### 🔧 Giải pháp: Sử dụng Dead Letter Queue (DLQ)
- **Cấu hình hàng đợi chính (`email_service.queue`)**: Đặt tùy chọn `deadLetterExchange: 'dlx.direct'`. RabbitMQ sẽ ngầm hiểu: "Bất kỳ message nào bị Nack (với cờ requeue=false) ở hàng đợi này sẽ tự động bị quăng sang `dlx.direct`".
- **Xử lý phía Code**: Bắt lỗi (`try/catch`) và trả về đối tượng `new Nack(false)` của thư viện để thông báo cho RabbitMQ biết message này bị lỗi không thể cứu chữa.
- **Tạo hàng đợi riêng (`email_service.dlq`)**: Nơi chuyên giam giữ các message bị lỗi được `dlx.direct` đẩy vào.

### ⚙️ Cách chương trình vận hành
1. `order-service` gửi đi 100 message chứa `to: 'invalid-email'`.
2. Hàm `sendEmail` tại `email-service` nhận được, phát hiện lỗi thiếu chữ `@` nên tung lỗi (throw Error).
3. Khối `catch` bắt lỗi và gọi `return new Nack(false)`.
4. RabbitMQ nhận tín hiệu từ chối này, gỡ message khỏi hàng chờ chính và bứng sang **Dead Letter Exchange (dlx.direct)**.
5. DLX chuyển tiếp message về **Dead Letter Queue (email_service.dlq)**.
6. Hàm `handleDeadLetter` đang lắng nghe trên DLQ tóm lấy message lỗi, in ra cảnh báo an toàn mà không làm nghẽn hệ thống.

### 🌟 3 Ý nghĩa sống còn trong thực tế

1. **Chống sập hệ thống do vòng lặp vô hạn (Infinite Loop):**
   Nếu một API hoặc thư viện third-party mà service của bạn phụ thuộc đang bị sập (lỗi 500) hoặc data truyền xuống từ người dùng bị sai format, nếu message cứ lặp lại mãi mãi thì CPU sẽ tăng vọt 100%. DLQ giống như khu vực "cách ly" mầm bệnh ngay lập tức để hệ thống rảnh tay xử lý các việc hợp lệ khác.
   
2. **Không bao giờ làm mất dữ liệu (Zero Data Loss):**
   Trong ngành tài chính - ngân hàng, mỗi message là một giao dịch tiền bạc. Lỗi xảy ra có thể do nghẽn mạng hoặc tài khoản khách hàng hết tiền. Thay vì hệ thống âm thầm xoá message (làm mất dấu giao dịch) hoặc vứt ngược về hàng đợi, việc chuyển vào DLQ giúp đội ngũ hỗ trợ (CS/Dev) có thể truy ra nguyên nhân, và hoàn toàn có thể khôi phục (replay/retry) lại giao dịch bằng tay bất kỳ lúc nào họ sửa xong lỗi.

3. **Tăng cường khả năng theo dõi (Observability & Alerting):**
   Thay vì chỉ ghi ra console, hệ thống thực tế thường cài đặt thêm các trigger. Bất cứ khi nào có 1 message rơi vào hàng đợi DLQ, một webhook sẽ chạy và bắn cảnh báo thẳng lên ứng dụng chat Slack hoặc Telegram của đội Dev (ví dụ: *"🚨 Cảnh báo: Có hóa đơn thanh toán không xuất được, vui lòng kiểm tra DLQ ngay!"*). Điều này giúp đội ngũ kỹ thuật chủ động sửa lỗi trước cả khi khách hàng kịp phàn nàn.
