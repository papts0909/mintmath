import {
  Archive,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Braces,
  Cloud,
  CloudUpload,
  Copy,
  CornerDownRight,
  Divide,
  Download,
  Expand,
  Eye,
  FileCode,
  FileOutput,
  FilePlus,
  FileText,
  FolderOpen,
  Grid3x3,
  Image,
  Keyboard,
  LibraryBig,
  Link2,
  LogOut,
  MonitorDown,
  Omega,
  Palette,
  Plus,
  Printer,
  Radical,
  Redo2,
  RefreshCw,
  Subscript,
  Superscript,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useRef } from "react";
import { downloadBlob } from "../api/exportClient";
import { disconnectB2, saveCurrentToB2, syncLibraryWithB2, useB2 } from "../cloud/b2Actions";
import { docFileName, DocFormatError, serializeDoc } from "../core/docFormat";
import { useDocStore } from "../core/docStore";
import { ACCEPTED_FILES, importFile } from "../core/fileImport";
import { newId } from "../core/id";
import { buildEnv } from "../core/matrix";
import { exportBackup, getDoc } from "../core/library";
import type { Settings } from "../core/persistence";
import { SHORTCUTS } from "../core/shortcuts";
import { THEME_OPTIONS } from "../core/theme";
import {
  exportPdf,
  exportPng,
  exportTex,
  exportToB2,
  previewPdf,
  printPage,
  useExport,
} from "../export/exportActions";
import { promptInstall, usePwa } from "../pwa";
import { insertMath, lineCommands as L, refocusEditor } from "./commands";
import { copyLines } from "./Editor";
import IconToolbar, { type ToolItem } from "./IconToolbar";
import InstallBar from "./InstallBar";
import { switchToDoc } from "./LibraryPanel";
import { Logo } from "./Logo";
import MatrixPicker from "./MatrixPicker";
import type { MenuItem } from "./Menu";
import MenuBar, { type TopMenu } from "./MenuBar";

interface Props {
  savedLocally: boolean;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onToggleShortcuts: () => void;
  onToggleLibrary: () => void;
  onOpenB2: () => void;
  onPreview: (url: string) => void;
  onMessage: (text: string) => void;
  onZen: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";

/** Run a command, then hand the keyboard back to the editor. */
const andRefocus = (fn: () => unknown) => () => {
  void fn();
  refocusEditor();
};

const SYSTEM_SIZES = [2, 3, 4, 5];
const SYMBOL_GROUPS = ["Logic", "Tập hợp", "Quan hệ", "Phép toán"] as const;

export default function Toolbar(props: Props) {
  const title = useDocStore((s) => s.doc.title);
  const canUndo = useDocStore((s) => s.past.length > 0);
  const canRedo = useDocStore((s) => s.future.length > 0);
  const selection = useDocStore((s) => s.selection);
  const b2 = useB2();
  const exportState = useExport();
  const installEvent = usePwa((s) => s.installEvent);
  const fileInput = useRef<HTMLInputElement>(null);

  // The open document is kept in the library, so starting a new one loses nothing.
  const newDoc = () => void switchToDoc(null);

  const download = () => {
    const doc = useDocStore.getState().doc;
    downloadBlob(new Blob([serializeDoc(doc)], { type: "application/json" }), docFileName(doc.title));
  };

  const backup = async () => {
    const data = await exportBackup();
    const day = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `mintmath-thu-vien-${day}.json`,
    );
    props.onMessage(`Đã sao lưu ${data.docs.length} bài`);
  };

  const openLocal = async (file: File) => {
    try {
      const r = await importFile(file);
      if (r.kind === "doc") {
        const doc = r.doc;
        // Opening an older copy must not overwrite the library's version.
        const existing = await getDoc(doc.id).catch(() => null);
        if (existing && existing.updatedAt !== doc.updatedAt) doc.id = newId();
        await switchToDoc(doc);
      }
      props.onMessage(r.message);
    } catch (e) {
      props.onMessage(e instanceof DocFormatError ? e.message : "Không đọc được tệp.");
    }
  };

