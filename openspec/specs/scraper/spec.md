# Đặc Tả Bộ Cào Bình Luận DOM (DOM Scraper Specification)

## Tổng Quan (Overview)
Bộ cào bình luận DOM được triển khai trong `content-script.js`, chạy trực tiếp trên các tab trình duyệt hiển thị luồng phát sóng trực tiếp (TikTok Live, Shopee Live, hoặc bất kỳ trang web nào người dùng cấu hình). Phân hệ này chịu trách nhiệm lắng nghe sự thay đổi của cây DOM theo thời gian thực bằng `MutationObserver`, trích xuất thông tin bình luận, lọc bỏ tin nhắn hệ thống hoặc tin nhắn rác, ngăn chặn trùng lặp bằng thuộc tính đánh dấu, và gửi gói tin về Background Service Worker.

---

## Kiến Trúc và Vòng Đời Cào Dữ Liệu

```mermaid
flowchart TD
    Init[Nạp content-script.js] --> CheckContext{Extension Context Hợp Lệ?}
    CheckContext -- Không --> Stop[Dừng mọi Observer & Timer]
    CheckContext -- Có --> FetchConfig[Gửi GET_MY_TAB_CONFIG lên Background]
    FetchConfig --> ApplyConfig[Áp dụng Selectors & Trạng thái Giám sát]
    
    ApplyConfig --> IsActive{monitoring_active == true?}
    IsActive -- Không --> Idle[Chờ lệnh kích hoạt]
    IsActive -- Có --> StartObserver[Lắng nghe MutationObserver trên Chat Container]
    
    StartObserver --> Heartbeat[Khởi chạy Checker Loop mỗi 2000ms]
    Heartbeat --> CheckDOM{Container bị thay đổi hoặc detach?}
    CheckDOM -- Có --> StartObserver
    CheckDOM -- Không --> Heartbeat
    
    DOMNode[DOM Node mới được thêm vào] --> ParseNode[Hàm parseCommentNode]
    ParseNode --> CheckParsed{Đã có data-ext-parsed?}
    CheckParsed -- Đã có --> Ignore[Bỏ qua - Tránh trùng lặp]
    CheckParsed -- Chưa có --> Mark[Gắn data-ext-parsed = true]
    
    Mark --> ExtractFields[Trích xuất nickname, username, message, profilePic]
    ExtractFields --> Validate{Có message & (nickname HOẶC username)?}
    Validate -- Không --> Discard[Bỏ qua thông báo hệ thống / rác]
    Validate -- Có --> Dispatch[Gửi CHAT_MESSAGE kèm ai_reply_id & tabId]
```

---

## Yêu Cầu Chức Năng (Requirements & Scenarios)

### Yêu Cầu 1: Trích Xuất Dữ Liệu Bình Luận Thời Gian Thực Bằng MutationObserver
Content Script PHẢI theo dõi cây con của phần tử khung chat (`chatContainer`) bằng `MutationObserver` với cấu hình `{ childList: true, subtree: true }` để bắt các phần tử bình luận mới (`commentNode`).

#### Kịch Bản: Phát hiện và trích xuất bình luận hợp lệ
* **GIVEN**: Tiện ích đang kích hoạt giám sát trên một phòng livestream có khung chat đang mở.
* **WHEN**: Một phần tử HTML khớp với `activeSelectors.commentNode` được thêm vào khung chat.
* **THEN**: Content Script trích xuất:
  * `nickname`: Tên hiển thị (nếu có phần tử khớp `activeSelectors.nickname`).
  * `username`: Handle/ID người dùng (nếu có phần tử khớp `activeSelectors.username`).
  * `message`: Nội dung văn bản bình luận (`activeSelectors.message`).
  * `profilePic`: Đường dẫn URL ảnh đại diện (từ `src` hoặc `data-src` của `activeSelectors.profilePic`).
* **AND**: Đính kèm `timestamp: Date.now()`, `ai_reply_id` của tab hiện tại, và `tabId` của tab hiện tại.
* **AND**: Gửi thông điệp `CHAT_MESSAGE` đến Background Service Worker qua `chrome.runtime.sendMessage`.

---

### Yêu Cầu 2: Chống Trùng Lặp Bình Luận (Deduplication)
Content Script PHẢI ngăn chặn việc trích xuất và gửi trùng lặp cùng một nút DOM bình luận nhiều lần.

