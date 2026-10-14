import { describe, it } from "node:test";
import { Markdown } from "@earendil-works/pi-tui";
import { expect } from "./expect.ts";
import {
	CHARS_PER_TOKEN,
	createThinkingController,
	estimateThinkingTokens,
	thinkingRunsFromMessage,
	thinkingStream,
	UNKNOWN_THOUGHT_LABEL,
} from "../src/thinking.ts";
import { formatThinkingTokens, THINKING_HEADER } from "../src/summaries.ts";
import { LIVE } from "./fake-theme.ts";

function uiCtx(theme?: unknown, getToolsExpanded?: () => boolean) {
	const notifications: string[] = [];
	let hiddenLabel: string | undefined;
	return {
		hasUI: true as const,
		ui: {
			theme,
			getToolsExpanded,
			notify(message: string) {
				notifications.push(message);
			},
			setHiddenThinkingLabel(label?: string) {
				hiddenLabel = label;
			},
		},
		notifications,
		get hiddenLabel() {
			return hiddenLabel;
		},
	};
}

function thinkingMessage(...blocks: string[]) {
	return {
		role: "assistant" as const,
		content: blocks.map((thinking) => ({ type: "thinking", thinking })),
	};
}

describe("thinkingRunsFromMessage", () => {
	it("merges adjacent thinking blocks into one run", () => {
		expect(
			thinkingRunsFromMessage({
				role: "assistant",
				content: [{ type: "thinking", thinking: "one" }, { type: "thinking", thinking: "two" }],
			}),
		).toEqual(["one\n\ntwo"]);
	});

	it("starts a new run after non-thinking content", () => {
		expect(
			thinkingRunsFromMessage({
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "one" },
					{ type: "text", text: "answer" },
					{ type: "thinking", thinking: "two" },
				],
			}),
		).toEqual(["one", "two"]);
	});

	it("trims blocks and drops runs without text", () => {
		expect(
			thinkingRunsFromMessage({
				role: "assistant",
				content: [{ type: "thinking", thinking: " keep me " }, { type: "thinking", thinking: "   " }, { type: "text", text: "answer" }],
			}),
		).toEqual(["keep me"]);
	});

	it("ignores non-assistant messages", () => {
		expect(thinkingRunsFromMessage({ role: "user", content: [{ type: "thinking", thinking: "nope" }] })).toEqual([]);
	});
});

describe("estimateThinkingTokens", () => {
	it("counts pi's way, four characters to a token", () => {
		expect(CHARS_PER_TOKEN).toBe(4);
		expect(estimateThinkingTokens("")).toBe(0);
		expect(estimateThinkingTokens("abcd")).toBe(1);
		expect(estimateThinkingTokens("abcde")).toBe(2);
	});

	it("grows with the run instead of with its line count", () => {
		expect(estimateThinkingTokens("aaa\nbbbb")).toBe(estimateThinkingTokens("aaaabbbb"));
	});
});

describe("thinkingStream", () => {
	it("shows the header and a live token count, never the thinking text", () => {
		expect(thinkingStream("a\nb\nc\nd")).toBe("· Thinking 2 tokens");
		expect(thinkingStream("a\nb\nc\nd")).toBe(formatThinkingTokens(2));
		expect(thinkingStream("x".repeat(8000))).toBe("· Thinking 2,000 tokens");
	});

	it("is always exactly one line, so nothing below it can move", () => {
		for (const source of ["a", "a\nb\nc\nd\ne\nf\ng", "x".repeat(200)]) {
			expect(thinkingStream(source).split("\n").length).toBe(1);
		}
	});

	it("counts up monotonically as the model keeps thinking", () => {
		const sources = ["x".repeat(40), "x".repeat(400), "x".repeat(4000)];
		const counts = sources.map((source) => estimateThinkingTokens(source));
		expect(counts).toEqual([...counts].sort((a, b) => a - b));
		expect(new Set(counts).size).toBe(counts.length);
	});

	it("passes empty thinking through untouched", () => {
		expect(thinkingStream("   ")).toBe("   ");
		expect(thinkingStream("")).toBe("");
	});
});

