import { describe, it } from "node:test";
import { ToolExecutionComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { Container, visibleWidth } from "@earendil-works/pi-tui";
import { expect } from "./expect.ts";
import { fakeTheme, LIVE, markerTheme } from "./fake-theme.ts";
import {
	ASK_USER_QUESTION,
	answerValue,
	formatAnswerLine,
	formatAsked,
	formatAsking,
	formatDeclined,
	headerLabel,
	isQuestionnaireRow,
	questionnaireRow,
} from "../src/questionnaire.ts";
import { layoutQuietRow } from "../src/render.ts";
import { createSpacing, patchContainer, visibleText } from "../src/spacing.ts";

/**
 * A substituted questionnaire row, laid out the way the transcript patch lays it out, with the
 * gutter stripped and the metric column's padding collapsed: these assertions are about what the
 * row says. The alignment is asserted in `layout.test.ts`.
 */
function plain(component: unknown, liveMarker = "◆"): string[] | undefined {
	const row = questionnaireRow(component as never, fakeTheme, liveMarker);
	if (!row) {
		return undefined;
	}
	return layoutQuietRow(fakeTheme, row, 200).map((line) =>
		visibleText(line).trimEnd().replace(/^ {2}/, "").replace(/ {2,}/g, " "),
	);
}

/** The same, with a caller-supplied live glyph instead of the settled `◆`. */
function plain2(component: unknown, liveMarker: string): string[] | undefined {
	return plain(component, liveMarker);
}

/** The styled lines of a row, for the emphasis assertions (gutter included). */
function styledLines(component: unknown, theme: unknown, liveMarker = "◆"): string[] | undefined {
	const row = questionnaireRow(component as never, theme as never, liveMarker);
	return row && layoutQuietRow(theme as never, row, 200);
}

const QUESTIONS = {
	questions: [
		{ header: "UI 框架", question: "用哪个 UI 框架？", options: [] },
		{ header: "补丁范围", question: "补丁到哪里？", options: [] },
	],
};

const ANSWERED = {
	content: [
		{
			type: "text",
			text: 'User has answered your questions: "用哪个 UI 框架？"="Claude Code UI". "补丁到哪里？"="不要补丁". You can now continue with the user\'s answers in mind.',
		},
	],
	details: {
		answers: [
			{ questionIndex: 0, question: "用哪个 UI 框架？", kind: "option", answer: "Claude Code UI" },
			{ questionIndex: 1, question: "补丁到哪里？", kind: "custom", answer: "不要补丁", notes: "只改渲染" },
		],
		cancelled: false,
	},
};

/** A stand-in for pi's `ToolExecutionComponent` for a questionnaire row. */
function fakeRow(overrides: Record<string, unknown> = {}) {
	return {
		toolName: ASK_USER_QUESTION,
		toolCallId: "call-1",
		args: QUESTIONS,
		result: undefined,
		isPartial: true,
		expanded: false,
		clicks: [] as number[],
		updateResult() {},
		render(): string[] {
			// pi's default for an extension tool: a padded box, up to ten lines of envelope.
			return ["", "", " ask_user_question", " User has answered your questions: …", ""];
		},
		handleMouse(event: { y: number }) {
			this.clicks.push(event.y);
			return { y: event.y - 1 };
		},
		...overrides,
	};
}

describe("questionnaire row text", () => {
	it("titles the row with the model's own chips", () => {
		expect(headerLabel(QUESTIONS.questions)).toBe("UI 框架, 补丁范围");
		expect(headerLabel([{ header: "  Auth method " }])).toBe("Auth method");
		expect(headerLabel([{ header: "" }, { header: "  " }])).toBe("2 questions");
		expect(headerLabel([{}])).toBe("1 question");
		expect(headerLabel([])).toBe("0 questions");
	});

	it("formats each state as one diamond line", () => {
		expect(formatAsking("UI 框架")).toBe("◆ Asking UI 框架");
		expect(formatAsking("UI 框架", "⠋")).toBe("⠋ Asking UI 框架");
		expect(formatAsked("UI 框架")).toBe("◆ Asked UI 框架");
		expect(formatDeclined("UI 框架")).toBe("◆ Asked UI 框架  declined");
		expect(formatAnswerLine("UI 框架", "Claude Code UI")).toBe('"UI 框架"="Claude Code UI"');
	});

	it("scalars an answer the way the envelope does", () => {
		expect(answerValue({ kind: "option", answer: "Claude Code UI" })).toBe("Claude Code UI");
		expect(answerValue({ kind: "custom", answer: "不要补丁" })).toBe("不要补丁");
		expect(answerValue({ kind: "custom", answer: "" })).toBe("(no input)");
		expect(answerValue({ kind: "multi", selected: ["a", "b"] })).toBe("a, b");
		expect(answerValue({ kind: "multi", selected: [] })).toBe("(no input)");
	});
});

describe("questionnaire row lines", () => {
	it("only recognises pi's questionnaire row", () => {
		expect(isQuestionnaireRow(fakeRow())).toBe(true);
		expect(isQuestionnaireRow({ toolName: "bash", updateResult() {} })).toBe(false);
		expect(isQuestionnaireRow({ toolName: ASK_USER_QUESTION })).toBe(false);
		expect(isQuestionnaireRow(undefined)).toBe(false);
		expect(styledLines({ toolName: "bash" }, markerTheme)).toBeUndefined();
	});

	it("collapses the pending row to Asking", () => {
		const [line] = styledLines(fakeRow(), markerTheme)!;
		expect(line).toContain("[accent]Asking[/]");
		expect(line).toContain("[dim] UI 框架, 补丁范围[/]");
		expect(plain(fakeRow())).toEqual(["◆ Asking UI 框架, 补丁范围"]);
		// A caller that passes the live glyph gets it, bold in the accent slot: the questionnaire
		// is still running, and the row should read that way like every other running row.
		const [live] = styledLines(fakeRow(), markerTheme, LIVE)!;
		expect(live).toContain(`<b>[accent]${LIVE}[/]</b>`);
		expect(plain2(fakeRow(), LIVE)).toEqual([`${LIVE} Asking UI 框架, 补丁范围`]);
		// An answered row has settled and ignores the live glyph entirely.
		expect(plain2(fakeRow({ result: ANSWERED, isPartial: false }), LIVE)).toEqual(["◆ Asked UI 框架, 补丁范围"]);
	});

	it("collapses the answered row to Asked", () => {
		const row = fakeRow({ result: ANSWERED, isPartial: false });
		const lines = styledLines(row, markerTheme)!;
		expect(lines.length).toBe(1);
		expect(plain(row)).toEqual(["◆ Asked UI 框架, 补丁范围"]);
	});

	it("lists one chip/answer line per question when expanded", () => {
		const row = fakeRow({ result: ANSWERED, isPartial: false, expanded: true });
		expect(plain(row)).toEqual([
			"◆ Asked UI 框架, 补丁范围",
			'"UI 框架"="Claude Code UI"',
			'"补丁范围"="不要补丁"',
			"notes: 只改渲染",
		]);
		// The answer hangs off the chip, not off the raw question text.
		const [, answer] = styledLines(row, markerTheme)!;
		expect(answer).toContain('[toolOutput]"UI 框架"="Claude Code UI"[/]');
	});

	it("reads a cancelled questionnaire as declined", () => {
		const row = fakeRow({
			result: { content: [{ type: "text", text: "User declined to answer questions" }], details: { answers: [], cancelled: true } },
			isPartial: false,
		});
		expect(plain(row)).toEqual(["◆ Asked UI 框架, 补丁范围 declined"]);
	});

	it("keeps partial answers on a declined row when expanded", () => {
		const row = fakeRow({
			result: {
				content: [{ type: "text", text: "User declined to answer questions" }],
				details: { answers: [ANSWERED.details.answers[0]], cancelled: true },
			},
			isPartial: false,
			expanded: true,
		});
		expect(plain(row)).toEqual(["◆ Asked UI 框架, 补丁范围 declined", '"UI 框架"="Claude Code UI"']);
	});

	it("reads a failed questionnaire as an error line", () => {
		const row = fakeRow({
			result: {
				content: [{ type: "text", text: "Error: UI not available (running in non-interactive mode)" }],
				details: { answers: [], cancelled: true, error: "no_ui" },
			},
			isPartial: false,
		});
		const [line] = styledLines(row, markerTheme)!;
		expect(line).toContain("[error]");
		expect(line).toContain("<b>ask_user_question</b>");
		expect(plain(row)).toEqual(["× ask_user_question UI not available (running in non-interactive mode)"]);
	});

	it("falls back to the envelope text when a session stored no answer details", () => {
		const row = fakeRow({
			result: { content: [{ type: "text", text: "User has answered your questions: …" }], details: { cancelled: false } },
			isPartial: false,
			expanded: true,
		});
		expect(plain(row)).toEqual(["◆ Asked UI 框架, 补丁范围", "User has answered your questions: …"]);
	});
});

/**
 * The substitution rides the transcript container patch, so it is checked through it: pi's box
 * is replaced, the leading blank is gone, and the recorded click offset still lands the row's
 * own click-to-expand handler on its content.
 */
describe("questionnaire row in the transcript", () => {
	function chat(children: unknown[]) {
		const container = new Container();
		for (const child of children) {
			container.addChild(child as never);
		}
		return container as unknown as Record<string, any>;
	}

	it("replaces pi's padded box and keeps click-to-expand aligned", () => {
		const row = fakeRow({ result: ANSWERED, isPartial: false });
		const container = chat([row]);
		const spacing = createSpacing();
		spacing.attachTui({ children: [container] });
		spacing.attachTheme(fakeTheme);
		spacing.sweep();

		const lines = container.render(80);
		expect(lines.length).toBe(1);
		expect(visibleText(lines[0])).toBe("  ◆ Asked UI 框架, 补丁范围");
		// The row rendered 5 lines and now contributes 1; the click offset makes up the rest.
		container.handleMouse({ type: "click", button: "left", y: 0, height: 1, width: 80, screenX: 0, screenY: 0 });
		expect(row.clicks).toEqual([4]);
	});

	it("leaves rows it does not own to their own renderer", () => {
		const other = { toolName: "bash", toolCallId: "call-2", updateResult() {}, render: () => ["", "◆ Run git status"] };
		const container = chat([other]);
		const spacing = createSpacing();
		spacing.attachTui({ children: [container] });
		spacing.attachTheme(markerTheme);
		spacing.sweep();
		expect(container.render(80)).toEqual(["◆ Run git status"]);
	});

	it("wraps a substituted row to the width pi gave the container", () => {
		const row = fakeRow({
			args: { questions: [{ header: "一个很长的标题" }, { header: "另一个很长的标题" }, { header: "第三个" }] },
			result: ANSWERED,
			isPartial: false,
		});
		const container = chat([row]);
		const spacing = createSpacing();
		spacing.attachTui({ children: [container] });
		// The identity theme, because this asserts real column widths: `markerTheme` writes its
		// styling as plain text, which `visibleWidth` would count as content.
		spacing.attachTheme(fakeTheme);
		spacing.sweep();

		const lines = container.render(24);
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			expect(visibleWidth(line) <= 24).toBe(true);
		}
	});

	it("does not touch rows before a theme is attached", () => {
		const row = fakeRow({ result: ANSWERED, isPartial: false });
		const container = chat([row]);
		expect(patchContainer(container)).toBe(true);
		// No theme: the row keeps pi's box, only tightened by one leading blank.
		expect(container.render(80).length).toBe(4);
	});
});

