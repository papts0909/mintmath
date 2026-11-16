# MathPad (mintmath)

MathPad là ứng dụng web để trình bày bài giải toán theo từng dòng, gõ hoàn toàn bằng bàn phím. Mỗi dòng là một dòng toán (MathLive) hoặc một dòng chữ tiếng Việt có dấu. Bài làm xuất được ra `.tex`, PDF, PNG và lưu trên Google Drive của người dùng.

- **Frontend:** React, Vite, TypeScript (strict), Zustand, MathLive. Thư mục `frontend/`.
- **Backend:** FastAPI, chỉ lo việc xuất file: LaTeX → PDF bằng Tectonic hoặc XeLaTeX, PDF → PNG bằng `pdftoppm`. Thư mục `backend/`.
- **Dữ liệu:** nằm ở trình duyệt (localStorage) và Google Drive. Backend không có cơ sở dữ liệu và không giữ token.

Tài liệu kèm theo: [docs/DECISIONS.md](docs/DECISIONS.md) (kết quả spike, các quyết định), [docs/DEPLOY.md](docs/DEPLOY.md) (triển khai), [docs/BACKLOG.md](docs/BACKLOG.md).

## Chạy khi phát triển

Yêu cầu: Node 22, Python 3.12, một engine TeX (`tectonic`, hoặc `xelatex` từ TeX Live), `pdftoppm` (poppler-utils) và font DejaVu.

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173. Vite chuyển `/api/*` sang cổng 8000.

Muốn chạy bằng Docker (backend dùng image có Tectonic):

```bash
cp .env.example .env
docker compose up --build
```

