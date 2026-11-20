# MintMath

MintMath là app để viết bài giải toán theo từng dòng, gõ bằng bàn phím là chính. Mỗi dòng là một dòng toán (dùng MathLive) hoặc một dòng chữ tiếng Việt. Viết xong thì xuất ra `.tex`, PDF hoặc PNG, và nếu muốn thì lưu lên tài khoản Backblaze B2 của mình để mở lại ở máy khác.

Bản web: https://monglinhnguyendat.id.vn/mintmath/

Repo gồm hai phần:

- `frontend/`: React + Vite + TypeScript, state bằng Zustand, ô toán là MathLive.
- `backend/`: FastAPI, chỉ dùng để xuất file (LaTeX → PDF bằng Tectonic hoặc XeLaTeX, PDF → PNG bằng `pdftoppm`). Không có cơ sở dữ liệu, không giữ khóa B2 của ai.

Backend không bắt buộc. Không có nó, app vẫn soạn bài, lưu, xuất `.tex`, in/lưu PDF và xuất PNG ngay trên máy. Có backend thì nút PDF/PNG cho bản dàn trang bằng LaTeX đẹp hơn.

Ghi chú thêm nằm trong `docs/`: [DECISIONS.md](docs/DECISIONS.md) (vì sao chọn cách này cách kia), [DEPLOY.md](docs/DEPLOY.md), [B2.md](docs/B2.md), [ANDROID.md](docs/ANDROID.md), [DESKTOP.md](docs/DESKTOP.md), [BACKLOG.md](docs/BACKLOG.md).

## Chạy trên máy

Cần Node 22 và Python 3.12. Muốn xuất PDF bằng LaTeX thì cài thêm `tectonic` (hoặc `xelatex` của TeX Live), `pdftoppm` (gói poppler-utils) và font DejaVu.

Backend:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Frontend, ở một terminal khác:

