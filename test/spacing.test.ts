import { describe, it } from "node:test";
import {
	AssistantMessageComponent,
	ToolExecutionComponent,
	UserMessageComponent,
	getMarkdownTheme,
	initTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, ScrollView, Spacer, Text, VStack, visibleWidth } from "@earendil-works/pi-tui";
import { expect } from "./expect.ts";
import { BurstTracker } from "../src/burst.ts";
import {
	createSpacing,
	escapesOf,
	findTranscriptContainer,
	isAgentOutput,
	isBlankLine,
	patchContainer,
	tightenChild,
	visibleText,
	type Spacing,
} from "../src/spacing.ts";
import { registerQuietTools } from "../src/tools.ts";
import { fakeTheme, markerTheme, renderContext } from "./fake-theme.ts";

/** A stand-in for pi's `ToolExecutionComponent`: self-shell output plus click forwarding. */
function fakeRow(toolCallId: string) {
	return {
		toolCallId,
		renders: 0,
		clicks: [] as number[],
		updateResult() {},
		render(_width: number): string[] {
			this.renders += 1;
			return ["", "◆ Run git status"];
		},
		handleMouse(event: { y: number }) {
			// pi's row counts the leading blank as line 0 and subtracts it.
			this.clicks.push(event.y);
			return { y: event.y - 1 };
		},
	};
}

/** A stand-in for pi's `AssistantMessageComponent`, including its OSC 133 zone marker. */
function fakeAssistant(lines: string[]) {
	return {
		contentContainer: { children: [] },
		updateContent() {},
		render(): string[] {
			const rendered = ["", ...lines];
			rendered[0] = "\x1b]133;A\x07" + rendered[0];
			rendered[rendered.length - 1] = "\x1b]133;B\x07\x1b]133;C\x07" + rendered[rendered.length - 1];
			return rendered;
		},
	};
}

/** A user turn keeps pi's box padding: blank, prompt, blank. */
function fakeUser(text: string) {
	return {
		text,
		render(): string[] {
			return ["", text, ""];
		},
	};
}

/**
 * The same turn as pi's `UserMessageComponent` shape: the box's own padding plus the fields the
 * prompt marker keys off (`text`, `outputPad`, `markdownTransformers`).
 */
function fakePrompt(text: string) {
	return {
		text,
		outputPad: 1,
		markdownTransformers: [],
		render(): string[] {
			return ["", ` \x1b[38;5;252m${text}\x1b[39m`, ""];
		},
	};
}

/** Container with tallies of what it holds, mirroring pi's chat container. */
function fakeContainer(children: unknown[]) {
	return { children: [...children] as unknown[], render: Container.prototype.render };
}

/**
 * A stand-in for pi's `AssistantMessageComponent` with a real `contentContainer`: pi renders the
 * message's blocks into it, and puts the `Spacer(1)` after a thinking run in there too.
 */
function fakeAssistantWithContent(children: unknown[]) {
	const contentContainer = new Container();
	for (const child of children) {
		contentContainer.addChild(child as never);
	}
	return {
		contentContainer,
		updateContent() {},
		render(width: number): string[] {
			const lines = contentContainer.render(width);
			const rendered = ["", ...lines];
			rendered[0] = "\x1b]133;A\x07" + rendered[0];
			rendered[rendered.length - 1] = "\x1b]133;B\x07\x1b]133;C\x07" + rendered[rendered.length - 1];
			return rendered;
		},
	};
}

