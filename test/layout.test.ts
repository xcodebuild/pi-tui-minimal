import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { GUTTER, ROW_RAIL_MAX, layoutOutput, layoutRow } from "../src/render.ts";
import { visibleWidth } from "@earendil-works/pi-tui";

const pad = " ".repeat(GUTTER);

describe("layoutRow", () => {
	it("starts every line at the gutter", () => {
		const lines = layoutRow({ title: "◆ Ran git status" }, 40);
		expect(lines).toEqual([`${pad}◆ Ran git status`]);
	});

	it("hangs a wrapped continuation past the marker", () => {
		const lines = layoutRow({ title: `◆ Ran ${"word ".repeat(12)}`.trim() }, 30);
		expect(lines.length).toBeGreaterThan(1);
		for (const [index, line] of lines.entries()) {
			expect(line.startsWith(pad)).toBe(true);
			if (index > 0) {
				expect(line.startsWith(`${pad}  `)).toBe(true);
			}
		}
	});

	it("right-aligns the metric with a fixed gap", () => {
		const lines = layoutRow({ title: "◆ Ran git status", metric: "1.2s" }, 40);
		expect(lines).toEqual([`${pad}◆ Ran git status${" ".repeat(40 - GUTTER - 16 - 4)}1.2s`]);
		expect(visibleWidth(lines[0] as string)).toBe(40);
		expect((lines[0] as string).endsWith("1.2s")).toBe(true);
	});

	it("lines up the metric of rows with different titles", () => {
		const wide = layoutRow({ title: "◆ Read src/a.ts, test/b.ts +44 more", metric: "2.4s" }, 60)[0] as string;
		const narrow = layoutRow({ title: "◆ Ran git status", metric: "2.4s" }, 60)[0] as string;
		expect(wide.indexOf("2.4s")).toBe(narrow.indexOf("2.4s"));
	});

	it("keeps the metric on the same capped rail in a wide terminal", () => {
		const capped = layoutRow({ title: "◆ Ran git status", metric: "2.4s" }, ROW_RAIL_MAX)[0] as string;
		const wide = layoutRow({ title: "◆ Ran git status", metric: "2.4s" }, 160)[0] as string;
		expect(wide).toBe(capped);
		expect(visibleWidth(wide)).toBe(ROW_RAIL_MAX);
	});

	it("does not wrap a merged command summary at the metric rail", () => {
		const title = "◆ Ran 4 commands: 查看项目目录结构和 README, 查看 package.json 与 git 信息 +2 more";
		const lines = layoutRow({ title, metricReserve: 8 }, 120);
		expect(lines).toEqual([`${pad}${title}`]);
		expect(visibleWidth(lines[0] as string)).toBeGreaterThan(ROW_RAIL_MAX);
	});

	it("keeps a metric beside a title that crosses the metric rail", () => {
		const title = `◆ Ran ${"word ".repeat(18)}`.trim();
		const lines = layoutRow({ title, metric: "2.4s", metricReserve: 8 }, 120);
		expect(lines).toEqual([`${pad}${title}  2.4s`]);
	});

	it("reserves the metric column so a late clock cannot add a line", () => {
		const title = `◆ Ran ${"w".repeat(40)}`;
		const running = layoutRow({ title, metricReserve: 8 }, 60);
		const settled = layoutRow({ title, metric: "12.4s", metricReserve: 8 }, 60);
		expect(running.length).toBe(settled.length);
		expect(running).toEqual([`${pad}${title}`]);
	});

	it("gives the metric its own right-aligned line when the row is too narrow for both", () => {
		const metric = "x".repeat(24);
		const lines = layoutRow({ title: "◆ Ran a", metric }, 26);
		expect(lines.length).toBeGreaterThan(1);
		const last = lines[lines.length - 1] as string;
		expect(last.trim()).toBe(metric);
		expect(visibleWidth(last)).toBe(26);
	});

	it("draws a metric with no title as one right-aligned line", () => {
		const lines = layoutRow({ title: "", metric: "1.2s" }, 20);
		expect(lines).toEqual(["1.2s".padStart(20)]);
	});

	it("puts a measurement wider than the column back into the wrapped title", () => {
		const metric = "ENOENT: no such file or directory, open 'src/a.ts'";
		const lines = layoutRow({ title: "× edit", metric }, 40);
		expect(lines.every((line) => visibleWidth(line) <= 40)).toBe(true);
		expect(lines.join(" ")).toContain("ENOENT:");
		expect(lines.join(" ")).toContain("directory,");
		expect(lines.some((line) => line.startsWith(pad))).toBe(true);
	});
});

describe("layoutOutput", () => {
	it("indents captured output the way a row is indented", () => {
		expect(layoutOutput("+1 added\n-2 gone", 40)).toEqual([`${pad}+1 added`, `${pad}-2 gone`]);
	});

	it("hangs a wrapped output line past the row marker", () => {
		const lines = layoutOutput("x".repeat(50), 20);
		expect(lines.length).toBeGreaterThan(1);
		expect(lines[1]?.startsWith(`${pad}  `)).toBe(true);
	});

	it("draws nothing for empty output", () => {
		expect(layoutOutput("", 40)).toEqual([]);
	});
});
