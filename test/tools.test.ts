import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { expect } from "./expect.ts";
import { BurstTracker } from "../src/burst.ts";
import { createQuietTools } from "../src/tools.ts";
import { QUIET_TOOL_NAMES } from "../src/rows.ts";
import { fakeTheme, fixedLive, LIVE, markerTheme, renderContext } from "./fake-theme.ts";

const dirs: string[] = [];

/**
 * This extension's tools with the live glyph pinned to `LIVE`: a running row then asserts as one
 * fixed `⠋` instead of whichever frame the wall clock happens to be on.
 */
function quietTools(cwd: string, burst: BurstTracker) {
	return createQuietTools(cwd, burst, fixedLive());
}

afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function paint(component: { render: (width: number) => string[] }): string {
	return component.render(80).join("\n");
}

/** One unwrapped line, for rows asserted exactly. */
function paintLine(component: { render: (width: number) => string[] }): string {
	return (component.render(200)[0] ?? "").trim();
}

/**
 * A row's header with the metric column's padding collapsed to one space, which is what the
 * alignment spends: `◆ Ran git status 2.4s`. The column itself is asserted in `layout.test.ts`.
 */
function rowLine(component: { render: (width: number) => string[] }, width = 100): string {
	return (component.render(width)[0] ?? "").trim().replace(/ {2,}/g, " ");
}

/** A running row that has been going for 2.4 seconds, for the clock assertions. */
function running(): Record<string, unknown> {
	return { state: { startedAt: Date.now() - 2400 } };
}

