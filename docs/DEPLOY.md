# Triển khai MathPad

## Chỉ bản web (PWA), không cần máy chủ

Đây là cách rẻ nhất để dùng cá nhân và chia sẻ bạn bè. Mọi thứ chạy trên thiết bị: soạn bài, lưu, xuất `.tex`, In/Lưu PDF, PNG.

**GitHub Pages:** repo public miễn phí, repo private cần gói trả phí.
1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. (Tùy chọn) Settings → Secrets and variables → Actions → **Variables**: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` để bật Drive, và `VITE_API_BASE` nếu có máy chủ xuất PDF.
3. Actions → "Deploy PWA to GitHub Pages" → **Run workflow**. Link sẽ là `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
4. Nếu dùng Drive: thêm origin `https://<tên-tài-khoản>.github.io` vào OAuth client (mục 1 bên dưới).

**Cloudflare Pages / Netlify** (miễn phí, chạy được với repo private): build command `cd frontend && npm ci && npm run build`, output `frontend/dist`. Đặt biến `VITE_EXPORT_SERVER=off`, hoặc `VITE_API_BASE=…` nếu có máy chủ.

## Đầy đủ: PWA và máy chủ xuất PDF LaTeX

Phương án đề xuất, **cần người chốt**: frontend tĩnh trên **Cloudflare Pages**, backend là một container trên **Google Cloud Run** (hoặc Fly.io) với 1 GB RAM.

## 0. Thông tin cần chuẩn bị

| Giá trị | Ví dụ | Dùng ở |
| --- | --- | --- |
| Tên miền frontend | `https://mathpad.example.com` | OAuth origin, `MATHPAD_CORS_ORIGINS` |
| URL backend | `https://mathpad-api-xxxx.a.run.app` | `VITE_API_BASE` |
| OAuth Client ID | `123-abc.apps.googleusercontent.com` | `VITE_GOOGLE_CLIENT_ID` |
| API key (giới hạn cho Picker API và origin) | `AIza…` | `VITE_GOOGLE_API_KEY` |
| Số hiệu project Google Cloud | `123456789012` | `VITE_GOOGLE_APP_ID` |

## 1. Google Cloud (OAuth, Drive, Picker)

1. Tạo project trong Google Cloud Console.
2. Bật **Google Drive API** và **Google Picker API**.
3. Cấu hình màn hình đồng ý OAuth: loại External, scope `https://www.googleapis.com/auth/drive.file`. Khi còn ở chế độ Testing, thêm tài khoản thử vào danh sách test users.
4. Tạo **OAuth client ID** loại *Web application*. Authorized JavaScript origins gồm `http://localhost:5173` (dev) và tên miền production.
5. Tạo **API key** và giới hạn: chỉ Picker API, HTTP referrer là các origin ở trên.

## 2. Backend lên Cloud Run

```bash
cd backend
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/mathpad/backend
gcloud run deploy mathpad-api \
  --image REGION-docker.pkg.dev/PROJECT/mathpad/backend \
  --region REGION --memory 1Gi --cpu 1 --concurrency 4 --timeout 60 \
  --allow-unauthenticated \
  --set-env-vars MATHPAD_CORS_ORIGINS=https://mathpad.example.com,MATHPAD_TRUST_PROXY=1,MATHPAD_RATE_LIMIT=20
```

- Image đã nạp sẵn cache gói TeX lúc build, nên lúc chạy không cần mạng ra ngoài.
- `MATHPAD_TRUST_PROXY=1` cho phép giới hạn tần suất dùng IP thật từ `X-Forwarded-For` của load balancer.
- Kiểm tra: `curl https://…/api/health` phải trả `{"status":"ok"}`.

Fly.io tương tự: `fly launch --dockerfile backend/Dockerfile`, đặt cùng các biến môi trường, chọn VM 1 GB.

## 3. Frontend lên Cloudflare Pages

- Build command: `cd frontend && npm ci && npm run build`
- Output directory: `frontend/dist`
- Environment variables (build):
  - `VITE_API_BASE=https://mathpad-api-xxxx.a.run.app`
  - `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`

Cách khác: đặt frontend và backend sau cùng một tên miền (ví dụ Cloudflare route `/api/*` về Cloud Run), khi đó để trống `VITE_API_BASE` và không cần CORS.

## 4. Sau khi triển khai

1. Thêm origin production vào OAuth client (bước 1.4) nếu chưa có.
2. Nghiệm thu: gõ bài mẫu, xuất `.tex`/PDF/PNG, lưu lên Drive, mở ở trình duyệt khác bằng Picker.
3. Đo thời gian xuất PDF bài mẫu khi backend đã ấm (yêu cầu dưới 5 giây). Log backend có dòng `compile doc=… took=…s`.
