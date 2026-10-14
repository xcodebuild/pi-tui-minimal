import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { GUTTER, layoutOutput, layoutRow } from "../src/render.ts";
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

	it("trails the metric after the title with a fixed gap", () => {
		const lines = layoutRow({ title: "◆ Ran git status", metric: "1.2s" }, 40);
		expect(lines).toEqual([`${pad}◆ Ran git status  1.2s`]);
		expect(visibleWidth(lines[0] as string)).toBe(GUTTER + 16 + 2 + 4);
		expect((lines[0] as string).endsWith("1.2s")).toBe(true);
	});

	it("keeps each metric beside its own title", () => {
		const wide = layoutRow({ title: "◆ Read src/a.ts, test/b.ts +44 more", metric: "2.4s" }, 60)[0] as string;
		const narrow = layoutRow({ title: "◆ Ran git status", metric: "2.4s" }, 60)[0] as string;
		expect(wide.endsWith("2.4s")).toBe(true);
		expect(narrow.endsWith("2.4s")).toBe(true);
		expect(wide.indexOf("2.4s")).toBe(wide.length - 4);
		expect(narrow.indexOf("2.4s")).toBe(narrow.length - 4);
	});

	it("does not stretch a short row to the terminal width", () => {
		const wide = layoutRow({ title: "◆ Ran git status", metric: "2.4s" }, 160)[0] as string;
		expect(wide).toBe(`${pad}◆ Ran git status  2.4s`);
		expect(visibleWidth(wide)).toBe(GUTTER + 16 + 2 + 4);
	});

	it("does not wrap a long merged command summary at a rail", () => {
		const title = "◆ Ran 4 commands: 查看项目目录结构和 README, 查看 package.json 与 git 信息 +2 more";
		const lines = layoutRow({ title, metricReserve: 8 }, 120);
		expect(lines).toEqual([`${pad}${title}`]);
		expect(visibleWidth(lines[0] as string)).toBeGreaterThan(80);
	});

	it("keeps a metric beside a title that fills the row", () => {
		const title = `◆ Ran ${"word ".repeat(18)}`.trim();
		const lines = layoutRow({ title, metric: "2.4s", metricReserve: 8 }, 120);
		expect(lines).toEqual([`${pad}${title}  2.4s`]);
	});

	it("reserves room for the metric so a late clock cannot add a line", () => {
		const title = `◆ Ran ${"w".repeat(40)}`;
		const running = layoutRow({ title, metricReserve: 8 }, 60);
		const settled = layoutRow({ title, metric: "12.4s", metricReserve: 8 }, 60);
		expect(running.length).toBe(settled.length);
		expect(running).toEqual([`${pad}${title}`]);
	});

	it("gives the metric its own line when the row is too narrow for both", () => {
		const metric = "x".repeat(24);
		const lines = layoutRow({ title: "◆ Ran a", metric }, 26);
		expect(lines.length).toBeGreaterThan(1);
		const last = lines[lines.length - 1] as string;
		expect(last.trim()).toBe(metric);
		expect(visibleWidth(last)).toBe(26);
	});

	it("draws a metric with no title as one left-aligned line", () => {
		const lines = layoutRow({ title: "", metric: "1.2s" }, 20);
		expect(lines).toEqual([`${pad}1.2s`]);
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
