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

	it("is valid JSON on disk", () => {
		const path = join(dirname(fileURLToPath(import.meta.url)), "..", "themes", "quiet.json");
		expect(() => JSON.parse(readFileSync(path, "utf8"))).not.toThrow();
	});
});
