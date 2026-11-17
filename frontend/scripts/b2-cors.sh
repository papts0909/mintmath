# MathPad: bật truy cập cho bản web trên bucket Backblaze B2 (quy tắc CORS).
# Chỉ dùng công cụ có sẵn trên macOS / Linux (sh, curl, grep, sed). Không cài gì.
#
#   curl -fsSL https://<địa chỉ MathPad>/b2-cors.sh | sh -s -- <tên-bucket> <địa-chỉ-web> [địa-chỉ-web…]
#
# Hỏi keyID / applicationKey của Master Application Key (gõ vào Terminal, không
# lưu ở đâu), rồi đặt quy tắc CORS tên "mathpad-web" cho bucket.
# Biến môi trường (không bắt buộc): B2_KEY_ID, B2_APP_KEY; B2_AUTH_URL (thử nghiệm).
set -eu

AUTH_URL=${B2_AUTH_URL:-https://api.backblazeb2.com}
TMP=$(mktemp -d)
trap 'stty echo </dev/tty 2>/dev/null || true; rm -rf "$TMP"' EXIT
trap 'exit 130' INT TERM

die() {
  printf '\n✘ %s\n' "$*" >&2
  exit 1
}

[ $# -ge 2 ] || die "Thiếu tên bucket hoặc địa chỉ web. Chép lại lệnh đầy đủ từ MathPad."
BUCKET=$1
shift
case $BUCKET in
  *[!A-Za-z0-9-]* | "") die "Tên bucket không hợp lệ: $BUCKET" ;;
esac
ORIGINS=""
for o in "$@"; do
  o=${o%/}
  printf '%s' "$o" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$' || die "Địa chỉ web không hợp lệ: $o"
  ORIGINS="$ORIGINS${ORIGINS:+, }\"$o\""
done

ask() { # ask <câu hỏi> <ẩn: 1|0>
  [ -r /dev/tty ] || die "Không hỏi được khóa (không có Terminal). Đặt B2_KEY_ID và B2_APP_KEY."
  printf '%s' "$1" >/dev/tty
  [ "$2" = 1 ] && stty -echo </dev/tty
  IFS= read -r REPLY </dev/tty || REPLY=""
  [ "$2" = 1 ] && { stty echo </dev/tty; printf '\n' >/dev/tty; }
  printf '%s' "$REPLY" | tr -d '[:space:]'
}

# Lấy giá trị chuỗi của một trường JSON (các giá trị B2 cần ở đây không chứa dấu ").
field() {
  tr -d '\n' <"$1" | grep -o "\"$2\" *: *\"[^\"]*\"" | head -n 1 | sed 's/.*: *"\(.*\)"$/\1/'
}

# call <tên bước> <tệp cấu hình curl> <url> [dữ liệu JSON]: mã HTTP ở $CODE, nội dung ở $TMP/out
call() {
  if [ $# -ge 4 ]; then
    printf '%s' "$4" >"$TMP/body"
    CODE=$(curl -sS -o "$TMP/out" -w '%{http_code}' -K "$2" -X POST \
      -H 'Content-Type: application/json' --data-binary @"$TMP/body" "$3") ||
      die "$1: không kết nối được tới Backblaze. Kiểm tra mạng (mạng công ty có thể chặn) rồi thử lại."
  else
    CODE=$(curl -sS -o "$TMP/out" -w '%{http_code}' -K "$2" "$3") ||
      die "$1: không kết nối được tới Backblaze. Kiểm tra mạng (mạng công ty có thể chặn) rồi thử lại."
  fi
}

printf 'Bật truy cập cho bản web MathPad trên bucket %s\n\n' "$BUCKET"
KEY_ID=${B2_KEY_ID:-}
APP_KEY=${B2_APP_KEY:-}
[ -n "$KEY_ID" ] || KEY_ID=$(ask "keyID của Master Application Key: " 0)
[ -n "$APP_KEY" ] || APP_KEY=$(ask "applicationKey của Master Application Key (không hiện khi gõ): " 1)
[ -n "$KEY_ID" ] && [ -n "$APP_KEY" ] || die "Cần keyID và applicationKey."

# Khóa đi qua tệp cấu hình tạm (không lộ trên dòng lệnh), xóa khi xong.
umask 077
printf 'user = "%s:%s"\n' "$KEY_ID" "$APP_KEY" >"$TMP/auth"
call "Đăng nhập Backblaze" "$TMP/auth" "$AUTH_URL/b2api/v3/b2_authorize_account"
[ "$CODE" = 200 ] || die "Backblaze không nhận khóa này (mã $CODE). Kiểm tra keyID và applicationKey của Master Application Key."
ACCOUNT=$(field "$TMP/out" accountId)
TOKEN=$(field "$TMP/out" authorizationToken)
API=$(field "$TMP/out" apiUrl)
[ -n "$ACCOUNT" ] && [ -n "$TOKEN" ] && [ -n "$API" ] || die "Backblaze trả về dữ liệu không đọc được."
printf 'header = "Authorization: %s"\n' "$TOKEN" >"$TMP/token"

call "Tìm bucket" "$TMP/token" "$API/b2api/v3/b2_list_buckets" \
  "{\"accountId\": \"$ACCOUNT\", \"bucketName\": \"$BUCKET\"}"
[ "$CODE" = 200 ] || die "Khóa này không xem được bucket (mã $CODE). Dùng Master Application Key."
BUCKET_ID=$(field "$TMP/out" bucketId)
[ -n "$BUCKET_ID" ] || die "Không thấy bucket \"$BUCKET\" trong tài khoản này. Kiểm tra tên bucket (phân biệt chữ hoa/thường)."
OTHERS=$(tr -d '\n' <"$TMP/out" | grep -o '"corsRuleName" *: *"[^"]*"' | grep -vc '"mathpad-web"' || true)
[ "$OTHERS" = 0 ] || printf 'Lưu ý: bucket có %s quy tắc CORS khác; chúng được thay bằng quy tắc của MathPad.\n' "$OTHERS"

RULE="{\"corsRuleName\": \"mathpad-web\", \"allowedOrigins\": [$ORIGINS],
  \"allowedOperations\": [\"s3_get\", \"s3_head\", \"s3_put\", \"s3_delete\"],
  \"allowedHeaders\": [\"*\"], \"exposeHeaders\": [\"ETag\"], \"maxAgeSeconds\": 3600}"
call "Cập nhật bucket" "$TMP/token" "$API/b2api/v3/b2_update_bucket" \
  "{\"accountId\": \"$ACCOUNT\", \"bucketId\": \"$BUCKET_ID\", \"corsRules\": [$RULE]}"
[ "$CODE" = 200 ] || die "Không đổi được cài đặt bucket (mã $CODE). Dùng Master Application Key."

printf '\n✔ Xong. Bucket %s đã cho phép: %s\n' "$BUCKET" "$(printf '%s' "$ORIGINS" | tr -d '"')"
printf '  Quay lại MathPad, bấm “Thử kết nối lại” (Backblaze có thể cần khoảng 1 phút).\n'