  const copySelection = async () => {
    const st = useDocStore.getState();
    const ok = await copyLines(st.doc.lines.filter((l) => st.selection.includes(l.id)));
    props.onMessage(ok ? "Đã sao chép" : "Không truy cập được clipboard");
  };

  const busy = exportState.busy !== null;
  const connected = b2.config !== null;
  const setSetting = (patch: Partial<Settings>) => props.onSettings({ ...props.settings, ...patch });

  // ---------- shared pieces ----------

  const exportItems: MenuItem[] = [
    { label: "LaTeX (.tex)", icon: FileCode, onSelect: () => void exportTex(), disabled: busy },
    { label: "PDF", icon: FileText, onSelect: () => void exportPdf(), disabled: busy },
    { label: "PNG", icon: Image, onSelect: () => void exportPng(), disabled: busy },
    { type: "separator" },
    {
      label: "Xem trước bản in",
      icon: Eye,
      onSelect: () => void previewPdf(props.onPreview),
      disabled: busy,
    },
    { label: "In", icon: Printer, shortcut: `${MOD}P`, onSelect: () => void printPage(), disabled: busy },
    ...(connected
      ? ([
          { type: "separator" },
          {
            label: "Lưu .tex và PDF lên B2",
            icon: CloudUpload,
            onSelect: () => void exportToB2(),
            disabled: busy,
          },
        ] as MenuItem[])
      : []),
  ];

  const systemItems: MenuItem[] = SYSTEM_SIZES.map((n) => ({
    label: `${n} phương trình`,
    onSelect: () => void insertMath(buildEnv("cases", n, 1)),
  }));

  const matrixPanel = (close: () => void) => (
    <MatrixPicker
      onPick={(latex) => {
        close();
        void insertMath(latex);
      }}
    />
  );

  const symbolItems: MenuItem[] = SYMBOL_GROUPS.map((g) => ({
    type: "submenu",
    label: g,
    items: SHORTCUTS.filter((s) => s.group === g && !s.sized).map((s) => ({
      label: s.label,
      shortcut: s.trigger,
      onSelect: () => void insertMath(s.latex),
    })),
  }));

  const b2Items: MenuItem[] = connected
    ? [
        {
          label: "Lưu lên B2",
          icon: CloudUpload,
          shortcut: `${MOD}S`,
          onSelect: () => void saveCurrentToB2(),
        },
        { label: "Đồng bộ thư viện", icon: RefreshCw, onSelect: () => void syncLibraryWithB2() },
        { label: "Mở bài từ B2…", icon: Cloud, onSelect: props.onOpenB2 },
        { type: "separator" },
        {
          label: "Ngắt kết nối B2",
          icon: LogOut,
          onSelect: () => {
            if (
              window.confirm(
                "Ngắt kết nối B2 trên máy này? Khóa sẽ bị xóa khỏi máy; dữ liệu trên B2 vẫn giữ.",
              )
            )
              disconnectB2();
          },
        },
      ]
    : [{ label: "Kết nối Backblaze B2…", icon: Cloud, onSelect: props.onOpenB2 }];

  // ---------- menu bar ----------

