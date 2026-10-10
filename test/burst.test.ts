import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { BurstTracker, isBurstSplitTool } from "../src/burst.ts";

describe("BurstTracker", () => {
	it("merges consecutive reads into one summary", () => {
		const burst = new BurstTracker();
		burst.complete("a", "read", false);
		burst.complete("b", "read", false);
		expect(burst.shouldPaintCollapsed("a", false)).toBe(false);
		expect(burst.shouldPaintCollapsed("b", false)).toBe(true);
		expect(burst.summaryFor("b")).toBe("Read 2 files");
	});

	it("builds a mixed inspect summary", () => {
		const burst = new BurstTracker();
		for (let i = 0; i < 46; i++) burst.complete(`r${i}`, "read", false);
		for (let i = 0; i < 3; i++) burst.complete(`l${i}`, "ls", false);
		for (let i = 0; i < 15; i++) burst.complete(`g${i}`, "grep", false);
		expect(burst.summaryFor("g14")).toBe("Read 46 files, Listed 3 dirs, Searched 15 patterns");
		expect(burst.shouldPaintCollapsed("r0", false)).toBe(false);
		expect(burst.shouldPaintCollapsed("g14", false)).toBe(true);
	});

	it("splits inspect bursts on bash", () => {
		const burst = new BurstTracker();
		burst.complete("r1", "read", false);
		burst.noteSplit();
		burst.complete("l1", "ls", false);
		expect(burst.summaryFor("r1")).toBe("Read 1 file");
		expect(burst.summaryFor("l1")).toBe("Listed 1 dir");
		expect(burst.shouldPaintCollapsed("r1", false)).toBe(true);
		expect(burst.shouldPaintCollapsed("l1", false)).toBe(true);
	});

	it("counts the questionnaire as a split tool", () => {
		expect(isBurstSplitTool("bash")).toBe(true);
		expect(isBurstSplitTool("ask_user_question")).toBe(true);
		expect(isBurstSplitTool("read")).toBe(false);
		expect(isBurstSplitTool("spawn_agent")).toBe(false);
	});

	it("omits errors from the success summary", () => {
		const burst = new BurstTracker();
		burst.complete("ok", "read", false);
		burst.complete("bad", "read", true);
		expect(burst.summaryFor("ok")).toBe("Read 1 file");
		expect(burst.shouldPaintCollapsed("bad", false)).toBe(true);
	});

	it("unmerges when expanded", () => {
		const burst = new BurstTracker();
		burst.complete("a", "read", false);
		burst.complete("b", "read", false);
		expect(burst.shouldPaintCollapsed("a", true)).toBe(true);
		expect(burst.shouldPaintCollapsed("b", true)).toBe(true);
	});

	it("invalidates the previous last row", () => {
		const burst = new BurstTracker();
		let invalidated = 0;
		burst.register("a", () => {
			invalidated++;
		});
		burst.complete("a", "read", false);
		burst.complete("b", "read", false);
		expect(invalidated).toBe(1);
	});
});
