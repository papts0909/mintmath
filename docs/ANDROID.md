# App Android (APK)

App Android là chính bản web MathPad, đóng gói bằng [Capacitor](https://capacitorjs.com). Thư mục `frontend/android/` chứa project Android.

## Lấy file APK

**Cách 1: từ GitHub Actions** (không cần cài gì)
1. Mỗi lần có code mới trong `frontend/`, workflow **Android APK** tự build. Muốn build lại bằng tay: Actions → Android APK → Run workflow.
2. Mở lần chạy mới nhất, kéo xuống mục **Artifacts**, tải `MathPad-apk-<số>`. Đây là file zip chứa `MathPad-<số>.apk`.
3. Muốn có link tải cố định cho bạn bè: tạo tag, ví dụ `git tag v1.0.0 && git push origin v1.0.0`. Workflow sẽ đưa APK lên mục **Releases** của repo.

**Cách 2: tự build trên máy** (cần Android Studio hoặc Android SDK, và JDK 21)

```bash
cd frontend && npm ci && VITE_EXPORT_SERVER=off npx vite build && npx cap sync android
```
```bash
cd frontend/android && ./gradlew assembleRelease
```

File APK nằm ở `frontend/android/app/build/outputs/apk/release/app-release.apk`. Có thể mở thư mục `frontend/android` bằng Android Studio để chạy thử trên máy ảo.

## Cài lên điện thoại

1. Chép file `.apk` vào điện thoại (Zalo, email, cáp USB…) rồi mở file.
2. Android hỏi cho phép cài từ nguồn này thì bấm **Cho phép** (Cài đặt → Ứng dụng → Quyền đặc biệt → Cài ứng dụng không rõ nguồn gốc).
3. Bản mới cài đè lên bản cũ, dữ liệu trong Thư viện được giữ nguyên. Đừng gỡ app trước khi cập nhật: gỡ app sẽ xóa thư viện trên máy. Nên **Sao lưu** thư viện định kỳ.

## Khác với bản web

| | Bản web / PWA | App Android |
| --- | --- | --- |
| Lưu bài | Thư viện trên máy | Thư viện trên máy |
| Xuất `.tex`, PNG | Tải về | Mở bảng **Chia sẻ** của Android: lưu vào Tệp, gửi Zalo, Gmail… |
| Xuất PDF | In → Lưu thành PDF, hoặc PDF LaTeX từ máy chủ | PDF khổ A4 tạo ngay trong app (dạng ảnh, không chọn được chữ) |
| Backblaze B2 | Có (bucket cần CORS) | Có, gọi qua HTTP native, không cần CORS |
| Bàn phím toán | Có, trên màn cảm ứng | Có |

## Khóa ký APK

Android chỉ cho cài bản cập nhật đè lên bản cũ nếu cả hai được ký bằng **cùng một khóa**.

- Mặc định, workflow dùng khóa `frontend/android/app/sideload.keystore` có sẵn trong repo. Như vậy mọi bản build đều cài đè được lên nhau. Khóa này **công khai**: ai có repo cũng ký được một bản "cập nhật".
- Trước khi chia sẻ rộng, nên dùng khóa riêng. Tạo khóa:
  ```bash
  keytool -genkeypair -keystore mathpad-release.keystore -alias mathpad -keyalg RSA -keysize 2048 -validity 10000
  ```
  Rồi thêm 4 secret trong Settings → Secrets and variables → Actions:
  - `ANDROID_KEYSTORE_BASE64`: kết quả của `base64 -w0 mathpad-release.keystore` (trên macOS: `base64 -i mathpad-release.keystore`)
  - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`mathpad`), `ANDROID_KEY_PASSWORD`

  Giữ file keystore ở nơi an toàn: mất khóa thì không phát hành được bản cập nhật cài đè nữa. Khi đổi từ khóa mặc định sang khóa riêng, người dùng phải gỡ app một lần, nên hãy Sao lưu thư viện trước.