  const menus: TopMenu[] = [
    {
      label: "Tệp",
      items: [
        { label: "Bài mới (tab mới)", icon: FilePlus, onSelect: newDoc },
        { label: "Mở tệp…", icon: FolderOpen, onSelect: () => fileInput.current?.click() },
        { label: "Thư viện", icon: LibraryBig, onSelect: props.onToggleLibrary },
        { type: "separator" },
        { label: "Tải về (.mintmath.json)", icon: Download, onSelect: download },
        { label: "Sao lưu thư viện", icon: Archive, onSelect: () => void backup() },
        { type: "separator" },
        { type: "submenu", label: "Xuất", icon: FileOutput, items: exportItems },
        { type: "submenu", label: "Backblaze B2", icon: Cloud, items: b2Items },
      ],
    },
    {
      label: "Chỉnh sửa",
      items: [
        {
          label: "Hoàn tác",
          icon: Undo2,
          shortcut: `${MOD}Z`,
          disabled: !canUndo,
          onSelect: andRefocus(L.undo),
        },
        {
          label: "Làm lại",
          icon: Redo2,
          shortcut: `${MOD}Shift+Z`,
          disabled: !canRedo,
          onSelect: andRefocus(L.redo),
        },
        { type: "separator" },
        { label: "Nhân đôi dòng", icon: Copy, shortcut: `${MOD}D`, onSelect: andRefocus(L.duplicate) },
        { label: "Xóa dòng", icon: Trash2, onSelect: andRefocus(L.remove) },
        { type: "separator" },
        {
          label: "Sao chép dòng đã chọn",
          disabled: !selection.length,
          onSelect: () => void copySelection(),
        },
        {
          label: "Xóa dòng đã chọn",
          disabled: !selection.length,
          onSelect: () => useDocStore.getState().deleteLines(selection),
        },
        {
          label: "Bỏ chọn",
          disabled: !selection.length,
          onSelect: () => useDocStore.getState().setSelection([]),
        },
      ],
    },
    {
      label: "Chèn",
      items: [
        { label: "Dòng toán", icon: Plus, shortcut: "Enter", onSelect: andRefocus(L.addMath) },
        { label: "Dòng chữ", icon: Type, onSelect: andRefocus(L.addText) },
        {
          label: "Dòng toán nối",
          icon: CornerDownRight,
          shortcut: "Shift+Enter",
          onSelect: andRefocus(L.addJoined),
        },
        { type: "separator" },
        { type: "submenu", label: "Hệ phương trình", icon: Braces, items: systemItems },
        { type: "panel", label: "Ma trận", icon: Grid3x3, render: matrixPanel },
        { label: "Phân số", icon: Divide, shortcut: "/", onSelect: () => void insertMath("\\frac{#@}{#?}") },
        {
          label: "Căn bậc hai",
          icon: Radical,
          shortcut: "sqrt",
          onSelect: () => void insertMath("\\sqrt{#@}"),
        },
        { label: "Lũy thừa", icon: Superscript, shortcut: "^", onSelect: () => void insertMath("#@^{#?}") },
        { label: "Chỉ số dưới", icon: Subscript, shortcut: "_", onSelect: () => void insertMath("#@_{#?}") },
        { type: "submenu", label: "Ký hiệu", icon: Omega, items: symbolItems },
      ],
    },
    {
      label: "Dòng",
      items: [
        {
          label: "Đổi Toán ⇄ Chữ",
          icon: ArrowLeftRight,
          shortcut: `${MOD}'`,
          onSelect: andRefocus(L.toggleType),
        },
        { label: "Nối với dòng trên / bỏ nối", icon: Link2, onSelect: andRefocus(L.toggleJoin) },
        { type: "separator" },
        { label: "Đưa lên", icon: ArrowUp, shortcut: "Alt+↑", onSelect: andRefocus(L.moveUp) },
        { label: "Đưa xuống", icon: ArrowDown, shortcut: "Alt+↓", onSelect: andRefocus(L.moveDown) },
        { label: "Nhân đôi", icon: Copy, shortcut: `${MOD}D`, onSelect: andRefocus(L.duplicate) },
        { label: "Xóa dòng", icon: Trash2, onSelect: andRefocus(L.remove) },
      ],
    },
    {
      label: "Xem",
      items: [
        {
          type: "submenu",
          label: "Giao diện",
          icon: Palette,
          items: THEME_OPTIONS.map((o) => ({
            type: "radio",
            label: o.label,
            checked: props.settings.theme === o.value,
            onSelect: () => setSetting({ theme: o.value }),
          })),
        },
        { label: "Chế độ Zen", icon: Expand, shortcut: `${MOD}.`, onSelect: props.onZen },
        { label: "Bảng lệnh tắt", icon: Keyboard, shortcut: `${MOD}/`, onSelect: props.onToggleShortcuts },
        { label: "Thư viện", icon: LibraryBig, onSelect: props.onToggleLibrary },
      ],
    },
    {
      label: "Công cụ",
      items: [
        {
          type: "check",
          label: "Tự đổi d1 → d₁ (chữ cái + số thành chỉ số dưới)",
          checked: props.settings.autoSubscript,
          onSelect: () => setSetting({ autoSubscript: !props.settings.autoSubscript }),
        },
        {
          type: "check",
          label: "Sửa bộ gõ tiếng Việt (Telex/VNI) trong dòng toán",
          checked: props.settings.imeFix,
          onSelect: () => setSetting({ imeFix: !props.settings.imeFix }),
        },
        ...(installEvent
          ? ([
              { type: "separator" },
              { label: "Cài ứng dụng", icon: MonitorDown, onSelect: () => void promptInstall() },
            ] as MenuItem[])
          : []),
      ],
    },
  ];