describe("quiet tool renderers", () => {
	it("collapses bash to a Run line and keeps two bash calls on two lines", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const a = paintLine(
			bash.renderCall!({ command: "git status" }, fakeTheme, renderContext({ toolCallId: "b1", isPartial: true })),
		);
		const b = paintLine(
			bash.renderCall!({ command: "ls" }, fakeTheme, renderContext({ toolCallId: "b2", isPartial: true })),
		);
		expect(a).toContain("git status");
		expect(b).toContain("Listed .");
		// A run that has only just started carries no clock: `0.0s` is nine columns spent on nothing.
		expect(a).toBe(`${LIVE} Run git status`);
		expect(a).not.toBe(b);
		// Once it has been going for a while, the clock appears in the metric column.
		const steady = rowLine(
			bash.renderCall!({ command: "git status" }, fakeTheme, renderContext({ toolCallId: "b1", isPartial: true, ...running() })),
		);
		expect(steady).toBe(`${LIVE} Run git status 2.4s`);
		const settled = rowLine(
			bash.renderCall!({ command: "git status" }, fakeTheme, renderContext({ toolCallId: "b1", ...running() })),
		);
		expect(settled).toBe("◆ Ran git status 2.4s");
		const done = paint(
			bash.renderResult!(
				{ content: [{ type: "text", text: "ok" }], details: {} },
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ args: { command: "git status" } }),
			),
		);
		expect(done).toBe("");
		// Collapsed while it runs, the result renderer adds nothing: the row is its header alone.
		expect(
			paint(
				bash.renderResult!(
					{ content: [{ type: "text", text: "1\n2\n3\n4\n5\n6" }], details: {} },
					{ expanded: false, isPartial: true },
					fakeTheme,
					renderContext({ args: { command: "git status" }, isPartial: true }),
				),
			),
		).toBe("");
		expect(
			bash.renderResult!(
				{ content: [], details: {} },
				{ expanded: false, isPartial: true },
				fakeTheme,
				renderContext({ args: { command: "git status" }, isPartial: true }),
			).render(80),
		).toEqual([]);
		const err = paint(
			bash.renderResult!(
				{ content: [{ type: "text", text: "Command exited with code 2" }], details: {} },
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ args: { command: "false" }, isError: true }),
			),
		);
		expect(err).toContain("exit 2");
		const expanded = paint(
			bash.renderResult!(
				{ content: [{ type: "text", text: "full\noutput" }], details: {} },
				{ expanded: true, isPartial: false },
				fakeTheme,
				renderContext({ args: { command: "git status" }, expanded: true }),
			),
		);
		expect(expanded).toContain("full");
		expect(expanded).toContain("Ran git status");
	});

	it("shows every line printed so far when a running call is expanded", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const lines = bash
			.renderResult!(
				{ content: [{ type: "text", text: "1\n2\n3\n4\n5\n6" }], details: {} },
				{ expanded: true, isPartial: true },
				fakeTheme,
				renderContext({ args: { command: "npm test" }, expanded: true, isPartial: true }),
			)
			.render(80)
			.map((line) => line.trimEnd());
		// Not a window onto the tail: the expanded view is everything the command has printed, and
		// the whole block (header and output) sits one gutter in from the assistants prose.
		expect(lines).toEqual([`  ${LIVE} Run npm test`, "  1", "  2", "  3", "  4", "  5", "  6"]);
	});

	it("prefers the model-supplied description over the heuristic summary", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const described = paint(
			bash.renderCall!(
				{ command: "ls -a ~/.pi/agent; echo ===; ls ~/.pi/agent/extensions", description: "  Check pi config\n and extensions " },
				fakeTheme,
				renderContext({ toolCallId: "b3", isPartial: true, executionStarted: false }),
			),
		);
		expect(described.trim()).toBe(`${LIVE} Run Check pi config and extensions`);

		const fallback = paint(
			bash.renderCall!(
				{ command: "ls -a ~/.pi/agent; echo ===; ls ~/.pi/agent/extensions" },
				fakeTheme,
				renderContext({ toolCallId: "b4", isPartial: true, executionStarted: false }),
			),
		);
		expect(fallback).toContain("Listed");
		expect(fallback).not.toMatch(/echo/);

		const err = paint(
			bash.renderResult!(
				{ content: [{ type: "text", text: "Command exited with code 3" }], details: {} },
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ args: { command: "npm test", description: "Unit tests" }, isError: true }),
			),
		);
		expect(err).toContain("Run Unit tests");
		expect(err).toContain("exit 3");
	});

	it("exposes an optional description parameter to the model", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const properties = (bash.parameters as { properties?: Record<string, unknown> }).properties ?? {};
		expect(Object.keys(properties).sort().join(",")).toBe("command,description,timeout");
		expect(bash.promptGuidelines?.some((line) => line.includes("description"))).toBe(true);
	});

	it("streams write line counts from the growing content", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const write = tools.find((tool) => tool.name === "write")!;
		const state: Record<string, unknown> = {};
		const growing = (content: string) =>
			rowLine(write.renderCall!({ path: "src/a.ts", content }, fakeTheme, renderContext({ isPartial: true, state })));
		expect(growing("a\nb")).toBe(`${LIVE} Write src/a.ts 2 lines`);
		expect(growing("a\nb\nc")).toBe(`${LIVE} Write src/a.ts 3 lines`);
		expect(growing("a\nb\nc\n")).toBe(`${LIVE} Write src/a.ts 3 lines`);
		expect(
			paintLine(write.renderCall!({ path: "src/a.ts", content: "" }, fakeTheme, renderContext({ isPartial: true }))),
		).toBe(`${LIVE} Write src/a.ts`);
	});

	it("streams edit old/new line counts across edits[]", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const edit = tools.find((tool) => tool.name === "edit")!;
		const row = (edits: unknown) =>
			rowLine(edit.renderCall!({ path: "src/a.ts", edits }, fakeTheme, renderContext({ isPartial: true })));
		expect(row([{ oldText: "a\nb", newText: "a\nb\nc\nd\n" }])).toBe(`${LIVE} Edit src/a.ts −2 +4`);
		expect(
			row([
				{ oldText: "a", newText: "b" },
				{ oldText: "x\ny", newText: "z" },
			]),
		).toBe(`${LIVE} Edit src/a.ts −3 +2`);
		expect(row([{ oldText: "bye", newText: "hello" }])).toBe(`${LIVE} Edit src/a.ts −1 +1`);
		expect(row([])).toBe(`${LIVE} Edit src/a.ts`);
	});

	it("gives a settled mutation row a single header", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const write = tools.find((tool) => tool.name === "write")!;
		const edit = tools.find((tool) => tool.name === "edit")!;
		const result = { content: [{ type: "text", text: "ok" }], details: { diff: "+1 a\n+2 b" } };
		const args = { path: "src/a.ts", content: "a\nb" };
		const settled = [
			paint(write.renderCall!(args, fakeTheme, renderContext({ isPartial: false }))),
			paint(
				write.renderResult!(result, { expanded: false, isPartial: false }, fakeTheme, renderContext({ args, isPartial: false })),
			),
		].join("\n");
		expect(settled.match(/◆/g)?.length).toBe(1);
		expect(settled).toMatch(/◆ Write src\/a\.ts +2 lines/);
		const expanded = paintLine(
			edit.renderResult!(
				result,
				{ expanded: true, isPartial: false },
				fakeTheme,
				renderContext({ args, expanded: true, isPartial: false }),
			),
		);
		expect(expanded).toBe("+1 a");
		expect(paintLine(edit.renderResult!(result, { expanded: false, isPartial: false }, fakeTheme, renderContext({ args, isPartial: false })))).toBe("");
		// An expanded row keeps the same relative path a collapsed one prints.
		expect(rowLine(edit.renderCall!(args, fakeTheme, renderContext({ expanded: true, isPartial: false })))).toBe(
			"◆ Edit src/a.ts",
		);
	});

	it("shortens the path of a collapsed row and spells it out when the row is expanded", () => {
		const tools = quietTools("/repo", new BurstTracker());
		const write = tools.find((tool) => tool.name === "write")!;
		const edit = tools.find((tool) => tool.name === "edit")!;
		const read = tools.find((tool) => tool.name === "read")!;
		const args = {
			path: "/repo/src/a.ts",
			content: "a\nb",
			edits: [{ oldText: "bye", newText: "hello" }],
		};
		const row = (tool: (typeof tools)[number], expanded: boolean) =>
			rowLine(tool.renderCall!(args, fakeTheme, renderContext({ args, cwd: "/repo", expanded })));

		expect(row(write, false)).toBe("◆ Write src/a.ts 2 lines");
		expect(row(write, true)).toBe("◆ Write src/a.ts 2 lines");
		expect(row(edit, false)).toBe("◆ Edit src/a.ts −1 +1");
		expect(row(edit, true)).toBe("◆ Edit src/a.ts −1 +1");
		// A collapsed read is the burst's merged line, so its own call row draws nothing.
		expect(row(read, false)).toBe("");
		expect(row(read, true)).toBe("◆ read src/a.ts");
		expect(
			paint(
				read.renderResult!(
					{ content: [{ type: "text", text: "body" }], details: {} },
					{ expanded: false, isPartial: false },
					fakeTheme,
					renderContext({ args, cwd: "/repo", toolCallId: "p1" }),
				),
			),
		).toContain("Read src/a.ts");
	});

	it("merges a mixed inspect burst and unmerges when expanded", () => {
		const burst = new BurstTracker();
		const tools = quietTools(process.cwd(), burst);
		const read = tools.find((tool) => tool.name === "read")!;
		const ls = tools.find((tool) => tool.name === "ls")!;
		const grep = tools.find((tool) => tool.name === "grep")!;
		const result = { content: [{ type: "text", text: "ok" }], details: {} };

		for (let i = 0; i < 46; i++) {
			read.renderResult!(
				result,
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ toolCallId: `r${i}`, args: { path: `f${i}` } }),
			);
		}
		for (let i = 0; i < 3; i++) {
			ls.renderResult!(
				result,
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ toolCallId: `l${i}`, args: { path: `.` } }),
			);
		}
		for (let i = 0; i < 15; i++) {
			grep.renderResult!(
				result,
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ toolCallId: `g${i}`, args: { pattern: "x" } }),
			);
		}

		// The burst's own line stays on `r0`, the read that opened it, however much lands after.
		expect(
			paint(
				read.renderResult!(
					result,
					{ expanded: false, isPartial: false },
					fakeTheme,
					renderContext({ toolCallId: "r0", args: { path: "f0" } }),
				),
			),
		).toContain("Read f0, f1 +44 more, Listed 3 dirs, Searched 15 patterns");
		expect(
			paint(
				grep.renderResult!(
					result,
					{ expanded: false, isPartial: false },
					fakeTheme,
					renderContext({ toolCallId: "g14", args: { pattern: "x" } }),
				),
			),
		).toBe("");
		expect(
			paint(
				read.renderResult!(
					{ content: [{ type: "text", text: "file body" }], details: {} },
					{ expanded: true, isPartial: false },
					fakeTheme,
					renderContext({ toolCallId: "r0", args: { path: "f0" }, expanded: true }),
				),
			),
		).toContain("file body");
	});

	it("repaints the row that opened the burst when a later inspect call lands", () => {
		const burst = new BurstTracker();
		const tools = quietTools(process.cwd(), burst);
		const read = tools.find((tool) => tool.name === "read")!;
		const result = { content: [{ type: "text", text: "ok" }], details: {} };
		const repainted: string[] = [];
		// The transcript hands every render a fresh invalidate; the burst repaints the row that holds
		// the merged line through whichever one that row registered last.
		const context = (toolCallId: string) =>
			renderContext({
				toolCallId,
				args: { path: `${toolCallId}.ts` },
				invalidate: () => repainted.push(toolCallId),
			});
		const settle = (toolCallId: string) =>
			read.renderResult!(result, { expanded: false, isPartial: false }, fakeTheme, context(toolCallId));

		expect(paint(settle("q0"))).toContain("Read q0.ts");
		expect(paint(settle("q1"))).toBe("");
		// `q0` opened the burst, so it is the row that had to be repainted — not `q1`, the row that
		// just landed, which draws nothing at all.
		expect(repainted).toEqual(["q0"]);
	});

	it("gives a running inspect row the live glyph, collapsed and expanded", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const ls = tools.find((tool) => tool.name === "ls")!;
		// Running and collapsed, the row is its own header — the live glyph says so.
		expect(
			paintLine(
				ls.renderResult!(
					{ content: [] },
					{ expanded: false, isPartial: true },
					fakeTheme,
					renderContext({ toolCallId: "i1", args: { path: "." }, isPartial: true }),
				),
			),
		).toBe(`${LIVE} ls .`);
		// Running and expanded, the call renderer owns the header, and it is still live.
		expect(
			paintLine(
				ls.renderCall!(
					{ path: "." },
					fakeTheme,
					renderContext({ toolCallId: "i2", args: { path: "." }, isPartial: true, expanded: true }),
				),
			),
		).toBe(`${LIVE} ls .`);
	});

	it("splits inspect tools across bash", () => {
		const burst = new BurstTracker();
		const tools = quietTools(process.cwd(), burst);
		const read = tools.find((tool) => tool.name === "read")!;
		const ls = tools.find((tool) => tool.name === "ls")!;
		const result = { content: [{ type: "text", text: "ok" }], details: {} };
		expect(
			paint(read.renderResult!(result, { expanded: false, isPartial: false }, fakeTheme, renderContext({ toolCallId: "r1", args: { path: "a" } }))),
		).toContain("Read a");
		burst.noteSplit();
		expect(
			paint(ls.renderResult!(result, { expanded: false, isPartial: false }, fakeTheme, renderContext({ toolCallId: "l1", args: { path: "." } }))),
		).toContain("Listed 1 dir");
	});
});

