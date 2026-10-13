# Spec Delta: scraper

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Quản Lý Bộ Nhớ Đệm Chống Trùng Lặp Tự Động Giải Phóng
Content Script MUST quản lý bộ nhớ đệm chống trùng lặp trong bộ nhớ RAM của tab sao cho không gây rò rỉ bộ nhớ trong suốt phiên phát sóng trực tiếp kéo dài.

#### Scenario: Dọn dẹp các mục hết hạn và giới hạn dung lượng bộ nhớ đệm
* **GIVEN**: Bộ nhớ đệm chống trùng lặp đang lưu trữ danh sách các bình luận đã gửi gần đây.
* **WHEN**: Số lượng mục trong bộ nhớ đệm đạt ngưỡng tối đa (500 mục) HOẶC khi có bình luận mới xuất hiện.
* **THEN**: Hệ thống tự động loại bỏ các bản ghi có thời gian tồn tại vượt quá thời gian cooldown (`now - timestamp > dedup_window_ms`).
* **AND**: Nếu dung lượng vẫn vượt ngưỡng tối đa, loại bỏ các bản ghi cũ nhất theo cơ chế FIFO để đảm bảo bộ nhớ luôn ổn định.
