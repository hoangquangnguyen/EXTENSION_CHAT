# Danh Sách Nhiệm Vụ Triển Khai (Tasks)

## 1. Cấu Trúc DOM và HTML (DOM Structure Fixes)

- [x] 1.1 Sửa lỗi thiếu thẻ đóng `</div>` tại khối hàng AI Auto-Reply ID trong `popup/popup.html`, đưa khối `dedup-row` và `#test-result` ra thành các khối độc lập bên dưới.
- [x] 1.2 Đóng thẻ `</div>` chuẩn xác cho container `#panel-config` trước khối `#btn-selectors` trong `popup/popup.html`, khôi phục tính độc lập cho toàn bộ các phần tử trong Accordion.

## 2. Kiểu Dáng CSS và Ổn Định Bố Cục (CSS Styling & Layout Stability)

- [x] 2.1 Cập nhật `popup/popup.css` đảm bảo `.test-result` là khối hiển thị toàn chiều ngang (`width: 100%`, `box-sizing: border-box`, `word-break: break-word`) không làm co cụm các trường dữ liệu lân cận.
- [x] 2.2 Bổ sung thuộc tính `scrollbar-gutter: stable` cho `body` trong `popup/popup.css` nhằm ngăn ngừa hiện tượng giật cục và xô lệch chiều ngang khi thanh cuộn dọc xuất hiện/biến mất.

## 3. Hành Vi Điều Khiển Accordion và Kiểm Thử (UI Controller Enhancements)

- [x] 3.1 Cập nhật `popup/popup.js` để tự động mở rộng panel `panel-config` khi người dùng nhấn nút `btn-test-conn` nếu panel đang ở trạng thái thu gọn.
- [x] 3.2 Cập nhật `popup/popup.js` để tự động mở rộng panel `panel-selectors` khi người dùng nhấn nút `btn-test-scrape` nếu panel đang ở trạng thái thu gọn.

## 4. Đồng Bộ Mã Nguồn Release và Kiểm Thử Hệ Thống (Release Sync & Verification)

- [x] 4.1 Đồng bộ toàn bộ các tệp đã sửa đổi (`popup.html`, `popup.css`, `popup.js`) từ thư mục `popup/` sang `Release/popup/`.
- [x] 4.2 Xác minh tính toàn vẹn của giao diện Popup khi nhấn "Test Connection" trên cả hai giao thức WebSocket (`ws://`) và HTTP POST (`http://`), đảm bảo kết quả hiển thị trọn vẹn và các ô nhập liệu không bị xô lệch hay ép dẹp.
- [x] 4.3 Kiểm thử thao tác nhấn "Test Scraper", xác minh accordion tự bung và giao diện ổn định khi tương tác với danh sách bình luận trực tiếp.
