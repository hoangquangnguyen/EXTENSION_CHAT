# Đề Xuất: Cơ Chế Chống Trùng Lặp Bình Luận Theo Người Dùng (Deduplicate User Comments)

## Why
Trong các buổi phát sóng trực tiếp (TikTok Live, Shopee Live), hệ thống thường xuyên gặp phải tình trạng một người dùng gửi cùng một nội dung bình luận nhiều lần liên tiếp (spam bình luận), hoặc cơ chế tái sử dụng DOM (Virtual DOM/Virtual Scrolling của TikTok) gỡ bỏ và vẽ lại các phần tử bình luận mà không giữ lại cờ `data-ext-parsed="true"`. Tình trạng này khiến cùng một bình luận từ cùng một khán giả bị trích xuất và chuyển tiếp nhiều lần đến máy chủ AI/LLM, gây lãng phí tài nguyên xử lý (token, API calls), trùng lặp câu trả lời của AI và làm tràn bộ đệm hiển thị.

Cần bổ sung một cơ chế chống trùng lặp thông minh dựa trên danh tính người dùng và nội dung bình luận (User-Comment Fingerprint Deduplication) kết hợp cửa sổ thời gian (cooldown window), đồng thời cho phép người dùng tùy chỉnh bật/tắt và thời gian lọc ngay trên giao diện Popup.

## What Changes
- **Cơ chế lọc trùng lặp theo Fingerprint và Cửa sổ thời gian (Cooldown Window)**:
  - Tạo khóa định danh duy nhất (fingerprint) kết hợp giữa danh tính người dùng (`username` hoặc `nickname`) và nội dung bình luận đã chuẩn hóa (`message.trim().toLowerCase()`).
  - Quản lý bộ nhớ đệm chống trùng (in-memory Map/LRU cache) trong `content-script.js` cho từng tab riêng biệt, lưu trữ mốc thời gian xuất hiện lần cuối.
  - Tự động bỏ qua không chuyển tiếp nếu cùng một người dùng gửi cùng nội dung trong khoảng thời gian cửa sổ cooldown (mặc định 30 giây).
  - Tự động dọn dẹp các mục hết hạn (TTL) và giới hạn kích thước tối đa của bộ nhớ đệm (tối đa 500 mục) để ngăn chặn rò rỉ bộ nhớ (memory leak) trong các phiên livestream kéo dài nhiều giờ.
- **Mở rộng lược đồ lưu trữ cấu hình (`storage`)**:
  - Bổ sung trường cấu hình `dedup_enabled` (boolean, mặc định: `true`) và `dedup_window_seconds` (number, mặc định: `30`) vào `connection_settings` và `tab_sessions[tabId]`.
- **Cập nhật giao diện điều khiển Popup (`popup-ui`)**:
  - Bổ sung công tắc bật/tắt lọc trùng "Filter Duplicate Comments" và ô nhập thời gian cửa sổ lọc "Duplicate Cooldown (seconds)" trong phần thiết lập cấu hình của Popup UI.
  - Đồng bộ cấu hình lọc trùng tới tab hiện tại thông qua thông điệp `TAB_CONFIG_UPDATED`.

## Capabilities

### New Capabilities
*(Không có phân hệ mới hoàn toàn; thay đổi mở rộng các đặc tả hiện có)*

### Modified Capabilities
- `scraper`: Mở rộng cơ chế chống trùng lặp trong Content Script. Bên cạnh kiểm tra thuộc tính DOM `data-ext-parsed="true"`, bổ sung tầng lọc fingerprint `(user, message)` kết hợp cửa sổ thời gian cooldown có thể cấu hình.
- `storage`: Bổ sung các trường `dedup_enabled` và `dedup_window_seconds` vào cấu trúc dữ liệu `connection_settings` và `tab_sessions[tabId]`.
- `popup-ui`: Bổ sung các điều khiển giao diện trong Popup cho phép người dùng bật/tắt và tùy chỉnh thời gian lọc trùng lặp bình luận.

## Impact
- **Content Script (`content-script.js`)**: Bổ sung logic tính fingerprint, kiểm tra cache và cơ chế tự động dọn dẹp bộ nhớ đệm trước khi gửi thông điệp `CHAT_MESSAGE`.
- **Popup UI (`popup/popup.html`, `popup/popup.js`, `popup/popup.css`)**: Bổ sung input checkbox và number input trong giao diện cấu hình, cập nhật logic lưu/nạp cấu hình.
- **Background Service Worker (`background.js`)**: Cập nhật giá trị mặc định cho `connection_settings` khi cài đặt extension để đảm bảo trường `dedup_enabled` và `dedup_window_seconds` luôn sẵn sàng.
- **Tương thích ngược**: Hoàn toàn tương thích ngược. Nếu các phiên cũ chưa có trường này trong storage, hệ thống sẽ tự động gán giá trị mặc định (`dedup_enabled: true`, `dedup_window_seconds: 30`). Gói tin `payload` gửi đi giữ nguyên cấu trúc chuẩn, không ảnh hưởng đến máy chủ tiếp nhận.
