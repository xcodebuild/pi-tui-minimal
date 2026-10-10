import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Theme } from "@earendil-works/pi-coding-agent";

export const FILL_BG_SLOTS = [
	"userMessageBg",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
	"customMessageBg",
] as const;

export type FillBgSlot = (typeof FILL_BG_SLOTS)[number];

/** pi paints thinking with its own token; the quiet style renders it in the theme's dim slot. */
export const THINKING_FG_SLOT = "thinkingText";
export const THINKING_DIM_SLOT = "dim";

export type ThemeLike = {
	bg: (color: string, text: string) => string;
	fg?: (color: string, text: string) => string;
	name?: string;
};

export type ThemeUi = {
	theme: ThemeLike;
	getTheme: (name: string) => Theme | undefined;
	setTheme: (theme: string | Theme) => { success: boolean; error?: string };
	notify?: (message: string, type?: "info" | "warning" | "error") => void;
};

const FILL = new Set<string>(FILL_BG_SLOTS);

/**
 * A copy of a live theme carrying the quiet overrides.
 *
 * `ctx.ui.theme` is a read-only proxy over the process-wide theme instance — pi builds it as
 * `new Proxy({}, { get })`, so `theme.bg = …` lands on the proxy's empty target and every read
 * still returns the instance's method. The overrides therefore have to live on a real `Theme`
 * instance installed with `setTheme`. `Object.create` keeps the prototype (which is what pi's
 * `instanceof Theme` check accepts) and every piece of theme state is a plain own property.
 */
export function cloneQuietTheme<T extends ThemeLike>(live: T): T {
	const clone = Object.create(Object.getPrototypeOf(live)) as T;
	Object.assign(clone, live);
	const originalBg = live.bg.bind(live);
	const originalFg = live.fg?.bind(live);
	clone.bg = (color: string, text: string) => (FILL.has(color) ? text : originalBg(color, text));
	if (originalFg) {
		clone.fg = (color: string, text: string) =>
			color === THINKING_FG_SLOT ? originalFg(THINKING_DIM_SLOT, text) : originalFg(color, text);
	}
	return clone;
}

/** Name of the theme pi installed in this process, when it exposes one. */
export function activeThemeName(theme: ThemeLike | undefined): string | undefined {
	try {
		const name = theme?.name;
		return typeof name === "string" && name.length > 0 ? name : undefined;
	} catch {
		return undefined;
	}
}

/** The live theme instance, looked up by the name the ui proxy reports. */
export function resolveActiveTheme(ui: ThemeUi): ThemeLike | undefined {
	const name = activeThemeName(ui.theme);
	if (!name) {
		return undefined;
	}
	try {
		const live = ui.getTheme(name) as ThemeLike | undefined;
		return live && typeof live.bg === "function" ? live : undefined;
	} catch {
		return undefined;
	}
}

export function loadQuietThemeJson(): {
	name: string;
	colors: Record<string, string | number>;
} {
	const here = dirname(fileURLToPath(import.meta.url));
	const path = join(here, "..", "themes", "quiet.json");
	return JSON.parse(readFileSync(path, "utf8"));
}

export function applyThemePatch(ui: ThemeUi): void {
	const live = resolveActiveTheme(ui);
	const theme = live ? cloneQuietTheme(live) : ui.getTheme("quiet");
	if (theme && installTheme(ui, theme as unknown as Theme)) {
		return;
	}
	ui.notify?.("quiet-tui: could not install the quiet theme, pi's theme is unchanged.", "warning");
}

function installTheme(ui: ThemeUi, theme: Theme): boolean {
	try {
		return ui.setTheme(theme)?.success !== false;
	} catch {
		return false;
	}
}
