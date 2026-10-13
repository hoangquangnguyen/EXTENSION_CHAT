# Hướng Dẫn Dành Cho AI Coding Agents (AI Agent Guidelines)

Chào mừng bạn đến với kho lưu trữ **LIVE Relayer**! Tài liệu này quy định cách các trợ lý AI (AI Coding Agents) phải làm việc với dự án này để đảm bảo tính an toàn, nhất quán kiến trúc và tuân thủ quy trình chuẩn **OpenSpec**.

---

## 1. Tổng Quan Dự Án (Project Overview)
**LIVE Relayer** là một tiện ích mở rộng trình duyệt Chrome tuân thủ chuẩn **Manifest V3 (MV3)**, dùng để cào bình luận thời gian thực từ các luồng phát sóng trực tiếp (TikTok Live, Shopee Live) và chuyển tiếp tới máy chủ AI/LLM cục bộ hoặc từ xa qua **WebSocket (`ws://`)** hoặc **HTTP POST (`http://`)**.

Hệ thống hoạt động theo mô hình 4 tầng độc lập:
1. **Content Script (`content-script.js`)**: Cào DOM bằng `MutationObserver`, chống trùng lặp qua `data-ext-parsed="true"`.
2. **Background Service Worker (`background.js`)**: Quản lý vòng đời tiện ích, phiên đa tab và tài liệu ngầm `chrome.offscreen`.
3. **Offscreen Document (`offscreen/offscreen.js`)**: Duy trì kết nối mạng lâu dài và quản lý hàng đợi bộ đệm FIFO (tối đa 100 tin nhắn).
4. **Popup UI (`popup/`)**: Giao diện điều khiển, cấu hình mạng, bộ chọn CSS và xem trước bình luận trực tiếp.

---

## 2. Tài Liệu Quan Trọng Cần Đọc (Critical Documentation)

Trước khi thực hiện bất kỳ công việc nào, AI Agent PHẢI nghiên cứu các tài liệu sau:

* [**`openspec/project.md`**](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/project.md): **Nguồn tri thức cốt lõi của dự án**. Cung cấp bức tranh toàn cảnh về kiến trúc 4 tầng, luồng dữ liệu, hợp đồng dữ liệu lưu trữ, nợ kỹ thuật và các quy tắc phát triển.
* [**`openspec/specs/`**](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/): **Các đặc tả hành vi hiện tại của từng phân hệ**:
  * [`architecture/spec.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/architecture/spec.md): Kiến trúc Manifest V3, Message Passing, vòng đời Offscreen Document.
  * [`scraper/spec.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/scraper/spec.md): Cơ chế cào bình luận DOM, MutationObserver, phát hiện shift container và chống trùng lặp.
  * [`relay/spec.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/relay/spec.md): Giao thức WebSocket / HTTP POST, hàng đợi FIFO 100 phần tử, tự động kết nối lại mỗi 5s.
  * [`session/spec.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/session/spec.md): Quản lý phiên đa tab độc lập (`tab_sessions`), định danh bot AI (`ai_reply_id`), dọn dẹp khi đóng tab.
  * [`selectors/spec.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/selectors/spec.md): Cấu hình bộ chọn cài sẵn, nạp JSON tùy chỉnh, cập nhật từ GitHub và công cụ `selector-tester.html`.
  * [`storage/spec.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/storage/spec.md): Lược đồ dữ liệu lưu trữ bền vững trong `chrome.storage.local`.
  * [`popup-ui/spec.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/popup-ui/spec.md): Giao diện Popup Dashboard, bảng chẩn đoán hệ thống và xem trước bình luận.
* [**`openspec/changes/`**](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/changes/): Thư mục chứa các đề xuất thay đổi đang thực hiện hoặc đã lưu trữ (`archive/`).
* [**`openspec/config.yaml`**](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/config.yaml): Cấu hình quy chuẩn và chỉ dẫn của OpenSpec cho dự án.

---

## 3. Quy Trình Làm Việc Khi Nhận Nhiệm Vụ (AI Agent Workflow)

### Bước 1: Trước Khi Chỉnh Sửa Mã Nguồn (Before Coding)
Mỗi AI Agent khi bắt đầu làm việc PHẢI:
1. Đọc kỹ [`openspec/project.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/project.md).
2. Xác định các phân hệ và đặc tả liên quan trong [`openspec/specs/`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/specs/).
3. Kiểm tra mã nguồn thực tế bị ảnh hưởng (`background.js`, `content-script.js`, `offscreen/`, `popup/`).
4. Kiểm tra xem có đề xuất thay đổi nào đang mở trong `openspec/changes/` hay không.
5. Nắm rõ các ràng buộc kiến trúc quan trọng:
   - **Tuyệt đối không di dời kết nối mạng về Service Worker** (`background.js`) vì Chrome MV3 sẽ ngắt kết nối.
   - **Giữ nguyên logic đánh dấu chống trùng lặp** `data-ext-parsed="true"` trong `content-script.js`.
   - **Duy trì tính tương thích của Payload**: `nickname`, `username`, `message`, `profilePic`, `timestamp`, `ai_reply_id`, `tabId`.
   - **Không tự ý chuyển đổi Vanilla JS sang React/Vue/TypeScript** trừ khi có yêu cầu rõ ràng.

### Bước 2: Quy Trình Phát Triển Tính Năng / Vá Lỗi (OpenSpec Lifecycle)
Mọi thay đổi chức năng đều PHẢI tuân thủ vòng đời OpenSpec tiêu chuẩn:
```
proposal (Đề xuất)
   ↓
design (Thiết kế kiến trúc)
   ↓
specs (Đặc tả hành vi: Requirements & Scenarios GIVEN/WHEN/THEN)
   ↓
tasks (Danh sách nhiệm vụ có thể kiểm thử)
   ↓
implementation (Triển khai mã nguồn)
   ↓
verification (Kiểm thử và xác minh hành vi)
   ↓
archive (Lưu trữ và đồng bộ vào openspec/specs/)
```

### Bước 3: Trước Khi Sửa Code
AI Agent PHẢI xác định xem hành vi cần sửa đã có trong các đặc tả tại `openspec/specs/` hay chưa:
* Nếu hành vi chưa tồn tại hoặc bị thay đổi: Khởi tạo một OpenSpec Change mới bằng workflow `opsx-new` hoặc skill `openspec-new-change`.
* Nếu chỉ là bổ sung tài liệu: Cập nhật trực tiếp vào file đặc tả tương ứng.

### Bước 4: Sau Khi Triển Khai (After Implementation)
Sau khi viết mã nguồn, AI Agent PHẢI:
1. Kiểm tra xác minh: Dùng `selector-tester.html` và kiểm tra logic trên các tab Popup/Offscreen.
2. Đồng bộ mã nguồn giữa thư mục gốc và thư mục [`Release/`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/Release/) nếu có thay đổi file runtime của extension.
3. Cập nhật các đặc tả tại `openspec/specs/` để phản ánh đúng hành vi mới nhất.
4. Đảm bảo tính tương thích ngược với các Server AI hạ tầng.
5. Tuyệt đối tránh việc tái cấu trúc (refactoring) lan man ra ngoài phạm vi nhiệm vụ được giao.

---

## 4. Ngôn Ngữ và Quy Chuẩn Giao Tiếp (Language Conventions)
* **Tài liệu và Báo cáo**: Sử dụng **Tiếng Việt** chuẩn mực, rõ ràng, có cấu trúc.
* **Mã nguồn**: Tên biến, tên hàm, tên lớp, chú thích kỹ thuật và commit message giữ bằng **Tiếng Anh**.
