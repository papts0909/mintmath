# MintMath: bật truy cập cho bản web trên bucket Backblaze B2 (quy tắc CORS).
# Chỉ dùng PowerShell có sẵn trên Windows 10/11. Không cài gì.
# MintMath hiện sẵn lệnh để chép, dạng:
#   $s=(iwr -UseBasicParsing https://<địa chỉ MintMath>/b2-cors.ps1).RawContentStream.ToArray();
#   & ([scriptblock]::Create([Text.Encoding]::UTF8.GetString($s))) -Bucket <tên> -Origin <địa chỉ>
# Hỏi keyID / applicationKey của Master Application Key (không lưu ở đâu).
param(
  [Parameter(Mandatory = $true)][string]$Bucket,
  [Parameter(Mandatory = $true)][string[]]$Origin
)

function Fail([string]$msg) {
  Write-Host ""
  Write-Host "✘ $msg" -ForegroundColor Red
}

try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

if ($Bucket -notmatch '^[A-Za-z0-9-]+$') { Fail "Tên bucket không hợp lệ: $Bucket"; return }
$origins = @()
foreach ($o in $Origin) {
  $o = $o.TrimEnd('/')
  if ($o -notmatch '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$') { Fail "Địa chỉ web không hợp lệ: $o"; return }
  $origins += $o
}

Write-Host "Bật truy cập cho bản web MintMath trên bucket $Bucket"
Write-Host ""
$keyId = $env:B2_KEY_ID
if (-not $keyId) { $keyId = Read-Host "keyID của Master Application Key" }
$appKey = $env:B2_APP_KEY
if (-not $appKey) {
  $sec = Read-Host "applicationKey của Master Application Key (không hiện khi gõ)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $appKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$keyId = "$keyId".Trim(); $appKey = "$appKey".Trim()
if (-not $keyId -or -not $appKey) { Fail "Cần keyID và applicationKey."; return }
if ("$keyId$appKey" -notmatch '^[A-Za-z0-9+/=_-]+$') { Fail "keyID hoặc applicationKey có ký tự lạ. Chép lại từ trang Backblaze."; return }

function StatusOf($err) {
  try { return [int]$err.Exception.Response.StatusCode } catch { return 0 }
}

$authUrl = if ($env:B2_AUTH_URL) { $env:B2_AUTH_URL } else { "https://api.backblazeb2.com" }
try {
  $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${keyId}:${appKey}"))
  $auth = Invoke-RestMethod -UseBasicParsing -Uri "$authUrl/b2api/v3/b2_authorize_account" `
    -Headers @{ Authorization = "Basic $basic" }
} catch {
  $code = StatusOf $_
  if ($code -eq 0) { Fail "Không kết nối được tới Backblaze. Kiểm tra mạng (mạng công ty có thể chặn) rồi thử lại." }
  else { Fail "Backblaze không nhận khóa này (mã $code). Kiểm tra keyID và applicationKey của Master Application Key." }
  return
}
$api = $auth.apiInfo.storageApi.apiUrl
$headers = @{ Authorization = $auth.authorizationToken }

function Post([string]$method, $body) {
  $json = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 6 -Compress))
  return Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$api/b2api/v3/$method" `
    -Headers $headers -ContentType "application/json; charset=utf-8" -Body $json
}

try {
  $list = Post "b2_list_buckets" @{ accountId = $auth.accountId; bucketName = $Bucket }
} catch { Fail "Khóa này không xem được bucket (mã $(StatusOf $_)). Dùng Master Application Key."; return }
$b = @($list.buckets) | Select-Object -First 1
if (-not $b) { Fail "Không thấy bucket `"$Bucket`" trong tài khoản này. Kiểm tra tên bucket (phân biệt chữ hoa/thường)."; return }

# Giữ các quy tắc CORS khác và các địa chỉ đã cho phép trước đó.
$rules = @(@($b.corsRules) | Where-Object { $_ -and $_.corsRuleName -notin @("mintmath-web", "mathpad-web") })
$old = @($b.corsRules) | Where-Object { $_ -and $_.corsRuleName -in @("mintmath-web", "mathpad-web") } | Select-Object -First 1
if ($old) { $origins = @(@($old.allowedOrigins) + $origins | Select-Object -Unique) }
$rules += [ordered]@{
  corsRuleName      = "mintmath-web"
  allowedOrigins    = [object[]]$origins
  allowedOperations = [object[]]@("s3_get", "s3_head", "s3_put", "s3_delete")
  allowedHeaders    = [object[]]@("*")
  exposeHeaders     = [object[]]@("ETag")
  maxAgeSeconds     = 3600
}

try {
  $null = Post "b2_update_bucket" @{ accountId = $auth.accountId; bucketId = $b.bucketId; corsRules = [object[]]$rules }
} catch { Fail "Không đổi được cài đặt bucket (mã $(StatusOf $_)). Dùng Master Application Key."; return }

Write-Host ""
Write-Host "✔ Xong. Bucket $Bucket đã cho phép: $($origins -join ', ')" -ForegroundColor Green
Write-Host "  Quay lại MintMath, bấm “Thử kết nối lại” (Backblaze có thể cần khoảng 1 phút)."