### Kiểm thử

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/pytest -q
```

```bash
cd frontend && npm run lint && npm test
```

```bash
cd frontend && npx playwright test
```

Playwright tự bật backend (cổng 8000) và Vite (cổng 5173). Các test Drive thay Google bằng bản giả, không cần tài khoản thật. Test biên dịch PDF ở backend tự bỏ qua nếu máy không có engine TeX.

## Biến môi trường

Xem [.env.example](.env.example). Không commit giá trị thật.

| Biến | Nơi dùng | Ý nghĩa |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | frontend | OAuth Client ID (Web). Để trống thì tính năng Drive bị ẩn. |
| `VITE_GOOGLE_API_KEY` | frontend | API key cho Google Picker |
| `VITE_GOOGLE_APP_ID` | frontend | Số hiệu project Google Cloud (Picker) |
| `VITE_API_BASE` | frontend | URL backend khi khác origin (production) |
| `MATHPAD_CORS_ORIGINS` | backend | Các origin được phép gọi API, cách nhau bằng dấu phẩy |
| `MATHPAD_RATE_LIMIT` | backend | Số lượt xuất mỗi phút mỗi IP (mặc định 20) |
| `MATHPAD_MAX_CONCURRENT` | backend | Số lượt biên dịch đồng thời (mặc định 2) |
| `MATHPAD_COMPILE_TIMEOUT` | backend | Giới hạn thời gian biên dịch, tính bằng giây (mặc định 20) |
| `MATHPAD_TECTONIC` | backend | Đường dẫn engine TeX, nếu không dùng bản trong PATH |
| `MATHPAD_TRUST_PROXY` | backend | `1` khi chạy sau reverse proxy, để lấy IP từ `X-Forwarded-For` |

## Phím tắt

| Phím | Hành vi |
| --- | --- |
| Enter | Tạo dòng mới bên dưới, cùng loại |
| Shift+Enter | Tạo dòng toán nối (cùng khối `align*` khi xuất) |
| Backspace ở dòng trống | Xóa dòng, focus lên dòng trên |
| ↑ / ↓ ở mép | Sang dòng trên / dưới |
| Ctrl+' | Đổi dòng giữa toán và chữ |
| Alt+↑ / Alt+↓ | Di chuyển dòng |
| Ctrl+D | Nhân đôi dòng |
| Ctrl+Z / Ctrl+Shift+Z | Hoàn tác / làm lại (thao tác dòng; bên trong ô toán do MathLive xử lý) |
| `,` trong ma trận | Sang cột kế, hoặc thêm cột ở cuối hàng (trong hệ phương trình thì là dấu phẩy thường) |
| `;` trong ma trận, hệ | Sang hàng kế, hoặc thêm hàng |
| Tab trong ma trận | Sang ô kế |
| `/` `^` `_` | Phân số, mũ, chỉ số dưới. `d1` thành `d₁` (tắt được) |
| Ctrl+S | Lưu lên Google Drive |
| Ctrl+/ | Bật/tắt bảng lệnh tắt |
| Bấm số dòng, Shift+bấm | Chọn một hoặc nhiều dòng để sao chép hoặc xóa; kéo số dòng để đổi thứ tự |

Lệnh tắt chữ (gõ trong dòng toán):

| Gõ | Ra | Gõ | Ra |
| --- | --- | --- | --- |
| `forall` | ∀ | `Rbb` `Zbb` `Nbb` `Qbb` `Cbb` | ℝ ℤ ℕ ℚ ℂ |
| `exists` | ∃ | `=>` | ⇒ |
| `element` | ∈ | `<=>` hoặc `iff` | ⇔ |
| `notin` | ∉ | `->` | → |
| `subset` | ⊂ | `!=` | ≠ |
| `union` | ∪ | `<=` `>=` | ≤ ≥ |
| `inter` | ∩ | `+-` | ± |
| `empty` | ∅ | `inf` | ∞ |
| `sqrt` | căn bậc hai | `sum` `int` `lim` | ∑ ∫ lim |
| `sys` | hệ phương trình (ngoặc trái) | `mat` `pat` `dat` | ma trận [ ], ( ), định thức |
| `amat` | ma trận bổ sung có vạch dọc | | |

Danh sách đầy đủ nằm ở `frontend/src/core/shortcuts.ts`, cũng hiện trong bảng Ctrl+/.

## Định dạng tài liệu

Tài liệu là một đối tượng JSON `{version: 1, id, title, lines: [{id, type: "math"|"text", content, joinPrev?}], updatedAt}`. Cùng một cấu trúc dùng cho localStorage, file `.mathpad.json` trên máy hoặc trên Drive, và thân request xuất file. Kiểu dữ liệu khai báo ở `frontend/src/core/types.ts` và khớp với `backend/app/models.py`.

API backend: `GET /api/health`, `POST /api/export/tex`, `POST /api/export/pdf`, `POST /api/export/png?dpi=200` (zip nếu nhiều trang). Giới hạn: thân request 1 MB, 2.000 dòng, biên dịch 20 giây, DPI từ 72 đến 600. Nội dung dòng toán chứa các lệnh đọc ghi file hoặc định nghĩa macro (`\input`, `\write`, `\def`, `\catcode`, `\csname`…) bị từ chối với lỗi 400 kèm `lineId`.

## Giới hạn đã biết

- Tectonic chưa chạy thử được trong môi trường phát triển của agent (không có Docker). Đã kiểm chứng bằng XeLaTeX; image Docker được build và chạy thử trong job CI `docker`. Xem DECISIONS.md.
- Google Drive mới được test với Google giả lập. Cần Client ID thật để nghiệm thu với Google.
- MathLive hiển thị ma trận bổ sung với một khoảng trống thừa phía trên. PDF thì đúng.
- Khi ứng dụng OAuth còn ở chế độ Testing, chỉ tài khoản trong danh sách test users đăng nhập được. Scope `drive.file` chỉ thấy file do MathPad tạo hoặc file chọn qua Picker.

## Việc cần người làm

1. **Google Cloud** (Phase 4): tạo project, bật Drive API và Picker API, màn hình đồng ý OAuth với scope `drive.file`, OAuth Client ID (Web) và API key. Đưa vào `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`.
2. **Triển khai** (Phase 5): chọn nền tảng và tên miền theo [docs/DEPLOY.md](docs/DEPLOY.md).
