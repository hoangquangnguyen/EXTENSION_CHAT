# Đặc Tả Bộ Cào Bình Luận DOM (DOM Scraper Specification)

## Purpose
Bộ cào bình luận DOM được triển khai trong `content-script.js`, chạy trực tiếp trên các tab trình duyệt hiển thị luồng phát sóng trực tiếp (TikTok Live, Shopee Live), chịu trách nhiệm lắng nghe sự thay đổi của cây DOM theo thời gian thực bằng `MutationObserver`, trích xuất thông tin bình luận, lọc bỏ tin nhắn hệ thống, ngăn chặn trùng lặp bằng thuộc tính `data-ext-parsed="true"`, phát hiện dịch chuyển vùng chứa chat, và gửi gói tin về Background Service Worker.

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

## Requirements

### Requirement: Trích Xuất Dữ Liệu Bình Luận Thời Gian Thực Bằng MutationObserver
Content Script MUST theo dõi cây con của phần tử khung chat (`chatContainer`) bằng `MutationObserver` với cấu hình `{ childList: true, subtree: true }` để bắt các phần tử bình luận mới (`commentNode`).

#### Scenario: Phát hiện và trích xuất bình luận hợp lệ
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

### Requirement: Chống Trùng Lặp Bình Luận (Deduplication)
Content Script MUST ngăn chặn việc trích xuất và gửi trùng lặp cùng một nút DOM bình luận nhiều lần, đồng thời MUST ngăn chặn việc gửi lặp lại cùng một nội dung bình luận từ cùng một người dùng trong khoảng thời gian cửa sổ cooldown xác định khi tính năng chống trùng lặp được kích hoạt.

#### Scenario: Nút DOM đã được xử lý trước đó
* **GIVEN**: Một nút DOM bình luận đã được quét qua và gán thuộc tính `data-ext-parsed="true"`.
* **WHEN**: Nút DOM này tiếp tục gây ra sự kiện mutation (do hiệu ứng hoạt họa, cập nhật icon hoặc render lại).
* **THEN**: Hàm `parseCommentNode` kiểm tra `node.hasAttribute("data-ext-parsed")`.
* **AND**: Bỏ qua ngay lập tức, không gửi lại thông điệp `CHAT_MESSAGE`.

#### Scenario: Cùng một người dùng gửi cùng nội dung trong khoảng thời gian cooldown
* **GIVEN**: Tính năng chống trùng lặp đang bật (`dedup_enabled = true`) với thời gian cooldown là `T` giây (ví dụ: 30 giây).
* **WHEN**: Một bình luận mới xuất hiện từ người dùng `U` với nội dung `M`, và hệ thống đã ghi nhận bình luận có nội dung `M` từ người dùng `U` cách đó ít hơn `T` giây.
* **THEN**: Content Script phát hiện trùng lặp fingerprint `(U, M)`.
* **AND**: Bỏ qua bình luận này, KHÔNG gửi thông điệp `CHAT_MESSAGE` đến Background và Offscreen.

#### Scenario: Cùng một người dùng gửi cùng nội dung sau khi hết thời gian cooldown
* **GIVEN**: Tính năng chống trùng lặp đang bật (`dedup_enabled = true`) với thời gian cooldown là `T` giây.
* **WHEN**: Một bình luận mới xuất hiện từ người dùng `U` với nội dung `M`, và lần cuối cùng ghi nhận bình luận này đã vượt quá `T` giây.
* **THEN**: Content Script cho phép trích xuất bình luận, cập nhật mốc thời gian mới cho fingerprint `(U, M)`.
* **AND**: Gửi thông điệp `CHAT_MESSAGE` bình thường.

#### Scenario: Hai người dùng khác nhau gửi cùng nội dung bình luận
* **GIVEN**: Tính năng chống trùng lặp đang bật (`dedup_enabled = true`).
* **WHEN**: Người dùng `U1` và người dùng `U2` cùng gửi nội dung `M` trong cùng một khoảng thời gian.
* **THEN**: Do danh tính người gửi khác nhau, hai fingerprint `(U1, M)` và `(U2, M)` là phân biệt.
* **AND**: Hệ thống chuyển tiếp cả hai bình luận mà không bị chặn nhầm.

