import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { applyThemePatch, cloneQuietTheme, FILL_BG_SLOTS, THINKING_DIM_SLOT, THINKING_FG_SLOT } from "../src/theme.ts";

/** Stands in for pi's `Theme`: state lives in plain own fields, behavior on the prototype. */
class FakeTheme {
	name?: string;
	fgColors: Map<string, string>;

	constructor(name?: string) {
		this.name = name;
		this.fgColors = new Map([
			[THINKING_FG_SLOT, "{thinkingText}"],
			[THINKING_DIM_SLOT, "{dim}"],
			["error", "{error}"],
		]);
	}

	fg(color: string, text: string): string {
		const ansi = this.fgColors.get(color);
		if (ansi === undefined) {
			throw new Error(`Unknown theme color: ${color}`);
		}
		return `${ansi}${text}`;
	}

	bg(color: string, text: string): string {
		return `[${color}]${text}`;
	}
}

/**
 * pi exposes `ctx.ui.theme` as `new Proxy({}, { get })` — a write to it lands on the empty target
 * and every read still comes from the installed instance, which is what made the old
 * `theme.bg = …` patch a no-op.
 */
function writeLosingProxy(get: () => object) {
	return new Proxy({} as any, {
		get: (_target, prop) => (get() as any)[prop],
	});
}

function fakeUi(theme: unknown, options: { live?: FakeTheme; quiet?: FakeTheme } = {}) {
	const installed: unknown[] = [];
	return {
		installed,
		ui: {
			theme: theme as any,
			getTheme: (name: string) => (name === "quiet" ? options.quiet : options.live),
			setTheme: (value: unknown) => {
				installed.push(value);
				return { success: true };
			},
		},
	};
}

describe("cloneQuietTheme", () => {
	it("clears the fill slots and keeps every other background slot", () => {
		const live = new FakeTheme("dark");
		const quiet = cloneQuietTheme(live);
		for (const slot of FILL_BG_SLOTS) {
			expect(quiet.bg(slot, "x")).toBe("x");
		}
		expect(quiet.bg("selectedBg", "keep")).toBe("[selectedBg]keep");
		expect(live.bg("toolSuccessBg", "x")).toBe("[toolSuccessBg]x");
	});

	it("renders thinking text in the dim slot and leaves other slots alone", () => {
		const live = new FakeTheme("dark");
		const quiet = cloneQuietTheme(live);
		expect(quiet.fg?.(THINKING_FG_SLOT, "why")).toBe("{dim}why");
		expect(quiet.fg?.("error", "boom")).toBe("{error}boom");
		let thrown = false;
		try {
			quiet.fg?.("nope", "x");
		} catch {
			thrown = true;
		}
		expect(thrown).toBe(true);
	});

	it("keeps the prototype so pi's `instanceof Theme` check accepts it", () => {
		const quiet = cloneQuietTheme(new FakeTheme("dark"));
		expect(quiet instanceof FakeTheme).toBe(true);
		expect(quiet.name).toBe("dark");
	});
});

describe("applyThemePatch", () => {
	it("installs a patched instance of the active theme", () => {
		const live = new FakeTheme("dark");
		const { ui, installed } = fakeUi(writeLosingProxy(() => live), { live });
		applyThemePatch(ui as any);
		expect(installed.length).toBe(1);
		const patched = installed[0] as FakeTheme;
		expect(patched).not.toBe(live);
		expect(patched instanceof FakeTheme).toBe(true);
		expect(patched.bg("toolPendingBg", "x")).toBe("x");
		expect(patched.fg?.(THINKING_FG_SLOT, "t")).toBe("{dim}t");
	});

	it("never writes through the ui.theme proxy", () => {
		const live = new FakeTheme("dark");
		const proxy = writeLosingProxy(() => live);
		const { ui } = fakeUi(proxy, { live });
		applyThemePatch(ui as any);
		expect(proxy.bg("toolPendingBg", "x")).toBe("[toolPendingBg]x");
		expect(live.bg("toolPendingBg", "x")).toBe("[toolPendingBg]x");
	});

	it("falls back to the shipped quiet theme when the active theme has no name", () => {
		const quiet = new FakeTheme("quiet");
		const { ui, installed } = fakeUi({ bg: () => "" }, { quiet });
		applyThemePatch(ui as any);
		expect(installed).toEqual([quiet]);
	});

	it("warns instead of throwing when nothing can be installed", () => {
		const warnings: string[] = [];
		const ui = {
			theme: { bg: () => "" },
			getTheme: () => undefined,
			setTheme: () => ({ success: false }),
			notify: (message: string) => {
				warnings.push(message);
			},
		};
		expect(() => applyThemePatch(ui as any)).not.toThrow();
		expect(warnings.length).toBe(1);
	});

	it("keeps going when setTheme throws", () => {
		const quiet = new FakeTheme("quiet");
		const ui = {
			theme: { bg: () => "", name: "dark" },
			getTheme: (name: string) => (name === "quiet" ? quiet : new FakeTheme("dark")),
			setTheme: () => {
				throw new Error("nope");
			},
		};
		expect(() => applyThemePatch(ui as any)).not.toThrow();
	});
});
