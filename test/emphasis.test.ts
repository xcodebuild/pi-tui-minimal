import { describe, it } from "node:test";
import { Markdown } from "@earendil-works/pi-tui";
import { expect } from "./expect.ts";
import { markerTheme } from "./fake-theme.ts";
import { emphasizeError, emphasizeHeader, emphasizeThinkingLabel } from "../src/emphasis.ts";

const ACCENT = "<b>[accent]";
const BOLD = "<b>";
const DIM = "[dim]";
const BODY = "[text]";
const THINKING = "[thinkingText]";
const ADDED = "[toolDiffAdded]";
const REMOVED = "[toolDiffRemoved]";

describe("emphasizeHeader", () => {
	it("accents the marker and the action word of a run", () => {
		expect(emphasizeHeader(markerTheme, "◆ Run 检查已装扩展与配置")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Run[/]</b>${DIM} 检查已装扩展与配置[/]`,
		);
	});

	it("leaves the run command dim when the summary falls back to raw text", () => {
		expect(emphasizeHeader(markerTheme, "◆ Run git status")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Run[/]</b>${DIM} git status[/]`,
		);
	});

	it("adds the marker when the caller did not", () => {
		expect(emphasizeHeader(markerTheme, "Run git status")).toBe(
			emphasizeHeader(markerTheme, "◆ Run git status"),
		);
	});

	it("bolds the counts of a merged inspect line", () => {
		expect(emphasizeHeader(markerTheme, "◆ Read 46 files, Listed 3 dirs")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Read[/]</b> ${BOLD}46</b> ${DIM}files[/]${DIM}, [/]` +
				`${ACCENT}Listed[/]</b> ${BOLD}3</b> ${DIM}dirs[/]`,
		);
	});

	it("bolds the paths of a merged read line and leaves the hidden count dim", () => {
		expect(emphasizeHeader(markerTheme, "◆ Read src/a.ts, test/b.ts +44 more, Listed 3 dirs")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Read[/]</b> ${BOLD}src/a.ts, test/b.ts</b>${DIM} +44 more[/]${DIM}, [/]` +
				`${ACCENT}Listed[/]</b> ${BOLD}3</b> ${DIM}dirs[/]`,
		);
	});

	it("bolds the counts of a single inspect kind", () => {
		expect(emphasizeHeader(markerTheme, "Searched 15 patterns")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Searched[/]</b> ${BOLD}15</b> ${DIM}patterns[/]`,
		);
	});

	it("bolds the path and colours the counts of a diff row", () => {
		expect(emphasizeHeader(markerTheme, "◆ src/a.ts  +12 −3")).toBe(
			`${ACCENT}◆[/]</b> ${BOLD}src/a.ts</b>${DIM}  [/]${ADDED}${BOLD}+12</b>[/]${DIM} [/]${REMOVED}${BOLD}−3</b>[/]`,
		);
	});

	it("keeps a path with spaces whole on a diff row", () => {
		expect(emphasizeHeader(markerTheme, "◆ my file.ts  +1 −0")).toBe(
			`${ACCENT}◆[/]</b> ${BOLD}my file.ts</b>${DIM}  [/]${ADDED}${BOLD}+1</b>[/]${DIM} [/]${REMOVED}${BOLD}−0</b>[/]`,
		);
	});

	it("accents edit and write and bolds the path", () => {
		expect(emphasizeHeader(markerTheme, "◆ Edit src/a.ts")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Edit[/]</b>${BOLD} src/a.ts</b>`,
		);
		expect(emphasizeHeader(markerTheme, "◆ Write src/a.ts")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Write[/]</b>${BOLD} src/a.ts</b>`,
		);
	});

	it("bolds the path and line count of a streamed write row", () => {
		expect(emphasizeHeader(markerTheme, "◆ Write src/a.ts  128 lines")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Write[/]</b> ${BOLD}src/a.ts</b>${DIM}  [/]${BOLD}128</b>${DIM} lines[/]`,
		);
	});

	it("bolds the path and colours the old/new counts of a streamed edit row", () => {
		expect(emphasizeHeader(markerTheme, "◆ Edit src/a.ts  −3 +12")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Edit[/]</b> ${BOLD}src/a.ts</b>${DIM}  [/]${REMOVED}${BOLD}−3</b>[/]${DIM} [/]${ADDED}${BOLD}+12</b>[/]`,
		);
	});

	it("accents an expanded inspect header and bolds its argument", () => {
		expect(emphasizeHeader(markerTheme, "grep mcpServers")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}grep[/]</b>${BOLD} mcpServers</b>`,
		);
	});

	it("keeps a run's clock in the dim summary text", () => {
		expect(emphasizeHeader(markerTheme, "◆ Ran git status for 2.1s")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Ran[/]</b>${DIM} git status for 2.1s[/]`,
		);
	});

	it("steps a thought label back to the light marker", () => {
		expect(emphasizeHeader(markerTheme, "· Thought 1,234 tokens for 2.4s")).toBe(
			`${DIM}·[/] ${DIM}Thought[/]${DIM} [/]${THINKING}1,234 tokens[/]${DIM} for 2.4s[/]`,
		);
		expect(emphasizeHeader(markerTheme, "· Thought for 2.4s")).toBe(
			`${DIM}·[/] ${DIM}Thought[/]${DIM} for 2.4s[/]`,
		);
	});

	it("falls back to an accented first word plus dim text", () => {
		expect(emphasizeHeader(markerTheme, "◆ Wat 46 files")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Wat[/]</b>${DIM} 46 files[/]`,
		);
	});

	it("renders a bare marker when there is nothing to describe", () => {
		expect(emphasizeHeader(markerTheme, "")).toBe(`${ACCENT}◆[/]</b>`);
	});
});

