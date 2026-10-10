import { describe, it } from "node:test";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { EditorTheme } from "@earendil-works/pi-tui";
import { expect } from "./expect.ts";
import { QuietEditor } from "../src/composer.ts";

/** Same shape as the real thing: `ctx.ui.theme.fg("dim", …)` emits SGR escapes, not literals. */
const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;
const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "");

const selectListTheme = {
	selectedPrefix: (text: string) => text,
	selectedText: (text: string) => text,
	description: (text: string) => text,
	scrollInfo: (text: string) => text,
	noMatch: (text: string) => text,
};

const editorTheme: EditorTheme = { borderColor: (text) => text, selectList: selectListTheme };

/** Only `terminal.rows` is read during render; nothing else in the editor is exercised here. */
function stubTui(rows = 24) {
	return { terminal: { rows }, requestRender() {} } as any;
}

function quietEditor(rows = 24) {
	return new QuietEditor(stubTui(rows), editorTheme, {} as any, dim);
}

describe("QuietEditor", () => {
	it("renders no prompt prefix on the input row", () => {
		const editor = quietEditor();
		editor.setText("hello");
		const lines = editor.render(40);
		for (const line of lines) {
			expect(plain(line)).not.toMatch(/^> /);
		}
		expect(lines.join("\n")).toContain("hello");
	});

	it("colors the top and bottom rules with the injected dim colorizer", () => {
		const editor = quietEditor();
		editor.setText("hello");
		const lines = editor.render(40);
		expect(plain(lines[0])).not.toBe(lines[0]);
		expect(plain(lines[lines.length - 1])).not.toBe(lines[lines.length - 1]);
	});

	it("does not paint a background", () => {
		const editor = quietEditor();
		editor.setText("hello");
		const rendered = editor.render(40).join("");
		expect(rendered).not.toMatch(/\x1b\[4[0-9]/);
		expect(rendered).not.toMatch(/\x1b\[48;/);
	});

	it("keeps pi's scroll indicator instead of rewriting the rule", () => {
		const editor = quietEditor();
		editor.setText(Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"));
		const lines = editor.render(30);
		expect(plain(lines[0])).toContain("↑ 23 more");
	});

	it("passes pi's own editor output through unchanged", () => {
		const stock = new CustomEditor(stubTui(), { ...editorTheme, borderColor: dim }, {} as any);
		const quiet = quietEditor();
		const text = Array.from({ length: 12 }, (_, index) => `line ${index}`).join("\n");
		stock.setText(text);
		quiet.setText(text);
		expect(quiet.render(36)).toEqual(stock.render(36));
	});
});
