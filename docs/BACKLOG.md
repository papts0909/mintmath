# Backlog

Ý tưởng và việc còn treo, chưa làm vì nằm ngoài task hiện tại.

## Hiển thị

- `\left[ array \right]` trong MathLive có khoảng trống thừa phía trên ma trận bổ sung. Có thể sửa bằng CSS trong shadow DOM hoặc báo lỗi cho MathLive.
- Gõ `(2m+1)/` tạo `\frac{\left(2m+1\right)}{…}` và giữ cả ngoặc. Có thể tự bỏ ngoặc ngoài cùng của tử số.
- Chọn font toán khớp với DejaVu (ví dụ `unicode-math` với `DejaVu Math TeX Gyre`) để PDF đồng bộ phong cách.

## Soạn thảo

- Thử bộ gõ tiếng Việt thật (Unikey/EVKey trên Windows, macOS Telex, Gboard) trên máy thật. E2E chỉ giả lập nhập Unicode.
- Kéo thả nhiều dòng đã chọn cùng lúc.
- Ghi nhớ vị trí con trỏ khi undo/redo cấp tài liệu.
- Thêm lệnh tắt: `lim` có chỉ số, `int` có cận, ma trận kích thước tùy chọn (ví dụ `mat3x4`).

## Xuất và Drive

- Chọn DPI cho PNG ngay trên giao diện.
- Liệt kê file gần đây trên Drive mà không cần mở Picker.
- Tự lưu lên Drive định kỳ khi đã gắn file.

## Phase 6 (chờ duyệt)

- `/api/compute` với SymPy, gợi ý kết quả mờ sau dấu `=`, biến đổi dòng ma trận tự động, chạy offline bằng service worker.