/**
 * A running row wears an animated glyph instead of `◆` (`live.ts`). The emphasis layer is what
 * decides how the two read: `◆` and the live glyph share the accent slot and the weight, so the
 * running cue is the row body — the title is drawn brighter while it runs (`render.ts`), and the
 * glyph shape is what says "not settled yet". Nothing is drawn in the `warning` slot, so a
 * spinner is never the most saturated thing on screen.
 */
describe("live marker emphasis", () => {
	it("paints the live glyph accent-bold and lifts the row's text out of dim", () => {
		expect(emphasizeHeader(markerTheme, "⠋ Run git status")).toBe(
			`<b>[accent]⠋[/]</b> ${ACCENT}Run[/]</b>${BODY} git status[/]`,
		);
		expect(emphasizeHeader(markerTheme, "⠼ ls .")).toBe(
			`<b>[accent]⠼[/]</b> ${ACCENT}ls[/]</b>${BOLD} .</b>`,
		);
	});

	it("keeps a settled row's text dim, so only the running one is bright", () => {
		expect(emphasizeHeader(markerTheme, "◆ Ran git status")).toBe(
			`${ACCENT}◆[/]</b> ${ACCENT}Ran[/]</b>${DIM} git status[/]`,
		);
	});

	it("keeps a live glyph whole when it is the only thing on the row", () => {
		expect(emphasizeHeader(markerTheme, "⠹")).toBe("<b>[accent]⠹[/]</b>");
	});

	it("gives a failed row `×` however it was handed in", () => {
		expect(emphasizeError(markerTheme, "⠋ Run npm test  exit 1")).toBe(
			`[error]${BOLD}×</b> ${BOLD}Run</b> npm test${BOLD}  exit 1</b>[/]`,
		);
		expect(emphasizeError(markerTheme, "◆ Run npm test  exit 1")).toBe(
			`[error]${BOLD}×</b> ${BOLD}Run</b> npm test${BOLD}  exit 1</b>[/]`,
		);
	});

	it("keeps the live glyph on a streaming thinking label", () => {
		expect(emphasizeThinkingLabel(markerTheme, "⠼ Thinking 1,234 tokens")).toBe(
			`${DIM}⠼[/] ${DIM}Thinking[/]${THINKING} [/]${THINKING}1,234 tokens[/]`,
		);
	});
});

describe("emphasizeError", () => {
	it("keeps the error colour and bolds the marker, the action and the exit code", () => {
		expect(emphasizeError(markerTheme, "× Run npm test  exit 1")).toBe(
			`[error]${BOLD}×</b> ${BOLD}Run</b> npm test${BOLD}  exit 1</b>[/]`,
		);
	});

	it("bolds the status of a run that failed without an exit code", () => {
		expect(emphasizeError(markerTheme, "× Run false  error")).toBe(
			`[error]${BOLD}×</b> ${BOLD}Run</b> false${BOLD}  error</b>[/]`,
		);
	});

	it("bolds the tool name of a tool failure", () => {
		expect(emphasizeError(markerTheme, "× edit  ENOENT: no such file")).toBe(
			`[error]${BOLD}×</b> ${BOLD}edit</b>  ENOENT: no such file[/]`,
		);
	});
});

