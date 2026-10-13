# Spec Delta: storage

## ADDED Requirements

### Requirement: Lưu Trữ Cấu Hình Chống Trùng Lặp Bình Luận
Hệ thống MUST lưu trữ và duy trì cấu hình chống trùng lặp bình luận bao gồm trạng thái kích hoạt (`dedup_enabled`) và thời gian cửa sổ lọc (`dedup_window_seconds`) trong `chrome.storage.local`.

#### Scenario: Khởi tạo giá trị mặc định cho cấu hình chống trùng
* **GIVEN**: Tiện ích vừa được cài đặt hoặc khởi chạy lần đầu với cấu hình chưa có trường chống trùng.
* **WHEN**: Background Service Worker hoặc Popup nạp cấu hình `connection_settings` hoặc phiên tab `tab_sessions`.
* **THEN**: Trường `dedup_enabled` được mặc định là `true`.
* **AND**: Trường `dedup_window_seconds` được mặc định là `30` (giây).

#### Scenario: Lưu và cách ly cấu hình chống trùng theo từng phiên tab
* **GIVEN**: Người dùng thay đổi thiết lập chống trùng lặp tại Tab A (ví dụ: `dedup_enabled = false` hoặc `dedup_window_seconds = 15`).
* **WHEN**: Người dùng lưu cấu hình trên giao diện Popup.
* **THEN**: Dữ liệu phiên của Tab A trong `tab_sessions[TabA.id]` được cập nhật với thiết lập riêng tương ứng.
* **AND**: Dữ liệu phiên của các Tab khác và cấu hình mặc định toàn cục không bị ghi đè sai lệch.
