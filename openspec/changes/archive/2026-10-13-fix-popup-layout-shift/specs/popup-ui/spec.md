# Spec Delta

## MODIFIED Requirements

### Requirement: Kiểm Thử Kết Nối Mạng (Test Connection)
Người dùng MUST có khả năng kiểm tra xem máy chủ đích có thể tiếp cận được hay không trước khi bắt đầu livestream, với giao diện hiển thị phản hồi toàn chiều ngang ổn định, không làm xô lệch các trường nhập liệu và tự động mở panel cấu hình nếu đang đóng.

#### Scenario: Kiểm tra kết nối WebSocket
* **GIVEN**: Cấu hình đang chọn giao thức `ws`.
* **WHEN**: Người dùng nhấn nút `"Test Connection"` trên Action Bar.
* **THEN**: Popup kiểm tra panel `"Connection Settings"`, nếu đang đóng thì MUST tự động mở panel này ra để người dùng quan sát kết quả.
* **AND**: Popup tạo một kết nối thử nghiệm `new WebSocket(url)` với thời gian timeout là 5000ms.
* **AND**: Phần tử thông báo kết quả kiểm thử MUST hiển thị dạng khối toàn chiều ngang (block width 100%), không nằm chung hàng flexbox với các trường dữ liệu khác.
* **AND**: Nếu bắt được sự kiện `onopen`, hiển thị thông báo thành công màu xanh lá: `"Connection Success! WebSocket server is running..."` và tự động đóng socket thử nghiệm.
* **AND**: Nếu xảy ra lỗi hoặc quá 5 giây không phản hồi, hiển thị thông báo lỗi màu đỏ rõ ràng với thông tin lỗi được bọc ngắt dòng an toàn.

#### Scenario: Kiểm tra kết nối HTTP POST
* **GIVEN**: Cấu hình đang chọn giao thức `http`.
* **WHEN**: Người dùng nhấn nút `"Test Connection"` trên Action Bar.
* **THEN**: Popup kiểm tra panel `"Connection Settings"`, nếu đang đóng thì MUST tự động mở panel này ra.
* **AND**: Popup gửi một yêu cầu `fetch(url, { method: "GET", mode: "cors" })` với thời gian timeout 5000ms.
* **AND**: Phần tử thông báo hiển thị đầy đủ trạng thái đang kiểm tra (`Testing connection to...`) và kết quả phản hồi mà không làm biến dạng các ô nhập `AI Auto-Reply ID` hay `Filter Duplicate Comments`.
* **AND**: Nếu nhận được mã trạng thái HTTP, hiển thị thông báo thành công.

## ADDED Requirements

### Requirement: Kiểm Thử Bộ Chọn Cào DOM và Ổn Định Bố Cục Popup
Giao diện Popup MUST duy trì bố cục cố định và tự động mở accordion panel tương ứng khi người dùng thực hiện các thao tác kiểm thử từ Action Bar.

#### Scenario: Nhấn Test Scraper khi panel DOM Selectors đang đóng
* **GIVEN**: Người dùng đang mở Popup và panel `"DOM Selectors"` đang thu gọn.
* **WHEN**: Người dùng nhấn nút `"Test Scraper"` trên Action Bar.
* **THEN**: Hệ thống MUST tự động mở rộng panel `"DOM Selectors"` để hiển thị tiến trình quét DOM và kết quả kiểm thử.
* **AND**: Kết quả kiểm thử bộ chọn MUST hiển thị dưới dạng khối thông báo độc lập, không gây tràn khung ngang.

#### Scenario: Xuất hiện thanh cuộn dọc không gây xô lệch chiều ngang
* **GIVEN**: Người dùng mở các panel hoặc danh sách bình luận nhiều hơn chiều cao tối đa của cửa sổ Popup.
* **WHEN**: Nội dung kích hoạt thanh cuộn dọc của trình duyệt.
* **THEN**: Bố cục Popup MUST sử dụng cơ chế giữ chỗ cuộn ổn định (`scrollbar-gutter: stable`), ngăn ngừa hiện tượng giật giật (layout jitter/shift) và không làm co hẹp đột ngột các nút bấm hoặc trường dữ liệu.
