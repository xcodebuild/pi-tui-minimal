import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { createLiveGlyphs, isLiveGlyph, LIVE_FRAMES, LIVE_INTERVAL_MS, liveGlyph } from "../src/live.ts";

describe("live frames", () => {
	it("are one column wide, printable, and distinct so a row never looks like a settled `◆`", () => {
		expect(LIVE_FRAMES.length).toBe(10);
		expect(new Set(LIVE_FRAMES).size).toBe(LIVE_FRAMES.length);
		for (const frame of LIVE_FRAMES) {
			// One column each: the marker is paid for out of the row's own layout, and the frame may
			// not jitter the row's width while it spins.
			expect(frame.length).toBe(1);
			expect(frame.trim()).toBe(frame);
			expect(frame).not.toBe("◆");
		}
	});

	it("advances one frame per interval and wraps around", () => {
		for (let index = 0; index < LIVE_FRAMES.length; index++) {
			expect(liveGlyph(index * LIVE_INTERVAL_MS)).toBe(LIVE_FRAMES[index] as string);
		}
		expect(liveGlyph(LIVE_FRAMES.length * LIVE_INTERVAL_MS)).toBe(LIVE_FRAMES[0] as string);
		// Within one interval the frame is stable, so a repaint that arrives early does not skip.
		expect(liveGlyph(LIVE_INTERVAL_MS + 5)).toBe(liveGlyph(LIVE_INTERVAL_MS + 95));
	});

	it("tolerates a nonsense interval instead of dividing by zero", () => {
		expect(liveGlyph(0, 0)).toBe(LIVE_FRAMES[0] as string);
		expect(liveGlyph(0, -5)).toBe(LIVE_FRAMES[0] as string);
	});

	it("recognises exactly its own frames", () => {
		for (const frame of LIVE_FRAMES) {
			expect(isLiveGlyph(frame)).toBe(true);
		}
		expect(isLiveGlyph("◆")).toBe(false);
		expect(isLiveGlyph("⠿")).toBe(false);
		expect(isLiveGlyph("")).toBe(false);
	});
});

/** A hand-driven stand-in for `setInterval`, so the ticker can be stepped without sleeping. */
function fakeClock() {
	const timers: Array<{ tick: () => void; stop: () => void }> = [];
	return {
		setTimer(tick: () => void) {
			const entry = {
				tick,
				stop() {
					const at = timers.indexOf(entry);
					if (at >= 0) {
						timers.splice(at, 1);
					}
				},
			};
			timers.push(entry);
			return entry;
		},
		clearTimer(timer: { stop?: () => void }) {
			timer.stop?.();
		},
		/** Fire every live timer once. */
		run() {
			for (const entry of [...timers]) {
				entry.tick();
			}
		},
		timers: () => timers.length,
	};
}

describe("createLiveGlyphs", () => {
	it("gives a settled row `◆` and a running row the current frame", () => {
		const clock = fakeClock();
		const live = createLiveGlyphs({
			now: () => LIVE_INTERVAL_MS,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});
		const state = {};
		expect(live.marker(state, false, () => {})).toBe("◆");
		expect(live.marker(state, true, () => {})).toBe(LIVE_FRAMES[1] as string);
		expect(clock.timers()).toBe(1);
		expect(live.marker(state, false, () => {})).toBe("◆");
		expect(clock.timers()).toBe(0);
	});

	it("keeps one watcher per row however often the row re-renders", () => {
		const clock = fakeClock();
		const live = createLiveGlyphs({ setTimer: clock.setTimer, clearTimer: clock.clearTimer });
		const state = {};
		expect(live.watching()).toBe(0);
		live.marker(state, true, () => {});
		live.marker(state, true, () => {});
		live.marker(state, true, () => {});
		expect(live.watching()).toBe(1);
		// One shared timer for however many live rows there are.
		expect(clock.timers()).toBe(1);
	});

	it("repaints every running row on each tick and drops the timer when the last one settles", () => {
		const clock = fakeClock();
		const live = createLiveGlyphs({ setTimer: clock.setTimer, clearTimer: clock.clearTimer });
		const a = {};
		const b = {};
		let aPaints = 0;
		let bPaints = 0;
		live.marker(a, true, () => aPaints++);
		live.marker(b, true, () => bPaints++);
		clock.run();
		clock.run();
		expect(aPaints).toBe(2);
		expect(bPaints).toBe(2);

		expect(live.marker(a, false, () => {})).toBe("◆");
		expect(live.watching()).toBe(1);
		expect(clock.timers()).toBe(1);
		clock.run();
		expect(bPaints).toBe(3);
		expect(aPaints).toBe(2);

		expect(live.marker(b, false, () => {})).toBe("◆");
		expect(live.watching()).toBe(0);
		// A finished transcript costs no timer at all.
		expect(clock.timers()).toBe(0);
		clock.run();
		expect(bPaints).toBe(3);
	});

	it("calls the latest invalidate a re-render handed in", () => {
		const clock = fakeClock();
		const live = createLiveGlyphs({ setTimer: clock.setTimer, clearTimer: clock.clearTimer });
		const state = {};
		let calls = 0;
		live.marker(state, true, () => {});
		live.marker(state, true, () => calls++);
		clock.run();
		expect(calls).toBe(1);
	});

	it("spins without a row state, for callers that drive their own repaint", () => {
		const live = createLiveGlyphs({ now: () => LIVE_INTERVAL_MS });
		expect(live.frame()).toBe(LIVE_FRAMES[1] as string);
		expect(live.marker(undefined, true, () => {})).toBe(LIVE_FRAMES[1] as string);
		expect(live.watching()).toBe(0);
	});

	it("stops on demand without forgetting which rows are running", () => {
		const clock = fakeClock();
		const live = createLiveGlyphs({ setTimer: clock.setTimer, clearTimer: clock.clearTimer });
		const state = {};
		live.marker(state, true, () => {});
		live.stop();
		expect(clock.timers()).toBe(0);
		expect(live.watching()).toBe(1);
		// A re-render restarts the beat.
		live.marker(state, true, () => {});
		expect(clock.timers()).toBe(1);
	});
});
