# Spec Delta: scraper

## ADDED Requirements

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
