import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { FILL_BG_SLOTS, loadQuietThemeJson } from "../src/theme.ts";

const REQUIRED_COLORS = [
	"accent",
	"border",
	"borderAccent",
	"borderMuted",
	"success",
	"error",
	"warning",
	"muted",
	"dim",
	"text",
	"thinkingText",
	"selectedBg",
	"userMessageBg",
	"userMessageText",
	"customMessageBg",
	"customMessageText",
	"customMessageLabel",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
	"toolTitle",
	"toolOutput",
	"mdHeading",
	"mdLink",
	"mdLinkUrl",
	"mdCode",
	"mdCodeBlock",
	"mdCodeBlockBorder",
	"mdQuote",
	"mdQuoteBorder",
	"mdHr",
	"mdListBullet",
	"toolDiffAdded",
	"toolDiffRemoved",
	"toolDiffContext",
	"syntaxComment",
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxPunctuation",
	"thinkingOff",
	"thinkingMinimal",
	"thinkingLow",
	"thinkingMedium",
	"thinkingHigh",
	"thinkingXhigh",
	"bashMode",
];

describe("quiet theme json", () => {
	it("has every required color token and empty fill backgrounds", () => {
		const json = loadQuietThemeJson();
		expect(json.name).toBe("quiet");
		for (const key of REQUIRED_COLORS) {
			expect(json.colors).toHaveProperty(key);
		}
		for (const slot of FILL_BG_SLOTS) {
			expect(json.colors[slot]).toBe("");
		}
	});

	/**
	 * The quiet style is dim almost everywhere, so the foreground ladder is what keeps prose,
	 * output and chrome apart. These values are asserted as *luminance* steps, not as hex, because
	 * what the eye reads is the steps between them.
	 */
	it("keeps three distinguishable foreground steps", () => {
		const json = loadQuietThemeJson();
		const vars = json.vars as Record<string, string>;
		const channels = (hex: string) =>
			[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
		const luminance = (hex: string) => {
			const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
			return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
		};
		const step = (name: string) => luminance(vars[name] as string);

		// Prose, captured output, and dim chrome: each is a visible step from the next. `text` is
		// declared rather than left to the terminal's default, which is what made prose a
		// different colour on every terminal.
		expect(json.colors.text).toBe("bodyText");
		expect(vars.bodyText).toBe("#d8d8d8");
		expect(step("bodyText") - step("gray")).toBeGreaterThan(0.1);
		expect(step("gray") - step("dimGray")).toBeGreaterThan(0.1);
		expect(step("mutedGray") - step("dimGray")).toBeGreaterThan(0.05);
	});

	it("keeps the diff and error colours apart in grayscale", () => {
		const json = loadQuietThemeJson();
		const vars = json.vars as Record<string, string>;
		const gray = (hex: string) => {
			const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
			const lin = [r, g, b].map((c) => (c as number) ** 2.2);
			return Math.round((0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!) * 255);
		};
		const added = gray(vars.green as string);
		const removed = gray(vars.red as string);
		const error = gray(vars.errorRed as string);
		expect(Math.abs(added - removed)).toBeGreaterThan(30);
		expect(Math.abs(added - error)).toBeGreaterThan(30);
		expect(Math.abs(removed - error)).toBeGreaterThan(30);
	});

	it("is valid JSON on disk", () => {
		const path = join(dirname(fileURLToPath(import.meta.url)), "..", "themes", "quiet.json");
		expect(() => JSON.parse(readFileSync(path, "utf8"))).not.toThrow();
	});
});