describe("emphasizeThinkingLabel", () => {
	it("steps the marker and the word back to dim, with no accent", () => {
		expect(emphasizeThinkingLabel(markerTheme, "· Thinking")).toBe(`${DIM}·[/] ${DIM}Thinking[/]`);
	});

	it("re-opens the thinking colour for the clock text", () => {
		expect(emphasizeThinkingLabel(markerTheme, "· Thought for 2.4s")).toBe(
			`${DIM}·[/] ${DIM}Thought[/]${THINKING} for 2.4s[/]`,
		);
	});

	it("keeps the live token count plain under the thinking header", () => {
		expect(emphasizeThinkingLabel(markerTheme, "· Thinking 1,234 tokens")).toBe(
			`${DIM}·[/] ${DIM}Thinking[/]${THINKING} [/]${THINKING}1,234 tokens[/]`,
		);
	});

	it("puts the count before the clock on a collapsed label", () => {
		expect(emphasizeThinkingLabel(markerTheme, "· Thought 1,234 tokens for 2.4s")).toBe(
			`${DIM}·[/] ${DIM}Thought[/]${THINKING} [/]` + `${THINKING}1,234 tokens[/]${THINKING} for 2.4s[/]`,
		);
	});

	it("passes a durationless thought through without a tail", () => {
		expect(emphasizeThinkingLabel(markerTheme, "· Thought")).toBe(`${DIM}·[/] ${DIM}Thought[/]`);
	});
});

/**
 * pi renders a thinking block by wrapping each line in `fg("thinkingText")` plus italic, and a
 * nested `fg` closes with a `39m` foreground reset. This is the reason the label re-opens the
 * thinking colour before its trailing text: without it, ` for 0.4s` would lose the dim colour.
 */
describe("emphasizeThinkingLabel under pi's thinking Markdown", () => {
	const colour = (code: number, text: string) => `\x1b[38;5;${code}m${text}\x1b[39m`;
	const markdownTheme = {
		heading: (text: string) => text,
		link: (text: string) => text,
		linkUrl: (text: string) => text,
		code: (text: string) => text,
		codeBlock: (text: string) => text,
		codeBlockBorder: (text: string) => text,
		quote: (text: string) => text,
		quoteBorder: (text: string) => text,
		hr: (text: string) => text,
		listBullet: (text: string) => text,
		bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
		italic: (text: string) => `\x1b[3m${text}\x1b[23m`,
		strikethrough: (text: string) => text,
		underline: (text: string) => text,
	} as any;

	const accentTheme = {
		fg: (color: string, text: string) => colour(color === "accent" ? 80 : 240, text),
		bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
	} as any;

	function renderThinking(label: string): string {
		const styled = emphasizeThinkingLabel(accentTheme, label);
		const thinkingStyle = { color: (text: string) => colour(240, text), italic: true };
		return new Markdown(styled, 0, 0, markdownTheme, thinkingStyle).render(50)[0] ?? "";
	}

	it("draws the marker and the word dim, with nothing accented", () => {
		const rendered = renderThinking("· Thought for 2.4s");
		expect(rendered).toContain("\x1b[38;5;240m·\x1b[39m");
		expect(rendered).toContain("\x1b[38;5;240mThought\x1b[39m");
		// The accent colour (80) is what made a thinking row compete with a tool row.
		expect(rendered).not.toMatch(/\x1b\[38;5;80m/);
	});

	it("keeps the trailing clock in the thinking colour", () => {
		expect(renderThinking("· Thought 1,234 tokens for 2.4s")).toContain("\x1b[38;5;240m for 2.4s");
	});

	it("keeps a trailing line in the thinking colour", () => {
		const styled = `${emphasizeThinkingLabel(accentTheme, "◆ Thinking")}\n  a tail line`;
		const thinkingStyle = { color: (text: string) => colour(240, text), italic: true };
		const lines = new Markdown(styled, 0, 0, markdownTheme, thinkingStyle).render(50);
		expect(lines[1]).toContain("\x1b[38;5;240m  a tail line");
	});
});
