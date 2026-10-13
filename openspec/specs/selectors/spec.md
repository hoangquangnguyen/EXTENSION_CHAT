# Đặc Tả Quản Lý và Cập Nhật Bộ Chọn DOM (Selectors Specification)

## Tổng Quan (Overview)
Các nền tảng livestream lớn như TikTok và Shopee thường xuyên cập nhật giao diện và làm mờ (obfuscate/hash) tên class CSS trong cây DOM. Để hệ thống hoạt động linh hoạt mà không cần phải phát hành lại phiên bản tiện ích mở rộng mỗi khi class thay đổi, LIVE Relayer áp dụng cơ chế:
1. **Bộ chọn cài sẵn (Built-in Presets)**: Cung cấp danh sách các selector tương thích rộng rãi (multi-selector phân tách bằng dấu phẩy) cho TikTok Live, Shopee SH, và Shopee Live trong `selectors.json`.
2. **Bộ chọn tùy biến (Custom Import)**: Cho phép người dùng nhập cấu hình selector từ tệp JSON ngoại vi.
3. **Cập nhật trực tuyến (Online Update)**: Tải và đồng bộ cấu hình selector mới nhất từ kho lưu trữ GitHub chính thức.
4. **Công cụ chẩn đoán ngoại tuyến (Selector Tester)**: Giao diện kiểm thử trực quan độc lập (`selector-tester.html`) để kiểm tra bộ chọn trên các tệp HTML mẫu hoặc mã nguồn trang web đã lưu.

---

## Danh Mục Bộ Chọn Cài Sẵn (Built-in Presets)

### 1. TikTok Live (`preset: "tiktok"`)
* **chatContainer**: `[data-e2e="live-chat-container"], .webcast-chatroom___list, .webcast-chatroom___message-list, [data-testid='chatroom-message-list']`
* **commentNode**: `[data-e2e="chat-message"], .webcast-chatroom___item, .webcast-chatroom___message-item, [data-testid='chatroom-message-item']`
* **nickname**: `[data-e2e="message-owner-name"], .webcast-chatroom___nickname, .webcast-chatroom___author-name, .nickname`
* **username**: `[data-e2e="message-owner-name"], .webcast-chatroom___username, .webcast-chatroom___author-handle, .username`
* **message**: `div:nth-child(2) > div:nth-child(2), .webcast-chatroom___content, .webcast-chatroom___message-text, .content`
* **profilePic**: `div:first-child img, .webcast-chatroom___avatar img, .avatar img`

### 2. Shopee SH (`preset: "shopee_sh"`)
* **chatContainer**: `.shopee-live-chat-list, .chat-list, div.relative.h-full.w-full.flex-col.overflow-hidden > div.flex-1, .flex-1.overflow-y-auto.space-y-3.mb-4.pr-2, .flex-1.overflow-y-auto.space-y-3`
* **commentNode**: `.shopee-live-chat-item, .chat-item, .chat-message-item, .group.flex.flex-col.p-3.rounded-2xl`
* **nickname**: `.shopee-live-chat-nickname, .nickname, .name, span.font-bold, span.text-slate-300, .text-xs.font-bold.text-slate-300`
* **username**: `.shopee-live-chat-username, .username, span.font-bold, span.text-slate-300, .text-xs.font-bold.text-slate-300`
* **message**: `.shopee-live-chat-message, .message, .content, span.break-words, p.leading-relaxed, p.text-slate-200`

### 3. Shopee Live Virtualized (`preset: "shopee_live"`)
* **chatContainer**: `.ReactVirtualized__Grid__innerScrollContainer, div[role="rowgroup"]`
* **commentNode**: `[class*="comment-container_"]`
* **nickname**: `[class*="user-name_"]`
* **username**: `[class*="user-name_"]`
* **message**: `[class*="message-content_"]`

---

## Yêu Cầu Chức Năng (Requirements & Scenarios)

