# Thiết Kế Kỹ Thuật: Ngăn Chặn Cào Lại Bình Luận Cũ Khi Cuộn Trang (Design)

## Context
TikTok Live sử dụng công nghệ Virtual DOM / Virtual Scrolling để tái sử dụng các phần tử HTML trong khung chat. Khi người dùng cuộn lên xem lịch sử chat hoặc khi tiện ích vừa khởi chạy:
- Các node cũ được mount lại dưới dạng phần tử mới tinh không có `data-ext-parsed="true"`.
- Các node đang hiển thị sẵn trước khi bật tiện ích cũng chưa có thuộc tính đánh dấu.

Xem `proposal.md` để nắm rõ nguyên nhân và mục tiêu.

---

## Goals / Non-Goals

**Goals:**
- Triệt tiêu hoàn toàn hiện tượng bình luận cũ bị cào lại khi người dùng lăn chuột cuộn khung chat.
- Đóng băng (pre-mark) tất cả các bình luận có sẵn trong khung chat tại thời điểm vừa nhấn Bật Giám Sát.
- Duy trì bộ nhớ lịch sử `seenHistoryCache` trong `content-script.js` lên tới 3.000 phần tử, tự động giải phóng theo FIFO để đảm bảo bộ nhớ RAM dưới 150KB.
- Tự động đánh dấu `data-ext-parsed="true"` cho các node cũ được render lại để các chu kỳ mutation sau không quét lại chúng.

**Non-Goals:**
- Can thiệp hook ngầm vào WebSocket nội bộ của TikTok (tiện ích tiếp tục tuân thủ giải pháp DOM Scraper an toàn, không lo bị chặn tài khoản).

---

## Decisions

### Quyết định 1: Đóng băng bình luận cũ ngay khi gọi `startMonitoring()`
* **Giải pháp**:
  Trong hàm `startMonitoring()`, ngay trước dòng lệnh `observer.observe(container, ...)`:
  1. Tìm tất cả các phần tử `commentNode` đang có sẵn: `container.querySelectorAll(activeSelectors.commentNode)`.
  2. Với mỗi phần tử:
     - Gán `node.setAttribute("data-ext-parsed", "true")`.
     - Trích xuất author và message, tạo fingerprint và nạp vào `seenHistoryCache.add(fingerprint)`.
* **Kết quả**: Toàn bộ các bình luận quá khứ hiển thị trước khi bật giám sát sẽ bị loại trừ 100%.

### Quyết định 2: Bộ nhớ đệm lịch sử toàn phiên `seenHistoryCache` với dung lượng 3.000 mục
* **Cấu trúc**: `seenHistoryCache = new Set()` lưu chuỗi fingerprint `${author}:::${message}`.
* **Cơ chế hoạt động**:
  - Khi một bình luận được xử lý:
    1. Kiểm tra `seenHistoryCache.has(fingerprint)`.
    2. Nếu ĐÃ TỒN TẠI: Đánh dấu `data-ext-parsed="true"` trên node và lập tức `return` (không gửi `CHAT_MESSAGE`).
    3. Nếu CHƯA TỒN TẠI: Kiểm tra tiếp bộ lọc cooldown `isDuplicateComment`, nếu hợp lệ thì thêm vào `seenHistoryCache.add(fingerprint)` và gửi đi.
* **Giới hạn dung lượng**:
  Khi `seenHistoryCache.size >= MAX_SEEN_HISTORY_SIZE` (3.000 mục), xóa mục cũ nhất ở đầu Set: `seenHistoryCache.delete(seenHistoryCache.values().next().value)`.
  Chiếm dụng bộ nhớ ước tính: ~150KB RAM.
* **Vòng đời**: Được giải phóng (`seenHistoryCache.clear()`) khi người dùng tắt giám sát (`stopMonitoring()`).

---

## Risks / Trade-offs

| Rủi ro (Risk) | Giải pháp giảm thiểu (Mitigation) |
| :--- | :--- |
| Một khán giả gửi lại câu hỏi cách đó 10 phút nhưng vẫn muốn nhận lại | Khán giả hiếm khi gõ lại câu hỏi giống từng ký tự sau 10 phút; việc chặn trùng lặp ưu tiên giải quyết vấn đề lớn hơn là bảo vệ AI server khỏi hàng trăm tin nhắn cũ bị dội lại khi streamer cuộn chuột |
| Container chat bị thay thế (Container Shift) | Khi hàm `startMonitoring()` được gọi lại do container shift, cơ chế pre-mark sẽ tiếp tục bảo vệ và không xóa `seenHistoryCache` nếu phiên vẫn đang duy trì |
