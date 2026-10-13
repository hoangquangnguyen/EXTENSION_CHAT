# Thiết Kế Kỹ Thuật: Cơ Chế Chống Trùng Lặp Bình Luận (Technical Design)

## Context
Hiện tại, tiện ích chỉ chống trùng lặp bằng cách đánh dấu thuộc tính `data-ext-parsed="true"` trên phần tử HTML của bình luận (`commentNode`) trong `content-script.js`. Tuy nhiên:
- Khung chat của TikTok Live sử dụng kỹ thuật Virtual List / Virtual DOM: khi cuộn hoặc cập nhật danh sách, các phần tử DOM cũ bị hủy và tái tạo lại mà không giữ lại thuộc tính `data-ext-parsed`, khiến `MutationObserver` bắt lại bình luận cũ.
- Khán giả livestream thường gõ lặp lại cùng một câu hỏi liên tục trong thời gian ngắn (spam bình luận), khiến máy chủ AI xử lý lặp lại không cần thiết.

Xem thêm `proposal.md` để hiểu bối cảnh và động lực của thay đổi này.

---

## Goals / Non-Goals

**Goals:**
- Ngăn chặn trùng lặp cùng một nội dung bình luận từ cùng một người dùng trong một khoảng thời gian xác định (`dedup_window_seconds`, mặc định 30 giây).
- Đặt tầng lọc ngay tại `content-script.js` để triệt tiêu gói tin thừa ngay từ đầu nguồn, giảm tải cho IPC `chrome.runtime.sendMessage`, Offscreen Document và Popup Live Preview.
- Duy trì tính độc lập hoàn toàn giữa các tab (`tab_sessions` isolation): mỗi tab duy trì bộ nhớ đệm chống trùng riêng trong môi trường Content Script của tab đó.
- Đảm bảo an toàn bộ nhớ (zero memory leak): tự động dọn dẹp các bản ghi hết hạn (TTL) và giới hạn kích thước bộ đệm (tối đa 500 mục, cơ chế FIFO).
- Cung cấp giao diện tùy chỉnh trong Popup UI (bật/tắt lọc trùng và tùy chỉnh số giây cooldown từ 1 đến 300 giây).

**Non-Goals:**
- So khớp ngữ nghĩa hoặc so sánh mờ (Fuzzy / Levenshtein matching): Không áp dụng so sánh mờ nội dung để tránh tính toán nặng nề và tránh lọc nhầm các câu hỏi khác biệt của người dùng. Chỉ so khớp nội dung văn bản chính xác sau khi chuẩn hóa (trim và lowercase).
- Lọc trùng liên tab (Cross-tab deduplication): Hai phòng livestream khác nhau trên hai tab khác nhau không bị ảnh hưởng lẫn nhau.

---

## Decisions

### Quyết định 1: Đặt bộ lọc trùng tại `content-script.js` thay vì `offscreen.js` hay `background.js`
* **Lý do**:
  - `content-script.js` là nơi đầu tiên trích xuất bình luận từ DOM. Nếu lọc tại đây, các thông điệp trùng lặp sẽ không bao giờ được gửi qua kênh IPC của Chrome, tiết kiệm CPU và tài nguyên toàn hệ thống.
  - Tự động cách ly theo từng tab: biến trạng thái cache nằm trong bộ nhớ riêng của từng Content Script mà không cần cơ chế gắn nhãn phức tạp.
  - Đảm bảo cả Popup Preview lẫn Offscreen đều nhận dữ liệu đã được làm sạch đồng nhất.
* **Phương án khác đã cân nhắc**: Lọc tại `offscreen.js`. Nhược điểm: Vẫn tốn IPC `chrome.runtime.sendMessage`, Popup vẫn nhận tin trùng lặp trong phần xem trước.

### Quyết định 2: Cấu trúc Fingerprint duy nhất cho mỗi bình luận
* **Công thức**:
  ```javascript
  const authorKey = (username || nickname).trim().toLowerCase();
  const messageKey = message.trim().toLowerCase();
  const fingerprint = `${authorKey}:::${messageKey}`;
  ```
* **Lý do**:
  - `username` (handle) là định danh duy nhất của khán giả. Trong trường hợp thiếu selector username, `nickname` được dùng làm fallback.
  - Chuẩn hóa chữ thường (`toLowerCase()`) và cắt khoảng trắng thừa (`trim()`) để xử lý trường hợp gõ hoa/thường không chủ ý.

### Quyết định 3: Cấu trúc dữ liệu Cache và cơ chế giải phóng bộ nhớ (TTL + FIFO Cap)
* **Cấu trúc**: Sử dụng `Map<string, number>` trong `content-script.js`, lưu cặp `fingerprint -> lastSeenTimestamp`.
* **Cơ chế dọn dẹp**:
  1. Khi kiểm tra một bình luận: nếu `Date.now() - lastSeenTimestamp < dedupWindowMs` -> Trùng lặp, bỏ qua.
  2. Dọn dẹp định kỳ hoặc khi nạp: duyệt qua Map để xóa các key có `Date.now() - timestamp >= dedupWindowMs`.
  3. Giới hạn cứng dung lượng (Max Size = 500): Nếu số lượng phần tử vượt quá 500, xóa phần tử cũ nhất ở đầu Map (`map.delete(map.keys().next().value)`).
* **Độ phức tạp**: Tra cứu $O(1)$, ghi $O(1)$, chiếm dụng bộ nhớ dưới 50KB RAM.

### Quyết định 4: Mở rộng Lược Đồ Lưu Trữ và Đồng Bộ Thời Gian Thực
* **Trường dữ liệu mới**:
  - `dedup_enabled`: `boolean` (mặc định: `true`)
  - `dedup_window_seconds`: `number` (mặc định: `30`, tối thiểu 1, tối đa 300)
* **Lưu trữ**:
  - Trong `connection_settings` (giá trị mặc định toàn cục khi cài extension).
  - Trong `tab_sessions[tabId]` (cấu hình độc lập của từng tab).
* **Đồng bộ**:
  - Khi lưu cấu hình hoặc thay đổi toggle trên Popup, thông điệp `TAB_CONFIG_UPDATED` gửi kèm `dedup_enabled` và `dedup_window_seconds` đến Content Script để cập nhật ngay lập tức mà không cần tải lại trang.

---

## Risks / Trade-offs

| Rủi ro (Risk) | Giải pháp giảm thiểu (Mitigation) |
| :--- | :--- |
| Khán giả hỏi lại câu hỏi sau 10s vì streamer chưa trả lời, bình luận bị bỏ qua | Thiết lập mặc định 30s là cân bằng hợp lý; người dùng có thể chủ động hạ thời gian xuống 5s hoặc tắt hoàn toàn tính năng qua Popup UI |
| Tải lại trang (F5) hoặc đổi luồng livestream làm mất cache | Hành vi tự nhiên: một buổi livestream mới bắt đầu cần cho phép nhận lại các bình luận từ đầu |
| Tràn bộ nhớ nếu phiên livestream kéo dài 10 tiếng với hàng chục ngàn bình luận | Áp dụng cả giới hạn thời gian (TTL) và giới hạn cứng (tối đa 500 mục theo FIFO), đảm bảo bộ nhớ luôn ổn định |

---

## Migration Plan
- Không có breaking change.
- Trong `background.js` (onInstalled) và `popup.js` (khi load cấu hình), nếu các thuộc tính `dedup_enabled` và `dedup_window_seconds` chưa tồn tại trong storage, gán giá trị mặc định tương ứng là `true` và `30`.
- Đồng bộ các file cập nhật sang thư mục `Release/`.
