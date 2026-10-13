# Đặc Tả Cấu Trúc Dữ Liệu Lưu Trữ (Storage Schema Specification)

## Tổng Quan (Overview)
Tiện ích mở rộng sử dụng `chrome.storage.local` làm cơ chế lưu trữ bền vững (persistent local storage). Toàn bộ trạng thái phiên làm việc, thiết lập kết nối mạng, định nghĩa bộ chọn CSS và nhật ký lỗi kết nối đều được quản lý tại đây. Dữ liệu được đồng bộ bất đồng bộ qua API `chrome.storage.local.get` và `chrome.storage.local.set`, đồng thời phát sinh sự kiện qua `chrome.storage.onChanged` để các thành phần phản ứng kịp thời.

---

## Chi Tiết Các Khóa Lưu Trữ (Storage Key Contracts)

### 1. `connection_settings` (Cấu Hình Kết Nối Toàn Cục)
* **Kiểu dữ liệu**: `Object`
* **Mục đích**: Cung cấp cấu hình kết nối mặc định ban đầu cho các tab chưa có phiên riêng.
* **Cấu trúc trường**:
  * `host` (`string`): Địa chỉ IP hoặc tên miền của máy chủ đích (Mặc định: `"127.0.0.1"`).
  * `port` (`string`): Cổng kết nối dịch vụ (Mặc định: `"3003"`).
  * `protocol` (`string`): Giao thức mạng, nhận giá trị `"http"` hoặc `"ws"` (Mặc định: `"http"`).
  * `path` (`string`): Đường dẫn endpoint (Mặc định: `"/api/chat/tiktok-comment"`).
  * `ai_reply_id` (`string`): Mã bot/kịch bản mặc định (Mặc định: `"default"`).

### 2. `tab_sessions` (Cấu Hình Phiên Riêng Từng Tab)
* **Kiểu dữ liệu**: `Object` (Bản đồ ánh xạ từ `tabId` sang cấu hình phiên)
* **Mục đích**: Cô lập trạng thái chạy và cấu hình riêng biệt cho từng phòng live stream.
* **Cấu trúc mỗi phiên (`tab_sessions[tabId]`)**:
  * `tabId` (`number`): ID duy nhất của tab trình duyệt.
  * `ai_reply_id` (`string`): Định danh bot AI được gán riêng cho tab này.
  * `monitoring_active` (`boolean`): Trạng thái bật/tắt cào bình luận của tab.
  * `connection_settings` (`Object`): Cấu hình kết nối riêng của tab (có cấu trúc giống `connection_settings`).
  * `selectors` (`Object`): Bộ selector DOM riêng của tab.
  * `active_preset` (`string`): Tên preset đang kích hoạt trên tab (ví dụ: `"tiktok"`, `"shopee_live"`).
  * `updatedAt` (`number`): Mốc thời gian lưu cấu hình lần cuối (Unix Epoch ms).

### 3. `selector_presets` (Danh Mục Các Bộ Chọn Đã Đăng Ký)
* **Kiểu dữ liệu**: `Object` (Bản đồ từ mã preset sang thông tin preset)
* **Cấu trúc mỗi preset**:
  * `name` (`string`): Tên hiển thị người dùng (ví dụ: `"TikTok Live"`, `"Shopee Live"`).
  * `selectors` (`Object`): Đối tượng chứa các bộ chọn:
    * `chatContainer` (`string`): Bộ chọn CSS cho vùng chứa danh sách chat.
    * `commentNode` (`string`): Bộ chọn CSS cho từng hàng/thẻ bình luận.
    * `nickname` (`string`): Bộ chọn CSS cho tên hiển thị người dùng.
    * `username` (`string`): Bộ chọn CSS cho username/handle người dùng.
    * `message` (`string`): Bộ chọn CSS cho nội dung bình luận.
    * `profilePic` (`string`): Bộ chọn CSS cho ảnh đại diện.

### 4. `selectors` (Bộ Chọn Đang Hoạt Động Mặc Định)
* **Kiểu dữ liệu**: `Object`
* **Mục đích**: Bộ selector dự phòng khi tab chưa có phiên riêng.

### 5. `active_preset` (Mã Preset Mặc Định)
* **Kiểu dữ liệu**: `string` (Mặc định: `"tiktok"`).

### 6. `connection_status` (Trạng Thái Kết Nối Hiện Tại)
* **Kiểu dữ liệu**: `string`
* **Giá trị có thể có**: `"connected"` | `"connecting"` | `"disconnected"`.

### 7. `last_connection_error` (Thông Điệp Lỗi Kết Nối Gần Nhất)
* **Kiểu dữ liệu**: `string`
* **Mục đích**: Lưu trữ mô tả lỗi từ WebSocket hoặc HTTP fetch để hiển thị lên bảng chẩn đoán hoặc biểu ngữ cảnh báo trên giao diện Popup.

---

## Yêu Cầu Chức Năng (Requirements & Scenarios)

### Yêu Cầu 1: Đảm Bảo Tính Toàn Vẹn Cấu Trúc Khi Lưu
Khi Popup hoặc Background cập nhật một khóa trong `chrome.storage.local`, hệ thống PHẢI giữ nguyên các khóa khác và không làm mất dữ liệu các phiên tab khác.

#### Kịch Bản: Cập nhật cấu hình phiên cho Tab A
* **GIVEN**: Đang có phiên của Tab A và Tab B trong `tab_sessions`.
* **WHEN**: Người dùng lưu thay đổi cấu hình tại Tab A.
* **THEN**: Dữ liệu phiên của Tab B trong `tab_sessions` được giữ nguyên nguyên vẹn.
* **AND**: Chỉ có bản ghi `tab_sessions[TabA.id]` được cập nhật trường mới và cập nhật `updatedAt`.

---

### Yêu Cầu 2: Tự Động Di Trú (Migration) Tên Preset Cũ
Hệ thống PHẢI tự động chuyển đổi các preset cũ trong bộ nhớ (ví dụ: `"shopee"` đổi thành `"shopee_sh"`) để tương thích với các phiên bản tiện ích mới.

#### Kịch Bản: Phát hiện phiên bản preset cũ trong storage
* **GIVEN**: `chrome.storage.local` chứa khóa preset `presets.shopee`.
* **WHEN**: Hàm `loadPresetsAndInit()` khởi chạy trong Popup.
* **THEN**: Tự động đổi tên khóa thành `shopee_sh` với tên hiển thị là `"Shopee SH"`.
* **AND**: Cập nhật lại `chrome.storage.local` để đảm bảo tính nhất quán của hệ thống.