```bash
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173. Vite tự chuyển `/api/*` sang cổng 8000.

Hoặc chạy cả hai bằng Docker:

```bash
cp .env.example .env
docker compose up --build
```

### Test

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/pytest -q
```

```bash
cd frontend && npm run lint && npm test
```

```bash
cd frontend && npx playwright test
```

Playwright tự bật backend và Vite. Test B2 chạy với một B2 giả trong bộ nhớ nên không cần tài khoản. Máy không có TeX thì test biên dịch PDF tự bỏ qua.

## Cài lên máy, điện thoại

MintMath là PWA nên cài được thẳng từ trình duyệt và chạy được khi không có mạng:

- Máy tính (Chrome, Edge): bấm "Cài ứng dụng" trong app hoặc biểu tượng cài trên thanh địa chỉ.
- Android (Chrome): "Cài ứng dụng", hoặc menu ⋮ → "Cài đặt ứng dụng".
- iPhone, iPad (Safari): Chia sẻ → "Thêm vào MH chính".

Có bản mới thì app tự cập nhật, hoặc hiện nút "Có bản mới – tải lại".

Ngoài ra còn có app cài đặt hẳn hoi, build bằng GitHub Actions:

- Android (APK, Capacitor): xem [docs/ANDROID.md](docs/ANDROID.md).
- macOS `.dmg` và Windows `.exe`/`.msi` (Tauri): xem [docs/DESKTOP.md](docs/DESKTOP.md). App chưa ký số nên lần đầu mở sẽ bị hệ điều hành hỏi.

Bản web tự đưa lên GitHub Pages mỗi khi `frontend/` trên `main` thay đổi. Cách đặt lên chỗ khác (Cloudflare Pages, Netlify) có trong [docs/DEPLOY.md](docs/DEPLOY.md).

## Dùng app

- **Tab**: mở nhiều bài cùng lúc, mỗi bài một tab. Đóng tab không mất bài, bài vẫn nằm trong Thư viện.
- **Thư viện**: bài nào đang viết cũng tự lưu vào thư viện trên máy (IndexedDB). Tìm theo tiêu đề hoặc nội dung, nhân bản, xóa. "Sao lưu" tải cả thư viện về một tệp `.json` để chuyển sang máy khác.
- **Mở tệp** nhận `.mintmath.json`, bản sao lưu, và `.tex`. File `.tex` do MintMath xuất ra thì mở lại y nguyên. File LaTeX viết tay cũng đọc được phần lớn: tiêu đề, đoạn văn, `\[ \]`, `$$ $$`, `equation`, `align`, `gather`, `multline`, `itemize`, `enumerate`.
- **Giao diện**: mặc định là kiểu "Giấy", chỉ đen trắng giống máy đọc sách, sáng hay tối theo cài đặt của máy. Muốn có màu thì chọn trong ⚙ Cài đặt.
- **Zen** (Ctrl+.): ẩn hết nút, chỉ chừa phần làm toán.
- Trên màn cảm ứng, bấm vào dòng toán sẽ hiện bàn phím toán, có tab riêng MintMath với các ký hiệu hay dùng (∀ ∃ ⇒ ∈ ℝ…), hệ phương trình, ma trận, [A|b]. Thanh nút ở trên thay cho các phím tắt: thêm dòng, đổi loại, đưa lên/xuống, xóa, hoàn tác.

Xuất file:

| | Không có backend / mất mạng | Có backend |
| --- | --- | --- |
| LaTeX (.tex) | làm trên máy, giống hệt bản backend | |
| PDF | mở hộp thoại In → "Lưu thành PDF" | PDF dàn trang bằng LaTeX |
| PNG | ảnh khổ A4 làm trên máy | ảnh cắt từ PDF LaTeX |

## Lưu trên Backblaze B2

Ai dùng thì tự tạo tài khoản B2 của mình (10 GB đầu miễn phí), tạo bucket và một khóa chỉ dùng cho bucket đó, rồi bấm "Kết nối Backblaze B2" trong app. Khóa chỉ lưu trên máy đó, không gửi đi đâu khác ngoài Backblaze.

Kết nối rồi thì có:

- "Lưu lên B2" (Ctrl+S), và mở bài từ B2 trên máy khác.
- "Đồng bộ thư viện" hai chiều giữa máy và B2. Đồng bộ không bao giờ xóa. Bài bị sửa ở cả hai nơi thì giữ cả hai bản.
- Tải tệp bất kỳ lên/xuống. Nút "B2" trong nhóm Xuất lưu luôn bản `.tex` và PDF.

Bản web cần bật CORS cho bucket một lần. Khi thiếu, app sẽ đưa sẵn lệnh để chép vào Terminal hoặc PowerShell, không cần cài gì thêm. App Android và app máy tính thì không cần bước này. Chi tiết trong [docs/B2.md](docs/B2.md).

Phần B2 mới chạy với B2 giả trong test. Ai dùng tài khoản thật mà gặp lỗi thì báo lại.

## Phím tắt

| Phím | Làm gì |
| --- | --- |
| Enter | Thêm dòng mới bên dưới, cùng loại |
| Shift+Enter | Thêm dòng toán nối tiếp (xuất ra cùng một khối `align*`) |
| Backspace ở dòng trống | Xóa dòng, quay lên dòng trên |
| ↑ / ↓ ở mép dòng | Sang dòng trên / dưới |
| Ctrl+' | Đổi dòng giữa toán và chữ |
| Alt+↑ / Alt+↓ | Di chuyển dòng |
| Ctrl+D | Nhân đôi dòng |
| Ctrl+Z / Ctrl+Shift+Z | Hoàn tác / làm lại thao tác trên dòng (gõ bên trong ô toán thì MathLive tự lo) |
| `,` trong ma trận | Sang cột kế, cuối hàng thì thêm cột (trong hệ phương trình là dấu phẩy thường) |
| `;` trong ma trận, hệ | Sang hàng kế, hoặc thêm hàng |
| Tab trong ma trận | Sang ô kế |
| `/` `^` `_` | Phân số, mũ, chỉ số dưới. Gõ `d1` thành `d₁` (tắt được trong Cài đặt) |
| Ctrl+S | Lưu lên B2 (chưa kết nối thì mở form kết nối) |
| Ctrl+. | Bật/tắt Zen |
| Ctrl+/ | Bảng lệnh tắt |
| Bấm số dòng, Shift+bấm | Chọn một hay nhiều dòng để chép hoặc xóa. Kéo số dòng để đổi thứ tự |

Gõ chữ trong dòng toán sẽ tự đổi thành ký hiệu:

| Gõ | Ra | Gõ | Ra |
| --- | --- | --- | --- |
| `forall` | ∀ | `Rbb` `Zbb` `Nbb` `Qbb` `Cbb` | ℝ ℤ ℕ ℚ ℂ |
| `exists` | ∃ | `=>` | ⇒ |
| `element` | ∈ | `<=>`, `iff` | ⇔ |
| `notin` | ∉ | `->` | → |
| `subset` | ⊂ | `!=` | ≠ |
| `union` | ∪ | `<=` `>=` | ≤ ≥ |
| `inter` | ∩ | `+-` | ± |
| `empty` | ∅ | `inf` | ∞ |
| `sqrt` | căn bậc hai | `sum` `int` `lim` | ∑ ∫ lim |
| `sys` | hệ phương trình | `mat` `pat` `dat` | ma trận [ ], ( ), định thức |
| `amat` | ma trận bổ sung có vạch dọc | | |

Hệ và ma trận mặc định 2×2 (`amat` là 2×3). Muốn cỡ khác thì gõ kích thước ngay sau rồi bấm Space hoặc Tab:

| Gõ | Ra |
| --- | --- |
| `mat3` + Space | ma trận 3×3 |
| `mat34` hoặc `mat3x4` + Space | ma trận 3 hàng × 4 cột |
| `sys4` + Space | hệ 4 phương trình |
| `amat3` + Space | ma trận bổ sung 3 ẩn (3×4) |
| `dat4` + Space | định thức 4×4 |

Gõ tiếp luôn mà không bấm Space (ví dụ `amat1,1,2;…`) thì vẫn ra cỡ mặc định như trước, số vừa gõ nằm ở ô đầu. Đang gõ dở vẫn thêm được hàng, cột bằng `;` và `,`, hoặc nút +hàng, +cột trên bàn phím toán.

Danh sách đủ ở `frontend/src/core/shortcuts.ts`, trong app thì bấm Ctrl+/.

## Cấu hình

Backend và bản build đọc các biến sau. Mẫu có trong [.env.example](.env.example); file `.env` thật thì đừng commit.

| Biến | Dùng ở | Để làm gì |
| --- | --- | --- |
| `VITE_API_BASE` | frontend | URL backend nếu đặt ở domain khác |
| `VITE_EXPORT_SERVER` | frontend | `off` để không gọi backend, mọi thứ xuất trên máy |
| `VITE_BASE` | frontend (lúc build) | Đường dẫn con, ví dụ `/mintmath/` trên GitHub Pages |
| `MATHPAD_CORS_ORIGINS` | backend | Các domain được gọi API, cách nhau bằng dấu phẩy |
| `MATHPAD_RATE_LIMIT` | backend | Số lần xuất mỗi phút cho mỗi IP (mặc định 20) |
| `MATHPAD_MAX_CONCURRENT` | backend | Số lần biên dịch chạy cùng lúc (mặc định 2) |
| `MATHPAD_COMPILE_TIMEOUT` | backend | Thời gian tối đa cho một lần biên dịch, tính bằng giây (mặc định 20) |
| `MATHPAD_TECTONIC` | backend | Đường dẫn tới engine TeX nếu không có sẵn trong PATH |
| `MATHPAD_TRUST_PROXY` | backend | Đặt `1` khi chạy sau reverse proxy để lấy IP từ `X-Forwarded-For` |

Các biến backend vẫn mang tiền tố `MATHPAD_` từ hồi app còn tên cũ. Đổi tên thì các bản đã triển khai phải sửa cấu hình theo, nên tạm giữ.

## Định dạng bài

Một bài là một object JSON:

```json
{ "version": 1, "id": "…", "title": "…", "updatedAt": "…",
  "lines": [{ "id": "…", "type": "math", "content": "x^2+1=0", "joinPrev": false }] }
```

`type` là `"math"` hoặc `"text"`. Cùng định dạng này được dùng để lưu trên máy, trong file `.mintmath.json`, trên B2 và khi gửi lên backend để xuất. Kiểu khai báo ở `frontend/src/core/types.ts`, khớp với `backend/app/models.py`. File `.mathpad.json` từ bản cũ vẫn mở được.

API backend: `GET /api/health`, `POST /api/export/tex`, `POST /api/export/pdf`, `POST /api/export/png?dpi=200` (nhiều trang thì trả về zip). Mỗi request tối đa 1 MB và 2.000 dòng, biên dịch tối đa 20 giây, DPI từ 72 đến 600. Dòng toán có lệnh đọc/ghi file hay định nghĩa macro (`\input`, `\write`, `\def`, `\catcode`, `\csname`…) sẽ bị từ chối với lỗi 400, kèm `lineId` của dòng đó.
