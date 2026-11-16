# Quyết định kỹ thuật

Ghi lại kết quả spike Phase 0 và những chỗ cách làm khác với plan hoặc với tên API viết theo trí nhớ trong plan.

## P0-T1 — MathLive và cấu trúc nhiều hàng

Thử trên MathLive **0.111.4** trong Chromium headless (`spikes/p0-t1-mathlive/`).

| Biểu thức | Hiển thị | Đặt con trỏ vào ô | Thêm hàng (`addRowAfter`) | Thêm cột (`addColumnAfter`) | LaTeX lấy ra |
| --- | --- | --- | --- | --- | --- |
| `\begin{cases}…\end{cases}` | Đúng, ngoặc chỉ bên trái | Được | Được | Thêm cột thứ hai (cột `&`) | Giữ nguyên (thêm khoảng trắng `\\ `) |
| `\begin{bmatrix}…\end{bmatrix}` | Đúng | Được | Được | Được | Giữ nguyên (`1 & 2`) |
| `\left[\begin{array}{ccc\|c}…\end{array}\right]` | Đúng, có vạch dọc | Được, từng ô | Được | **Không làm gì** (array có spec cố định) | Giữ nguyên spec `ccc\|c` |

**Quyết định:** lưu ma trận bổ sung đúng dạng LaTeX chuẩn `\left[\begin{array}{cc|c}…\end{array}\right]`. Không cần macro đánh dấu của phương án dự phòng. `normalize.py` vẫn hiểu `\augmented{k}{\begin{bmatrix}…\end{bmatrix}}` để đọc được dữ liệu kiểu cũ nếu có.

Thêm cột cho `array` do frontend tự làm: viết lại LaTeX (`addColumn` trong `src/core/matrix.ts`), chèn `c` vào spec sao cho vạch luôn đứng trước cùng số cột cuối. Gõ `,` ở ô cuối của `[A|b]` sẽ mở rộng A, b vẫn ở bên phải.

Điều đã kiểm chứng về API MathLive (khác hoặc chi tiết hơn plan):

- Sự kiện ra khỏi công thức là `move-out` với `detail.direction` ∈ `forward | backward | upward | downward`.
- Lệnh tắt nội dòng nằm ở thuộc tính `mf.inlineShortcuts` (một từ điển). Nhiều lệnh như `forall`, `=>` đã có sẵn.
- `smartSuperscript` mặc định bật: gõ `m^2` thì con trỏ tự ra khỏi số mũ sau một chữ số. Bài mẫu gõ được tự nhiên: `m^2+1`.
- `mf.focus()` **hoãn focus thật khoảng 60 ms** (trong `onFocus` có `setTimeout(…, 60)`). Phím gõ ngay sau Enter sẽ bị mất. Cách xử lý: focus thẳng vào `[part=keyboard-sink]` trong shadow root (đồng bộ), cộng một bộ đệm phím (`keyBuffer.ts`) cho khoảng chuyển giao.
- Không có API công khai cho biết con trỏ đang ở ô nào của ma trận; `getValue(start, end)` trên một khoảng bên trong ma trận chỉ trả nội dung đã làm phẳng. Cách làm: chèn tạm `\ddagger` tại con trỏ, đọc LaTeX rồi `undo`. Undo khôi phục cả giá trị lẫn vùng chọn (kể cả placeholder đang được chọn), nên lịch sử undo không bị bẩn. Xem `probeCell` trong `mathfieldTools.ts`.
- Phím `Tab` và các phím `,` `;` được chặn ở pha capture trên phần tử bao (React `onKeyDownCapture`) trước khi MathLive nhận.
- Ô trống là `\placeholder{}`. Khi cấu trúc vừa chèn thì placeholder đầu tiên đang được chọn, `selectionIsCollapsed` là false.
- Có một lỗi hiển thị nhỏ: `\left[ … array … \right]` trong MathLive có thêm khoảng trống phía trên ma trận (bmatrix thì không). PDF xuất ra không bị. Đã ghi vào BACKLOG.

## P0-T2 — Tectonic và tiếng Việt

Môi trường agent **không chạy được Docker** (không có daemon) và **không được phép chạy binary Tectonic tải về**, nên chưa đo được Tectonic thật. Đã làm như sau:

