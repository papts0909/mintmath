import { useEffect, useRef, useState } from "react";
import { Cloud, CloudUpload, Download, FileInput, RefreshCw, RotateCw, Trash2, Upload } from "lucide-react";
import { downloadBlob } from "../api/exportClient";
import { DEFAULT_PREFIX, validateConfig, type B2Config } from "../cloud/b2";
import {
  connectB2,
  deleteFromB2,
  disconnectB2,
  downloadFromB2,
  openFromB2,
  refreshB2,
  saveCurrentToB2,
  syncLibraryWithB2,
  uploadFileToB2,
  useB2,
} from "../cloud/b2Actions";
import { displayName, isDocKey } from "../cloud/b2Sync";
import { useDocStore } from "../core/docStore";
import { isNativeApp } from "../native";
import { switchToDoc } from "./LibraryPanel";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

/** Readable name for a MintMath document key: "Ten-bai__id.mintmath.json" -> "Ten bai". */
const docLabel = (name: string) =>
  name.replace(/__[A-Za-z0-9_-]+\.(?:mintmath|mathpad)\.json$/, "").replace(/-/g, " ");

function ConnectForm() {
  const busy = useB2((s) => s.busy);
  const [cfg, setCfg] = useState<B2Config>({
    keyId: "",
    appKey: "",
    bucket: "",
    endpoint: "",
    prefix: DEFAULT_PREFIX,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const set = (k: keyof B2Config) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg({ ...cfg, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateConfig(cfg);
    setFormError(err);
    if (!err) void connectB2(cfg);
  };

  return (
    <form className="b2-form" onSubmit={submit} aria-label="Kết nối Backblaze B2">
      <label>
        keyID
        <input ref={first} value={cfg.keyId} onChange={set("keyId")} autoComplete="off" spellCheck={false} />
      </label>
      <label>
        applicationKey
        <span className="b2-secret">
          <input
            type={showKey ? "text" : "password"}
            value={cfg.appKey}
            onChange={set("appKey")}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? "Ẩn khóa" : "Hiện khóa"}
          >
            {showKey ? "Ẩn" : "Hiện"}
          </button>
        </span>
      </label>
      <label>
        Tên bucket
        <input value={cfg.bucket} onChange={set("bucket")} autoComplete="off" spellCheck={false} />
      </label>
      <label>
        Endpoint
        <input
          value={cfg.endpoint}
          onChange={set("endpoint")}
          placeholder="s3.us-west-004.backblazeb2.com"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        Thư mục trong bucket
        <input value={cfg.prefix} onChange={set("prefix")} autoComplete="off" spellCheck={false} />
      </label>
      {formError ? (
        <p className="status error" role="alert">
          {formError}
        </p>
      ) : null}
      <button type="submit" className="primary" disabled={busy !== null}>
        {busy ?? "Kết nối"}
      </button>
      <details className="b2-help">
        <summary>Lấy các thông tin này ở đâu?</summary>
        <ol>
          <li>Đăng ký tài khoản tại backblaze.com (10 GB đầu miễn phí).</li>
          <li>
            <b>Buckets → Create a Bucket</b>: đặt tên, chọn <b>Private</b>. Mục <b>Endpoint</b> của bucket là
            dòng dạng <code>s3.….backblazeb2.com</code>.
          </li>
          <li>
            <b>Application Keys → Add a New Application Key</b>: chỉ cho phép bucket vừa tạo, quyền{" "}
            <b>Read and Write</b>. Chép <b>keyID</b> và <b>applicationKey</b> (khóa chỉ hiện một lần).
          </li>
          <li>
            Mở bucket vừa tạo, chép dòng <b>Endpoint</b> và tên bucket vào đây rồi bấm <b>Kết nối</b>.
          </li>
          {isNativeApp() ? null : (
            <li>
              Bản web: lần đầu kết nối, bucket cần cho phép địa chỉ <code>{location.origin}</code>. Nếu chưa,
              app sẽ hiện hướng dẫn bật (làm một lần). App máy tính và Android không cần bước này.
            </li>
          )}
        </ol>
        <p className="muted small">
          Khóa chỉ lưu trên thiết bị này. Không chia sẻ applicationKey cho người khác.
        </p>
      </details>
    </form>
  );
}

function CopyLine({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="b2-cmd">
      <code>{text}</code>
      <button
        type="button"
        aria-label={`Chép lệnh ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            window.prompt("Chép lệnh này:", text);
          }
        }}
      >
        {copied ? "Đã chép" : "Chép"}
      </button>
    </span>
  );
}

type Os = "mac" | "windows";
const guessOs = (): Os => (/Windows/i.test(navigator.userAgent) ? "windows" : "mac");

/** Shown when the browser was blocked by a missing CORS rule on the bucket.
 *  Backblaze refuses bucket changes made from a browser, so the rule is set
 *  with a short command that uses only tools every computer already has. */
function CorsHelp() {
  const cors = useB2((s) => s.cors);
  const busy = useB2((s) => s.busy);
  const [os, setOs] = useState<Os>(guessOs);
  if (!cors) return null;
  const app = new URL(import.meta.env.BASE_URL, location.origin).href;
  const { bucket } = cors.cfg;
  const mac = `curl -fsSL ${app}b2-cors.sh | sh -s -- ${bucket} ${cors.origin}`;
  const win =
    `$s=(iwr -UseBasicParsing ${app}b2-cors.ps1).RawContentStream.ToArray(); ` +
    `& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString($s))) -Bucket ${bucket} -Origin ${cors.origin}`;

  return (
    <section className="b2-cors" aria-label="Bật truy cập cho bản web">
      <strong>Bật truy cập cho bản web (làm một lần)</strong>
      <p>
        Trình duyệt chỉ cho MintMath đọc và lưu bài trong bucket <b>{bucket}</b> khi bucket cho phép địa chỉ{" "}
        <code>{cors.origin}</code>. Backblaze không cho đổi cài đặt này từ trang web, nên cần chạy một lệnh
        ngắn (khoảng 1 phút, không cài thêm gì). App máy tính và app Android không cần bước này.
      </p>
      <ol>
        <li>
          <b>Lấy Master Application Key:</b> vào backblaze.com → <b>Application Keys</b> → mục{" "}
          <b>Master Application Key</b> → <b>Generate New Master Application Key</b>. Để trang đó mở, lát nữa
          chép keyID và applicationKey. (Khóa đang dùng trong MintMath không có quyền đổi cài đặt bucket. Tạo
          Master key mới làm Master key cũ hết hiệu lực.)
        </li>
        <li>
          <b>Chạy lệnh</b> trên máy tính:
          <span className="b2-os" role="tablist" aria-label="Hệ điều hành">
            <button type="button" role="tab" aria-selected={os === "mac"} onClick={() => setOs("mac")}>
              macOS / Linux
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={os === "windows"}
              onClick={() => setOs("windows")}
            >
              Windows
            </button>
          </span>
          {os === "mac" ? (
            <>
              Mở <b>Terminal</b> (bấm ⌘ Space, gõ “Terminal”, Enter), dán lệnh này rồi Enter:
              <CopyLine label="macOS" text={mac} />
            </>
          ) : (
            <>
              Mở <b>PowerShell</b> (bấm phím Windows, gõ “PowerShell”, Enter), dán lệnh này rồi Enter:
              <CopyLine label="Windows" text={win} />
            </>
          )}
        </li>
        <li>
          Lệnh hỏi <b>keyID</b> rồi <b>applicationKey</b> của Master key: dán vào, Enter (applicationKey không
          hiện khi dán, vẫn bình thường). Khóa chỉ dùng cho lần này, không được lưu.
        </li>
        <li>
          Thấy “✔ Xong” thì bấm <b>Thử kết nối lại</b> bên dưới.
        </li>
      </ol>
      <p className="muted small">
        Máy không mở được Terminal/PowerShell (ví dụ máy công ty)? Mở shell.cloud.google.com bằng tài khoản
        Google, dán lệnh macOS / Linux vào đó. Hoặc dùng MintMath trên điện thoại Android.
      </p>
      <button type="button" disabled={busy !== null} onClick={() => void connectB2(cors.cfg)}>
        <RefreshCw className="icon" aria-hidden="true" />
        Thử kết nối lại
      </button>
    </section>
  );
}

interface Props {
  onMessage: (text: string) => void;
  onOpened: () => void;
}

export default function B2Panel({ onMessage, onOpened }: Props) {
  const { config, busy, message, files, savedAt } = useB2();
  const uploadInput = useRef<HTMLInputElement>(null);
  const currentId = useDocStore((s) => s.doc.id);

  useEffect(() => {
    if (config && files === null) void refreshB2();
  }, [config, files]);

  const status = message ? (
    <p className={`status ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
      {message.text}
    </p>
  ) : null;

  if (!config) {
    return (
      <div className="b2-panel">
        <div className="b2-cta">
          <strong>
            <Cloud className="icon" aria-hidden="true" />
            Lưu bài lên Backblaze B2
          </strong>
          <p>
            Dùng tài khoản B2 của riêng bạn để lưu bài và mở lại trên máy khác: máy tính, điện thoại, bản web.
          </p>
        </div>
        <ConnectForm />
        {status}
        <CorsHelp />
      </div>
    );
  }

  const prefix = config.prefix;
  const docs = (files ?? []).filter((f) => isDocKey(f.key));
  const others = (files ?? []).filter((f) => !isDocKey(f.key) && !f.key.endsWith("/"));

  const open = async (key: string) => {
    const doc = await openFromB2(key);
    if (doc) {
      await switchToDoc(doc);
      onMessage(`Đã mở “${doc.title || "Không tiêu đề"}” từ B2`);
      onOpened();
    }
  };

  return (
    <div className="b2-panel">
      <p className="b2-account">
        <Cloud className="icon" aria-hidden="true" /> <b>{config.bucket}</b>
        <span className="muted"> /{prefix}</span>
      </p>
      <div className="library-actions">
        <button
          type="button"
          className="primary"
          disabled={busy !== null}
          onClick={() => void saveCurrentToB2()}
          title="Ctrl+S"
        >
          <CloudUpload className="icon" aria-hidden="true" />
          Lưu bài đang mở
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void syncLibraryWithB2()}>
          <RefreshCw className="icon" aria-hidden="true" />
          Đồng bộ thư viện
        </button>
        <button type="button" disabled={busy !== null} onClick={() => uploadInput.current?.click()}>
          <Upload className="icon" aria-hidden="true" />
          Tải tệp lên
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void refreshB2()}
          aria-label="Làm mới danh sách"
        >
          <RotateCw className="icon" aria-hidden="true" />
        </button>
        <input
          ref={uploadInput}
          type="file"
          multiple
          hidden
          data-testid="b2-upload"
          onChange={async (e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            for (const f of list) await uploadFileToB2(f, f.name);
          }}
        />
      </div>
      {busy ? <p className="muted">{busy}</p> : null}
      {status}
      <CorsHelp />
      {savedAt ? (
        <p className="muted small">
          Đã lưu lên B2 lúc {savedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      ) : null}

      <h3>Bài MintMath ({docs.length})</h3>
      {files === null ? <p className="muted">Đang tải…</p> : null}
      {files && !docs.length ? (
        <p className="muted">Chưa có bài nào trên B2. Bấm “Lưu bài đang mở”.</p>
      ) : null}
      <ul className="library-list">
        {docs.map((f) => {
          const name = displayName(f.key, prefix);
          const isOpen = name.includes(`__${currentId}.`);
          return (
            <li key={f.key} className={isOpen ? "is-current" : ""} data-testid="b2-item">
              <button
                type="button"
                className="library-open"
                disabled={busy !== null}
                onClick={() => void open(f.key)}
              >
                <strong>{docLabel(name)}</strong>
                <span className="meta">
                  {fmtDate(f.lastModified)} · {fmtSize(f.size)}
                  {isOpen ? " · đang mở" : ""}
                </span>
              </button>
              <span className="library-item-actions">
                <button
                  type="button"
                  aria-label={`Xóa ${docLabel(name)} trên B2`}
                  title="Xóa trên B2"
                  onClick={() => {
                    if (
                      window.confirm(`Xóa “${docLabel(name)}” trên B2? Bản trong thư viện máy này vẫn giữ.`)
                    )
                      void deleteFromB2(f.key);
                  }}
                >
                  <Trash2 className="icon" aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      {others.length ? (
        <>
          <h3>Tệp khác ({others.length})</h3>
          <ul className="library-list">
            {others.map((f) => {
              const name = displayName(f.key, prefix);
              const isTex = /\.(tex|ltx)$/i.test(name);
              return (
                <li key={f.key} data-testid="b2-file">
                  <span className="library-open">
                    <strong>{name}</strong>
                    <span className="meta">
                      {fmtDate(f.lastModified)} · {fmtSize(f.size)}
                    </span>
                  </span>
                  <span className="library-item-actions">
                    {isTex ? (
                      <button
                        type="button"
                        title="Nhập thành bài"
                        aria-label={`Nhập ${name}`}
                        onClick={() => void open(f.key)}
                      >
                        <FileInput className="icon" aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      title="Tải về"
                      aria-label={`Tải về ${name}`}
                      onClick={async () => {
                        const blob = await downloadFromB2(f.key);
                        if (blob) downloadBlob(blob, name.split("/").pop() ?? name);
                      }}
                    >
                      <Download className="icon" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Xóa trên B2"
                      aria-label={`Xóa ${name} trên B2`}
                      onClick={() => {
                        if (window.confirm(`Xóa “${name}” trên B2?`)) void deleteFromB2(f.key);
                      }}
                    >
                      <Trash2 className="icon" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <button
        type="button"
        className="link-button"
        onClick={() => {
          if (
            window.confirm("Ngắt kết nối B2 trên máy này? Khóa sẽ bị xóa khỏi máy; dữ liệu trên B2 vẫn giữ.")
          )
            disconnectB2();
        }}
      >
        Ngắt kết nối B2
      </button>
    </div>
  );
}