### Yêu Cầu 1: Chuyển Đổi Nhanh Nền Tảng (Preset Switching)
Giao diện Popup PHẢI cung cấp danh sách lựa chọn nền tảng và tự động điền các trường selector tương ứng khi người dùng chọn một preset.

#### Kịch Bản: Chọn preset nền tảng khác
* **GIVEN**: Popup UI đang mở trên màn hình.
* **WHEN**: Người dùng chọn một preset từ menu chọn (ví dụ: chuyển từ `"TikTok Live"` sang `"Shopee Live"`).
* **THEN**: Các ô nhập liệu (`selContainer`, `selNode`, `selNickname`, `selUsername`, `selMessage`, `selProfile`) tự động được cập nhật bằng giá trị từ preset đã chọn.
* **AND**: Hiển thị thông báo xác nhận: `"Loaded preset: Shopee Live"`.

---

### Yêu Cầu 2: Nhập Bộ Chọn Từ Tệp JSON (Import JSON)
Hệ thống PHẢI cho phép nạp bộ chọn hoặc danh sách presets từ tệp JSON cục bộ của người dùng.

#### Kịch Bản: Nạp tệp JSON chứa một cấu hình selector đơn lẻ
* **GIVEN**: Người dùng bấm nút `"Load JSON"` và chọn một tệp `.json` chứa các khóa `{ chatContainer, commentNode, nickname, message }`.
* **WHEN**: Trình duyệt đọc và phân tích cú pháp tệp JSON thành công.
* **THEN**: Điền các giá trị đọc được vào các ô nhập liệu của form.
* **AND**: Đặt menu preset sang lựa chọn `"Custom / Uploaded JSON"` và hiển thị thông báo thành công.

#### Kịch Bản: Nạp tệp JSON chứa danh sách presets
* **GIVEN**: Tệp JSON chứa đối tượng `{ presets: { ... }, default: "..." }`.
* **WHEN**: Trình duyệt phân tích tệp JSON.
* **THEN**: Hệ thống hợp nhất các preset mới vào `loadedPresets`, cập nhật lại danh sách dropdown và áp dụng preset mặc định được chỉ định.

---

### Yêu Cầu 3: Cập Nhật Bộ Chọn Trực Tuyến Từ GitHub (Update Online)
Hệ thống PHẢI hỗ trợ lấy tệp định nghĩa bộ chọn mới nhất từ kho lưu trữ GitHub chính thức khi người dùng nhấn nút `"Update Online"`.

#### Kịch Bản: Cập nhật thành công từ GitHub
* **GIVEN**: Thiết bị có kết nối Internet.
* **WHEN**: Người dùng bấm nút `"Update Online"`.
* **THEN**: Hệ thống gửi yêu cầu `fetch` đến `https://raw.githubusercontent.com/hoangquangnguyen/EXTENSION_CHAT/master/selectors.json`.
* **AND**: Khi nhận được phản hồi hợp lệ, lưu `selector_presets` và `selectors` mới vào `chrome.storage.local`.
* **AND**: Hiển thị thông báo `"Selectors updated successfully from GitHub!"`.

---

### Yêu Cầu 4: Kiểm Thử Bộ Chọn Ngoại Tuyến (Offline Testing Tool)
Hệ thống PHẢI cung cấp công cụ `selector-tester.html` cho phép nhà phát triển kiểm tra độ chính xác của các selector trên mã nguồn HTML mẫu mà không cần kết nối mạng hay mở live stream thực tế.

#### Kịch Bản: Kiểm tra selector trên file HTML dump
* **GIVEN**: Nhà phát triển mở công cụ `selector-tester.html` trên trình duyệt.
* **WHEN**: Dán hoặc tải tệp HTML lưu trữ từ `htmltest/` (ví dụ: `shopeelive.html`) và nhập bộ selector cần thử nghiệm.
* **THEN**: Công cụ thực hiện trích xuất trong DOM ảo, hiển thị số lượng bình luận tìm thấy, hiển thị danh sách kết quả trực quan (tên, avatar, nội dung) và tô sáng các lỗi nếu selector không tìm thấy phần tử.
