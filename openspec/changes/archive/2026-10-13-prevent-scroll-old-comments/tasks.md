# Nhiệm Vụ Triển Khai: Ngăn Chặn Cào Lại Bình Luận Cũ Khi Cuộn Trang (Tasks)

## 1. Cơ Chế Đóng Băng Bình Luận Ban Đầu

- [x] 1.1 Thêm hàm `premarkExistingComments(container)` trong `content-script.js` để quét tất cả `commentNode` hiện có trong khung chat, gán `data-ext-parsed="true"` và nạp fingerprint vào `seenHistoryCache`. Xác minh hàm chạy không lỗi khi container rỗng hoặc có node.
- [x] 1.2 Gọi `premarkExistingComments(container)` trong `startMonitoring()` ngay trước khi `MutationObserver` bắt đầu quan sát, đảm bảo các tin nhắn cũ có sẵn không bao giờ bị cào.

## 2. Bộ Nhớ Đệm Lịch Sử Toàn Phiên

- [x] 2.1 Khởi tạo `seenHistoryCache = new Set()` và hằng số `MAX_SEEN_HISTORY_SIZE = 3000` trong `content-script.js`.
- [x] 2.2 Xây dựng hàm `addSeenHistory(fingerprint)` tự động loại bỏ phần tử cũ nhất theo cơ chế FIFO khi số lượng mục đạt 3.000 để tránh tràn RAM.
- [x] 2.3 Cập nhật `parseCommentNode(node)`: kiểm tra `seenHistoryCache.has(fingerprint)`, nếu bình luận đã từng xuất hiện thì gán `data-ext-parsed="true"` và lập tức bỏ qua, không gửi `CHAT_MESSAGE`.
- [x] 2.4 Đảm bảo nạp fingerprint của bình luận mới hợp lệ vào `addSeenHistory(fingerprint)` khi gửi đi thành công, và giải phóng `seenHistoryCache.clear()` khi gọi `stopMonitoring()`.

## 3. Kiểm Thử Và Xác Minh Hành Vi

- [x] 3.1 Viết và chạy kịch bản kiểm thử mô phỏng hành vi Virtual Scroll re-mount và Initial Pre-mark để xác minh không một bình luận cũ nào bị gửi lại khi cuộn trang.
- [x] 3.2 Kiểm tra cú pháp mã nguồn bằng `node --check content-script.js`.

## 4. Đồng Bộ Bản Phát Hành

- [x] 4.1 Sao chép tệp `content-script.js` đã cập nhật sang thư mục `Release/content-script.js`.
- [x] 4.2 Kiểm tra đối soát mã băm file giữa thư mục gốc và thư mục `Release/content-script.js`.