describe("quiet tool metadata and execute", () => {
	it("registers exactly the rows the foreign-row substitution steps aside for", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		expect(tools.map((tool) => tool.name).sort()).toEqual([...QUIET_TOOL_NAMES].sort());
	});

	it("copies original prompt metadata", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		for (const name of ["read", "bash", "edit", "write", "grep", "find", "ls"]) {
			const tool = tools.find((item) => item.name === name)!;
			expect(tool.description.length).toBeGreaterThan(0);
			expect(tool.parameters).toBeTruthy();
			expect(tool.promptSnippet).toBeTruthy();
			expect(tool.renderShell).toBe("self");
		}
	});

	it("delegates write execute and stores a create diff", async () => {
		const dir = await mkdtemp(join(tmpdir(), "quiet-tui-"));
		dirs.push(dir);
		const tools = quietTools(dir, new BurstTracker());
		const write = tools.find((tool) => tool.name === "write")!;
		const path = join(dir, "new.txt");
		const result = await write.execute(
			"w1",
			{ path, content: "hello\nworld" },
			undefined,
			undefined,
			{ cwd: dir, hasUI: false } as any,
		);
		expect(await readFile(path, "utf8")).toBe("hello\nworld");
		expect(result.content[0]).toMatchObject({ type: "text" });
		expect(String((result.details as any).diff)).toContain("+");
		expect((result.details as any).created).toBe(true);
	});

	it("stores an overwrite diff for write", async () => {
		const dir = await mkdtemp(join(tmpdir(), "quiet-tui-"));
		dirs.push(dir);
		const path = join(dir, "old.txt");
		await writeFile(path, "aaa\nbbb\n");
		const tools = quietTools(dir, new BurstTracker());
		const write = tools.find((tool) => tool.name === "write")!;
		const result = await write.execute(
			"w2",
			{ path, content: "aaa\nccc\n" },
			undefined,
			undefined,
			{ cwd: dir, hasUI: false } as any,
		);
		expect((result.details as any).created).toBe(false);
		expect(String((result.details as any).diff)).toContain("-");
		expect(String((result.details as any).diff)).toContain("+");
		const header = rowLine(
			write.renderCall!({ path, content: "aaa\nccc\n" }, fakeTheme, renderContext({ cwd: dir, isPartial: false })),
		);
		expect(header).toBe("◆ Write old.txt 2 lines");
		const body = paint(
			write.renderResult!(
				result,
				{ expanded: true, isPartial: false },
				fakeTheme,
				renderContext({ args: { path, content: "aaa\nccc\n" }, isPartial: false, expanded: true }),
			),
		);
		expect(body).toContain("-");
		expect(body).toContain("+");
		expect(body).not.toMatch(/write/);
		expect(
			paint(
				write.renderResult!(
					result,
					{ expanded: false, isPartial: false },
					fakeTheme,
					renderContext({ args: { path, content: "aaa\nccc\n" }, isPartial: false }),
				),
			),
		).toBe("");
	});

	it("shows only the counts by default and the diff once expanded", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const edit = tools.find((tool) => tool.name === "edit")!;
		const diff = "+1 hello\n-2 bye";
		const header = rowLine(
			edit.renderCall!(
				{ path: "src/a.ts", edits: [{ oldText: "bye", newText: "hello" }] },
				fakeTheme,
				renderContext({ isPartial: false }),
			),
		);
		expect(header).toBe("◆ Edit src/a.ts −1 +1");
		const collapsed = paint(
			edit.renderResult!(
				{ content: [{ type: "text", text: "ok" }], details: { diff } },
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ args: { path: "src/a.ts" }, isPartial: false }),
			),
		);
		expect(collapsed).toBe("");
		const expanded = paint(
			edit.renderResult!(
				{ content: [{ type: "text", text: "ok" }], details: { diff } },
				{ expanded: true, isPartial: false },
				fakeTheme,
				renderContext({ args: { path: "src/a.ts" }, expanded: true }),
			),
		);
		expect(expanded).toContain("hello");
		expect(expanded).not.toMatch(/edit/);
		// The header stays the call renderer's; expanded only adds the diff body, and keeps the
		// same relative path (a full absolute path spends the row on directories already known).
		expect(
			rowLine(
				edit.renderCall!(
					{ path: "src/a.ts", edits: [{ oldText: "bye", newText: "hello" }] },
					fakeTheme,
					renderContext({ expanded: true, isPartial: false }),
				),
			),
		).toBe("◆ Edit src/a.ts −1 +1");
		const err = paint(
			edit.renderResult!(
				{ content: [{ type: "text", text: "Error: missing" }], details: {} },
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ args: { path: "src/a.ts" }, isError: true }),
			),
		);
		expect(err.toLowerCase()).toContain("error");
	});
});

