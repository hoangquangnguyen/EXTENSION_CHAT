# Danh Sách Nhiệm Vụ (Tasks)

## 1. Cập Nhật Cấu Trúc Giao Diện & Kiểu Dáng (HTML & CSS)

- [x] 1.1 Thêm khung Modal `#ai-picker-modal` (header có nút đóng, container danh sách bot) vào [`popup/popup.html`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.html). Xác minh phần tử hiển thị đúng cấu trúc DOM.
- [x] 1.2 Thêm style CSS cho Modal Picker (overlay backdrop, scroll list, active badge, close button) trong [`popup/popup.css`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.css). Xác minh giao diện hài hòa với Dark Mode và không bị tràn khung Popup (600px).
- [x] 1.3 Chuẩn hóa các thuộc tính `title`, `placeholder` từ Tiếng Việt sang Tiếng Anh trong [`popup/popup.html`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.html). Xác minh không còn chuỗi Tiếng Việt trong mã HTML.

## 2. Xử Lý Logic JavaScript (Popup Controller)

- [x] 2.1 Thay thế toàn bộ lệnh gọi `window.prompt()` và `window.alert()` khi nhấn `btnFetchAiList` bằng việc mở Modal `#ai-picker-modal` trong [`popup/popup.js`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.js). Xác minh khi chọn bot, ID được cập nhật vào ô input và modal tự động đóng mượt mà.
- [x] 2.2 Hiển thị thông báo lỗi mạng hoặc thông báo không có bot trên banner nội bộ (`#test-result`) thay vì dùng `alert()` trong [`popup/popup.js`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.js). Xác minh thông báo lỗi hiển thị rõ ràng bằng Tiếng Anh.
- [x] 2.3 Chuẩn hóa trạng thái bot (`ACTIVE` / `INACTIVE`) và các chuỗi thông báo phản hồi trong [`popup/popup.js`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.js). Xác minh không còn alert/prompt nào trong mã JavaScript.

## 3. Đồng Bộ Bản Phân Phối & Kiểm Thử Toàn Diện

- [x] 3.1 Kiểm thử chức năng Load AI khi máy chủ online và khi máy chủ offline. Xác minh không có hộp thoại blocking nào xuất hiện và giao diện không bị treo.
- [x] 3.2 Kiểm tra xác nhận tính năng Update Online vẫn hoạt động bình thường với URL GitHub mặc định hiện tại. Xác minh selector được tải về và cập nhật thành công.
- [x] 3.3 Đồng bộ toàn bộ các tệp đã cập nhật ([`popup/popup.html`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.html), [`popup/popup.css`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.css), [`popup/popup.js`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.js)) sang thư mục [`Release/popup/`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/Release/popup/). Xác minh mã hash trùng khớp giữa thư mục gốc và thư mục Release.