  // ---------- icon toolbar ----------

  const tools: ToolItem[] = [
    {
      id: "undo",
      kind: "button",
      group: "history",
      priority: 8,
      label: "Hoàn tác",
      icon: Undo2,
      shortcut: `${MOD}Z`,
      disabled: !canUndo,
      onSelect: L.undo,
    },
    {
      id: "redo",
      kind: "button",
      group: "history",
      priority: 7,
      label: "Làm lại",
      icon: Redo2,
      shortcut: `${MOD}Shift+Z`,
      disabled: !canRedo,
      onSelect: L.redo,
    },
    {
      id: "math",
      kind: "button",
      group: "lines",
      priority: 10,
      label: "Thêm dòng toán",
      shortLabel: "Toán",
      icon: Plus,
      showLabel: true,
      onSelect: L.addMath,
    },
    {
      id: "text",
      kind: "button",
      group: "lines",
      priority: 10,
      label: "Thêm dòng chữ",
      shortLabel: "Chữ",
      icon: Type,
      showLabel: true,
      onSelect: L.addText,
    },
    {
      id: "join",
      kind: "button",
      group: "lines",
      priority: 5,
      label: "Thêm dòng toán nối",
      icon: CornerDownRight,
      shortcut: "Shift+Enter",
      onSelect: L.addJoined,
    },
    {
      id: "type",
      kind: "button",
      group: "lines",
      priority: 6,
      label: "Đổi Toán ⇄ Chữ",
      icon: ArrowLeftRight,
      shortcut: `${MOD}'`,
      onSelect: L.toggleType,
    },
    {
      id: "sys",
      kind: "menu",
      group: "struct",
      priority: 6,
      label: "Hệ phương trình",
      icon: Braces,
      items: systemItems,
    },
    {
      id: "matrix",
      kind: "panel",
      group: "struct",
      priority: 6,
      label: "Ma trận",
      icon: Grid3x3,
      render: matrixPanel,
    },
    {
      id: "frac",
      kind: "button",
      group: "struct",
      priority: 4,
      label: "Phân số",
      icon: Divide,
      onSelect: () => void insertMath("\\frac{#@}{#?}"),
    },
    {
      id: "sqrt",
      kind: "button",
      group: "struct",
      priority: 3,
      label: "Căn bậc hai",
      icon: Radical,
      onSelect: () => void insertMath("\\sqrt{#@}"),
    },
    {
      id: "export",
      kind: "menu",
      group: "out",
      priority: 9,
      label: "Xuất",
      icon: FileOutput,
      showLabel: true,
      items: exportItems,
    },
    ...(connected
      ? ([
          {
            id: "b2",
            kind: "button",
            group: "out",
            priority: 9,
            label: "Lưu B2",
            title: "Lưu bài đang mở lên Backblaze B2 (Ctrl+S)",
            icon: CloudUpload,
            showLabel: true,
            disabled: b2.busy !== null,
            onSelect: () => void saveCurrentToB2(),
          },
        ] as ToolItem[])
      : []),
    // Only in "⋯":
    {
      id: "up",
      kind: "button",
      group: "move",
      priority: 0,
      overflowOnly: true,
      label: "Đưa dòng lên",
      icon: ArrowUp,
      shortcut: "Alt+↑",
      onSelect: L.moveUp,
    },
    {
      id: "down",
      kind: "button",
      group: "move",
      priority: 0,
      overflowOnly: true,
      label: "Đưa dòng xuống",
      icon: ArrowDown,
      shortcut: "Alt+↓",
      onSelect: L.moveDown,
    },
    {
      id: "dup",
      kind: "button",
      group: "move",
      priority: 0,
      overflowOnly: true,
      label: "Nhân đôi dòng",
      icon: Copy,
      shortcut: `${MOD}D`,
      onSelect: L.duplicate,
    },
    {
      id: "joinToggle",
      kind: "button",
      group: "move",
      priority: 0,
      overflowOnly: true,
      label: "Nối với dòng trên / bỏ nối",
      icon: Link2,
      onSelect: L.toggleJoin,
    },
    {
      id: "del",
      kind: "button",
      group: "move",
      priority: 0,
      overflowOnly: true,
      label: "Xóa dòng",
      icon: Trash2,
      onSelect: L.remove,
    },
    {
      id: "pow",
      kind: "button",
      group: "more",
      priority: 0,
      overflowOnly: true,
      label: "Lũy thừa",
      icon: Superscript,
      onSelect: () => void insertMath("#@^{#?}"),
    },
    {
      id: "sub",
      kind: "button",
      group: "more",
      priority: 0,
      overflowOnly: true,
      label: "Chỉ số dưới",
      icon: Subscript,
      onSelect: () => void insertMath("#@_{#?}"),
    },
    {
      id: "sym",
      kind: "menu",
      group: "more",
      priority: 0,
      overflowOnly: true,
      label: "Ký hiệu",
      icon: Omega,
      items: symbolItems,
    },
  ];