void mkdir;

/**
 * The emphasis layer sits behind `headerLine`, so every quiet row picks it up without the
 * formatters in `summaries.ts` knowing about styling.
 */
describe("quiet tool emphasis", () => {
	it("accents the marker and the action of a run row", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const row = paint(bash.renderCall!({ command: "git status" }, markerTheme, renderContext({ toolCallId: "e1", isPartial: true, executionStarted: false })));
		// A running row's marker is the live glyph, bold in the accent slot like the settled `◆`.
		expect(row).toContain(`<b>[accent]${LIVE}[/]</b> <b>[accent]Run[/]</b>`);
		// Running, the row's own text is the brighter `text` slot rather than the settled dim.
		expect(row).toContain("[text] git status[/]");
		expect(row.includes("◆")).toBe(false);
	});

	it("drops the live glyph and goes back to `◆` once the row settles", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const settled = paint(
			bash.renderCall!({ command: "git status" }, markerTheme, renderContext({ toolCallId: "e3" })),
		);
		expect(settled).toContain("<b>[accent]◆[/]</b> <b>[accent]Ran[/]</b>");
		expect(settled.includes(LIVE)).toBe(false);
	});

	it("keeps the live clock in the row's dim metric column, never bold", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const row = paintLine(
			bash.renderCall!({ command: "git status" }, markerTheme, renderContext({ toolCallId: "e2", isPartial: true, ...running() })),
		);
		expect(row).toContain("[text] git status[/]");
		expect(row).toMatch(/\[dim\]2\.4s\[\/\]$/);
		expect(row.includes("<b>2.4s")).toBe(false);
	});

	it("bolds the counts of a merged inspect row", () => {
		const burst = new BurstTracker();
		const tools = quietTools(process.cwd(), burst);
		const ls = tools.find((tool) => tool.name === "ls")!;
		const result = { content: [{ type: "text", text: "ok" }], details: {} };
		for (let i = 0; i < 3; i++) {
			ls.renderResult!(
				result,
				{ expanded: false, isPartial: false },
				fakeTheme,
				renderContext({ toolCallId: `e-l${i}`, args: { path: "." } }),
			);
		}
		const row = paint(
			ls.renderResult!(
				result,
				{ expanded: false, isPartial: false },
				markerTheme,
				renderContext({ toolCallId: "e-l0", args: { path: "." } }),
			),
		);
		expect(row).toContain("<b>[accent]Listed[/]</b> <b>3</b> [dim]dirs[/]");
	});

	it("bolds the path and colours the counts of a collapsed edit row", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const edit = tools.find((tool) => tool.name === "edit")!;
		const row = paint(
			edit.renderCall!(
				{ path: "src/a.ts", edits: [{ oldText: "gone", newText: "added" }] },
				markerTheme,
				renderContext({ isPartial: false }),
			),
		);
		expect(row).toContain("[toolDiffRemoved]<b>−1</b>[/][dim] [/][toolDiffAdded]<b>+1</b>[/]");
	});
});

