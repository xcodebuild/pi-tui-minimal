import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import {
	countDiffStats,
	countLines,
	formatDiffCounts,
	formatDuration,
	formatEditCounts,
	formatInspectMerge,
	formatRanLine,
	formatRunError,
	formatRunFull,
	formatRunLine,
	formatThinkingLive,
	formatThinkingTokens,
	formatTokenCount,
	formatThought,
	formatWriteLines,
	elideMiddle,
	longPath,
	shortPath,
	shortReadPath,
	THINKING_HEADER,
} from "../src/summaries.ts";

describe("formatInspectMerge", () => {
	it("uses singular for one item", () => {
		expect(formatInspectMerge({ read: 1 })).toBe("Read 1 file");
		expect(formatInspectMerge({ ls: 1 })).toBe("Listed 1 dir");
		expect(formatInspectMerge({ grep: 1 })).toBe("Searched 1 pattern");
	});

	it("uses plural and joins kinds", () => {
		expect(formatInspectMerge({ read: 46, ls: 3, grep: 15 })).toBe(
			"Read 46 files, Listed 3 dirs, Searched 15 patterns",
		);
	});

	it("lists the read paths instead of their count", () => {
		expect(formatInspectMerge({ read: 1 }, ["src/a.ts"])).toBe("Read src/a.ts");
		expect(formatInspectMerge({ read: 2 }, ["src/a.ts", "test/b.test.ts"])).toBe(
			"Read src/a.ts, test/b.test.ts",
		);
		expect(formatInspectMerge({ read: 3, ls: 1 }, ["a.ts", "b.ts", "c.ts"])).toBe(
			"Read a.ts, b.ts +1 more, Listed 1 dir",
		);
	});

	it("does not repeat the same path twice", () => {
		expect(formatInspectMerge({ read: 2 }, ["src/a.ts", "src/a.ts"])).toBe("Read src/a.ts");
	});
});