describe("transcript spacing", () => {
	it("measures lines by their visible text", () => {
		expect(isBlankLine("")).toBe(true);
		expect(isBlankLine("        ")).toBe(true);
		expect(isBlankLine("\x1b[39m\x1b[0m")).toBe(true);
		expect(isBlankLine("\x1b]133;A\x07")).toBe(true);
		expect(isBlankLine("◆ Run git status")).toBe(false);
		expect(visibleText("\x1b]133;A\x07\x1b[90mhello\x1b[39m")).toBe("hello");
	});

	it("keeps the escapes of a dropped line so zone markers survive", () => {
		expect(escapesOf("\x1b]133;A\x07  ")).toBe("\x1b]133;A\x07");
		expect(escapesOf("   ")).toBe("");
		expect(tightenChild(fakeAssistant(["· Thought"]), ["\x1b]133;A\x07", "· Thought"])).toEqual([
			"\x1b]133;A\x07· Thought",
		]);
	});

	it("tightens agent output, drops spacers and leaves user turns alone", () => {
		const row = fakeRow("call-1");
		expect(tightenChild(row, ["", "◆ Run git status"])).toEqual(["◆ Run git status"]);
		expect(tightenChild(row, ["◆ Run git status"])).toEqual(["◆ Run git status"]);
		expect(tightenChild(fakeAssistant(["a"]), ["", "a"])).toEqual(["a"]);
		expect(tightenChild({ render: () => [""] }, [""])).toEqual([]);
		expect(tightenChild({ render: () => [""] }, ["", "  ", ""])).toEqual([]);
		expect(tightenChild(fakeUser("hi"), ["", "hi", ""])).toEqual(["", "hi", ""]);
		expect(tightenChild(undefined, ["", "?"])).toEqual(["", "?"]);
	});

	it("recognises agent output by shape", () => {
		expect(isAgentOutput(fakeRow("a"))).toBe(true);
		expect(isAgentOutput(fakeAssistant(["a"]))).toBe(true);
		expect(isAgentOutput(fakeUser("a"))).toBe(false);
		expect(isAgentOutput(undefined)).toBe(false);
	});

	it("finds the container that directly holds agent output", () => {
		const chat = fakeContainer([fakeUser("hi"), fakeAssistant(["a"])]);
		const root = { children: [{ children: [{ children: [chat] }] }] };
		expect(findTranscriptContainer(root)).toBe(chat);
		expect(findTranscriptContainer({ children: [{ children: [] }] })).toBeUndefined();
	});

	it("tightens a container's output and its mouse layout", () => {
		const row = fakeRow("call-1");
		const user = fakeUser("hi");
		const chat: any = fakeContainer([user, { render: () => [""] }, fakeAssistant(["· Thought"]), row]);
		expect(patchContainer(chat)).toBe(true);
		expect(patchContainer(chat)).toBe(false);

		const lines = chat.render(80);
		expect(lines.map((line: string) => visibleText(line).trimEnd())).toEqual([
			"",
			"hi",
			"",
			"· Thought",
			"◆ Run git status",
		]);
		// The container's own click routing must match the shorter output: the row is line 4,
		// so the row's handler has to see the click as its own line 0.
		const heights = chat.mouseLayout.children.map((entry: any) => entry.height);
		expect(heights).toEqual([3, 0, 1, 1]);
		expect(row.handleMouse({ y: 0 })).toEqual({ y: 0 });
		expect(row.handleMouse({ y: 0 })).toEqual({ y: 0 });
		expect(row.clicks).toEqual([1, 1]);
	});

	it("keeps one phase break between a thought label and prose", () => {
		const assistant = fakeAssistantWithContent([
			new Spacer(1),
			new Text("· Thought", 0, 0),
			new Spacer(1),
			new Text("answer", 0, 0),
		]);
		const chat: any = fakeContainer([assistant]);
		// pi puts the blank between the thought label and the answer inside the message, one level
		// below the transcript container this patch owns.
		expect(isBlankLine(chat.render(80)[3] ?? "")).toBe(true);

		expect(patchContainer(chat)).toBe(true);
		expect(chat.render(80).map((line: string) => visibleText(line).trimEnd())).toEqual(["· Thought", "", "answer"]);
		// The inner layout is the one whose heights are now wrong, so it is the one repaired.
		expect(assistant.contentContainer.mouseLayout.children.map((entry: any) => entry.height)).toEqual([0, 1, 0, 2]);
	});

	it("installs the message pass before a finalized message renders, once", () => {
		const assistant = fakeAssistantWithContent([new Text("· Thought", 0, 0), new Spacer(1), new Text("answer", 0, 0)]);
		const chat: any = fakeContainer([assistant]);
		expect(patchContainer(chat)).toBe(true);
		// First render is already tight — a restored message may never render again.
		expect(chat.render(80).map((line: string) => visibleText(line).trimEnd())).toEqual(["· Thought", "", "answer"]);
		expect(patchContainer(assistant.contentContainer)).toBe(false);
	});

	it("keeps thinking and tool rows compact", () => {
		const assistant = fakeAssistant(["· Thought"]);
		const row = fakeRow("call-compact");
		const chat: any = fakeContainer([assistant, { render: () => [""] }, row]);
		expect(patchContainer(chat)).toBe(true);
		expect(chat.render(80).map((line: string) => visibleText(line).trimEnd())).toEqual([
			"· Thought",
			"◆ Run git status",
		]);
	});

	it("keeps one phase break when a tool follows prose", () => {
		const assistant = fakeAssistant(["answer"]);
		const row = fakeRow("call-after-prose");
		const chat: any = fakeContainer([assistant, { render: () => [""] }, row]);
		expect(patchContainer(chat)).toBe(true);
		expect(chat.render(80).map((line: string) => visibleText(line).trimEnd())).toEqual([
			"answer",
			"",
			"◆ Run git status",
		]);
		expect(chat.mouseLayout.children.map((entry: any) => entry.height)).toEqual([1, 0, 2]);
	});

	it("keeps one phase break when prose follows a tool", () => {
		const row = fakeRow("call-before-prose");
		const assistant = fakeAssistant(["answer"]);
		const chat: any = fakeContainer([row, { render: () => [""] }, assistant]);
		expect(patchContainer(chat)).toBe(true);
		expect(chat.render(80).map((line: string) => visibleText(line).trimEnd())).toEqual([
			"◆ Run git status",
			"",
			"answer",
		]);
		expect(chat.mouseLayout.children.map((entry: any) => entry.height)).toEqual([1, 0, 2]);
	});

	it("rebuilds an assistant message when the Ctrl+O state flips", () => {
		let expanded = false;
		let rebuilds = 0;
		const contentContainer = new Container();
		contentContainer.addChild(new Text("◆ Thinking", 0, 0) as never);
		const assistant: any = {
			contentContainer,
			updateContent() {
				rebuilds += 1;
			},
			invalidate() {
				this.updateContent();
			},
			render(width: number): string[] {
				return ["", ...contentContainer.render(width)];
			},
		};
		const chat: any = fakeContainer([assistant]);
		expect(patchContainer(chat, () => markerTheme, () => expanded)).toBe(true);
		// An unchanged state costs no rebuild (every frame reads the Ctrl+O flag).
		chat.render(80);
		chat.render(80);
		expect(rebuilds).toBe(0);
		expanded = true;
		chat.render(80);
		expect(rebuilds).toBe(1);
		chat.render(80);
		expect(rebuilds).toBe(1);
		expanded = false;
		chat.render(80);
		expect(rebuilds).toBe(2);
	});

	it("marks the prompt through the patch without moving anything else", () => {
		const prompt = fakePrompt("不要动画，直接平铺");
		const row = fakeRow("call-1");
		const chat: any = fakeContainer([prompt, { render: () => [""] }, fakeAssistant(["reply"]), row]);
		expect(patchContainer(chat, () => markerTheme)).toBe(true);

		const lines = chat.render(80);
		expect(lines.length).toBe(6);
		expect(lines[1] ?? "").toMatch(/❯.*不要动画/);
		// The prompt keeps its own blank lines, its height, and therefore its click coordinates.
		expect(lines.map((line: string) => visibleText(line).trimEnd())).toEqual([
			"",
			"<b>[accent]❯[/]</b> 不要动画，直接平铺",
			"",
			"reply",
			"",
			"◆ Run git status",
		]);
		expect(chat.mouseLayout.children.map((entry: any) => entry.height)).toEqual([3, 0, 1, 2]);
	});

	it("lays a substituted row out and repairs its height and clicks", () => {
		// Faulty: a foreign tool that failed with a long message. It renders four lines of its own
		// and collapses to a header plus a metric line, so the container has to repair both the
		// height it recorded and the click it forwards.
		const row = {
			toolName: "ffgrep",
			toolCallId: "call-long",
			args: { pattern: "useEffect", path: "src" },
			result: { content: [{ type: "text", text: "ENOENT: no such file or directory" }], isError: true },
			isPartial: false,
			expanded: false,
			clicks: [] as number[],
			updateResult() {},
			render(): string[] {
				return ["", "ffgrep", "ENOENT: no such file or directory", ""];
			},
			handleMouse(event: { y: number }) {
				this.clicks.push(event.y);
				return { y: event.y - 1 };
			},
		};
		const chat: any = new Container();
		chat.addChild(row as never);
		expect(row.render(26).length).toBe(4);

		expect(patchContainer(chat, () => fakeTheme)).toBe(true);
		const rendered = chat.render(26);
		const lines = rendered.map((line: string) => visibleText(line).trimEnd());
		// The error is far too wide to be a column, so it joins the title as prose and wraps with
		// it: more than one line, every one of them inside the container's width.
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			expect(visibleWidth(visibleText(line)) <= 26).toBe(true);
		}
		expect(lines[0]?.startsWith("  × ffgrep")).toBe(true);
		// The height recorded for the row matches what it now draws, and the lines it lost are
		// handed back to its own mouse handler, which counts from its own first line.
		expect(chat.mouseLayout.children.map((entry: any) => entry.height)).toEqual([rendered.length]);
		chat.handleMouse({ type: "click", button: "left", y: 0, height: 1, width: 26, screenX: 0, screenY: 0 });
		expect(row.clicks).toEqual([4 - rendered.length]);
	});

	it("no-ops before a TUI is attached and installs on sweep", async () => {
		const row = fakeRow("call-1");
		const chat = fakeContainer([fakeAssistant(["· Thought"]), row]);
		const spacing: Spacing = createSpacing();
		spacing.sweep();
		expect(chat.render(80).length).toBe(4);

		spacing.attachTui({ children: [{ children: [chat] }] });
		spacing.sweep();
		expect(chat.render(80).length).toBe(2);
		expect(chat.render(80).filter((line: string) => visibleText(line).trim() === "").length).toBe(0);
		await Promise.resolve();
	});

	it("retries a sweep that runs before the transcript is mounted", async () => {
		const chat = fakeContainer([fakeAssistant(["text"])]);
		const spacing = createSpacing();
		spacing.attachTui({ children: [] });
		spacing.sweep();
		const root: any = { children: [chat] };
		spacing.attachTui(root);
		await new Promise((resolve) => setImmediate(resolve));
		expect(chat.render(80).length).toBe(1);
	});

	it("installs from the tool renderers", () => {
		const row = fakeRow("call-9");
		const chat = fakeContainer([row]);
		const spacing = createSpacing();
		spacing.attachTui({ children: [chat] });

		const registered: any[] = [];
		registerQuietTools(
			{
				registerTool(tool: any) {
					registered.push(tool);
				},
				on() {},
			} as any,
			new BurstTracker(),
			spacing,
		);
		const bash = registered.find((tool) => tool.name === "bash")!;
		bash.renderCall({ command: "git status" }, fakeTheme, renderContext({ toolCallId: "call-9" }));
		expect(chat.render(80)).toEqual(["◆ Run git status"]);
	});
});

