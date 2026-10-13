# Thiết Kế Kỹ Thuật (Technical Design)

## Bối Cảnh (Context)
Xem [`proposal.md`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/openspec/changes/resolve-popup-technical-debt/proposal.md). Hiện tại, việc chọn bot AI trong giao diện Popup sử dụng các hộp thoại trình duyệt blocking (`prompt()` và `alert()`) làm gián đoạn luồng JavaScript và trộn lẫn ngôn ngữ. Hằng số `gitHubUrl` trong việc cập nhật bộ chọn được giữ nguyên không thay đổi theo quyết định của dự án.

---

## Mục Tiêu & Giới Hạn (Goals / Non-Goals)

### Mục Tiêu (Goals):
* Thay thế toàn bộ hộp thoại `window.prompt()` và `window.alert()` bằng một Modal Picker hiện đại, không làm đứng luồng thực thi (non-blocking) và tự động khớp với phong cách giao diện tối (Dark Theme).
* Chuẩn hóa 100% ngôn ngữ giao diện Popup sang Tiếng Anh thống nhất.
* Đảm bảo toàn bộ tài liệu kỹ thuật và đặc tả OpenSpec được viết và duy trì chuẩn mực bằng Tiếng Việt.
* Đảm bảo không làm thay đổi hay gián đoạn luồng cào DOM, kết nối mạng nền hoặc URL cập nhật selector từ GitHub.

### Giới Hạn (Non-Goals):
* Giữ nguyên hằng số `gitHubUrl` trong `popup.js`; không thay đổi cơ chế cập nhật bộ chọn online từ GitHub.
* Không thay đổi cấu trúc tệp `selectors.json` hay logic parse của `MutationObserver`.
* Không thêm các thư viện bên ngoài (không dùng SweetAlert, React hay Vue); toàn bộ giải pháp sử dụng thuần Vanilla JS và CSS nội bộ.

---

## Các Quyết Định Kỹ Thuật (Decisions)

### Quyết định 1: Xây dựng AI Picker Modal nội bộ (Non-blocking Dialog)
* **Giải pháp chọn**:
  * Tạo một phần tử Modal HTML `#ai-picker-modal` trong [`popup/popup.html`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.html) (ẩn mặc định qua class `hidden`).
  * Định kiểu dáng trong [`popup/popup.css`](file:///d:/DU_AN_LIVE_TITOK/EXTENSION_CHAT/popup/popup.css) với nền mờ backdrop, header có nút đóng (×), danh sách thẻ bot có thể cuộn (`max-height: 180px`), và badge trạng thái `ACTIVE` (xanh ngọc) / `INACTIVE` (xám).
  * Khi nhấn "Load AI":
    1. Gửi `fetch` đến `http://${host}:${port}/api/auto-reply/public`.
    2. Nếu thành công và có danh sách bot: Render các thẻ bot vào modal và mở modal lên.
    3. Người dùng nhấp vào một bot: Tự động gán `inputAiId.value = bot.id`, đóng modal, và hiển thị thông báo ngắn xác nhận.
    4. Nếu rỗng hoặc lỗi: Thay vì `alert()`, hiển thị thông điệp lỗi trực tiếp vào banner `#test-result` hoặc `#error-banner` trên popup bằng Tiếng Anh.

### Quyết định 2: Chuẩn hóa ngôn ngữ giao diện sang Tiếng Anh
* **Thay đổi cụ thể**:
  * Nút "Load AI": `title="Fetch AI Auto-Reply list from server"`.
  * Placeholder: `placeholder="default or custom ID (e.g. ai-fashion)"`.
  * Nhãn trạng thái bot: `ACTIVE` / `INACTIVE`.
  * Thông báo lỗi:
    - `"No AI Auto-Reply instances available on server."`
    - `"Failed to connect to AI server: ${err.message}"`
  * Tiêu đề modal: `"Select AI Instance"`.

---

## Rủi Ro & Biện Pháp Giảm Thiểu (Risks / Trade-offs)

* **[Rủi ro] Kích thước Popup bị chật chội**: Khung popup của Chrome extension có giới hạn chiều cao tối đa khoảng 600px, việc thêm Modal có thể gây tràn giao diện.
  * *Biện pháp*: Thiết kế Modal theo dạng overlay tuyệt đối (`position: absolute; inset: 0; backdrop-filter: blur(4px); z-index: 999;`), phủ lên trên nội dung hiện tại và cuộn nội bộ khi danh sách bot dài.
