# Spec Delta: popup-ui

## MODIFIED Requirements

### Requirement: Tải Danh Sách Bot AI Từ Máy Chủ Đích (Load AI)
Hệ thống MUST hỗ trợ lấy danh sách các phiên bản bot AI đang hoạt động từ máy chủ và hiển thị qua một giao diện Modal trực quan tích hợp sẵn trong Popup thay vì sử dụng các hộp thoại trình duyệt blocking (alert/prompt), đồng thời MUST sử dụng ngôn ngữ Tiếng Anh chuẩn thống nhất với toàn bộ giao diện.

#### Scenario: Lấy danh sách bot AI thành công
- **WHEN** Người dùng nhấn nút "Load AI" trên giao diện Popup
- **THEN** Hệ thống MUST gửi yêu cầu HTTP GET đến endpoint của máy chủ
- **AND** Hiển thị danh sách bot AI trong một Modal nội bộ với trạng thái [ACTIVE/INACTIVE]
- **AND** Khi người dùng nhấp chọn một bot, ID của bot đó MUST được điền vào ô "AI Auto-Reply ID" và đóng Modal

#### Scenario: Xử lý khi không có bot hoặc máy chủ mất kết nối
- **WHEN** Máy chủ trả về danh sách rỗng hoặc gặp lỗi kết nối
- **THEN** Hệ thống MUST hiển thị thông báo lỗi bằng Tiếng Anh trên banner thông báo của form mà không kích hoạt cửa sổ window.alert()

## ADDED Requirements

### Requirement: Chuẩn Hóa Toàn Diện Ngôn Ngữ Giao Diện Sang Tiếng Anh
Toàn bộ nhãn, placeholder, tooltip và thông báo phản hồi trên giao diện Popup MUST sử dụng Tiếng Anh thống nhất.

#### Scenario: Người dùng quan sát các trường giao diện
- **WHEN** Người dùng mở Popup Dashboard
- **THEN** Tất cả các nhãn, placeholder gợi ý, tiêu đề nút bấm và thông báo phản hồi MUST hiển thị bằng Tiếng Anh
