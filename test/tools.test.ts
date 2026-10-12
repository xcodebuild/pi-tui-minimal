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
		expect(a).toMatch(new RegExp(`^${LIVE} Run git status for \\d+\\.\\d+s$`));
		expect(a).not.toBe(b);
		const settled = paintLine(
			bash.renderCall!({ command: "git status" }, fakeTheme, renderContext({ toolCallId: "b1" })),
		);
		expect(settled).toMatch(/^◆ Ran git status for \d+\.\d+s$/);
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
		// Not a window onto the tail: the expanded view is everything the command has printed.
		expect(lines).toEqual([`${LIVE} Run npm test for 0.0s`, "1", "2", "3", "4", "5", "6"]);
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
			paintLine(write.renderCall!({ path: "src/a.ts", content }, fakeTheme, renderContext({ isPartial: true, state })));
		expect(growing("a\nb")).toBe(`${LIVE} Write src/a.ts  2 lines`);
		expect(growing("a\nb\nc")).toBe(`${LIVE} Write src/a.ts  3 lines`);
		expect(growing("a\nb\nc\n")).toBe(`${LIVE} Write src/a.ts  3 lines`);
		expect(
			paintLine(write.renderCall!({ path: "src/a.ts", content: "" }, fakeTheme, renderContext({ isPartial: true }))),
		).toBe(`${LIVE} Write src/a.ts`);
	});

	it("streams edit old/new line counts across edits[]", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const edit = tools.find((tool) => tool.name === "edit")!;
		const row = (edits: unknown) =>
			paintLine(edit.renderCall!({ path: "src/a.ts", edits }, fakeTheme, renderContext({ isPartial: true })));
		expect(row([{ oldText: "a\nb", newText: "a\nb\nc\nd\n" }])).toBe(`${LIVE} Edit src/a.ts  −2 +4`);
		expect(
			row([
				{ oldText: "a", newText: "b" },
				{ oldText: "x\ny", newText: "z" },
			]),
		).toBe(`${LIVE} Edit src/a.ts  −3 +2`);
		expect(row([{ oldText: "bye", newText: "hello" }])).toBe(`${LIVE} Edit src/a.ts  −1 +1`);
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
		expect(settled).toContain("◆ Write src/a.ts  2 lines");
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
		expect(paintLine(edit.renderCall!(args, fakeTheme, renderContext({ expanded: true, isPartial: false })))).toBe(
			`◆ Edit ${join(process.cwd(), "src/a.ts")}`,
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
			paintLine(tool.renderCall!(args, fakeTheme, renderContext({ args, cwd: "/repo", expanded })));

		expect(row(write, false)).toBe("◆ Write src/a.ts  2 lines");
		expect(row(write, true)).toBe("◆ Write /repo/src/a.ts  2 lines");
		expect(row(edit, false)).toBe("◆ Edit src/a.ts  −1 +1");
		expect(row(edit, true)).toBe("◆ Edit /repo/src/a.ts  −1 +1");
		// A collapsed read is the burst's merged line, so its own call row draws nothing.
		expect(row(read, false)).toBe("");
		expect(row(read, true)).toBe("◆ read /repo/src/a.ts");
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

		expect(paint(read.renderResult!(result, { expanded: false, isPartial: false }, fakeTheme, renderContext({ toolCallId: "r0", args: { path: "f0" } })))).toBe("");
		expect(
			paint(
				grep.renderResult!(
					result,
					{ expanded: false, isPartial: false },
					fakeTheme,
					renderContext({ toolCallId: "g14", args: { pattern: "x" } }),
				),
			),
		).toContain("Read f0, f1 +44, Listed 3 dirs, Searched 15 patterns");
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
		).toBe(`${LIVE} ls ${process.cwd()}`);
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
		const header = paintLine(
			write.renderCall!({ path, content: "aaa\nccc\n" }, fakeTheme, renderContext({ isPartial: false })),
		);
		expect(header).toBe(`◆ Write ${path}  2 lines`);
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
		const header = paintLine(
			edit.renderCall!(
				{ path: "src/a.ts", edits: [{ oldText: "bye", newText: "hello" }] },
				fakeTheme,
				renderContext({ isPartial: false }),
			),
		);
		expect(header).toBe("◆ Edit src/a.ts  −1 +1");
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
		// The header stays the call renderer's; expanded only adds the diff body — and spells the path out.
		expect(
			paintLine(
				edit.renderCall!(
					{ path: "src/a.ts", edits: [{ oldText: "bye", newText: "hello" }] },
					fakeTheme,
					renderContext({ expanded: true, isPartial: false }),
				),
			),
		).toBe(`◆ Edit ${join(process.cwd(), "src/a.ts")}  −1 +1`);
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
		// A running row's marker is the live glyph, bold in the warning slot rather than accent.
		expect(row).toContain(`<b>[warning]${LIVE}[/]</b> <b>[accent]Run[/]</b>`);
		expect(row).toContain("[dim] git status[/]");
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

	it("keeps the live clock in the running row's dim text", () => {
		const tools = quietTools(process.cwd(), new BurstTracker());
		const bash = tools.find((tool) => tool.name === "bash")!;
		const row = paintLine(
			bash.renderCall!({ command: "git status" }, markerTheme, renderContext({ toolCallId: "e2", isPartial: true })),
		);
		expect(row).toContain("[dim] git status for ");
		expect(row.includes("<b>0.0s")).toBe(false);
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
				renderContext({ toolCallId: "e-l2", args: { path: "." } }),
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
