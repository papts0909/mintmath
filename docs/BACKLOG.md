# Backlog

Ý tưởng và việc còn treo, chưa làm vì nằm ngoài task hiện tại.

## Hiển thị

- Gõ `(2m+1)/` tạo `\frac{\left(2m+1\right)}{…}` và giữ cả ngoặc. Có thể tự bỏ ngoặc ngoài cùng của tử số.
- Chọn font toán khớp với DejaVu (ví dụ `unicode-math` với `DejaVu Math TeX Gyre`) để PDF đồng bộ phong cách.

## Soạn thảo

- Thử bộ gõ tiếng Việt thật (Unikey/EVKey trên Windows, macOS Telex, Gboard) trên máy thật. E2E chỉ giả lập nhập Unicode.
- Kéo thả nhiều dòng đã chọn cùng lúc.
- Ghi nhớ vị trí con trỏ khi undo/redo cấp tài liệu.
- Thêm lệnh tắt: `lim` có chỉ số, `int` có cận, ma trận kích thước tùy chọn (ví dụ `mat3x4`).

## Thiết bị

- Thử trên iPhone/iPad và Android thật: bàn phím toán ảo, cài lên màn hình chính, chạy offline. E2E mới giả lập Pixel 7 trên Chromium.
- Nếu sau này cần đưa lên store: dùng Capacitor bọc chính frontend này.
- Nếu cần PDF chuẩn LaTeX mà không có máy chủ trên desktop: dùng Tauri kèm Tectonic.

## Xuất và B2

- Chọn DPI cho PNG ngay trên giao diện.
- Tự đồng bộ với B2 định kỳ hoặc khi mở app.
- Lưu khóa B2 vào kho bảo mật của hệ điều hành (Keychain, Android Keystore) thay vì bộ nhớ của app.

## Phase 6 (chờ duyệt)

- `/api/compute` với SymPy, gợi ý kết quả mờ sau dấu `=`, biến đổi dòng ma trận tự động, chạy offline bằng service worker.
