import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { applyQuietChrome } from "../src/chrome.ts";

describe("applyQuietChrome", () => {
	it("skips TUI calls when hasUI is false", () => {
		const ctx = {
			hasUI: false,
			ui: {
				setEditorComponent() {
					throw new Error("setEditorComponent");
				},
				setTheme() {
					throw new Error("setTheme");
				},
				getTheme() {
					throw new Error("getTheme");
				},
				theme: {},
			},
		};
		expect(() => applyQuietChrome(ctx as any)).not.toThrow();
	});

	it("patches fill backgrounds and installs an editor when UI is present", () => {
		class FakeTheme {
			name = "dark";
			fg = (_c: string, text: string) => text;
			bg = (color: string, text: string) => `[${color}]${text}`;
		}
		const live = new FakeTheme();
		let installed: unknown;
		let editorFactory: unknown;
		const ctx = {
			hasUI: true,
			ui: {
				theme: new Proxy({} as any, { get: (_t, prop) => (live as any)[prop] }),
				getTheme: (name: string) => (name === "dark" ? live : undefined),
				setTheme: (value: unknown) => {
					installed = value;
					return { success: true };
				},
				setEditorComponent(factory: unknown) {
					editorFactory = factory;
				},
			},
		};
		applyQuietChrome(ctx as any);
		expect(installed).not.toBe(live);
		expect((installed as FakeTheme).bg("userMessageBg", "hi")).toBe("hi");
		expect(live.bg("userMessageBg", "hi")).toBe("[userMessageBg]hi");
		expect(editorFactory).toBeTypeOf("function");
	});

	it("hands the live TUI and theme to the transcript spacing through the editor factory", () => {
		class FakeTheme {
			name = "dark";
			fg = (_c: string, text: string) => text;
			bg = (_c: string, text: string) => text;
		}
		const live = new FakeTheme();
		let editorFactory: any;
		const attached: unknown[] = [];
		const themes: unknown[] = [];
		const spacing = {
			attachTui(tui: unknown) {
				attached.push(tui);
			},
			attachTheme(theme: unknown) {
				themes.push(theme);
			},
			sweep() {},
		};
		const ctx = {
			hasUI: true,
			ui: {
				theme: new Proxy({} as any, { get: (_t, prop) => (live as any)[prop] }),
				getTheme: () => live,
				setTheme: () => ({ success: true }),
				setEditorComponent(factory: unknown) {
					editorFactory = factory;
				},
			},
		};
		const returned = applyQuietChrome(ctx as any, spacing as any);
		expect(returned).toBe(spacing);
		// The questionnaire row is styled from the theme the extension reads at session start.
		expect(themes.length).toBe(1);
		expect((themes[0] as any).name).toBe("dark");

		const tui = { requestRender() {} };
		editorFactory(tui, { borderColor: (text: string) => text }, {});
		expect(attached).toEqual([tui]);
	});
});
