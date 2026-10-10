import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { expect } from "./expect.ts";
import { visibleText } from "../src/ansi.ts";
import { isPromptRow, promptLines } from "../src/prompt.ts";
import { fakeTheme, markerTheme } from "./fake-theme.ts";

/** pi's `UserMessageComponent` shape: the prompt box, plus the fields the marker keys off. */
function promptRow(lines: string[], extra: Record<string, unknown> = {}) {
	return { text: "hi", outputPad: 1, markdownTransformers: [], render: () => lines, ...extra };
}

/** What `markerTheme` renders for the marker: `fg("accent")` wrapped in `bold`, plus the gap. */
const MARKED = "<b>[accent]❯[/]</b> ";

describe("prompt marker", () => {
	it("recognises pi's prompt row by shape", () => {
		expect(isPromptRow(promptRow([]))).toBe(true);
		// An assistant message carries a `contentContainer` and no prompt text.
		expect(isPromptRow(promptRow([], { contentContainer: { children: [] } }))).toBe(false);
		// A tool row carries a `toolCallId`.
		expect(isPromptRow(promptRow([], { toolCallId: "call-1", updateResult() {} }))).toBe(false);
		// pi's `Text` has the text but none of the box's fields.
		expect(isPromptRow({ text: "hi" })).toBe(false);
		expect(isPromptRow(undefined)).toBe(false);
	});

	it("marks the first line carrying text and leaves the rest alone", () => {
		const lines = ["", "  hello", "  second line", ""];
		const marked = promptLines(promptRow(lines), lines, markerTheme, 80);
		expect(marked).toEqual(["", `${MARKED}hello`, "  second line", ""]);
	});

	it("pays for the marker with the line's own left padding", () => {
		const lines = ["", "  一次评估选出成员", ""];
		const marked = promptLines(promptRow(lines), lines, fakeTheme, 80)!;
		expect(visibleText(marked[1] ?? "")).toBe("❯ 一次评估选出成员");
		// Two of the three padding columns pay for the marker and its gap; the row keeps its width.
		expect(visibleWidth(marked[1] ?? "")).toBe(visibleWidth("  一次评估选出成员"));
		expect(marked.length).toBe(lines.length);
	});

	it("takes a short padding off the trailing filler instead of wrapping", () => {
		const padded = ` ${"hello"}`.padEnd(12, " ");
		const lines = ["", padded, ""];
		const marked = promptLines(promptRow(lines), lines, fakeTheme, 12)!;
		expect(visibleWidth(marked[1] ?? "")).toBe(12);
		expect(visibleText(marked[1] ?? "").trimEnd()).toBe("❯ hello");
	});

	it("re-opens the escapes the line began with", () => {
		const lines = ["", " \x1b[38;5;252mhi\x1b[39m", ""];
		const marked = promptLines(promptRow(lines), lines, fakeTheme, 80)!;
		expect(marked[1]).toBe("❯ \x1b[38;5;252mhi\x1b[39m");
		expect(visibleText(marked[1] ?? "")).toBe("❯ hi");
	});

	it("looks through the background pi paints around the whole line", () => {
		// What `UserMessageComponent` really renders: the box's `bg(userMessageBg)` wraps the
		// padding *and* the text, so the escapes come first and the padding after them.
		const painted = "\x1b[48;2;52;53;65m \x1b[38;2;212;212;212mhi\x1b[39m\x1b[49m";
		const lines = ["", painted, ""];
		const marked = promptLines(promptRow(lines), lines, fakeTheme, 80)!;
		expect(visibleText(marked[1] ?? "")).toBe("❯ hi");
		expect(marked[1]?.startsWith("❯ \x1b[48;2;52;53;65m\x1b[38;2;212;212;212mhi")).toBe(true);
	});

	it("leaves lines without text and other rows untouched", () => {
		expect(promptLines(promptRow(["", "  ", ""]), ["", "  ", ""], fakeTheme, 80)).toBeUndefined();
		const lines = ["", "  hi", ""];
		expect(promptLines({ text: "hi" }, lines, fakeTheme, 80)).toBeUndefined();
		expect(promptLines(undefined, lines, fakeTheme, 80)).toBeUndefined();
	});
});