/**
 * The layout contract: a two-column gutter that separates machinery from prose, a metric column
 * that lines the measurements up, and a height that does not move while a row is still running.
 */
describe("quiet row layout", () => {
	it("indents a header and its expanded output by the same gutter", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const rows = bash
			.renderResult!(
				{ content: [{ type: "text", text: "one\ntwo" }], details: {} },
				{ expanded: true, isPartial: false },
				fakeTheme,
				renderContext({ args: { command: "git status" }, expanded: true }),
			)
			.render(80);
		expect(rows[0]?.startsWith("  ◆ Ran git status")).toBe(true);
		expect(rows[1]?.startsWith("  one")).toBe(true);
		expect(rows[2]?.startsWith("  two")).toBe(true);
	});

	it("keeps a running row and its settled view the same height", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const args = { command: "git status" };
		const runningRows = bash
			.renderCall!(args, fakeTheme, renderContext({ toolCallId: "h1", isPartial: true, ...running() }))
			.render(80);
		const settledRows = bash
			.renderCall!(args, fakeTheme, renderContext({ toolCallId: "h1", ...running() }))
			.render(80);
		expect(runningRows.length).toBe(settledRows.length);
	});

	it("does not grow a line when a streamed count arrives or climbs", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const write = tools.find((tool) => tool.name === "write")!;
		const state: Record<string, unknown> = {};
		const height = (content: string) =>
			write
				.renderCall!({ path: "src/a.ts", content }, fakeTheme, renderContext({ isPartial: true, state }))
				.render(80).length;
		const first = height("");
		expect(height("a\nb")).toBe(first);
		expect(height("a\nb\nc\nd\ne")).toBe(first);
		expect(height("a\n".repeat(400))).toBe(first);
	});

	it("puts the exit code of a failed run in the metric column, behind a `×`", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const row = paintLine(
			bash.renderResult!(
				{ content: [{ type: "text", text: "Command exited with code 2" }], details: {} },
				{ expanded: false, isPartial: false },
				markerTheme,
				renderContext({ args: { command: "false" }, isError: true }),
			),
		);
		// The whole line keeps the error colour, and the status is bold and right-aligned.
		expect(row).toContain("[error]");
		expect(row).toContain("<b>×</b>");
		expect(row).toContain("<b>Run</b>");
		expect(row).toContain("<b>[error]exit 2[/]</b>");
		expect(row.trimEnd().endsWith("<b>[error]exit 2[/]</b>")).toBe(true);
	});
});

