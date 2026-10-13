# Đề Xuất Sửa Lỗi Xô Lệch Giao Diện Popup (Fix Popup Layout Shift)

## Why

Hiện tại, giao diện Popup điều khiển của extension bị lỗi vỡ layout và xô lệch nghiêm trọng khi người dùng tương tác, đặc biệt là khi nhấn nút "Test Connection". Nguyên nhân bắt nguồn từ lỗi cú pháp HTML (thiếu thẻ đóng `</div>` cho khối hàng flexbox chứa ô "AI Auto-Reply ID" và "Load AI", khiến khối "Filter Duplicate Comments" và phần tử thông báo `#test-result` bị nuốt vào bên trong flex-row), đồng thời làm cho thẻ container `#panel-config` không được đóng đúng cách và bao trùm luôn các accordion khác. Khi nhấn "Test Connection", phần tử `#test-result` chuyển từ `display: none` sang hiển thị, trở thành một flex item thứ 4 chen chúc trong hàng ngang 360px, ép co cụm toàn bộ các trường nhập liệu, gây vỡ giao diện và che khuất thông tin.

Việc khắc phục lỗi này là cần thiết ngay để người dùng có trải nghiệm điều khiển ổn định, quan sát rõ ràng trạng thái kiểm thử kết nối mạng và kiểm thử cào DOM mà không bị lệch hoặc mất các thành phần giao diện.

## What Changes

- **Sửa lỗi cú pháp cấu trúc HTML trong `popup.html`**:
  - Đóng đúng thẻ `</div>` cho hàng chứa "AI Auto-Reply ID" và nút "Load AI".
  - Tách hàng "Filter Duplicate Comments" và Cooldown thành một flex row độc lập.
  - Di dời `#test-result` thành một phần tử khối toàn chiều rộng (`width: 100%`) độc lập ở đáy của panel cấu hình kết nối.
  - Đóng đúng thẻ `</div>` cho container `#panel-config` để trả lại cấu trúc phân cấp chuẩn cho toàn bộ Accordion.
- **Tối ưu hóa hành vi kiểm thử trong `popup.js`**:
  - Khi người dùng nhấn nút "Test Connection", nếu accordion panel "Connection Settings" đang đóng, hệ thống tự động mở panel này ra để người dùng nhìn thấy tiến trình kiểm thử và kết quả.
  - Tương tự, khi nhấn "Test Scraper", nếu accordion panel "DOM Selectors" đang đóng, hệ thống tự động mở panel này ra để hiển thị `#scrape-test-result`.
- **Ổn định bố cục CSS trong `popup.css`**:
  - Đảm bảo `.test-result` hiển thị độc lập, có chiều rộng 100%, ngắt dòng rõ ràng (`word-break: break-word`) và không gây ảnh hưởng đến các flex item xung quanh.
  - Bổ sung thuộc tính `scrollbar-gutter: stable` cho `body` nhằm ngăn chặn hiện tượng giật cục / xô lệch ngang khi thanh cuộn dọc xuất hiện/biến mất.
  - Chuẩn hóa khoảng cách và bố cục thanh nút bấm `.action-bar`.
- **Đồng bộ mã nguồn**: Cập nhật cả mã nguồn chính trong `popup/` và bản phát hành trong `Release/popup/`.

## Capabilities

### New Capabilities
*(Không có năng lực mới)*

### Modified Capabilities
- `popup-ui`: Cập nhật đặc tả yêu cầu kiểm thử kết nối và kiểm thử cào DOM để quy định rõ hành vi hiển thị kết quả kiểm thử toàn chiều rộng, không làm xô lệch hoặc phá vỡ các trường nhập liệu và tự động mở panel tương ứng khi người dùng kích hoạt kiểm thử từ Action Bar.

## Impact

- **Mã nguồn bị ảnh hưởng**:
  - `popup/popup.html` & `Release/popup/popup.html`: Sửa cấu trúc DOM của Connection Settings và Accordion.
  - `popup/popup.css` & `Release/popup/popup.css`: Chuẩn hóa style `.test-result`, layout chống xô lệch `scrollbar-gutter`.
  - `popup/popup.js` & `Release/popup/popup.js`: Tự động bung accordion tương ứng khi nhấn "Test Connection" và "Test Scraper".
- **Hệ thống / API / Giao thức**: Không ảnh hưởng đến background, offscreen hay giao thức chuyển tiếp dữ liệu tới AI server. Đảm bảo 100% tính tương thích ngược.
