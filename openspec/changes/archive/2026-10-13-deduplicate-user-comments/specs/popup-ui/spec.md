# Spec Delta: popup-ui

## ADDED Requirements

### Requirement: Điều Khiển Cấu Hình Chống Trùng Lặp Bình Luận Trên Popup
Giao diện Popup MUST cung cấp các trường điều khiển trực quan cho phép người dùng bật/tắt tính năng chống trùng lặp bình luận và điều chỉnh thời gian cửa sổ cooldown, với tất cả nhãn hiển thị bằng Tiếng Anh chuẩn.

#### Scenario: Hiển thị và thay đổi cấu hình chống trùng trên Popup
* **GIVEN**: Người dùng mở bảng điều khiển Popup trên một tab livestream hợp lệ.
* **WHEN**: Người dùng xem phần thiết lập trong panel cấu hình.
* **THEN**: Giao diện hiển thị checkbox "Filter Duplicate Comments" (mặc định được tích chọn) và ô nhập "Duplicate Cooldown (seconds)" (mặc định giá trị là 30, nhận giá trị số từ 1 đến 300).
* **AND**: Khi người dùng nhấn nút "Save Config", các giá trị này được lưu vào `tab_sessions[currentTabId]` và `connection_settings`.
* **AND**: Popup gửi thông điệp `TAB_CONFIG_UPDATED` ngay lập tức tới Content Script của tab hiện tại để áp dụng thay đổi trong thời gian thực.