#### Kịch Bản: Nút DOM đã được xử lý trước đó
* **GIVEN**: Một nút DOM bình luận đã được quét qua và gán thuộc tính `data-ext-parsed="true"`.
* **WHEN**: Nút DOM này tiếp tục gây ra sự kiện mutation (do hiệu ứng hoạt họa, cập nhật icon hoặc render lại).
* **THEN**: Hàm `parseCommentNode` kiểm tra `node.hasAttribute("data-ext-parsed")`.
* **AND**: Bỏ qua ngay lập tức, không gửi lại thông điệp `CHAT_MESSAGE`.

---

### Yêu Cầu 3: Lọc Bỏ Thông Báo Hệ Thống và Tin Nhắn Rỗng
Content Script PHẢI loại bỏ các thông báo không phải là bình luận thực sự của khán giả.

#### Kịch Bản: Nhận thông báo hệ thống (vào phòng, tặng quà hệ thống không tên, v.v.)
* **GIVEN**: Một nút DOM mới xuất hiện trong khung chat nhưng không chứa cả `nickname` lẫn `username` (cả hai trường đều rỗng).
* **WHEN**: Hàm `parseCommentNode` kiểm tra thông tin người gửi.
* **THEN**: Hệ thống hủy xử lý nút DOM này và KHÔNG gửi gói tin đến máy chủ.

#### Kịch Bản: Bình luận không có nội dung văn bản
* **GIVEN**: Một nút DOM có tên người dùng nhưng trường `message` sau khi `trim()` là rỗng.
* **WHEN**: Hàm `parseCommentNode` kiểm tra nội dung `message`.
* **THEN**: Hệ thống hủy xử lý nút DOM này và KHÔNG gửi gói tin đến máy chủ.

---

### Yêu Cầu 4: Tự Phục Hồi Khi Khung Chat Bị Dịch Chuyển (Container Shift Detection)
Các nền tảng livestream hiện đại (React/Vue/Virtual List) thường xuyên hủy và tạo lại phần tử chứa khung chat khi cuộn hoặc thay đổi bố cục. Content Script PHẢI định kỳ kiểm tra tính hợp lệ của vùng chứa chat đang theo dõi.

#### Kịch Bản: Phần tử khung chat bị thay thế hoặc ngắt kết nối khỏi body
* **GIVEN**: `MutationObserver` đang theo dõi một phần tử DOM `lastObservedElement`.
* **WHEN**: Vòng lặp kiểm tra (`checkerInterval`, chu kỳ 2000ms) phát hiện phần tử đó không còn nằm trong `document.body` HOẶC phần tử khớp `chatContainer` hiện tại khác với `lastObservedElement`.
* **THEN**: Content Script tự động ngắt kết nối observer cũ (`observer.disconnect()`).
* **AND**: Tìm phần tử `chatContainer` mới trên trang và gắn lại `MutationObserver` mà không làm gián đoạn trạng thái giám sát của người dùng.

---

### Yêu Cầu 5: Chế Độ Kiểm Thử Cào Dữ Liệu Tức Thì (Test Scraper DOM)
Content Script PHẢI hỗ trợ phản hồi yêu cầu kiểm tra bộ chọn từ Popup UI thông qua thông điệp `TEST_SCRAPE_DOM` mà không cần bật chế độ giám sát chính thức.

#### Kịch Bản: Người dùng bấm "Test Scraper" từ Popup UI
* **GIVEN**: Người dùng đang mở Popup UI trên một tab livestream.
* **WHEN**: Popup gửi thông điệp `TEST_SCRAPE_DOM` kèm theo bộ selector đang hiển thị trên form.
* **THEN**: Content Script tìm kiếm phần tử `chatContainer` và các nút `commentNode`.
* **AND**: Nếu tìm thấy, trích xuất tối đa 5 bình luận mẫu đầu tiên kèm tổng số lượng bình luận tìm thấy (`commentCount`).
* **AND**: Phản hồi lại cho Popup cấu trúc `{ success: true, commentCount: number, comments: Array }`.
* **AND**: Nếu không tìm thấy phần tử khung chat, phản hồi `{ success: false, error: "Chat container not found..." }`.
