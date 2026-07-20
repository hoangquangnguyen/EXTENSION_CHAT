# Hướng dẫn Kết nối và Giao thức WebSocket (TikTok Live Chat Extension)

Tài liệu này mô tả chi tiết giao thức kết nối và định dạng dữ liệu (payload) được gửi từ Extension TikTok Live Chat đến máy chủ WebSocket (hoặc HTTP). Dựa vào tài liệu này, bạn có thể thiết kế và lập trình WebSocket Server tương thích hoàn toàn với Extension.

---

## 1. Tổng quan Luồng Dữ liệu (Data Flow Overview)

1. **Content Script (`content-script.js`)**: Theo dõi các thay đổi (mutations) của khung chat TikTok Live Stream. Khi xuất hiện tin nhắn mới, nó trích xuất thông tin người dùng và nội dung bình luận, sau đó đóng gói thành một `payload` và gửi lên Background Service Worker.
2. **Service Worker (`background.js`)**: Nhận gói tin từ Content Script và chuyển tiếp (relay) đến Offscreen Document để xử lý gửi đi.
3. **Offscreen Document (`offscreen.js`)**: Chịu trách nhiệm duy trì kết nối WebSocket/HTTP, quản lý hàng đợi bộ đệm (buffer) và truyền dữ liệu trực tiếp đến máy chủ đích của bạn.

---

## 2. Cấu hình Kết nối (Connection Settings)

Mặc định, Extension kết nối đến máy chủ thông qua giao thức và địa chỉ được cấu hình trực tiếp từ popup dashboard:

* **Mặc định:**
  * **Protocol (Giao thức):** `ws` (WebSocket) hoặc `http` (HTTP Post)
  * **Host:** `localhost`
  * **Port:** `6161`
  * **Path:** `/`
* **Địa chỉ kết nối đầy đủ:** `ws://localhost:6161/`

> [!NOTE]
> Bạn có thể thay đổi cấu hình này động thông qua giao diện Pop-up của Extension. Nếu đổi sang giao thức HTTP, Extension sẽ chuyển sang gửi dữ liệu qua phương thức `POST` đến địa chỉ `http://localhost:6161/`.

---

## 3. Quy trình Kết nối và Xử lý Lỗi (Lifecycle & Buffer)

Hệ thống được thiết kế tự động phục hồi kết nối để đảm bảo không bị mất bình luận:

* **Khi có kết nối (`connected`):** Dữ liệu bình luận trích xuất sẽ lập tức được gửi qua WebSocket dưới dạng chuỗi JSON UTF-8.
* **Khi mất kết nối (`disconnected`):**
  * Bình luận mới sẽ tự động được đưa vào bộ đệm FIFO (First-In, First-Out) tạm thời.
  * Kích thước bộ đệm tối đa: `100` tin nhắn (khi vượt quá, tin nhắn cũ nhất sẽ bị hủy).
  * Hệ thống tự động đặt lịch thử kết nối lại (Reconnection) sau mỗi **5 giây**.
* **Khi kết nối lại thành công:** Bộ đệm sẽ tự động được xả (`flushBuffer`) và gửi tuần tự toàn bộ các bình luận đã lưu trữ trước đó đến máy chủ.

---

## 4. Định dạng Dữ liệu (Payload Format)

Dữ liệu được gửi từ Extension sang WebSocket Server là một **chuỗi JSON** (kết quả của `JSON.stringify(payload)`).

### Chi tiết các trường dữ liệu (Schema):

| Trường (Field) | Kiểu dữ liệu | Mô tả | Ví dụ |
| :--- | :--- | :--- | :--- |
| `nickname` | `string` | Tên hiển thị (Display Name) của người dùng | `"Nguyễn Văn A"` |
| `username` | `string` | Username/Handle của người dùng (bắt đầu bằng `@`) | `"@nguyenvana.123"` |
| `message`  | `string` | Nội dung bình luận của người dùng | `"Chào cả nhà nha! Chúc live stream vui vẻ."` |
| `timestamp`| `number` | Mốc thời gian nhận tin nhắn (Unix Epoch Time - Milliseconds) | `1784534400000` |

### Ví dụ Payload JSON:

```json
{
  "nickname": "Nguyễn Văn A",
  "username": "@nguyenvana.123",
  "message": "Chào cả nhà nha! Chúc live stream vui vẻ. 🔥🔥",
  "timestamp": 1784534400000
}
```