/**
 * A run of quick commands is what makes the recording's ladder of `◆ Ran X for 0.1s` lines: the
 * three of them collapse to one, while a command that took real time keeps its own row.
 */
describe("quiet run merging", () => {
	/** A `bash` row that has been running for 400ms — under the merge threshold, three times over a second. */
	function quickState(): Record<string, unknown> {
		return { startedAt: Date.now() - 400 };
	}
	function settle(bash: any, toolCallId: string, description: string, state: Record<string, unknown>) {
		const args = { command: `run ${toolCallId}`, description };
		bash.renderCall!(args, fakeTheme, renderContext({ toolCallId, isPartial: true, state }));
		bash.renderResult!(
			{ content: [{ type: "text", text: "ok" }], details: {} },
			{ expanded: false, isPartial: false },
			fakeTheme,
			renderContext({ toolCallId, args, state }),
		);
	}

	it("merges consecutive quick runs into one line and unmerges when expanded", () => {
		const burst = new BurstTracker();
		const tools = quietTools(process.cwd(), burst);
		const bash = tools.find((tool) => tool.name === "bash")!;
		settle(bash, "b1", "Check repo state", quickState());
		settle(bash, "b2", "Run the test suite", quickState());
		settle(bash, "b3", "List the tree", quickState());

		// The line stays on the run that opened the sequence; the ones after it draw nothing.
		expect(
			rowLine(bash.renderCall!({ command: "run b1", description: "Check repo state" }, fakeTheme, renderContext({ toolCallId: "b1", state: quickState() }))),
		).toBe("◆ Ran 3 commands: Check repo state, Run the test suite +1 more 1.2s");
		expect(
			paint(bash.renderCall!({ command: "run b2", description: "Run the test suite" }, fakeTheme, renderContext({ toolCallId: "b2", state: quickState() }))),
		).toBe("");

		// Expanded, each covered run is its own row with its own output again.
		const expanded = paint(
			bash.renderResult!(
				{ content: [{ type: "text", text: "ok" }], details: {} },
				{ expanded: true, isPartial: false },
				fakeTheme,
				renderContext({
					toolCallId: "b2",
					args: { command: "run b2", description: "Run the test suite" },
					state: quickState(),
					expanded: true,
				}),
			),
		);
		// Expanded shows the run's real command, which is what the row was collapsing.
		expect(expanded).toContain("◆ Ran run b2");
		expect(expanded).toContain("ok");
	});

	it("keeps a slow run its own row between the quick ones", () => {
		const burst = new BurstTracker();
		const tools = quietTools(process.cwd(), burst);
		const bash = tools.find((tool) => tool.name === "bash")!;
		settle(bash, "b1", "Check repo state", quickState());
		settle(bash, "slow", "Run the test suite", { startedAt: Date.now() - 2400 });
		settle(bash, "b3", "List the tree", quickState());

		// A quick run that is alone keeps its own row and, being sub-second, no clock at all.
		expect(
			rowLine(bash.renderCall!({ command: "run b1", description: "Check repo state" }, fakeTheme, renderContext({ toolCallId: "b1", state: quickState() }))),
		).toBe("◆ Ran Check repo state");
		// The slow run keeps its own row with its own settled clock.
		expect(
			rowLine(
				bash.renderCall!({ command: "run slow", description: "Run the test suite" }, fakeTheme, renderContext({ toolCallId: "slow", state: { startedAt: Date.now() - 2400 } })),
			),
		).toBe("◆ Ran Run the test suite 2.4s");
		expect(
			rowLine(bash.renderCall!({ command: "run b3", description: "List the tree" }, fakeTheme, renderContext({ toolCallId: "b3", state: quickState() }))),
		).toBe("◆ Ran List the tree");
	});

	it("never merges a bash run with an inspect summary", () => {
		const burst = new BurstTracker();
		const tools = quietTools(process.cwd(), burst);
		const read = tools.find((tool) => tool.name === "read")!;
		const bash = tools.find((tool) => tool.name === "bash")!;
		const result = { content: [{ type: "text", text: "ok" }], details: {} };
		read.renderResult!(result, { expanded: false, isPartial: false }, fakeTheme, renderContext({ toolCallId: "r1", args: { path: "a" } }));
		settle(bash, "b1", "Check repo state", quickState());
		expect(
			paint(read.renderResult!(result, { expanded: false, isPartial: false }, fakeTheme, renderContext({ toolCallId: "r1", args: { path: "a" } }))),
		).toContain("Read a");
		expect(
			rowLine(bash.renderCall!({ command: "run b1", description: "Check repo state" }, fakeTheme, renderContext({ toolCallId: "b1", state: quickState() }))),
		).toBe("◆ Ran Check repo state");
	});
});