  const savedTime = b2.savedAt?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <Logo />
        <input
          className="title-input"
          type="text"
          placeholder="Tiêu đề tài liệu"
          aria-label="Tiêu đề"
          value={title}
          onChange={(e) => useDocStore.getState().setTitle(e.target.value)}
        />
        <InstallBar />
        <span className="save-state" role="status" aria-live="polite">
          {props.savedLocally ? "Đã lưu" : "Đang lưu…"}
        </span>
        <div role="group" aria-label="Backblaze B2" className="cloud">
          {connected ? (
            <>
              {b2.busy ? <span className="muted">{b2.busy}</span> : null}
              {!b2.busy && savedTime ? <span className="muted">Đã lưu lên B2 lúc {savedTime}</span> : null}
              {!b2.busy && b2.message?.kind === "error" ? (
                <span className="status error" role="alert">
                  {b2.message.text}
                </span>
              ) : null}
              <button type="button" onClick={props.onOpenB2} title="Mở, đồng bộ, quản lý tệp trên B2">
                <Cloud className="icon" aria-hidden="true" />
                {b2.config!.bucket}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="cta"
              aria-label="Kết nối Backblaze B2"
              onClick={props.onOpenB2}
              title="Lưu và mở bài trên tài khoản B2 của bạn"
            >
              <Cloud className="icon" aria-hidden="true" />
              <span className="cta-label">Kết nối Backblaze B2</span>
            </button>
          )}
        </div>
        <button
          type="button"
          className="zen-toggle"
          aria-label="Zen"
          onClick={props.onZen}
          title="Chế độ Zen: chỉ còn phần làm toán (Ctrl+.)"
        >
          <Expand className="icon" aria-hidden="true" />
          <span>Zen</span>
        </button>
      </div>
      <div className="command-bar">
        <MenuBar menus={menus} />
        <div className="toolbar-row tools-row">
          <IconToolbar items={tools} label="Công cụ soạn" />
          {exportState.status ? (
            <span
              className={`status export-status ${exportState.status.kind}`}
              role={exportState.status.kind === "error" ? "alert" : "status"}
            >
              {exportState.status.text}
            </span>
          ) : null}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_FILES}
        hidden
        data-testid="open-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openLocal(f);
          e.target.value = "";
        }}
      />
      {selection.length ? (
        <div className="toolbar-row selection-bar" role="group" aria-label="Dòng đã chọn">
          <span>Đã chọn {selection.length} dòng</span>
          <button type="button" onClick={() => void copySelection()}>
            Sao chép
          </button>
          <button type="button" onClick={() => useDocStore.getState().deleteLines(selection)}>
            Xóa
          </button>
          <button type="button" onClick={() => useDocStore.getState().setSelection([])}>
            Bỏ chọn
          </button>
        </div>
      ) : null}
    </header>
  );
}
