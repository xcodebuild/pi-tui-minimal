import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { additionsDiff, numberedDiff } from "../src/diff.ts";

describe("numberedDiff", () => {
	it("renders a new file as additions", () => {
		const diff = additionsDiff("hello\nworld");
		expect(diff).toContain("+");
		expect(diff).not.toMatch(/^-/m);
	});

	it("renders an overwrite as plus and minus lines", () => {
		const diff = numberedDiff("aaa\nbbb\n", "aaa\nccc\n");
		expect(diff).toContain("-");
		expect(diff).toContain("+");
	});
});
