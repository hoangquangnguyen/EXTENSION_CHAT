# Đề Xuất: Chuẩn Hóa Giao Diện Popup & Thay Thế Hộp Thoại AI Picker

## Bối Cảnh & Lý Do (Why)
Hiện tại, giao diện Popup ([`popup/popup.js`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.js)) đang tồn tại một số bất cập về trải nghiệm người dùng và tính nhất quán:
1. **Hộp thoại tương tác blocking (`window.prompt` và `window.alert`)**: Khi người dùng nhấn nút "Load AI" để lấy danh sách bot từ server, hệ thống sử dụng `window.prompt()` để nhập ID và `window.alert()` để báo lỗi. Các hộp thoại này làm đứng luồng thực thi JavaScript của trình duyệt và có nguy cơ khiến Chrome tự đóng cửa sổ Popup tiện ích khi người dùng nhấp ra ngoài.
2. **Trộn lẫn ngôn ngữ trên giao diện Popup**: Trong khi hầu hết các nhãn chính của Dashboard viết bằng Tiếng Anh, một số chuỗi lại dùng Tiếng Việt (ví dụ: tooltip nút "Load AI", placeholder ô nhập ID bot, huy hiệu trạng thái bot BẬT/TẮT, và các thông báo lỗi).
3. **Giữ nguyên URL GitHub**: Đối với địa chỉ URL tải bộ chọn từ GitHub, giữ nguyên hằng số hiện tại như yêu cầu của dự án.

Việc giải quyết các điểm trên sẽ giúp giao diện Popup hoạt động mượt mà, không bị gián đoạn, trực quan và chuyên nghiệp.

---

## Những Thay Đổi Cụ Thể (What Changes)

* **Xây dựng Modal Picker nội bộ cho tính năng Load AI (Non-blocking Dialog)**:
  * Loại bỏ hoàn toàn việc gọi `window.prompt()` và `window.alert()`.
  * Thêm Modal overlay `#ai-picker-modal` trong Popup UI với danh sách các instance bot AI có thể cuộn, kèm huy hiệu trạng thái `ACTIVE` / `INACTIVE`.
  * Cho phép người dùng nhấp chọn nhanh một bot với 1-click (tự động điền ID vào ô input và đóng modal) hoặc nhấn nút đóng (×).
  * Hiển thị lỗi kết nối trực tiếp trên thẻ thông báo nội bộ của Popup thay vì dùng `alert()`.
* **Chuẩn hóa ngôn ngữ giao diện sang Tiếng Anh đồng nhất**:
  * Chuẩn hóa toàn bộ tooltip, placeholder và thông báo trạng thái trên Popup sang Tiếng Anh để đồng bộ với phần còn lại của giao diện.
* **Chuẩn hóa tài liệu dự án bằng Tiếng Việt**:
  * Bảo đảm toàn bộ tài liệu đặc tả OpenSpec, giải thích kỹ thuật và hướng dẫn lập trình được duy trì chuẩn mực, đầy đủ và nhất quán bằng Tiếng Việt.

---

## Danh Mục Đặc Tả Bị Ảnh Hưởng (Capabilities)

### New Capabilities
*(Không có phân hệ mới nào được tạo thêm)*

### Modified Capabilities
- `popup-ui`: Chuẩn hóa giao diện Popup, thay thế hộp thoại blocking khi nạp bot AI bằng Modal UI nội bộ, và đồng bộ ngôn ngữ giao diện.

---

## Phạm Vi Ảnh Hưởng (Impact)
* **Tệp mã nguồn bị ảnh hưởng**:
  * [`popup/popup.html`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.html): Thêm khung HTML cho Modal chọn bot AI, chuẩn hóa thuộc tính `title` và `placeholder`.
  * [`popup/popup.css`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.css): Định kiểu dáng CSS cho Modal chọn bot AI theo phong cách Dark Mode hiện tại.
  * [`popup/popup.js`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.js): Cập nhật hàm `btnFetchAiList` để mở Modal nội bộ và render danh sách bot thay vì gọi `prompt`/`alert`.
* **Khả năng tương thích ngược**:
  * Hoàn toàn tương thích ngược 100%. Không làm thay đổi cơ chế cào DOM của [`content-script.js`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/content-script.js), logic mạng của [`offscreen/offscreen.js`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/offscreen/offscreen.js), hay nguồn tải bộ chọn GitHub trong [`selectors.json`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/selectors.json).