- `backend/Dockerfile` cài Tectonic 0.15.0 (bản musl tĩnh), `poppler-utils` và `fonts-dejavu-core`. Lúc build chạy `python -m warmup.warmup`: biên dịch một tài liệu dùng mọi gói trong template, nên cache gói có sẵn trong image và lúc chạy không cần mạng (`XDG_CACHE_HOME=/opt/cache`).
- `compiler.py` tự dò engine: `MATHPAD_TECTONIC` → `tectonic` → `xelatex`. Đây là phương án dự phòng của plan, áp dụng sẵn.
- Đã kiểm chứng bằng **XeLaTeX (TeX Live 2023)**, đúng phương án dự phòng: cả 6 fixture biên dịch được. PNG của bài mẫu hiện đúng dấu tiếng Việt, ℝ và vạch ma trận bổ sung.
  - Font chữ: **DejaVu Serif** (đủ dấu tiếng Việt, có ℝ ∀ ⇒). Font toán là Computer Modern mặc định của amsmath.
  - Thời gian biên dịch bài mẫu: khoảng 0,4 s cả lần đầu lẫn lần sau (XeLaTeX đã có format sẵn). Với Tectonic, lần đầu sẽ chậm vì phải tải gói; việc này dồn vào lúc build image.
  - Kích thước image: chưa đo. Job `docker` trong CI build image và chạy thử xuất PDF.
- **Cần người xác nhận:** chạy `docker build ./backend` (hoặc xem job `docker` trên CI) để có thời gian biên dịch Tectonic và kích thước image thật. Nếu Tectonic gặp vấn đề, đổi Dockerfile sang `texlive-xetex`; code không cần sửa.

## P0-T3 — Drive từ trang tĩnh

**Hoãn** vì cần Client ID và API key thật (việc cần người làm, xem README). Thay vào đó:

- `src/drive/*` viết theo Google Identity Services (`google.accounts.oauth2.initTokenClient`, `requestAccessToken`, `revoke`) và Picker (`gapi.load('picker')`, `google.picker.PickerBuilder`, `DocsView`). Tên API viết theo trí nhớ, **cần đối chiếu khi có credential thật**.
- E2E `e2e/drive.spec.ts` thay Google bằng bản giả (`e2e/fakeGoogle.ts`: GIS, Picker, Drive v3) và chạy trọn vòng lưu → mở bằng Picker ở trình duyệt khác → sửa → ghi đè → mở lại, kèm các trường hợp 401, 404, từ chối quyền, mất mạng.

## Khác với plan

- **Engine TeX:** hỗ trợ cả Tectonic và XeLaTeX (lý do ở trên).
- **Dòng chữ** dùng `<textarea>` tự giãn chiều cao thay cho `<input>`, để văn bản dài xuống dòng được trên màn hình 380 px. Enter vẫn tạo dòng mới; xuống dòng do dán vào được đổi thành dấu cách. Mũi tên lên/xuống chỉ rời dòng khi con trỏ ở hàng hiển thị đầu/cuối.
- **Undo/redo cấp tài liệu:** mỗi thao tác cấu trúc (thêm, xóa, di chuyển, đổi loại, nhân đôi, dán) lưu một ảnh chụp danh sách dòng. Khi undo, thứ tự, loại và joinPrev lấy theo ảnh chụp, còn nội dung chữ của các dòng còn tồn tại lấy bản mới nhất, nên chữ gõ sau thao tác không bị mất. Ctrl+Z chỉ đi vào lịch sử tài liệu khi thay đổi gần nhất là thao tác cấu trúc; nếu không, ô đang gõ tự undo.
- **`;` trong ma trận** sang ô đầu của hàng kế (giống xuống dòng), không giữ cột.
- **Quy tắc d1 → d₁** áp dụng cho một chữ cái theo sau là một chữ số, bật/tắt bằng ô "d1 → d₁" trên thanh công cụ (lưu trong localStorage).
- **Playwright** đặt cố định bản 1.63.0 để khớp trình duyệt có sẵn trong môi trường agent. Trên CI thì `npx playwright install` cài đúng bản.
- **Tên file tải về** có dấu tiếng Việt. Riêng Chromium headless báo tên non-ASCII là `download` (lỗi của môi trường test), nên test E2E dùng tiêu đề không dấu.
