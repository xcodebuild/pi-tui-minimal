import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { cleanSummary, splitSegments, summarizeCommand } from "../src/command-summary.ts";

const HOME = "/Users/xcodebuild";
const opts = { home: HOME };

function summary(command: string): string | undefined {
	return summarizeCommand(command, opts);
}

describe("splitSegments", () => {
	it("splits on top-level separators", () => {
		expect(splitSegments("a; b && c || d")).toEqual(["a", "b", "c", "d"]);
		expect(splitSegments("a\nb").length).toBe(2);
	});

	it("keeps pipes, quoted separators and redirects intact", () => {
		expect(splitSegments("rg -F 'a;b' src | head -5")).toEqual(["rg -F 'a;b' src | head -5"]);
		expect(splitSegments("ls x 2>&1")).toEqual(["ls x 2>&1"]);
	});
});

describe("summarizeCommand", () => {
	it("summarizes an ls + echo + ls one-liner", () => {
		const command = `ls -a ${HOME}/.pi/agent/ 2>/dev/null; echo "=== extensions ==="; ls -a ${HOME}/.pi/agent/extensions 2>/dev/null`;
		expect(summary(command)).toBe("Listed ~/.pi/agent; Listed ~/.pi/agent/extensions");
	});

	it("summarizes searches with paths", () => {
		expect(summary("rg -ilF --hidden 'mcpServers' ~/.pi/agent")).toBe("Searched 'mcpServers' in ~/.pi/agent");
		expect(summary("grep -ril foo src test")).toBe("Searched 'foo' in src, test");
	});

	it("summarizes git, node and package managers", () => {
		expect(summary("git status")).toBe("git status");
		expect(summary("git diff --stat src/tools.ts")).toBe("git diff");
		expect(summary("node --experimental-strip-types -e \"console.log(1)\"")).toBe("Ran a node script");
		expect(summary("npm test")).toBe("Ran tests");
		expect(summary("pnpm run build")).toBe("Ran build");
		expect(summary("yarn install")).toBe("Installed dependencies");
		expect(summary("npx tsc --noEmit")).toBe("Type-checked");
	});

	it("drops navigation, echo noise and redirections", () => {
		expect(summary("cd /tmp && npm test > /tmp/out 2>&1")).toBe("Ran tests");
		expect(summary("echo hi")).toBeUndefined();
		expect(summary("FOO=bar rg pattern src")).toBe("Searched 'pattern' in src");
	});

	it("cuts pipelines at the first command", () => {
		expect(summary(`cat ${HOME}/.pi/agent/settings.json | head -80`)).toBe("Read ~/.pi/agent/settings.json");
	});

	it("joins many commands with a remainder count", () => {
		expect(summary("ls a; ls b; ls c; ls d; ls e")).toBe("Listed a; Listed b; Listed c +2 more");
		expect(summary("rm a b c d")).toBe("Removed a, b +2 more");
	});

	it("returns undefined for empty input and keeps unknown commands readable", () => {
		expect(summary("   ")).toBeUndefined();
		expect(summary("frobnicate --frob /tmp/x")).toBe("frobnicate --frob /tmp/x");
	});

	it("truncates very long summaries", () => {
		const long = `rg '${"x".repeat(200)}'`;
		expect(summary(long)!.length).toBeLessThanOrEqual(80);
	});
});

describe("cleanSummary", () => {
	it("collapses model descriptions to one line", () => {
		expect(cleanSummary("  Check pi   global config\n and extensions ")).toBe(
			"Check pi global config and extensions",
		);
	});

	it("truncates long descriptions", () => {
		expect(cleanSummary("y".repeat(120)).length).toBeLessThanOrEqual(80);
	});
});
