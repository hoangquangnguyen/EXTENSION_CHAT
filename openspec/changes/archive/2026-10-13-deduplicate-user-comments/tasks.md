# Nhiệm Vụ Triển Khai: Chống Trùng Lặp Bình Luận (Tasks)

## 1. Lược Đồ Lưu Trữ & Background Service Worker

- [x] 1.1 Cập nhật cấu hình mặc định trong `background.js`: bổ sung `dedup_enabled: true` và `dedup_window_seconds: 30` vào `connection_settings` và bộ khởi tạo phiên mặc định. Xác minh bằng cách kiểm tra storage khởi tạo có đủ 2 trường này.
- [x] 1.2 Cập nhật logic phản hồi thông điệp `GET_MY_TAB_CONFIG` trong `background.js` để đảm bảo chuyển tiếp đầy đủ `dedup_enabled` và `dedup_window_seconds` tới Content Script của tab yêu cầu.

## 2. Bộ Lọc Chống Trùng Lặp Trong Content Script

- [x] 2.1 Khởi tạo cấu trúc bộ nhớ đệm `dedupCache = new Map()` và các biến cấu hình `dedupEnabled`, `dedupWindowSeconds` trong `content-script.js`.
- [x] 2.2 Xây dựng hàm tạo fingerprint `getCommentFingerprint(author, message)` chuẩn hóa chữ thường và khoảng trắng, cùng hàm kiểm tra `isDuplicateComment(author, message)` dựa trên timestamp và cooldown window.
- [x] 2.3 Xây dựng cơ chế dọn dẹp bộ nhớ đệm tự động giải phóng các bản ghi hết hạn (TTL) và giới hạn cứng dung lượng tối đa 500 mục theo FIFO để tránh rò rỉ bộ nhớ.
- [x] 2.4 Tích hợp kiểm tra fingerprint vào `parseCommentNode(node)` trong `content-script.js`, đảm bảo bỏ qua và không gửi `CHAT_MESSAGE` nếu phát hiện bình luận trùng lặp khi `dedup_enabled = true`.
- [x] 2.5 Cập nhật hàm `updateState()` và lắng nghe thông điệp `TAB_CONFIG_UPDATED` để đồng bộ ngay lập tức cấu hình chống trùng lặp mới mà không cần reload trang.

## 3. Giao Diện Điều Khiển Popup UI

- [x] 3.1 Thêm điều khiển giao diện trong `popup/popup.html`: checkbox "Filter Duplicate Comments" (`input-dedup-enabled`) và ô nhập số "Duplicate Cooldown (seconds)" (`input-dedup-window`, min: 1, max: 300) vào panel Connection Settings.
- [x] 3.2 Tinh chỉnh stylesheet trong `popup/popup.css` để nhóm cài đặt lọc trùng hiển thị ngay ngắn, đồng bộ với phong cách giao diện hiện có.
- [x] 3.3 Cập nhật `popup/popup.js` để đọc, hiển thị giá trị cấu hình chống trùng từ storage khi mở Popup, và lưu lại khi người dùng bấm "Save Config".
- [x] 3.4 Đảm bảo Popup gửi thông điệp `TAB_CONFIG_UPDATED` kèm `dedup_enabled` và `dedup_window_seconds` tới Content Script khi lưu cấu hình.

## 4. Kiểm Thử Và Xác Minh Hành Vi

- [x] 4.1 Kiểm thử cơ chế fingerprint và cooldown trên công cụ `selector-tester.html` với kịch bản cùng một user gửi cùng một comment nhiều lần trong vòng 30s.
- [x] 4.2 Kiểm thử kịch bản hai user khác nhau gửi cùng nội dung comment và kịch bản khi tắt tùy chọn `dedup_enabled = false`.
- [x] 4.3 Kiểm thử chuyển tiếp dữ liệu trên cả 2 giao thức WebSocket và HTTP POST để đảm bảo payload không bị gián đoạn hay sai lệch.

## 5. Đồng Bộ Bản Phát Hành

- [x] 5.1 Sao chép các tệp đã cập nhật (`background.js`, `content-script.js`, `popup/popup.html`, `popup/popup.js`, `popup/popup.css`) từ thư mục gốc sang thư mục `Release/`.
- [x] 5.2 Kiểm tra đối soát tính toàn vẹn tệp giữa thư mục gốc và thư mục `Release/` để sẵn sàng đóng gói extension.
