import { createLiveGlyphs, LIVE_FRAMES, LIVE_INTERVAL_MS, type LiveGlyphs } from "../src/live.ts";

export const fakeTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	italic: (text: string) => text,
} as any;

/**
 * A theme that makes styling visible: `fg` wraps in `[color]…[/]`, `bold` in `<b>…</b>`.
 * Used to assert what the emphasis layer accents, since `fakeTheme` renders identity.
 */
export const markerTheme = {
	fg: (color: string, text: string) => `[${color}]${text}[/]`,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => `<b>${text}</b>`,
	italic: (text: string) => text,
} as any;

export function renderContext(overrides: Record<string, unknown> = {}) {
	return {
		args: {},
		toolCallId: "t1",
		invalidate: () => {},
		lastComponent: undefined,
		state: {},
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: false,
		showImages: false,
		isError: false,
		...overrides,
	} as any;
}

/** The frame a pinned live glyph shows: `⠋`, the first of `LIVE_FRAMES`. */
export const LIVE = LIVE_FRAMES[0] as string;

/**
 * A live-glyph source pinned to one frame: the clock is frozen and the shared repaint loop is a
 * no-op, so a running row asserts as `⠋ …` instead of whatever the wall clock says.
 */
export function fixedLive(frame: string = LIVE): LiveGlyphs {
	const index = Math.max(0, LIVE_FRAMES.indexOf(frame));
	return createLiveGlyphs({
		now: () => index * LIVE_INTERVAL_MS,
		intervalMs: LIVE_INTERVAL_MS,
		setTimer: () => ({ unref() {} }),
		clearTimer: () => {},
	});
}
