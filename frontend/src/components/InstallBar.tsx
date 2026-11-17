import { useState } from "react";
import { isIos, promptInstall, usePwa } from "../pwa";

/** Offline badge, "install app" button and the iOS add-to-home-screen hint. */
export default function InstallBar() {
  const { online, installEvent, installed, updateReady } = usePwa();
  const [showIosHint, setShowIosHint] = useState(false);
  const iosCanInstall = !installed && isIos();

  return (
    <span className="install-bar">
      {!online ? (
        <span
          className="badge offline"
          title="Vẫn soạn và xuất LaTeX/In/PNG được; B2 và PDF máy chủ cần mạng"
        >
          Ngoại tuyến
        </span>
      ) : null}
      {updateReady ? (
        <button type="button" onClick={() => window.location.reload()}>
          Có bản mới – tải lại
        </button>
      ) : null}
      {installEvent && !installed ? (
        <button type="button" onClick={() => void promptInstall()}>
          Cài ứng dụng
        </button>
      ) : null}
      {iosCanInstall ? (
        <button type="button" onClick={() => setShowIosHint((v) => !v)} aria-expanded={showIosHint}>
          Cài lên máy
        </button>
      ) : null}
      {showIosHint ? (
        <span className="ios-hint" role="note">
          Trên iPhone/iPad (Safari): bấm nút Chia sẻ <span aria-hidden>⬆︎</span> rồi chọn “Thêm vào MH chính”.
        </span>
      ) : null}
    </span>
  );
}
