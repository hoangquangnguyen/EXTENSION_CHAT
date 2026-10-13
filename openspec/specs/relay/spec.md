# Đặc Tả Giao Thức Chuyển Tiếp Mạng (Network Relay & Buffering Specification)

## Tổng Quan (Overview)
Phân hệ chuyển tiếp mạng được hiện thực trong `offscreen/offscreen.js`, hoạt động trong một Offscreen Document độc lập với vòng đời của Service Worker. Phân hệ này chịu trách nhiệm:
1. Thiết lập và duy trì kết nối mạng với máy chủ tiếp nhận (Server AI / Localhost) thông qua giao thức **WebSocket (`ws://`)** hoặc **HTTP POST (`http://`)**.
2. Đóng gói và phát tán các gói tin bình luận nhận được từ các Content Script.
3. Cung cấp cơ chế bộ đệm hàng đợi tạm thời (FIFO Queue Buffer, tối đa 100 phần tử) để chống thất thoát dữ liệu khi mạng bị đứt hoặc máy chủ tạm dừng.
4. Tự động phục hồi kết nối định kỳ (mỗi 5 giây) và xả hàng đợi tuần tự khi kết nối hoạt động trở lại.

---

## Luồng Xử Lý Gói Tin và Hàng Đợi (Queue & Relay Architecture)

```mermaid
flowchart TD
    InMsg[Nhận CHAT_MESSAGE từ Content Script] --> CheckProto{Giao thức là gì?}
    
    %% WebSocket Branch
    CheckProto -- WebSocket (ws) --> CheckWSState{WebSocket có OPEN?}
    CheckWSState -- Có --> SendWS[Gửi socket.send(JSON)]
    CheckWSState -- Không --> EnqueueWS[Đưa vào commentBuffer FIFO]
    SendWS -- Lỗi khi gửi --> EnqueueWS
    
    %% HTTP POST Branch
    CheckProto -- HTTP POST (http) --> CheckHTTPState{connectionStatus == 'connected'?}
    CheckHTTPState -- Không --> EnqueueHTTP[Đưa vào commentBuffer FIFO]
    CheckHTTPState -- Có --> SendHTTP[Gửi fetch POST]
    SendHTTP -- HTTP 200 OK --> Done[Hoàn tất chuyển giao]
    SendHTTP -- HTTP Lỗi / Network Error --> EnqueueHTTP
    EnqueueHTTP --> DisconnHandler[Kích hoạt handleDisconnect & Reconnect Timer]
    
    %% Buffer & Reconnect
    EnqueueWS --> CheckBufLen{commentBuffer.length >= 100?}
    EnqueueHTTP --> CheckBufLen
    CheckBufLen -- Có --> DropOldest[Hủy phần tử cũ nhất (shift)]
    CheckBufLen -- Không --> KeepBuf[Lưu vào hàng đợi]
    
    DisconnHandler --> Loop5s[Chu kỳ kiểm tra mỗi 5000ms]
    Loop5s --> TryConn{Thử kết nối lại}
    TryConn -- Thành công --> Flush[Gọi flushBuffer - Xả hàng đợi tuần tự]
    Flush --> Done
```

---

## Cấu Trúc Gói Tin Chuyển Tiếp (Payload Data Contract)

Tất cả các gói tin gửi sang máy chủ đích PHẢI tuân thủ cấu trúc JSON tiêu chuẩn sau:

| Tên Trường (Field) | Kiểu Dữ Liệu | Bắt Buộc | Mô Tả | Ví Dụ |
| :--- | :--- | :---: | :--- | :--- |
| `nickname` | `string` | Có | Tên hiển thị của khán giả live | `"Nguyễn Văn A"` |
| `username` | `string` | Có | Tên tài khoản/Handle (thường bắt đầu bằng `@`) | `"@nguyenvana.123"` |
| `message` | `string` | Có | Toàn văn nội dung câu hỏi/bình luận | `"Shop có ship COD không?"` |
| `profilePic` | `string` | Không | Đường dẫn URL ảnh đại diện | `"https://.../avatar.jpg"` |
| `timestamp` | `number` | Có | Thời điểm nhận tin nhắn (Unix Epoch ms) | `1784534400000` |
| `ai_reply_id` | `string` | Có | Mã định danh kịch bản/bot AI của tab này | `"sales_fashion_bot"` |
| `tabId` | `number` | Không | ID của tab trình duyệt đang phát live | `1024` |

---

## Yêu Cầu Chức Năng (Requirements & Scenarios)

### Yêu Cầu 1: Chuyển Tiếp Dữ Liệu Qua WebSocket Thời Gian Thực
Khi tiện ích được cấu hình ở chế độ WebSocket (`protocol: "ws"`), hệ thống PHẢI duy trì kết nối hai chiều ổn định và gửi các gói tin bình luận ngay khi nhận được.

#### Kịch Bản: Kết nối WebSocket thành công và gửi tin nhắn
* **GIVEN**: Máy chủ WebSocket đang hoạt động tại địa chỉ đích (mặc định: `ws://127.0.0.1:3003/api/chat/tiktok-comment`).
* **WHEN**: Offscreen Document khởi tạo và kết nối thành công (`socket.onopen`).
* **THEN**: Trạng thái kết nối chuyển thành `"connected"` và gửi thông điệp `CONNECTION_STATUS` lên background/popup.
* **AND**: Khi có bình luận mới, gói tin được chuyển thành chuỗi JSON UTF-8 và gửi đi qua `socket.send()`.