/**
 * The patch keys off pi's own components, so it is checked against the real ones: if a pi
 * release stops rendering the leading spacer or renames the fields the search uses, this fails
 * instead of quietly restoring the blank line.
 */
describe("transcript spacing against pi's components", () => {
	function realRow(toolCallId: string): any {
		const definition = {
			name: "bash",
			label: "Bash",
			description: "run",
			parameters: { type: "object", properties: {} },
			renderShell: "self",
			renderCall: (args: { command?: string }) => new Text(`◆ Run ${args.command ?? ""}`, 0, 0),
			renderResult: () => new Text("", 0, 0),
		};
		const row = new ToolExecutionComponent(
			"bash",
			toolCallId,
			{ command: "git status" },
			{},
			definition as never,
			{ requestRender() {} } as never,
			process.cwd(),
		);
		row.updateResult({ content: [{ type: "text", text: "ok" }], details: {}, isError: false }, false);
		return row;
	}

	const click = (y: number) =>
		({ type: "click", button: "left", y, height: 1, width: 80, screenX: 0, screenY: 0 }) as never;

	it("removes the real row's spacer and keeps click-to-expand on its line", () => {
		const row = realRow("call-1");
		const chat = new Container();
		chat.addChild(row);
		expect(row.render(80)[0]?.trim()).toBe("");

		const spacing = createSpacing();
		spacing.attachTui({ children: [chat] });
		spacing.sweep();

		const lines = chat.render(80);
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain("◆ Run git status");
		row.handleMouse(click(0));
		expect(row.expanded).toBe(true);
	});

	it("marks the real prompt row without changing its height", () => {
		// pi renders a prompt through the process-wide theme; the real component needs it up.
		initTheme(undefined, false);
		const prompt = new UserMessageComponent("不要动画，直接平铺", undefined, 1, []);
		const before = prompt.render(80);
		expect(before.filter((line) => visibleText(line).trim() !== "").length).toBe(1);

		const chat = new Container();
		chat.addChild(prompt);
		const spacing = createSpacing();
		spacing.attachTheme(fakeTheme);
		spacing.attachTui({ children: [chat] });
		spacing.sweep();

		const lines = chat.render(80);
		expect(lines.length).toBe(before.length);
		const content = lines.findIndex((line) => visibleText(line).trim() !== "");
		expect(visibleText(lines[content] ?? "")).toMatch(/^❯ 不要动画/);
	});

	it("keeps one real phase break between a thought label and the answer", () => {
		// pi's `AssistantMessageComponent` collapses a finalized thinking run through the
		// transformer and then adds a `Spacer(1)` for the answer that follows it.
		initTheme(undefined, false);
		const label = "· Thought for 9.1s";
		const message = {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "先把三块参考对齐。" },
				{ type: "text", text: "工作目录是空的。" },
			],
			timestamp: 0,
		};
		const assistant = new AssistantMessageComponent(
			message as never,
			false,
			getMarkdownTheme(),
			"Thinking...",
			1,
			[(markdown, { messageType }) => (messageType === "assistant-thinking" ? label : markdown)],
		);
		const chat = new Container();
		chat.addChild(assistant);
		expect(chat.render(80).filter(isBlankLine).length).toBe(2);

		const spacing = createSpacing();
		spacing.attachTui({ children: [chat] });
		spacing.sweep();

		const lines = chat.render(80).map((line) => visibleText(line).trim());
		expect(lines).toEqual([label, "", "工作目录是空的。"]);
		// Click-to-reveal still lands on the thinking line: its handler is handed the line it had
		// before the blank above it was dropped.
		chat.handleMouse(click(0));
		expect(chat.render(80).map((line) => visibleText(line).trim())[0]).toBe("Thinking...");
	});

	it("keeps the paragraph break inside the answer", () => {
		initTheme(undefined, false);
		const message = {
			role: "assistant",
			content: [{ type: "text", text: "第一段。\n\n第二段。" }],
			timestamp: 0,
		};
		const assistant = new AssistantMessageComponent(message as never, true, getMarkdownTheme(), "Thinking...", 1, []);
		const chat = new Container();
		chat.addChild(assistant);
		const spacing = createSpacing();
		spacing.attachTui({ children: [chat] });
		spacing.sweep();

		// The blank between the paragraphs is inside one `Markdown` child, below this patch, so
		// only pi's own spacers are dropped.
		expect(chat.render(80).map((line) => visibleText(line).trim())).toEqual(["第一段。", "", "第二段。"]);
	});

	it("tightens the chat container inside the fullscreen ScrollView/VStack viewport", () => {
		const chat = new Container();
		const document = new Container();
		document.addChild(chat);
		chat.addChild(fakeAssistant(["reply text"]));
		chat.addChild(new Spacer(1));
		chat.addChild(realRow("fs-1"));

		// pi's fullscreen viewport: document -> ScrollView -> VStack layout root.
		const transcript = new ScrollView(document, { follow: "end", primary: true, overscroll: "chain" });
		const root = new VStack([{ component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 }]);
		// TuiAltScreen still mounts every component as a child and additionally sets the layout root.
		const renderer: any = new Container();
		renderer.addChild(document);
		renderer.render = (width: number) => root.render(width);
		const uiProxy = new Proxy({}, { get: (_target, key) => renderer[key as string] });

		expect(document.render(80).filter(isBlankLine).length).toBeGreaterThan(0);
		expect(findTranscriptContainer(uiProxy)).toBe(chat);

		const spacing = createSpacing();
		spacing.attachTui(uiProxy);
		spacing.sweep();

		// The ScrollView's child is a plain Container in both modes, so the same walk and the same
		// height repair reach it; only the ancestry differs.
		expect(document.render(80).map((line) => visibleText(line).trimEnd())).toEqual([
			"reply text",
			"",
			"◆ Run git status",
		]);
		expect((chat as any).mouseLayout.children.map((entry: any) => entry.height)).toEqual([1, 0, 2]);
	});
});