/**
 * The substitution keys off pi's own component shape, so it is checked against the real
 * `ToolExecutionComponent`: if a pi release renames `toolName`/`args`/`result`/`isPartial`,
 * these fail instead of the row quietly falling back to pi's ten-line box.
 */
describe("questionnaire row against pi's component", () => {
	const definition = {
		name: ASK_USER_QUESTION,
		label: "Ask User Question",
		description: "ask",
		parameters: { type: "object", properties: {} },
	};

	function realRow() {
		// pi's component reads its own global theme for the fallback call/result text.
		initTheme("dark");
		const row = new ToolExecutionComponent(
			ASK_USER_QUESTION,
			"call-1",
			QUESTIONS as never,
			{},
			definition as never,
			{ requestRender() {} } as never,
			process.cwd(),
		);
		return row;
	}

	it("collapses the real box to one quiet line, before and after the answer", () => {
		const row = realRow();
		const container = new Container();
		container.addChild(row as never);
		const spacing = createSpacing({ liveMarker: () => LIVE });
		spacing.attachTui({ children: [container] });
		spacing.attachTheme(fakeTheme);
		spacing.sweep();

		// Pending: the row still holds pi's padded call fallback, which is why it is substituted.
		expect(row.render(80).length > 1).toBe(true);
		// …and it wears the live glyph, because the questionnaire is still running.
		expect(visibleText(container.render(80)[0] ?? "")).toBe(`  ${LIVE} Asking UI 框架, 补丁范围`);

		row.updateResult(ANSWERED as never, false);
		const lines = container.render(80);
		expect(lines.length).toBe(1);
		expect(visibleText(lines[0])).toBe("  ◆ Asked UI 框架, 补丁范围");

		row.setExpanded(true);
		expect(container.render(80).map((line) => visibleText(line))).toEqual([
			"  ◆ Asked UI 框架, 补丁范围",
			'  "UI 框架"="Claude Code UI"',
			'  "补丁范围"="不要补丁"',
			"  notes: 只改渲染",
		]);
	});
});
