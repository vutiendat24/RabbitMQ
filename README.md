# 🐇 RabbitMQ - Bài Tập Thực Hành

Dự án này là một monorepo NestJS kết hợp RabbitMQ (`@golevelup/nestjs-rabbitmq`), dùng để demo các lỗi thường gặp trong Message Queue và cách khắc phục.


## 🎯 Bài 2: Consumer quá tải (Backpressure & Prefetch Count)

### Ngữ cảnh
Gửi lệnh giả lập Marketing bắn 100 email cùng một lúc:
```bash
curl -X POST http://localhost:3002/bulk-email
```
Mỗi email mất 2 giây để gửi. Nếu để mặc định, RabbitMQ sẽ nhồi toàn bộ 100 email vào RAM của NodeJS ngay lập tức. 

### 🔧 Giải pháp: Bật Prefetch Count
Trong file `email-service.module.ts`, chúng ta đã thêm cờ `prefetchCount: 5`.
Kết quả: Consumer chỉ tải về tối đa 5 message vào RAM để xử lý. Nó sẽ xử lý xong (và gửi ACK) cho 1 message thì mới lấy tiếp 1 message mới. Dòng chảy dữ liệu diễn ra từ từ và ổn định.

### 🌟 3 Ứng dụng sống còn trong thực tế

1. **Chống sập hệ thống (Out Of Memory / DB Crash):**
   Trong các đợt Flash Sale, lượng đơn hàng đổ về có thể lên tới 100,000 đơn/phút. Nếu không có giới hạn, Server sẽ bị quá tải, full RAM và kết nối Database bị sập. Dùng `prefetch` giúp Server từ từ "tiêu hóa" dữ liệu một cách an toàn nhất.

2. **Chia đều công việc (Fair Dispatch):**
   Khi bạn chạy 3 con Server nhận email song song, RabbitMQ có xu hướng nhồi hết 100 email vào Server rảnh đầu tiên. Bằng cách giới hạn `prefetchCount: 5`, mỗi Server chỉ được ôm 5 việc, làm xong mới được nhận tiếp. Hệ quả là 100 email sẽ được chia cực kỳ đồng đều cho cả 3 Server cùng làm.

3. **Kiểm soát tốc độ - Rate Limiting (Tôn trọng giới hạn bên thứ 3):**
   Nếu bạn gửi SMS/Email qua đối tác bên ngoài (VD: SendGrid, Viettel) và họ chỉ cho phép gọi API 10 lần/giây. `prefetchCount` kết hợp với thời gian xử lý thực tế giúp bạn điều tiết tốc độ gọi API, đảm bảo không bao giờ gọi quá nhanh khiến đối tác khóa tài khoản của bạn.
