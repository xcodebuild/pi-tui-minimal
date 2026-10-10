import { describe, it } from "node:test";
import { ToolExecutionComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { expect } from "./expect.ts";
import { fakeTheme, markerTheme } from "./fake-theme.ts";
import {
	FFF_TOOL_NAMES,
	QUIET_TOOL_NAMES,
	foreignToolRowLines,
	isToolRow,
	oneLine,
	toolRowTitle,
} from "../src/rows.ts";
import { ASK_USER_QUESTION } from "../src/questionnaire.ts";
import { createSpacing, visibleText } from "../src/spacing.ts";

/** A stand-in for pi's `ToolExecutionComponent`: the fields the substitution reads. */
function fakeRow(overrides: Record<string, unknown> = {}) {
	return {
		toolName: "ffgrep",
		toolCallId: "call-1",
		args: { pattern: "useEffect", path: "src" },
		result: undefined,
		isPartial: true,
		expanded: false,
		updateResult() {},
		...overrides,
	};
}

/** Plain row text (identity theme). */
function plain(component: unknown): string[] | undefined {
	return foreignToolRowLines(component as never, fakeTheme)?.map((line) => line.trimEnd());
}

const DONE = { content: [{ type: "text", text: "src/composer.ts\n 12: useEffect(() => {" }] };

describe("foreign tool row titles", () => {
	it("titles an FFF grep like the inspect row it mirrors", () => {
		expect(toolRowTitle("ffgrep", { pattern: "useEffect", path: "src" })).toBe("ffgrep /useEffect/ in src");
		expect(toolRowTitle("ffgrep", { pattern: "useEffect" })).toBe("ffgrep /useEffect/ in .");
		expect(toolRowTitle("ffgrep", { pattern: "x", path: "src", limit: 50, context: 2 })).toBe(
			"ffgrep /x/ in src (limit 50, context 2)",
		);
		expect(toolRowTitle("ffgrep", { pattern: "x", cursor: "fff_c1" })).toBe("ffgrep /x/ in . (page)");
	});

	it("titles an FFF find without the slashes", () => {
		expect(toolRowTitle("fffind", { pattern: "tail-viewport", path: "src" })).toBe(
			"fffind tail-viewport in src",
		);
	});

	it("titles a multi-grep with its quoted patterns", () => {
		expect(toolRowTitle("fff-multi-grep", { patterns: ["snake_case", "camelCase"] })).toBe(
			'fff-multi-grep "snake_case", "camelCase"',
		);
		expect(toolRowTitle("fff-multi-grep", { patterns: ["a"], constraints: "*.ts" })).toBe(
			'fff-multi-grep "a" (*.ts)',
		);
	});

	it("prefers the model's own one-line description for a generic tool", () => {
		expect(toolRowTitle("Agent", { description: "Review changes", prompt: "Read everything and …" })).toBe(
			"Agent Review changes",
		);
		expect(toolRowTitle("create_goal", { objective: "Cut the release" })).toBe("create_goal Cut the release");
	});

	it("cuts a long argument instead of dumping it into the row", () => {
		const title = toolRowTitle("create_goal", { objective: "x".repeat(200) });
		expect(title.length).toBe("create_goal ".length + 60);
		expect(title.endsWith("...")).toBe(true);
		expect(oneLine("a\n\tb   c")).toBe("a b c");
	});

	it("falls back to the tool name when there is no readable argument", () => {
		expect(toolRowTitle("notify", {})).toBe("notify");
		expect(toolRowTitle("notify", { config: { nested: true }, list: [] })).toBe("notify");
	});
});

describe("foreign tool row lines", () => {
	it("recognises pi's tool row and nothing else", () => {
		expect(isToolRow(fakeRow())).toBe(true);
		expect(isToolRow({ toolName: "ffgrep" })).toBe(false);
		expect(isToolRow(undefined)).toBe(false);
		expect(foreignToolRowLines(undefined, fakeTheme)).toBeUndefined();
		expect(foreignToolRowLines({ toolName: "ffgrep" } as never, fakeTheme)).toBeUndefined();
	});

	it("leaves this extension's own rows and the questionnaire alone", () => {
		for (const name of QUIET_TOOL_NAMES) {
			expect(foreignToolRowLines(fakeRow({ toolName: name, result: DONE, isPartial: false }), fakeTheme)).toBeUndefined();
		}
		expect(
			foreignToolRowLines(fakeRow({ toolName: ASK_USER_QUESTION, result: DONE, isPartial: false }), fakeTheme),
		).toBeUndefined();
	});

	it("collapses a settled FFF row to one diamond line", () => {
		expect(plain(fakeRow({ result: DONE, isPartial: false }))).toEqual(["◆ ffgrep /useEffect/ in src"]);
	});

	it("keeps a running FFF row on its one-line header", () => {
		const row = fakeRow({ result: { content: [{ type: "text", text: "1\n2\n3\n4\n5\n6" }] } });
		// No output block while it runs: the row cannot change height between running and settled.
		expect(plain(row)).toEqual(["◆ ffgrep /useEffect/ in src"]);
		expect(plain(fakeRow())).toEqual(["◆ ffgrep /useEffect/ in src"]);
	});

	it("reads a failed FFF row as an error line", () => {
		const row = fakeRow({
			result: { content: [{ type: "text", text: "Operation aborted\nat …" }], isError: true },
			isPartial: false,
		});
		const [line] = foreignToolRowLines(row, markerTheme)!;
		expect(line).toContain("[error]");
		expect(line).toContain("<b>ffgrep</b>");
		expect(plain(row)).toEqual(["◆ ffgrep /useEffect/ in src  Operation aborted"]);
	});

	it("shows the full output when expanded", () => {
		expect(plain(fakeRow({ result: DONE, isPartial: false, expanded: true }))).toEqual([
			"◆ ffgrep /useEffect/ in src",
			"src/composer.ts",
			" 12: useEffect(() => {",
		]);
		expect(plain(fakeRow({ result: { content: [] }, isPartial: false, expanded: true }))).toEqual([
			"◆ ffgrep /useEffect/ in src",
		]);
	});

	it("bolds the tool name and the argument, like an inspect row", () => {
		const [line] = foreignToolRowLines(fakeRow({ result: DONE, isPartial: false }), markerTheme)!;
		expect(line).toContain("<b>[accent]◆[/]</b>");
		expect(line).toContain("[accent]ffgrep[/]");
		expect(line).toContain("<b> /useEffect/ in src</b>");
	});

	it("leaves a running tool it does not know to its own renderer", () => {
		expect(
			foreignToolRowLines(fakeRow({ toolName: "Agent", args: { description: "Review" } }), fakeTheme),
		).toBeUndefined();
		// …and collapses it once it settles.
		const settled = fakeRow({ toolName: "Agent", args: { description: "Review" }, result: DONE, isPartial: false });
		expect(plain(settled)).toEqual(["◆ Agent Review"]);
		expect(plain({ ...settled, expanded: true })).toEqual(["◆ Agent Review", "src/composer.ts", " 12: useEffect(() => {"]);
	});

	it("leaves a row that carries images alone", () => {
		const row = fakeRow({ toolName: "screenshot", result: DONE, isPartial: false });
		expect(foreignToolRowLines({ ...row, imageComponents: [{}] }, fakeTheme)).toBeUndefined();
		expect(
			foreignToolRowLines({ ...row, result: { content: [{ type: "image", data: "…" }] } }, fakeTheme),
		).toBeUndefined();
	});
});

/**
 * The substitution rides the transcript container patch, so it is checked through it against
 * pi's real `ToolExecutionComponent`: an `ffgrep` row pi-fff drew itself becomes the quiet line.
 */
describe("foreign tool row in the transcript", () => {
	function realRow(toolName: string, args: Record<string, unknown>) {
		initTheme("dark");
		const definition = {
			name: toolName,
			label: toolName,
			description: "fff",
			parameters: { type: "object", properties: {} },
			renderCall: () => ({ render: () => [`${toolName} /${String(args.pattern ?? "")}/ in . ...`] }),
		};
		return new ToolExecutionComponent(
			toolName,
			"call-fff",
			args as never,
			{},
			definition as never,
			{ requestRender() {} } as never,
			process.cwd(),
		);
	}

	it("replaces the FFF row's own rendering once it settles", () => {
		const row = realRow("ffgrep", { pattern: "useEffect", path: "src" });
		const container = new Container();
		container.addChild(row as never);
		const spacing = createSpacing();
		spacing.attachTui({ children: [container] });
		spacing.attachTheme(fakeTheme);
		spacing.sweep();

		row.updateResult({ content: [{ type: "text", text: "src/composer.ts\n 12: useEffect(() => {" }] } as never, false);
		const lines = container.render(80).map((line) => visibleText(line));
		expect(lines).toEqual(["◆ ffgrep /useEffect/ in src"]);

		row.setExpanded(true);
		expect(container.render(80).map((line) => visibleText(line))).toEqual([
			"◆ ffgrep /useEffect/ in src",
			"src/composer.ts",
			" 12: useEffect(() => {",
		]);
	});

	it("keeps a running FFF row on one line while its output streams", () => {
		const row = realRow("ffgrep", { pattern: "padding" });
		const container = new Container();
		container.addChild(row as never);
		const spacing = createSpacing();
		spacing.attachTui({ children: [container] });
		spacing.attachTheme(fakeTheme);
		spacing.sweep();

		// Running, the row is its header: no output block, so its height cannot change.
		expect(container.render(80).map((line) => visibleText(line))).toEqual(["◆ ffgrep /padding/ in ."]);
		row.updateResult({ content: [{ type: "text", text: "1\n2\n3\n4\n5\n6" }] } as never, true);
		expect(container.render(80).map((line) => visibleText(line))).toEqual(["◆ ffgrep /padding/ in ."]);
	});

	it("keeps every FFF tool name in the set the title formatter knows", () => {
		expect([...FFF_TOOL_NAMES]).toEqual(["ffgrep", "fffind", "fff-multi-grep"]);
	});
});
