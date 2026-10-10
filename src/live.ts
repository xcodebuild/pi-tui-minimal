import { DIAMOND } from "./summaries.ts";

/**
 * The marker a **running** row wears instead of the settled `◆`.
 *
 * The quiet transcript is one `◆` line per row, which reads well once a turn is over but says
 * nothing while it is still going: a `Run` row, a streaming `write`, a thinking block and a
 * settled row all opened with the same glyph, so the only cue that work was in flight was the
 * clock text (and the thinking row had none at all). Every live row now carries an animated
 * glyph in the theme's `warning` slot, and only a settled row keeps `◆` — the glyph is what
 * separates "still running" from "done" at a glance.
 *
 * The frame is a pure function of the clock (`liveGlyph`), so every live row on screen spins in
 * step without sharing state, and any repaint advances all of them together. What needs sharing
 * is the repaint itself: pi re-renders a partial tool row only when the row asks for it, so
 * `createLiveGlyphs` keeps one `setInterval` that invalidates every live row that registered
 * through `marker`. See each call site for which rows opt in.
 */

/** The frames a live row spins through, one per `LIVE_INTERVAL_MS`. */
export const LIVE_FRAMES: readonly string[] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** How long one frame stays on screen; ten frames make one revolution a second. */
export const LIVE_INTERVAL_MS = 100;

const LIVE = new Set(LIVE_FRAMES);

/** Whether `text` is one of the live frames — the marker a running row wears instead of `◆`. */
export function isLiveGlyph(text: string): boolean {
	return LIVE.has(text);
}

/**
 * The frame a live row shows at `now`. A pure function of the clock, so two rows rendered in the
 * same frame cannot disagree, and a caller with no row state of its own (the patched rows in
 * `spacing.ts`) can spin the same way as a row with an `invalidate`.
 */
export function liveGlyph(now: number = Date.now(), intervalMs: number = LIVE_INTERVAL_MS): string {
	const step = Math.max(1, Math.floor(intervalMs));
	const index = Math.floor(now / step) % LIVE_FRAMES.length;
	return LIVE_FRAMES[(index + LIVE_FRAMES.length) % LIVE_FRAMES.length] as string;
}

/** The handle a live row keeps in its renderer state: the invalidation the shared ticker calls. */
type LiveWatch = { invalidate: () => void };

type LiveState = { liveWatch?: LiveWatch };

/** A timer that can be `unref`ed (Node's) or driven by hand (the tests' fake). */
type Timer = { unref?: () => void };

export type LiveGlyphOptions = {
	/** Test seam for the clock; defaults to `Date.now`. */
	now?: () => number;
	/** Repaint period; defaults to `LIVE_INTERVAL_MS`. */
	intervalMs?: number;
	/** Test seam for the repaint loop; defaults to `setInterval`. */
	setTimer?: (tick: () => void, intervalMs: number) => Timer;
	/** Test seam for the repaint loop; defaults to `clearInterval`. */
	clearTimer?: (timer: Timer) => void;
};

export type LiveGlyphs = {
	/**
	 * A row's marker while it is `live`, and `◆` once it has settled. Registering is idempotent
	 * per `state`, so a row that renders its call and its result in the same frame watches once;
	 * settling releases the row and stops the shared timer when the last live row is gone.
	 */
	marker(state: unknown, live: boolean, invalidate: () => void): string;
	/** The frame right now, for callers that drive their own repaint. */
	frame(): string;
	/** How many rows the shared timer is currently repainting; a test seam. */
	watching(): number;
	/** Stop the shared timer without unregistering the rows (session teardown). */
	stop(): void;
};

/**
 * The shared repaint loop behind every live row.
 *
 * Without it a live glyph would freeze: pi redraws a partial tool row only when that row
 * invalidates itself, and nothing else on screen ticks at glyph speed. Each partial render hands
 * its `context.invalidate` in and gets released when the row settles, so a long inspect burst, a
 * streaming write and the thinking label all move on the same 100ms beat for the cost of one
 * timer — and a finished transcript costs none.
 */
export function createLiveGlyphs(options: LiveGlyphOptions = {}): LiveGlyphs {
	const now = options.now ?? (() => Date.now());
	const intervalMs = options.intervalMs ?? LIVE_INTERVAL_MS;
	const setTimer = options.setTimer ?? ((tick, ms) => setInterval(tick, ms));
	const clearTimer = options.clearTimer ?? ((timer) => clearInterval(timer as ReturnType<typeof setInterval>));
	const watchers = new Set<LiveWatch>();
	let timer: Timer | undefined;

	const start = () => {
		if (timer !== undefined || watchers.size === 0) {
			return;
		}
		timer = setTimer(() => {
			for (const watcher of [...watchers]) {
				watcher.invalidate();
			}
		}, intervalMs);
		timer.unref?.();
	};

	const release = (state: LiveState) => {
		const watch = state.liveWatch;
		if (!watch) {
			return;
		}
		watchers.delete(watch);
		delete state.liveWatch;
		if (watchers.size === 0 && timer !== undefined) {
			clearTimer(timer);
			timer = undefined;
		}
	};

	return {
		frame: () => liveGlyph(now(), intervalMs),
		marker(state, live, invalidate) {
			if (!state || typeof state !== "object") {
				return live ? liveGlyph(now(), intervalMs) : DIAMOND;
			}
			const holder = state as LiveState;
			if (!live) {
				release(holder);
				return DIAMOND;
			}
			let watch = holder.liveWatch;
			if (!watch) {
				watch = { invalidate };
				holder.liveWatch = watch;
				watchers.add(watch);
			}
			// Re-renders hand in a fresh closure; keep the ticker calling the latest one.
			watch.invalidate = invalidate;
			start();
			return liveGlyph(now(), intervalMs);
		},
		watching: () => watchers.size,
		stop() {
			if (timer !== undefined) {
				clearTimer(timer);
				timer = undefined;
			}
		},
	};
}
