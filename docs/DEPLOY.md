# Triển khai MintMath

## Chỉ bản web (PWA), không cần máy chủ

Đây là cách rẻ nhất để dùng cá nhân và chia sẻ bạn bè. Mọi thứ chạy trên thiết bị: soạn bài, lưu, xuất `.tex`, In/Lưu PDF, PNG.

**GitHub Pages:** repo public miễn phí, repo private cần gói trả phí.
1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. (Tùy chọn) Settings → Secrets and variables → Actions → **Variables**: `VITE_API_BASE` nếu có máy chủ xuất PDF.
3. Actions → "Deploy PWA to GitHub Pages" → **Run workflow**. Link sẽ là `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
4. Ai dùng Backblaze B2 trên bản web thì thêm địa chỉ `https://<tên-tài-khoản>.github.io` vào quy tắc CORS của bucket của mình (xem [B2.md](B2.md)).

**Cloudflare Pages / Netlify** (miễn phí, chạy được với repo private): build command `cd frontend && npm ci && npm run build`, output `frontend/dist`. Đặt biến `VITE_EXPORT_SERVER=off`, hoặc `VITE_API_BASE=…` nếu có máy chủ.

## Đầy đủ: PWA và máy chủ xuất PDF LaTeX

Phương án đề xuất, **cần người chốt**: frontend tĩnh trên **Cloudflare Pages**, backend là một container trên **Google Cloud Run** (hoặc Fly.io) với 1 GB RAM.

## 0. Thông tin cần chuẩn bị

| Giá trị | Ví dụ | Dùng ở |
| --- | --- | --- |
| Tên miền frontend | `https://mintmath.example.com` | `MATHPAD_CORS_ORIGINS`, CORS của bucket B2 |
| URL backend | `https://mintmath-api-xxxx.a.run.app` | `VITE_API_BASE` |

## 1. Backend lên Cloud Run

```bash
cd backend
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/mintmath/backend
gcloud run deploy mintmath-api \
  --image REGION-docker.pkg.dev/PROJECT/mintmath/backend \
  --region REGION --memory 1Gi --cpu 1 --concurrency 4 --timeout 60 \
  --allow-unauthenticated \
  --set-env-vars MATHPAD_CORS_ORIGINS=https://mintmath.example.com,MATHPAD_TRUST_PROXY=1,MATHPAD_RATE_LIMIT=20
```

- Image đã nạp sẵn cache gói TeX lúc build, nên lúc chạy không cần mạng ra ngoài.
- `MATHPAD_TRUST_PROXY=1` cho phép giới hạn tần suất dùng IP thật từ `X-Forwarded-For` của load balancer.
- Kiểm tra: `curl https://…/api/health` phải trả `{"status":"ok"}`.

Fly.io tương tự: `fly launch --dockerfile backend/Dockerfile`, đặt cùng các biến môi trường, chọn VM 1 GB.

## 2. Frontend lên Cloudflare Pages

- Build command: `cd frontend && npm ci && npm run build`
- Output directory: `frontend/dist`
- Environment variables (build):
  - `VITE_API_BASE=https://mintmath-api-xxxx.a.run.app`

Cách khác: đặt frontend và backend sau cùng một tên miền (ví dụ Cloudflare route `/api/*` về Cloud Run), khi đó để trống `VITE_API_BASE` và không cần CORS.

## 3. Sau khi triển khai

1. Nghiệm thu: gõ bài mẫu, xuất `.tex`/PDF/PNG, kết nối B2, lưu bài và mở lại ở trình duyệt khác.
3. Đo thời gian xuất PDF bài mẫu khi backend đã ấm (yêu cầu dưới 5 giây). Log backend có dòng `compile doc=… took=…s`.
