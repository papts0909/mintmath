import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShortcutPanel from "../src/components/ShortcutPanel";
import TextLine from "../src/components/TextLine";
import { SHORTCUTS } from "../src/core/shortcuts";
import { resetDocStore, useDocStore } from "../src/core/docStore";

beforeEach(() => resetDocStore());

describe("ShortcutPanel", () => {
  it("lists every shortcut and filters by search", () => {
    const onClose = vi.fn();
    render(<ShortcutPanel onClose={onClose} />);
    expect(screen.getAllByTestId("shortcut-row")).toHaveLength(SHORTCUTS.length);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ma trận" } });
    expect(screen.getAllByTestId("shortcut-row").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("shortcut-row").length).toBeLessThan(SHORTCUTS.length);
    fireEvent.click(screen.getByRole("button", { name: "Đóng bảng lệnh tắt" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("TextLine", () => {
  const line = { id: "a", type: "text" as const, content: "xin chào" };
  const base = {
    line,
    focused: false,
    focusNonce: 0,
    focusEdge: "end" as const,
    onFocus: () => {},
    onMoveOut: () => {},
    onPasteText: () => false,
  };

  it("reports edits and turns pasted newlines into spaces", () => {
    const onChange = vi.fn();
    render(<TextLine {...base} onChange={onChange} onKey={() => false} />);
    fireEvent.change(screen.getByLabelText("Dòng chữ"), { target: { value: "a\nb" } });
    expect(onChange).toHaveBeenCalledWith("a b");
  });

  it("does not handle keys while an IME is composing", () => {
    const onKey = vi.fn(() => true);
    useDocStore.setState({ focusedLineId: "a" });
    render(<TextLine {...base} onChange={() => {}} onKey={onKey} />);
    fireEvent.keyDown(screen.getByLabelText("Dòng chữ"), { key: "Enter", isComposing: true });
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Dòng chữ"), { key: "Enter" });
    expect(onKey).toHaveBeenCalledTimes(1);
  });
});