describe("thinkingStream under pi's Markdown", () => {
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
		bold: (text: string) => text,
		italic: (text: string) => text,
		strikethrough: (text: string) => text,
		underline: (text: string) => text,
	} as any;

	it("renders one row whatever the thinking looks like", () => {
		for (const source of ["a", "a\nb\nc\nd\ne", "x".repeat(2000)]) {
			const rendered = new Markdown(thinkingStream(source), 0, 0, markdownTheme, {
				color: (text: string) => text,
				italic: true,
			}).render(40);
			expect(rendered.length).toBe(1);
		}
	});
});

describe("thinking controller", () => {
	it("streams a one-line token counter and collapses to a duration plus the total", () => {
		let clock = 1000;
		const controller = createThinkingController({ now: () => clock, liveMarker: () => LIVE });
		const ctx = uiCtx();
		const message = thinkingMessage("a".repeat(400));
		controller.onSessionStart(ctx as any);
		expect(ctx.hiddenLabel).toBe(THINKING_HEADER);
		expect(ctx.notifications).toEqual([]);
		controller.handleMessageUpdate(message);
		clock = 2500;
		// The count stays in the row; the clock trails it as the metric, laid out to the width the
		// transformer was handed.
		const streaming = controller.transform("a".repeat(400), {
			messageType: "assistant-thinking",
			isStreaming: true,
			availableWidth: 80,
		});
		expect(streaming.startsWith(`  ${LIVE} Thinking 100 tokens`)).toBe(true);
		expect(streaming.trimEnd().endsWith("1.5s")).toBe(true);
		expect(streaming.split("\n").length).toBe(1);

		controller.handleMessageEnd(message, ctx as any);
		const collapsed = controller.transform("a".repeat(400), {
			messageType: "assistant-thinking",
			isStreaming: false,
			availableWidth: 80,
		});
		expect(collapsed.startsWith("  · Thought 100 tokens")).toBe(true);
		expect(collapsed.trimEnd().endsWith("1.5s")).toBe(true);
		// The hidden label is drawn by pi's own one-line renderer, which is never given a width,
		// so the clock has no column to sit in there and stays inline.
		expect(ctx.hiddenLabel).toBe("· Thought 100 tokens for 1.5s");
	});

	it("hands the thinking text back once Ctrl+O expands", () => {
		let expanded = false;
		const controller = createThinkingController({ isExpanded: () => expanded });
		controller.handleMessageUpdate(thinkingMessage("SECRET"));
		const streaming = { messageType: "assistant-thinking" as const, isStreaming: true, availableWidth: 80 };
		expect(controller.transform("SECRET", streaming).includes("SECRET")).toBe(false);
		expanded = true;
		expect(controller.transform("SECRET", streaming)).toBe("SECRET");
		expect(
			controller.transform("SECRET", { ...streaming, isStreaming: false }),
		).toBe("SECRET");
	});

	it("reads Ctrl+O from the session UI when no seam is given", () => {
		const controller = createThinkingController();
		controller.onSessionStart(uiCtx(undefined, () => true) as any);
		expect(controller.toolsExpanded()).toBe(true);
		expect(
			controller.transform("SECRET", {
				messageType: "assistant-thinking",
				isStreaming: false,
				availableWidth: 80,
			}),
		).toBe("SECRET");
	});

	it("keeps the streamed line from drawing the thinking text", () => {
		const controller = createThinkingController();
		controller.handleMessageUpdate(thinkingMessage("SECRET"));
		const streamed = String(
			controller.transform("SECRET", {
				messageType: "assistant-thinking",
				isStreaming: true,
				availableWidth: 80,
			}),
		);
		expect(streamed.includes("SECRET")).toBe(false);
	});

	it("counts each run of a multi-run message separately", () => {
		const controller = createThinkingController();
		const ctx = uiCtx();
		const message = {
			role: "assistant" as const,
			content: [
				{ type: "thinking", thinking: "a".repeat(40) },
				{ type: "text", text: "answer" },
				{ type: "thinking", thinking: "b".repeat(80) },
			],
		};
		controller.handleMessageUpdate(message);
		controller.handleMessageEnd(message, ctx as any);
		expect(
			controller.transform("a".repeat(40), { messageType: "assistant-thinking", isStreaming: false, availableWidth: 80 }),
		).toMatch(/ 10 tokens( for \S+)?$/);
		expect(
			controller.transform("b".repeat(80), { messageType: "assistant-thinking", isStreaming: false, availableWidth: 80 }),
		).toMatch(/ 20 tokens( for \S+)?$/);
		expect(ctx.hiddenLabel).toMatch(/ 20 tokens( for \S+)?$/);
	});

	it("counts restored thinking, which comes with no duration", () => {
		const controller = createThinkingController();
		expect(
			controller.transform("a".repeat(400), {
				messageType: "assistant-thinking",
				isStreaming: false,
				availableWidth: 80,
			}),
		).toBe("  · Thought 100 tokens");
		expect(
			controller.transform("", { messageType: "assistant-thinking", isStreaming: false, availableWidth: 80 }),
		).toBe(`  ${UNKNOWN_THOUGHT_LABEL}`);
		expect(UNKNOWN_THOUGHT_LABEL).toBe("· Thought");
	});

	it("never rewrites other Markdown", () => {
		const controller = createThinkingController();
		expect(controller.transform("**bold**", { messageType: "assistant", isStreaming: true, availableWidth: 80 })).toBe("**bold**");
		expect(controller.transform("ask", { messageType: "user", isStreaming: false, availableWidth: 80 })).toBe("ask");
	});

	it("does not strip thinking from the stored message", () => {
		const message = thinkingMessage("keep me");
		createThinkingController().handleMessageEnd(message, uiCtx() as any);
		expect(message.content[0]?.thinking).toBe("keep me");
	});

	it("warns once when thinking is hidden", () => {
		const controller = createThinkingController({ isThinkingHidden: () => true });
		const ctx = uiCtx();
		controller.onSessionStart(ctx as any);
		expect(ctx.notifications.length).toBe(1);
		expect(ctx.notifications[0]).toContain("Ctrl+T");
	});

	it("skips UI calls when hasUI is false", () => {
		const controller = createThinkingController({ isThinkingHidden: () => true });
		const ctx = {
			hasUI: false as const,
			ui: {
				notify() {
					throw new Error("notify must not run without UI");
				},
				setHiddenThinkingLabel() {
					throw new Error("setHiddenThinkingLabel must not run without UI");
				},
			},
		};
		expect(() => controller.onSessionStart(ctx as any)).not.toThrow();
		expect(() => controller.handleMessageUpdate(thinkingMessage("x"))).not.toThrow();
		expect(() => controller.handleMessageEnd(thinkingMessage("x"), ctx as any)).not.toThrow();
		expect(() => controller.handleAgentEnd()).not.toThrow();
	});

	it("accents the labels with the session theme", () => {
		const controller = createThinkingController({ liveMarker: () => LIVE });
		const theme = {
			fg: (color: string, text: string) => `[${color}]${text}[/]`,
			bold: (text: string) => `<b>${text}</b>`,
		};
		const ctx = uiCtx(theme);
		controller.onSessionStart(ctx as any);
		expect(ctx.hiddenLabel).toBe("[dim]·[/] [dim]Thinking[/]");
		expect(
			controller.transform("a".repeat(8), { messageType: "assistant-thinking", isStreaming: true, availableWidth: 80 }),
		).toBe(
			`  [dim]${LIVE}[/] [dim]Thinking[/]` + "[thinkingText] [/][thinkingText]2 tokens[/]",
		);
	});

	it("leaves a theme that cannot bold unstyled", () => {
		const controller = createThinkingController();
		const ctx = uiCtx({ fg: (color: string, text: string) => `[${color}]${text}[/]` });
		controller.onSessionStart(ctx as any);
		expect(ctx.hiddenLabel).toBe(THINKING_HEADER);
	});

	it("takes a styleLabel override instead of the session theme", () => {
		const controller = createThinkingController({ styleLabel: (text) => `<${text}>` });
		const ctx = uiCtx({ fg: () => "theme", bold: () => "theme" });
		controller.onSessionStart(ctx as any);
		expect(ctx.hiddenLabel).toBe("<· Thinking>");
		expect(
			controller.transform("gone", { messageType: "assistant-thinking", isStreaming: false, availableWidth: 80 }),
		).toBe("  <· Thought 1 token>");
	});
});
