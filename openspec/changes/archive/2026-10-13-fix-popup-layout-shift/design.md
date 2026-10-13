# Tài Liệu Thiết Kế Kỹ Thuật (Design Document)

## Context

Xem `proposal.md` để nắm bối cảnh và lý do thay đổi.

Hiện tại, giao diện Popup hoạt động trên mô hình HTML tĩnh kết hợp Vanilla JS và CSS thuần. Toàn bộ cấu trúc giao diện được chứa trong một cửa sổ Popup cố định chiều rộng 360px với trần chiều cao tối đa 600px do trình duyệt Chrome quản lý.

Cấu trúc hiện tại của accordion "Connection Settings" (`#panel-config`) trong `popup/popup.html` bị lỗi thiếu thẻ đóng `</div>` ở khối hàng dòng thứ 3 (chứa `input-ai-id` và `btn-fetch-ai-list`), dẫn tới:
- Khối hàng dòng thứ 4 (`.dedup-row`) và khối thông báo `#test-result` bị trình duyệt hiểu nhầm là các phần tử con nằm trong hàng flexbox dòng 3.
- Thẻ đóng `</div>` vốn dành cho `#panel-config` bị tiêu thụ bởi dòng 3, khiến `#panel-config` không được đóng lại và ôm luôn các accordion phía sau (`#panel-selectors`, `#panel-diagnostics`).
- Khi `#test-result` hiển thị, việc chen ngang vào flex row gây xô lệch và ép dẹp các ô nhập liệu còn lại.

## Goals / Non-Goals

**Goals:**
- Khôi phục cấu trúc phân cấp DOM chuẩn xác, đóng đầy đủ thẻ cho từng flex row và đóng đúng container `#panel-config`.
- Đảm bảo `#test-result` là một khối độc lập toàn chiều ngang (`width: 100%`) ở cuối `#panel-config`.
- Tự động mở rộng panel "Connection Settings" khi nhấn "Test Connection" và panel "DOM Selectors" khi nhấn "Test Scraper" nếu chúng đang đóng.
- Ngăn chặn layout shift ngang khi thanh cuộn dọc xuất hiện bằng thuộc tính CSS `scrollbar-gutter: stable`.
- Đảm bảo đồng bộ mã nguồn 1:1 giữa `popup/` và `Release/popup/`.

**Non-Goals:**
- Không thay đổi logic kết nối WebSocket hoặc HTTP POST (`buildUrl`, fetch, WebSocket timeout).
- Không thay đổi lược đồ dữ liệu lưu trữ `chrome.storage.local` (`tab_sessions`, `connection_settings`).
- Không tác động tới các phân hệ `background.js`, `content-script.js` hay `offscreen/`.

## Decisions

### 1. Chuẩn hóa cấu trúc phân cấp DOM trong `popup.html`
- **Giải pháp**:
  - Đóng thẻ `</div>` ngay sau cột chứa nút `btn-fetch-ai-list` để kết thúc hàng AI Auto-Reply ID.
  - Giữ khối `.dedup-row` là một hàng flexbox độc lập tiếp theo.
  - Đặt `#test-result` ở cuối `#panel-config` dưới dạng khối độc lập (không nằm trong bất kỳ `.form-group.row` nào).
  - Đóng thẻ `</div>` cho `#panel-config` trước khi bắt đầu khối button `#btn-selectors`.
- **Lý do**: Khắc phục triệt để lỗi ép dẹp các input khi `#test-result` xuất hiện, đồng thời trả lại tính độc lập cho các accordion panels.
- **Phương án thay thế đã loại bỏ**: Di dời `#test-result` xuống dưới `.action-bar`. Lý do loại bỏ: Giữ nguyên tính tổ chức giao diện theo khu vực chức năng, nơi kết quả kiểm thử kết nối thuộc về cụm Connection Settings và kết quả cào DOM thuộc về cụm DOM Selectors.

### 2. Tự động mở Accordion Panel khi kích hoạt kiểm thử từ Action Bar
- **Giải pháp**:
  - Trong sự kiện click của `btnTestConn`, kiểm tra:
    ```javascript
    if (panelConfig && !panelConfig.classList.contains("active")) {
      btnConfig.classList.add("active");
      panelConfig.classList.add("active");
    }
    ```
  - Trong sự kiện click của `btnTestScrape`, kiểm tra:
    ```javascript
    if (panelSelectors && !panelSelectors.classList.contains("active")) {
      btnSelectors.classList.add("active");
      panelSelectors.classList.add("active");
    }
    ```
- **Lý do**: Nút kiểm thử nằm ở Action Bar cố định phía dưới. Nếu panel tương ứng đang thu gọn, người dùng bấm nút sẽ không nhìn thấy kết quả. Việc tự động mở panel giúp người dùng nhận được phản hồi trực quan ngay lập tức.

### 3. Ngăn ngừa gián đoạn layout bằng `scrollbar-gutter` và CSS Box Model
- **Giải pháp**:
  - Bổ sung `scrollbar-gutter: stable` cho `body` trong `popup.css`.
  - Thiết lập chiều rộng ổn định cho `.test-result` (`width: 100%`, `box-sizing: border-box`, `word-break: break-word`).
- **Lý do**: Khi kích thước nội dung vượt quá 600px, thanh cuộn của Chrome popup xuất hiện sẽ không làm giật chiều rộng của các phần tử 360px bên trong.

## Risks / Trade-offs

- **[Risk] Chiều cao Popup vượt 600px khi tự động bung panel**:
  → *Mitigation*: Khung Popup có cơ chế cuộn dọc (`overflow-y: auto`) mượt mà, người dùng có thể dễ dàng cuộn xem toàn bộ giao diện; `scrollbar-gutter: stable` đảm bảo không bị xô lệch ngang khi cuộn.
- **[Risk] Không đồng bộ giữa mã nguồn phát triển và bản Release**:
  → *Mitigation*: Mọi sửa đổi trên `popup.html`, `popup.css`, `popup.js` đều được nhân bản chính xác sang `Release/popup/`.
