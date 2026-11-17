import { useEffect, useRef, useState } from "react";
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
import { DOC_SUFFIX, displayName } from "../cloud/b2Sync";
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

/** Readable name for a MathPad document key: "Ten-bai__id.mathpad.json" -> "Ten bai". */
const docLabel = (name: string) => name.replace(/__[A-Za-z0-9_-]+\.mathpad\.json$/, "").replace(/-/g, " ");

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
          {isNativeApp() ? null : (
            <li>
              Bản web cần bật CORS cho bucket với địa chỉ <code>{location.origin}</code> (xem docs/B2.md). App
              máy tính và Android không cần.
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
          <strong>☁ Lưu bài lên Backblaze B2</strong>
          <p>
            Dùng tài khoản B2 của riêng bạn để lưu bài và mở lại trên máy khác: máy tính, điện thoại, bản web.
          </p>
        </div>
        <ConnectForm />
        {status}
      </div>
    );
  }

  const prefix = config.prefix;
  const docs = (files ?? []).filter((f) => f.key.endsWith(DOC_SUFFIX));
  const others = (files ?? []).filter((f) => !f.key.endsWith(DOC_SUFFIX) && !f.key.endsWith("/"));

  const open = async (key: string) => {
    const doc = await openFromB2(key);
    if (doc) {
      await switchToDoc(() => useDocStore.getState().loadDoc(doc));
      onMessage(`Đã mở “${doc.title || "Không tiêu đề"}” từ B2`);
      onOpened();
    }
  };

  return (
    <div className="b2-panel">
      <p className="b2-account">
        ☁ <b>{config.bucket}</b>
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
          ⬆ Lưu bài đang mở
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void syncLibraryWithB2()}>
          ⇅ Đồng bộ thư viện
        </button>
        <button type="button" disabled={busy !== null} onClick={() => uploadInput.current?.click()}>
          Tải tệp lên
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void refreshB2()}
          aria-label="Làm mới danh sách"
        >
          ↻
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
      {savedAt ? (
        <p className="muted small">
          Đã lưu lên B2 lúc {savedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      ) : null}

      <h3>Bài MathPad ({docs.length})</h3>
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
                  🗑
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
                        ⤵
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
                      ⬇
                    </button>
                    <button
                      type="button"
                      title="Xóa trên B2"
                      aria-label={`Xóa ${name} trên B2`}
                      onClick={() => {
                        if (window.confirm(`Xóa “${name}” trên B2?`)) void deleteFromB2(f.key);
                      }}
                    >
                      🗑
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