describe("shortPath", () => {
	it("shortens paths inside the session", () => {
		expect(shortPath("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
		expect(shortPath("./src/a.ts", "/repo")).toBe("src/a.ts");
		expect(shortPath("src/a.ts", "/repo")).toBe("src/a.ts");
	});

	it("keeps a path outside the session readable", () => {
		expect(shortPath("/home/me/notes.md", "/repo", "/home/me")).toBe("~/notes.md");
		expect(shortPath("/elsewhere/a.ts", "/repo", "/home/me")).toBe("/elsewhere/a.ts");
	});

	it("leaves a long path whole, because only the merged read row has to stay one line", () => {
		expect(shortPath(`${`src/${"x".repeat(80)}`}.ts`, "/repo").length).toBe(87);
	});
});

describe("shortReadPath", () => {
	it("elides a path that would wrap the merged row, keeping the file name", () => {
		const long = `src/${"x".repeat(80)}.ts`;
		expect(shortReadPath(long, "/repo").length).toBeLessThanOrEqual(40);
		expect(shortReadPath(long, "/repo").startsWith("…")).toBe(true);
		expect(shortReadPath(long, "/repo").endsWith(".ts")).toBe(true);
	});

	it("keeps the name of a path with room to spare in its directories", () => {
		expect(shortReadPath("src/very/long/path/to/component/deeper/file.ts", "/repo")).toBe(
			"src/very/long/path/to/…/file.ts",
		);
	});
});

describe("elideMiddle", () => {
	it("leaves a short path alone", () => {
		expect(elideMiddle("src/a.ts", 40)).toBe("src/a.ts");
	});

	it("keeps as many leading directories as fit and always the name", () => {
		expect(elideMiddle("src/very/deep/tree/of/dirs/file.ts", 24)).toBe("src/very/deep/…/file.ts");
	});

	it("cuts a name that does not fit at all from the left", () => {
		const long = `${"n".repeat(60)}.ts`;
		const elided = elideMiddle(long, 20);
		expect(elided.length).toBe(20);
		expect(elided.startsWith("…")).toBe(true);
		expect(elided.endsWith(".ts")).toBe(true);
	});

	it("handles a path with no directory at all", () => {
		expect(elideMiddle("file.ts", 40)).toBe("file.ts");
	});
});

describe("longPath", () => {
	it("keeps an expanded row relative to the session", () => {
		expect(longPath("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
		expect(longPath("./src/a.ts", "/repo")).toBe("src/a.ts");
	});

	it("keeps a home path under a tilde", () => {
		expect(longPath("/home/me/notes.md", "/repo", "/home/me")).toBe("~/notes.md");
	});

	it("elides a path outside both roots from the left", () => {
		const long = `/elsewhere/${"d/".repeat(40)}file.ts`;
		const elided = longPath(long, "/repo", "/home/me");
		expect(elided.length).toBeLessThanOrEqual(72);
		expect(elided.startsWith("…")).toBe(true);
		expect(elided.endsWith("file.ts")).toBe(true);
	});
});

describe("run summaries", () => {
	it("formats a run line from the command", () => {
		expect(formatRunLine("git status")).toBe("◆ Run git status");
	});

	it("appends a live clock once the command has started", () => {
		expect(formatRunLine("git status", "检查仓库", 2.1)).toBe("◆ Run 检查仓库 for 2.1s");
		expect(formatRanLine("git status", "检查仓库", 2.1)).toBe("◆ Ran 检查仓库 for 2.1s");
		expect(formatRanLine("git status")).toBe("◆ Ran git status");
		expect(formatRunFull("git status", 12.4)).toBe("◆ Run git status for 12.4s");
	});

	it("leaves the clock off a sub-second run", () => {
		// `0.0s` is nine columns of the row and a column of the metric alignment spent on nothing.
		expect(formatRunLine("git status", undefined, 0.4)).toBe("◆ Run git status");
		expect(formatRanLine("git status", undefined, 0.4)).toBe("◆ Ran git status");
		expect(formatRunFull("git status", 0)).toBe("◆ Run git status");
		expect(formatThought(0.4)).toBe("· Thought");
	});

	it("formats durations the way pi's shell renderer does", () => {
		expect(formatDuration(0.4)).toBe("0.4s");
		expect(formatDuration(12.36)).toBe("12.4s");
		expect(formatDuration(65)).toBe("1m 5s");
		expect(formatDuration(3723)).toBe("1h 2m 3s");
	});

	it("includes exit code on errors", () => {
		expect(formatRunError("ls missing", 2)).toContain("exit 2");
	});
});

describe("thought and diffs", () => {
	it("formats thought duration", () => {
		expect(formatThought(2.4)).toBe("· Thought for 2.4s");
		expect(formatThought()).toBe("· Thought");
		expect(THINKING_HEADER).toBe("· Thinking");
	});

	it("formats the live token counter as one line", () => {
		expect(formatThinkingTokens(0)).toBe("· Thinking 0 tokens");
		expect(formatThinkingTokens(1)).toBe("· Thinking 1 token");
		expect(formatThinkingTokens(1234567)).toBe("· Thinking 1,234,567 tokens");
	});

	it("groups thousands the same way in every locale", () => {
		expect(formatTokenCount(999)).toBe("999 tokens");
		expect(formatTokenCount(1000)).toBe("1,000 tokens");
		expect(formatTokenCount(1234)).toBe("1,234 tokens");
	});

	it("keeps the token total on the collapsed label, ahead of the clock", () => {
		expect(formatThought(2.4, 1234)).toBe("· Thought 1,234 tokens for 2.4s");
		expect(formatThought(12.4, 1)).toBe("· Thought 1 token for 12.4s");
		expect(formatThought(undefined, 12)).toBe("· Thought 12 tokens");
	});

	it("adds the live clock to the thinking header once a run has started", () => {
		expect(formatThinkingLive(undefined, 1234)).toBe("· Thinking 1,234 tokens");
		expect(formatThinkingLive(2.1, 1234)).toBe("· Thinking 1,234 tokens for 2.1s");
	});

	it("counts +/− and formats a collapsed mutation line", () => {
		const diff = "+1 added\n-2 gone\n 3 same";
		expect(countDiffStats(diff)).toEqual({ added: 1, removed: 1 });
		expect(formatDiffCounts("src/a.ts", 12, 3)).toBe("◆ src/a.ts  +12 −3");
	});

	it("counts lines without inflating a trailing newline", () => {
		expect(countLines("")).toBe(0);
		expect(countLines("a")).toBe(1);
		expect(countLines("a\nb")).toBe(2);
		expect(countLines("a\nb\n")).toBe(2);
		expect(countLines("a\n\n")).toBe(2);
	});

	it("formats the streamed write and edit headers", () => {
		expect(formatWriteLines("src/a.ts", 128)).toBe("◆ Write src/a.ts  128 lines");
		expect(formatWriteLines("src/a.ts", 1)).toBe("◆ Write src/a.ts  1 line");
		expect(formatEditCounts("src/a.ts", 3, 12)).toBe("◆ Edit src/a.ts  −3 +12");
	});

	it("takes the running row's marker from the caller", () => {
		// The formatters stay plain text: the live glyph is a parameter, and `◆` is the default.
		expect(formatRunLine("git status", "检查仓库", 2.1, "⠋")).toBe("⠋ Run 检查仓库 for 2.1s");
		expect(formatRunFull("git status", 12.4, "⠋")).toBe("⠋ Run git status for 12.4s");
		expect(formatThinkingLive(2.1, 1234, "⠼")).toBe("⠼ Thinking 1,234 tokens for 2.1s");
		expect(formatWriteLines("src/a.ts", 2, "⠋")).toBe("⠋ Write src/a.ts  2 lines");
		expect(formatEditCounts("src/a.ts", 3, 12, "⠋")).toBe("⠋ Edit src/a.ts  −3 +12");
		// The settled forms never take one: the marker belongs to the table in `summaries.ts`.
		expect(formatRanLine("git status", "检查仓库", 2.1)).toBe("◆ Ran 检查仓库 for 2.1s");
		expect(formatThought(2.4, 1)).toBe("· Thought 1 token for 2.4s");
	});
});
