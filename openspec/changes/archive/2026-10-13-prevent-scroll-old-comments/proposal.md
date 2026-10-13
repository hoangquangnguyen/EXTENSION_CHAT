# Đề Xuất: Ngăn Chặn Cào Lại Bình Luận Cũ Khi Cuộn Trang (Prevent Re-scraping Old Comments On Scroll)

## Why
Trong các phiên phát sóng trực tiếp trên TikTok Live (và Shopee Live), khung chat sử dụng kỹ thuật Virtual List / Virtual DOM. Khi người dùng cuộn chuột ngược lên trên để xem các bình luận trước đó, TikTok sẽ tạo mới (re-mount) các phần tử DOM của bình luận cũ vào khung chat mà không giữ lại cờ `data-ext-parsed="true"`. Đồng thời, khi người dùng vừa mở trang livestream và bật tiện ích, trong khung chat đã tồn tại sẵn hàng chục bình luận cũ. Tình trạng này khiến các bình luận trong quá khứ bị bắt lại bởi `MutationObserver`, gán nhãn `Date.now()` của hiện tại và gửi đi hàng loạt như bình luận mới, gây quá tải và làm sai lệch luồng xử lý AI.

Cần bổ sung cơ chế đóng băng (pre-mark) các bình luận có sẵn khi bắt đầu giám sát, duy trì bộ nhớ lịch sử toàn phiên (`seenHistoryCache`), và nhận diện vị trí chèn tin nhắn mới để triệt tiêu hoàn toàn việc cào lại tin nhắn cũ khi cuộn trang.

## What Changes
- **Đóng băng bình luận ban đầu (Initial Pre-marking)**:
  - Khi bắt đầu giám sát (`startMonitoring`), tự động quét và đánh dấu `data-ext-parsed="true"` cho tất cả các phần tử `commentNode` đang hiện diện sẵn trong khung chat, đồng thời lưu fingerprint của chúng vào bộ nhớ lịch sử để không cào các bình luận cũ này.
- **Bộ nhớ đệm lịch sử toàn phiên (`seenHistoryCache`)**:
  - Quản lý một `seenHistoryCache` (Set/FIFO map) lưu trữ tới 5.000 fingerprint bình luận đã từng xuất hiện hoặc được pre-mark trong suốt buổi livestream của tab.
  - Khi người dùng cuộn trang khiến Virtual DOM tạo lại bất kỳ node nào của bình luận cũ đã từng xuất hiện, tiện ích kiểm tra `seenHistoryCache` và bỏ qua ngay lập tức.
- **Nhận diện trạng thái cuộn và vị trí chèn tin nhắn (Live Bottom Insertion Detection)**:
  - Kiểm tra xem khung chat có đang ở trạng thái cuộn trực tiếp hay không (`isNearBottom`).
  - Trong luồng livestream tự nhiên, bình luận mới luôn được chèn ở cuối danh sách. Nếu người dùng đang cuộn lên xem lịch sử và node được chèn không phải ở đáy, coi đó là node lịch sử từ virtual list và bỏ qua không chuyển tiếp.

## Capabilities

### New Capabilities
*(Không có phân hệ mới hoàn toàn)*

### Modified Capabilities
- `scraper`: Mở rộng khả năng cào bình luận với cơ chế đóng băng tin nhắn cũ khi khởi động (initial pre-marking), bộ nhớ lịch sử toàn phiên (`seenHistoryCache`) và lọc bỏ các bình luận re-render khi cuộn trang.

## Impact
- **Content Script (`content-script.js`)**: Bổ sung hàm pre-mark các node hiện hữu, bổ sung `seenHistoryCache`, cập nhật logic `parseCommentNode` và `MutationObserver` callback.
- **Tương thích ngược**: Không thay đổi cấu trúc dữ liệu Payload, không ảnh hưởng đến Background Service Worker, Offscreen hay Popup UI.
