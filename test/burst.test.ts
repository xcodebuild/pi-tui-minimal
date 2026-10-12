import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { BurstTracker, isBurstSplitTool } from "../src/burst.ts";

describe("BurstTracker", () => {
	it("merges consecutive reads into one summary", () => {
		const burst = new BurstTracker();
		burst.complete("a", "read", false);
		burst.complete("b", "read", false);
		expect(burst.shouldPaintCollapsed("a", false)).toBe(true);
		expect(burst.shouldPaintCollapsed("b", false)).toBe(false);
		expect(burst.summaryFor("a")).toBe("Read 2 files");
	});

	it("builds a mixed inspect summary", () => {
		const burst = new BurstTracker();
		for (let i = 0; i < 46; i++) burst.complete(`r${i}`, "read", false);
		for (let i = 0; i < 3; i++) burst.complete(`l${i}`, "ls", false);
		for (let i = 0; i < 15; i++) burst.complete(`g${i}`, "grep", false);
		expect(burst.summaryFor("g14")).toBe("Read 46 files, Listed 3 dirs, Searched 15 patterns");
		// The line stays on the read that opened the burst; everything after it only adds counts.
		expect(burst.shouldPaintCollapsed("r0", false)).toBe(true);
		expect(burst.shouldPaintCollapsed("g14", false)).toBe(false);
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
		// The merged line keeps the first success; the failure still draws its own error line.
		expect(burst.shouldPaintCollapsed("ok", false)).toBe(true);
		expect(burst.shouldPaintCollapsed("bad", false)).toBe(true);
	});

	it("lets a later success own a burst that opened with a failure", () => {
		const burst = new BurstTracker();
		burst.complete("bad", "read", true);
		burst.complete("ok", "ls", false);
		expect(burst.summaryFor("ok")).toBe("Listed 1 dir");
		expect(burst.shouldPaintCollapsed("ok", false)).toBe(true);
	});

	it("unmerges when expanded", () => {
		const burst = new BurstTracker();
		burst.complete("a", "read", false);
		burst.complete("b", "read", false);
		expect(burst.shouldPaintCollapsed("a", true)).toBe(true);
		expect(burst.shouldPaintCollapsed("b", true)).toBe(true);
	});

	it("repaints the burst's first row, not the row that just landed", () => {
		const burst = new BurstTracker();
		const invalidated: string[] = [];
		burst.register("a", () => invalidated.push("a"));
		burst.register("b", () => invalidated.push("b"));
		burst.register("c", () => invalidated.push("c"));
		// The first success draws the line itself; nothing has to be repainted for it.
		burst.complete("a", "read", false);
		expect(invalidated).toEqual([]);
		// Each later landing moves the counts, so the owner is repainted — and the new row is not.
		burst.complete("b", "read", false);
		burst.complete("c", "grep", false);
		expect(invalidated).toEqual(["a", "a"]);
	});
});

/**
 * The run of quick commands: same bargain as the inspect burst, one row for one run of `bash`
 * calls that each settled in under a second. The commands that took real time are never covered.
 */
describe("BurstTracker runs", () => {
	it("merges three quick runs into one line", () => {
		const burst = new BurstTracker();
		burst.completeRun("a", 0.4, false, "git status");
		burst.completeRun("b", 0.4, false, "npm test");
		burst.completeRun("c", 0.4, false, "ls -a");
		// The line belongs to the run that opened the sequence.
		expect(burst.shouldPaintRunCollapsed("a")).toBe(true);
		expect(burst.shouldPaintRunCollapsed("b")).toBe(false);
		expect(burst.shouldPaintRunCollapsed("c")).toBe(false);
		const parts = burst.runMergeFor("a");
		expect(parts?.title).toBe("◆ Ran 3 commands: git status, npm test +1 more");
		// 1.2s together, so the total is in the metric column.
		expect(parts?.metric).toBe("1.2s");
	});

	it("keeps a slow run on its own row and ends the sequence", () => {
		const burst = new BurstTracker();
		burst.completeRun("a", 0.1, false, "git status");
		burst.completeRun("slow", 2.4, false, "npm test");
		burst.completeRun("c", 0.1, false, "ls");
		// The slow run is covered by nothing and separates the quick runs on either side of it.
		expect(burst.runMergeFor("slow")).toBeUndefined();
		expect(burst.shouldPaintRunCollapsed("slow")).toBe(true);
		expect(burst.runMergeFor("a")).toBeUndefined();
		expect(burst.runMergeFor("c")).toBeUndefined();
	});

	it("does not merge across assistant text", () => {
		const burst = new BurstTracker();
		burst.completeRun("a", 0.1, false, "git status");
		burst.noteSplit();
		burst.completeRun("b", 0.1, false, "ls");
		expect(burst.runMergeFor("a")).toBeUndefined();
		expect(burst.runMergeFor("b")).toBeUndefined();
	});

	it("keeps a failed quick run's own error row but still merges the rest", () => {
		const burst = new BurstTracker();
		burst.completeRun("a", 0.4, false, "git status");
		burst.completeRun("bad", 0.9, true, "false");
		burst.completeRun("c", 0.6, false, "ls");
		expect(burst.shouldPaintRunCollapsed("bad")).toBe(true);
		const parts = burst.runMergeFor("a");
		expect(parts?.title).toBe("◆ Ran 2 commands: git status, ls");
		// The failure is not counted in the total either: 0.4 + 0.6, not 0.4 + 0.9 + 0.6.
		expect(parts?.metric).toBe("1.0s");
	});

	it("lets a lone quick run keep its own row", () => {
		const burst = new BurstTracker();
		burst.completeRun("a", 0.1, false, "git status");
		expect(burst.runMergeFor("a")).toBeUndefined();
		expect(burst.shouldPaintRunCollapsed("a")).toBe(true);
	});

	it("leaves a sub-second total without a clock", () => {
		const burst = new BurstTracker();
		burst.completeRun("a", 0.2, false, "git status");
		burst.completeRun("b", 0.2, false, "ls");
		expect(burst.runMergeFor("a")?.metric).toBeUndefined();
	});

	it("repaints the run that opened the sequence when a later one lands", () => {
		const burst = new BurstTracker();
		const invalidated: string[] = [];
		burst.register("a", () => invalidated.push("a"));
		burst.register("b", () => invalidated.push("b"));
		burst.completeRun("a", 0.1, false, "git status");
		expect(invalidated).toEqual([]);
		burst.completeRun("b", 0.2, false, "ls");
		expect(invalidated).toEqual(["a"]);
	});

	it("does not let the two families contaminate each other", () => {
		const burst = new BurstTracker();
		burst.complete("r1", "read", false);
		// A bash row ends the inspect burst, and an inspect row ends the run of quick commands.
		burst.completeRun("b1", 0.1, false, "git status");
		burst.complete("l1", "ls", false);
		expect(burst.summaryFor("r1")).toBe("Read 1 file");
		expect(burst.summaryFor("l1")).toBe("Listed 1 dir");
		expect(burst.shouldPaintCollapsed("r1", false)).toBe(true);
		expect(burst.shouldPaintCollapsed("l1", false)).toBe(true);
		// No inspect count ever lands on a run line, and no run lands on an inspect line.
		expect(burst.runMergeFor("b1")).toBeUndefined();
		expect(burst.summaryFor("l1").includes("command")).toBe(false);
	});
});