#### Scenario: Tính năng chống trùng lặp bị tắt
* **GIVEN**: Người dùng cấu hình tắt lọc trùng lặp (`dedup_enabled = false`).
* **WHEN**: Cùng một người dùng gửi cùng nội dung bình luận nhiều lần liên tiếp trên các nút DOM mới.
* **THEN**: Hệ thống bỏ qua bước kiểm tra fingerprint và chuyển tiếp tất cả các bình luận hợp lệ.

### Requirement: Lọc Bỏ Thông Báo Hệ Thống và Tin Nhắn Rỗng
Content Script MUST loại bỏ các thông báo không phải là bình luận thực sự của khán giả.

#### Scenario: Nhận thông báo hệ thống (vào phòng, tặng quà hệ thống không tên, v.v.)
* **GIVEN**: Một nút DOM mới xuất hiện trong khung chat nhưng không chứa cả `nickname` lẫn `username` (cả hai trường đều rỗng).
* **WHEN**: Hàm `parseCommentNode` kiểm tra thông tin người gửi.
* **THEN**: Hệ thống hủy xử lý nút DOM này và KHÔNG gửi gói tin đến máy chủ.

#### Scenario: Bình luận không có nội dung văn bản
* **GIVEN**: Một nút DOM có tên người dùng nhưng trường `message` sau khi `trim()` là rỗng.
* **WHEN**: Hàm `parseCommentNode` kiểm tra nội dung `message`.
* **THEN**: Hệ thống hủy xử lý nút DOM này và KHÔNG gửi gói tin đến máy chủ.

---

### Requirement: Tự Phục Hồi Khi Khung Chat Bị Dịch Chuyển (Container Shift Detection)
Các nền tảng livestream hiện đại (React/Vue/Virtual List) thường xuyên hủy và tạo lại phần tử chứa khung chat khi cuộn hoặc thay đổi bố cục. Content Script MUST định kỳ kiểm tra tính hợp lệ của vùng chứa chat đang theo dõi.

#### Scenario: Phần tử khung chat bị thay thế hoặc ngắt kết nối khỏi body
* **GIVEN**: `MutationObserver` đang theo dõi một phần tử DOM `lastObservedElement`.
* **WHEN**: Vòng lặp kiểm tra (`checkerInterval`, chu kỳ 2000ms) phát hiện phần tử đó không còn nằm trong `document.body` HOẶC phần tử khớp `chatContainer` hiện tại khác với `lastObservedElement`.
* **THEN**: Content Script tự động ngắt kết nối observer cũ (`observer.disconnect()`).
* **AND**: Tìm phần tử `chatContainer` mới trên trang và gắn lại `MutationObserver` mà không làm gián đoạn trạng thái giám sát của người dùng.

---

### Requirement: Chế Độ Kiểm Thử Cào Dữ Liệu Tức Thì (Test Scraper DOM)
Content Script MUST hỗ trợ phản hồi yêu cầu kiểm tra bộ chọn từ Popup UI thông qua thông điệp `TEST_SCRAPE_DOM` mà không cần bật chế độ giám sát chính thức.

#### Scenario: Người dùng bấm "Test Scraper" từ Popup UI
* **GIVEN**: Người dùng đang mở Popup UI trên một tab livestream.
* **WHEN**: Popup gửi thông điệp `TEST_SCRAPE_DOM` kèm theo bộ selector đang hiển thị trên form.
* **THEN**: Content Script tìm kiếm phần tử `chatContainer` và các nút `commentNode`.
* **AND**: Nếu tìm thấy, trích xuất tối đa 5 bình luận mẫu đầu tiên kèm tổng số lượng bình luận tìm thấy (`commentCount`).
* **AND**: Phản hồi lại cho Popup cấu trúc `{ success: true, commentCount: number, comments: Array }`.
* **AND**: Nếu không tìm thấy phần tử khung chat, phản hồi `{ success: false, error: "Chat container not found..." }`.