#### Kịch Bản: WebSocket bị ngắt kết nối đột ngột
* **GIVEN**: WebSocket đang kết nối và đang truyền nhận dữ liệu.
* **WHEN**: Máy chủ đích đóng kết nối hoặc mạng bị ngắt (`socket.onclose`).
* **THEN**: Trạng thái kết nối chuyển thành `"disconnected"`.
* **AND**: Hệ thống ghi nhận thông báo lỗi qua `saveConnectionError` và khởi chạy bộ đếm kết nối lại sau 5 giây (`handleDisconnect`).

---

### Yêu Cầu 2: Chuyển Tiếp Dữ Liệu Qua HTTP REST API (POST)
Khi tiện ích được cấu hình ở chế độ HTTP (`protocol: "http"`), hệ thống PHẢI gửi dữ liệu thông qua phương thức `POST` với tiêu đề `Content-Type: application/json`.

#### Kịch Bản: Gửi bình luận thành công qua HTTP POST
* **GIVEN**: Máy chủ HTTP đích đang chạy và hỗ trợ endpoint nhận POST.
* **WHEN**: Có bình luận mới từ livestream.
* **THEN**: Offscreen Document thực hiện gọi `fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })`.
* **AND**: Khi phản hồi có `response.ok === true`, ghi nhận thành công và duy trì trạng thái kết nối là `"connected"`.

#### Kịch Bản: Máy chủ HTTP phản hồi mã lỗi hoặc không thể kết nối
* **GIVEN**: Yêu cầu HTTP POST được gửi đi đến máy chủ.
* **WHEN**: Máy chủ phản hồi mã lỗi (status khác 2xx) HOẶC xảy ra lỗi kết nối mạng (Network Error / CORS blocked).
* **THEN**: Gói tin hiện tại tự động được đưa vào hàng đợi `commentBuffer`.
* **AND**: Trạng thái kết nối chuyển sang `"disconnected"` và kích hoạt quy trình thăm dò kết nối lại (`checkHttpConnection`).

---

### Yêu Cầu 3: Hàng Đợi Tạm Thời FIFO Chống Thất Thoát Dữ Liệu
Hệ thống PHẢI duy trì một bộ đệm hàng đợi trong bộ nhớ với dung lượng tối đa 100 phần tử (`MAX_BUFFER_SIZE = 100`).

#### Kịch Bản: Bình luận đến trong lúc mất kết nối
* **GIVEN**: Máy chủ đang ngoại tuyến hoặc kết nối mạng bị gián đoạn (`connectionStatus === "disconnected"`).
* **WHEN**: Content Script liên tục gửi các bình luận mới về.
* **THEN**: Tất cả các bình luận được đưa vào cuối hàng đợi `commentBuffer`.
* **AND**: Nếu kích thước hàng đợi vượt quá 100 phần tử, hệ thống tự động loại bỏ phần tử cũ nhất ở đầu hàng đợi (`commentBuffer.shift()`) để ưu tiên lưu trữ các bình luận mới nhất.

---

### Yêu Cầu 4: Tự Động Xả Hàng Đợi Khi Kết Nối Phục Hồi (Buffer Flush)
Khi kết nối mạng đến máy chủ đích được thiết lập lại thành công, hệ thống PHẢI tự động xả toàn bộ bình luận trong hàng đợi theo thứ tự trước-sau (FIFO).

#### Kịch Bản: Khôi phục kết nối WebSocket
* **GIVEN**: `commentBuffer` đang chứa các bình luận đang chờ gửi.
* **WHEN**: WebSocket kết nối lại thành công (`socket.onopen`).
* **THEN**: Hàm `flushBuffer` được kích hoạt, lặp qua hàng đợi và gửi lần lượt từng bình luận cho đến khi hàng đợi rỗng hoặc socket bị ngắt.

#### Kịch Bản: Khôi phục kết nối HTTP
* **GIVEN**: `commentBuffer` đang chứa các bình luận đang chờ gửi.
* **WHEN**: Bộ thăm dò `checkHttpConnection` phát hiện máy chủ HTTP đã online trở lại.
* **THEN**: Hàm `sendNextHttpBufferedComment` thực hiện gửi tuần tự từng yêu cầu POST, lấy phần tử ra khỏi hàng đợi sau mỗi lần gửi thành công, đảm bảo không gửi chồng chéo làm quá tải máy chủ.

---

### Yêu Cầu 5: Dọn Dẹp Tài Nguyên Khi Tắt Giám Sát
Khi người dùng tắt toàn bộ hoạt động giám sát, hệ thống PHẢI đóng kết nối và giải phóng bộ đệm.

#### Kịch Bản: Tắt giám sát
* **GIVEN**: Tiện ích đang chạy và có thể đang duy trì socket hoặc hàng đợi tin nhắn.
* **WHEN**: Trạng thái `monitoringActive` chuyển thành `false`.
* **THEN**: Đóng kết nối WebSocket (nếu có).
* **AND**: Hủy vòng lặp kết nối lại (`stopReconnectTimer()`).
* **AND**: Xóa toàn bộ các phần tử đang lưu trong `commentBuffer` (`commentBuffer.length = 0`).
* **AND**: Đặt trạng thái kết nối về `"disconnected"` và xóa bỏ các thông báo lỗi cũ.
