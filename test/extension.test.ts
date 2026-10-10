import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import factory from "../extensions/index.ts";

function mockPi() {
	const tools: any[] = [];
	const events = new Map<string, Function[]>();
	const commands: string[] = [];
	const markdownTransformers: Function[] = [];
	return {
		tools,
		events,
		commands,
		markdownTransformers,
		registerTool(tool: any) {
			tools.push(tool);
		},
		registerMarkdownTransformer(transformer: Function) {
			markdownTransformers.push(transformer);
		},
		registerCommand(name: string) {
			commands.push(name);
		},
		on(event: string, handler: Function) {
			const list = events.get(event) ?? [];
			list.push(handler);
			events.set(event, list);
		},
	};
}

/**
 * A UI whose theme renders styling as visible markers, so assertions can read it.
 *
 * `ui.theme` is a getter over the installed theme, mirroring pi: its `theme` is a proxy over
 * the process-wide instance, so a theme installed with `setTheme` is what extensions read back.
 */
function mockUi() {
	let installed: any;
	let hiddenLabel: string | undefined;
	const registered = {
		name: "quiet-test",
		fg: (color: string, text: string) => `[${color}]${text}[/]`,
		bg: (color: string, text: string) => `{${color}}${text}{/}`,
		bold: (text: string) => `<b>${text}</b>`,
	};
	return {
		registered,
		get installed() {
			return installed;
		},
		get hiddenLabel() {
			return hiddenLabel;
		},
		ui: {
			get theme() {
				return installed ?? registered;
			},
			getTheme: (name: string) => (name === registered.name ? (registered as any) : undefined),
			setTheme: (next: any) => {
				installed = next;
				return { success: true };
			},
			setEditorComponent: () => {},
			notify: () => {},
			setHiddenThinkingLabel: (label?: string) => {
				hiddenLabel = label;
			},
		},
	};
}

describe("extension factory", () => {
	it("registers built-in overrides and no slash command", () => {
		const pi = mockPi();
		factory(pi as any);
		expect(pi.tools.map((tool) => tool.name).sort()).toEqual(
			["bash", "edit", "find", "grep", "ls", "read", "write"].sort(),
		);
		expect(pi.commands).toEqual([]);
		expect(pi.tools.every((tool) => tool.renderShell === "self")).toBe(true);
		expect(pi.markdownTransformers.length).toBe(1);
		expect(
			pi.markdownTransformers[0]("thinking", {
				messageType: "assistant-thinking",
				isStreaming: false,
				availableWidth: 80,
			}),
		).toBe("◆ Thought 2 tokens");
		expect(
			pi.markdownTransformers[0]("thinking", {
				messageType: "assistant-thinking",
				isStreaming: true,
				availableWidth: 80,
			}),
		).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Thinking 2 tokens$/);
	});

	it("session_start is a no-op without UI", async () => {
		const pi = mockPi();
		factory(pi as any);
		const handlers = pi.events.get("session_start") ?? [];
		await Promise.all(
			handlers.map((handler) =>
				handler({ type: "session_start", reason: "startup" }, { hasUI: false, ui: {} }),
			),
		);
	});

	it("session_start installs the patched theme and accents the thinking labels", async () => {
		const pi = mockPi();
		factory(pi as any);
		const ui = mockUi();
		const ctx = { hasUI: true as const, ui: ui.ui, cwd: process.cwd(), isProjectTrusted: () => true };
		for (const handler of pi.events.get("session_start") ?? []) {
			await handler({ type: "session_start", reason: "startup" }, ctx);
		}

		// The clone keeps the name and accented colours, drops the fill bands, and maps the
		// thinking slot onto `dim` — which is what the label styling then reads.
		expect(ui.installed.name).toBe("quiet-test");
		expect(ui.installed.bg("toolSuccessBg", "x")).toBe("x");
		expect(ui.installed.bg("userMessageBg", "x")).toBe("x");
		// Selection bands are not fill bands: they stay.
		expect(ui.installed.bg("selectedBg", "x")).toBe("{selectedBg}x{/}");
		expect(ui.installed.fg("thinkingText", "x")).toBe("[dim]x[/]");
		expect(ui.installed.fg("accent", "x")).toBe("[accent]x[/]");

		expect(ui.hiddenLabel).toBe("<b>[accent]◆[/]</b> <b>[accent]Thinking[/]</b>");
		const [transform] = pi.markdownTransformers;
		// A streaming label wears the live glyph, bold in the warning slot rather than accent.
		const streaming = transform!("a\nb", {
			messageType: "assistant-thinking",
			isStreaming: true,
			availableWidth: 80,
		});
		expect(streaming).toMatch(/^<b>\[warning\][⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\[\/\]<\/b> /);
		expect(streaming).toContain("<b>[accent]Thinking[/]</b>[dim] [/]<b>[dim]1 token[/]</b>");

		const message = { role: "assistant", content: [{ type: "thinking", thinking: "a" }] };
		for (const handler of pi.events.get("message_update") ?? []) {
			await handler({ type: "message_update", message }, ctx);
		}
		for (const handler of pi.events.get("message_end") ?? []) {
			await handler({ type: "message_end", message }, ctx);
		}
		expect(
			transform!("a", { messageType: "assistant-thinking", isStreaming: false, availableWidth: 80 }),
		).toContain("[dim] for ");
	});
});