### Requirement: Quản Lý Bộ Nhớ Đệm Chống Trùng Lặp Tự Động Giải Phóng
Content Script MUST quản lý bộ nhớ đệm chống trùng lặp trong bộ nhớ RAM của tab sao cho không gây rò rỉ bộ nhớ trong suốt phiên phát sóng trực tiếp kéo dài.

#### Scenario: Dọn dẹp các mục hết hạn và giới hạn dung lượng bộ nhớ đệm
* **GIVEN**: Bộ nhớ đệm chống trùng lặp đang lưu trữ danh sách các bình luận đã gửi gần đây.
* **WHEN**: Số lượng mục trong bộ nhớ đệm đạt ngưỡng tối đa (500 mục) HOẶC khi có bình luận mới xuất hiện.
* **THEN**: Hệ thống tự động loại bỏ các bản ghi có thời gian tồn tại vượt quá thời gian cooldown (`now - timestamp > dedup_window_ms`).
* **AND**: Nếu dung lượng vẫn vượt ngưỡng tối đa, loại bỏ các bản ghi cũ nhất theo cơ chế FIFO để đảm bảo bộ nhớ luôn ổn định.

### Requirement: Ngăn Chặn Cào Lại Bình Luận Lịch Sử Khi Khởi Động Và Cuộn Trang
Content Script MUST ngăn chặn việc trích xuất và chuyển tiếp các bình luận cũ đã tồn tại trước khi bật giám sát hoặc các bình luận cũ được nạp lại do hành vi cuộn khung chat (Virtual List re-rendering).

#### Scenario: Đóng băng các bình luận có sẵn khi bắt đầu giám sát
* **GIVEN**: Khung chat đang hiển thị sẵn danh sách các bình luận cũ trước khi tiện ích bắt đầu giám sát.
* **WHEN**: Người dùng bật giám sát (`monitoring_active = true`).
* **THEN**: Content Script quét tất cả các phần tử khớp với `activeSelectors.commentNode` đang có trong khung chat.
* **AND**: Gán thuộc tính `data-ext-parsed="true"` và lưu fingerprint vào bộ nhớ lịch sử `seenHistoryCache`.
* **AND**: Không gửi bất kỳ thông điệp `CHAT_MESSAGE` nào đối với các phần tử ban đầu này.

#### Scenario: Bỏ qua bình luận cũ được mount lại khi người dùng cuộn khung chat
* **GIVEN**: Tiện ích đang trong phiên giám sát và đã từng ghi nhận bình luận `(U, M)` vào `seenHistoryCache`.
* **WHEN**: Người dùng cuộn ngược khung chat lên trên, khiến cơ chế Virtual List của trang web tạo mới (re-mount) một phần tử HTML cho bình luận `(U, M)` mà không có cờ `data-ext-parsed`.
* **THEN**: Content Script tính fingerprint của phần tử và kiểm tra `seenHistoryCache.has(fingerprint)`.
* **AND**: Nhận diện bình luận đã từng xuất hiện trong phiên, lập tức gán `data-ext-parsed="true"` và hủy xử lý, KHÔNG phát thông điệp `CHAT_MESSAGE`.

#### Scenario: Nhận diện bình luận mới thực sự được chèn vào luồng phát trực tiếp
* **GIVEN**: Khung chat đang hoạt động ở chế độ trực tiếp.
* **WHEN**: Một bình luận mới chưa từng xuất hiện trong `seenHistoryCache` được chèn vào luồng chat.
* **THEN**: Content Script trích xuất dữ liệu, lưu fingerprint vào cả `seenHistoryCache` và bộ lọc cooldown.
* **AND**: Gửi gói tin `CHAT_MESSAGE` bình thường.
