# App máy tính (.dmg cho macOS, .exe cho Windows)

App máy tính là chính bản web MintMath, đóng gói bằng [Tauri 2](https://tauri.app). Thư mục `frontend/src-tauri/` chứa phần đóng gói. Dung lượng khoảng 10–15 MB, vì app dùng trình duyệt có sẵn của hệ điều hành (WebKit trên macOS, WebView2 trên Windows).

## Lấy file cài

**Từ GitHub Actions:** workflow **Desktop apps** build trên máy Mac và máy Windows của GitHub. Hiện tạm không tự build khi có code mới, phải chạy bằng tay.
1. Actions → **Desktop apps** → **Run workflow**, đợi chạy xong rồi mở lần chạy đó.
2. Kéo xuống mục **Artifacts**:
   - `MintMath-macos-<số>`: file `.dmg` chạy được trên cả Mac chip Apple (M1–M4) và Mac Intel.
   - `MintMath-windows-<số>`: `MintMath_…_x64-setup.exe` (nên dùng file này) và `.msi`.
3. (Khi bật lại build tự động) tạo tag, ví dụ `v1.0.0`, thì các file này được đưa lên mục **Releases**, có link tải cố định để gửi bạn bè.

**Tự build trên máy:** cần Node 22 và Rust (https://rustup.rs). Trên Mac cần thêm Xcode Command Line Tools: `xcode-select --install`.

```bash
cd frontend && npm ci && npm run desktop:build
```

File cài nằm trong `frontend/src-tauri/target/release/bundle/` (thư mục `dmg/` trên Mac, `nsis/` trên Windows).

Chạy thử khi đang phát triển (cửa sổ app tự tải lại khi sửa code):

```bash
cd frontend && npx tauri dev
```

## Cài đặt

App **chưa ký số** (ký số cần Apple Developer 99 USD/năm và chứng chỉ Windows), nên lần đầu hệ điều hành sẽ cảnh báo.

**macOS**
1. Mở file `.dmg`, kéo **MintMath** vào **Applications**.
2. Mở app lần đầu: nếu bị chặn, vào **System Settings → Privacy & Security**, kéo xuống, bấm **Open Anyway**.
3. Nếu macOS báo *"MintMath is damaged and can't be opened"*: app không hỏng, chỉ là macOS chặn app tải từ Internet chưa ký số. Mở Terminal và chạy:
   ```bash
   xattr -cr /Applications/MintMath.app
   ```
   rồi mở lại app.

**Windows**
1. Chạy `MintMath_…_x64-setup.exe`.
2. Nếu SmartScreen hiện *"Windows protected your PC"*: bấm **More info → Run anyway**.

## Khác với bản web

| | Bản web / PWA | App máy tính |
| --- | --- | --- |
| Thư viện bài tập | Có | Có (lưu riêng trong app) |
| Xuất file | Tải về thư mục Downloads | Hộp thoại **Lưu thành…** của hệ điều hành |
| PDF | In → Lưu thành PDF, hoặc PDF LaTeX từ máy chủ | PDF A4 tạo ngay trong app |
| Backblaze B2 | Có (bucket cần CORS) | Có, gọi qua HTTP native, không cần CORS |

## Nâng cấp sau (nếu cần)

- **PDF dàn trang LaTeX chuẩn, không cần mạng:** kèm Tectonic vào app. App nặng thêm vài chục MB.
- **Hết cảnh báo khi cài:** ký số và notarize bằng tài khoản Apple Developer, ký số Windows bằng chứng chỉ code signing.
