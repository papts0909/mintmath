import { useRef, useState } from "react";
import { useDocStore } from "../core/docStore";
import { isMultiLine, linesToClipboard, splitPastedText } from "../core/paste";
import type { Line } from "../core/types";
import MathLine, { type LineKeyContext, type MoveDirection } from "./MathLine";
import TextLine from "./TextLine";

interface Props {
  autoSubscript: boolean;
  imeFix: boolean;
}

const isMod = (e: React.KeyboardEvent) => e.ctrlKey || e.metaKey;

export async function copyLines(lines: Line[]): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(linesToClipboard(lines));
    return true;
  } catch {
    return false;
  }
}

export default function Editor({ autoSubscript, imeFix }: Props) {
  const lines = useDocStore((s) => s.doc.lines);
  const focusedLineId = useDocStore((s) => s.focusedLineId);
  const focusNonce = useDocStore((s) => s.focusNonce);
  const focusEdge = useDocStore((s) => s.focusEdge);
  const selection = useDocStore((s) => s.selection);
  const error = useDocStore((s) => s.error);
  const anchor = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const api = useDocStore.getState;

  const handleKey = (line: Line, e: React.KeyboardEvent, ctx: LineKeyContext): boolean => {
    if (e.nativeEvent.isComposing) return false;
    const structuralKey =
      e.key === "Enter" || isMod(e) || (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown"));
    if (structuralKey) ctx.sync();
    const st = api();
    const idx = st.doc.lines.findIndex((l) => l.id === line.id);
    const k = e.key;
    if (k === "Enter" && !isMod(e) && !e.altKey) {
      if (e.shiftKey) st.insertLineAfter(line.id, "math", { joinPrev: true });
      else st.insertLineAfter(line.id, line.type);
      return true;
    }
    if (k === "Backspace" && !isMod(e) && !e.altKey && !e.shiftKey && ctx.isEmpty) {
      if (st.doc.lines.length > 1) {
        st.deleteLine(line.id);
        return true;
      }
      return false;
    }
    if (isMod(e) && !e.altKey && (k === "'" || e.code === "Quote")) {
      st.toggleType(line.id);
      return true;
    }
    if (e.altKey && !isMod(e) && (k === "ArrowUp" || k === "ArrowDown")) {
      st.moveLine(line.id, idx + (k === "ArrowUp" ? -1 : 1));
      return true;
    }
    if (isMod(e) && !e.altKey && !e.shiftKey && (k === "d" || k === "D")) {
      st.duplicateLine(line.id);
      return true;
    }
    if (isMod(e) && !e.altKey && (k === "z" || k === "Z") && !e.shiftKey) {
      if (st.lastChangeStructural && st.past.length) return st.undo();
      return false;
    }
    if (isMod(e) && !e.altKey && (((k === "z" || k === "Z") && e.shiftKey) || k === "y")) {
      if (st.future.length) return st.redo();
      return false;
    }
    return false;
  };

  const handleMoveOut = (line: Line, dir: MoveDirection) => {
    const back = dir === "upward" || dir === "backward";
    api().focusRelative(line.id, back ? -1 : 1, back ? "end" : "start");
  };

  const handlePaste = (line: Line, text: string): boolean => {
    if (!isMultiLine(text)) return false;
    const parsed = splitPastedText(text);
    if (!parsed.length) return true;
    const st = api();
    if (!line.content.trim()) {
      const [first, ...rest] = parsed;
      if (first.type !== line.type) st.toggleType(line.id);
      st.updateLine(line.id, first.content);
      if (rest.length) st.insertLinesAfter(line.id, rest);
      else st.focusLine(line.id, "end");
    } else {
      st.insertLinesAfter(line.id, parsed);
    }
    return true;
  };

  const onGutterClick = (line: Line, e: React.MouseEvent) => {
    const st = api();
    const ids = st.doc.lines.map((l) => l.id);
    if (e.shiftKey && anchor.current && ids.includes(anchor.current)) {
      const a = ids.indexOf(anchor.current);
      const b = ids.indexOf(line.id);
      st.setSelection(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
      return;
    }
    anchor.current = line.id;
    if (e.ctrlKey || e.metaKey) {
      st.setSelection(
        st.selection.includes(line.id)
          ? st.selection.filter((x) => x !== line.id)
          : [...st.selection, line.id],
      );
    } else {
      st.setSelection(st.selection.length === 1 && st.selection[0] === line.id ? [] : [line.id]);
    }
  };

  const onGutterKey = (e: React.KeyboardEvent) => {
    const st = api();
    if (!st.selection.length) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      st.deleteLines(st.selection);
    } else if (isMod(e) && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      void copyLines(st.doc.lines.filter((l) => st.selection.includes(l.id)));
    } else if (e.key === "Escape") {
      st.setSelection([]);
    }
  };

  const onDrop = (target: Line, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("application/x-mathpad-line");
    if (!id || id === target.id) return;
    const st = api();
    st.moveLine(
      id,
      st.doc.lines.findIndex((l) => l.id === target.id),
    );
  };

  return (
    <ol className="editor" aria-label="Nội dung tài liệu">
      {lines.map((line, i) => {
        const focused = line.id === focusedLineId;
        const selected = selection.includes(line.id);
        const lineError = error && error.lineId === line.id ? error.message : null;
        const shared = {
          line,
          focused,
          focusNonce,
          focusEdge,
          onChange: (c: string) => api().updateLine(line.id, c),
          onFocus: () => {
            if (api().focusedLineId !== line.id) useDocStore.setState({ focusedLineId: line.id });
          },
          onKey: (e: React.KeyboardEvent, ctx: LineKeyContext) => handleKey(line, e, ctx),
          onMoveOut: (dir: MoveDirection) => handleMoveOut(line, dir),
          onPasteText: (text: string) => handlePaste(line, text),
        };
        return (
          <li
            key={line.id}
            className={[
              "line",
              `line-${line.type}`,
              focused ? "is-focused" : "",
              selected ? "is-selected" : "",
              line.joinPrev ? "is-joined" : "",
              lineError ? "has-error" : "",
              dragOver === line.id ? "drag-over" : "",
            ].join(" ")}
            data-testid="line"
            data-type={line.type}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/x-mathpad-line")) {
                e.preventDefault();
                setDragOver(line.id);
              }
            }}
            onDragLeave={() => setDragOver((d) => (d === line.id ? null : d))}
            onDrop={(e) => onDrop(line, e)}
          >
            <button
              type="button"
              className="gutter"
              draggable
              title="Bấm để chọn (Shift+bấm chọn nhiều), kéo để đổi thứ tự"
              aria-label={`Dòng ${i + 1}${selected ? ", đang chọn" : ""}`}
              aria-pressed={selected}
              onClick={(e) => onGutterClick(line, e)}
              onKeyDown={onGutterKey}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-mathpad-line", line.id);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <span className="num">{i + 1}</span>
              {line.joinPrev ? (
                <span className="join-mark" aria-hidden>
                  ↳
                </span>
              ) : null}
            </button>
            <div className="line-body">
              {line.type === "math" ? (
                <MathLine {...shared} autoSubscript={autoSubscript} imeFix={imeFix} />
              ) : (
                <TextLine {...shared} />
              )}
              {lineError ? (
                <div className="line-error" role="alert">
                  {lineError}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
