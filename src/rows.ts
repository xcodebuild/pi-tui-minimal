import type { Theme } from "@earendil-works/pi-coding-agent";
import { emphasizeError, emphasizeHeader } from "./emphasis.ts";
import { ASK_USER_QUESTION } from "./questionnaire.ts";
import { DIAMOND, formatToolError } from "./summaries.ts";

/**
 * The quiet row for a tool **this extension does not register** — `ffgrep`/`fffind` from
 * `@ff-labs/pi-fff`, the subagent and goal tools, MCP tools, any other package's tool.
 *
 * pi keeps the *first* registration per tool name (`ExtensionRunner.getAllRegisteredTools`), and
 * the packages that register these tools load before this one, so their definitions cannot be
 * replaced with quiet `renderCall`/`renderResult`. The row is rewritten where the questionnaire
 * row already is: inside the transcript container patch (`spacing.ts`), once per row per render.
 * That patch is the only thing that has to change, and it declines everything it does not
 * recognise.
 *
 * Two rules keep the rewrite from guessing about a tool it knows nothing about:
 *
 * - A **running** row is left to its own renderer, unless it is one of the FFF tools. Those are
 *   titled with their own arguments (`ffgrep /pattern/ in path`) and then collapse to the settled
 *   `◆` line like every other row; while they run they wear the live glyph the caller passes in
 *   (`live.ts`), so the patched rows read as “running” the same way this extension's own rows do.
 *   Another package's tool may be drawing live progress of its own, and the settled row is the one
 *   the transcript keeps anyway.
 * - **Collapsed**, a settled row is the one `◆` line; `Ctrl+O` adds the tool's full text output.
 *   That is the same bargain the built-in rows make. A row that carries images is left alone
 *   entirely — there is no text substitute for it.
 *
 * Everything keys off fields of pi's `ToolExecutionComponent` (`toolName`, `toolCallId`, `args`,
 * `result`, `isPartial`, `expanded`), so a pi release that renames them makes the substitution
 * decline and the row return to its own rendering instead of breaking.
 */

type AnyComponent = Record<string, any>;

/** The tools this extension registers itself; their rows already carry a quiet renderer. */
export const QUIET_TOOL_NAMES: readonly string[] = ["read", "bash", "edit", "write", "find", "grep", "ls"];

/** The FFF tools (`@ff-labs/pi-fff`), whose rows are titled like the inspect rows they mirror. */
export const FFF_TOOL_NAMES: readonly string[] = ["ffgrep", "fffind", "fff-multi-grep"];

const QUIET = new Set(QUIET_TOOL_NAMES);
const FFF = new Set(FFF_TOOL_NAMES);

/** Longest argument summary on a generic row before it is cut with `...`. */
const MAX_SUMMARY = 60;

/**
 * Arguments tried in order for a generic row's title. `description` first: tools that ask the
 * model for one (the subagent tools, `bash`) mean it as the display line, and the real argument
 * (`prompt`, `objective`) is usually far too long for a row.
 */
const SUMMARY_KEYS: readonly string[] = [
	"description",
	"prompt",
	"objective",
	"query",
	"pattern",
	"command",
	"path",
	"text",
	"message",
];

/** pi's own tool row, running or settled — the same recognition `questionnaire.ts` performs. */
export function isToolRow(component: AnyComponent | undefined): component is AnyComponent {
	return (
		!!component &&
		typeof component.toolName === "string" &&
		typeof component.updateResult === "function" &&
		"toolCallId" in component
	);
}

/** Rows that own their rendering: this extension's tools and the questionnaire. */
function isOwnedRow(component: AnyComponent): boolean {
	return QUIET.has(component.toolName) || component.toolName === ASK_USER_QUESTION;
}

/** The text blocks of a tool result, joined the way the quiet renderers join them. */
function resultText(result: unknown): string {
	const content = (result as { content?: Array<{ type?: unknown; text?: unknown }> } | undefined)?.content;
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.filter((block) => block?.type === "text" && typeof block.text === "string")
		.map((block) => block.text as string)
		.join("\n");
}

function firstLine(text: string): string {
	return text.trim().split("\n")[0] ?? "";
}

/** One line of text: whitespace collapsed, cut to `max` with `...`. */
export function oneLine(value: string, max = MAX_SUMMARY): string {
	const compact = value.replace(/\s+/g, " ").trim();
	return compact.length <= max ? compact : `${compact.slice(0, max - 3)}...`;
}

/**
 * One argument as row text. Only what fits on a row qualifies: strings, numbers, booleans and
 * arrays of strings; nested objects (and empty arrays) are skipped so a row never shows JSON.
 */
function scalar(value: unknown): string | undefined {
	if (typeof value === "string") {
		return oneLine(value);
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")) {
		return oneLine((value as string[]).join(", "));
	}
	return undefined;
}

/** `ffgrep /useEffect/ in src`, `fffind tail-viewport in src …` — the FFF tools' own headers. */
function fffTitle(name: string, args: unknown): string {
	const values = (args ?? {}) as Record<string, unknown>;

	if (name === "fff-multi-grep") {
		const patterns = Array.isArray(values.patterns)
			? (values.patterns as unknown[]).map((pattern) => `"${String(pattern)}"`).join(", ")
			: "";
		let title = `${name} ${oneLine(patterns, 80)}`.trimEnd();
		const constraints = scalar(values.constraints);
		if (constraints) {
			title += ` (${constraints})`;
		}
		return values.cursor ? `${title} (page)` : title;
	}

	const pattern = typeof values.pattern === "string" ? values.pattern : "";
	const shown = name === "ffgrep" ? `/${pattern}/` : pattern;
	const path = typeof values.path === "string" && values.path.length > 0 ? values.path : ".";
	let title = `${name} ${shown} in ${path}`;
	const options: string[] = [];
	if (values.limit !== undefined) {
		options.push(`limit ${values.limit}`);
	}
	if (values.context !== undefined) {
		options.push(`context ${values.context}`);
	}
	if (options.length > 0) {
		title += ` (${options.join(", ")})`;
	}
	return values.cursor ? `${title} (page)` : title;
}

/** `<tool> <first readable argument>` — the fallback for a tool quiet knows nothing about. */
function genericTitle(name: string, args: unknown): string {
	const values = (args ?? {}) as Record<string, unknown>;
	for (const key of SUMMARY_KEYS) {
		const value = scalar(values[key]);
		if (value) {
			return `${name} ${value}`;
		}
	}
	for (const value of Object.values(values)) {
		const shown = scalar(value);
		if (shown) {
			return `${name} ${shown}`;
		}
	}
	return name;
}

/** A row's title without the `◆` marker: `ffgrep /x/ in src`, `Agent Review changes`. */
export function toolRowTitle(name: string, args: unknown): string {
	return FFF.has(name) ? fffTitle(name, args) : genericTitle(name, args);
}

/** A row that carries images has no text substitute; pi keeps rendering it. */
function hasImages(component: AnyComponent): boolean {
	if (Array.isArray(component.imageComponents) && component.imageComponents.length > 0) {
		return true;
	}
	const content = (component.result as { content?: unknown } | undefined)?.content;
	return Array.isArray(content) && content.some((block) => (block as { type?: unknown })?.type === "image");
}

/** The full output of a settled row, one colored line each; spacing wraps them to the width. */
function outputLines(theme: Theme, output: string): string[] {
	if (output.length === 0) {
		return [];
	}
	const lines = output.split("\n");
	if (lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines.map((line) => theme.fg("toolOutput", line));
}

/**
 * The quiet lines for a foreign tool row, or `undefined` when the row is not one, belongs to
 * this extension, carries images, or is still running while not being an FFF tool (the caller
 * keeps the row's own rendering then).
 *
 * `liveMarker` is the animated glyph a running row wears instead of `◆`; it defaults to `◆` so a
 * caller that drives its own repaint can keep the row still.
 */
export function foreignToolRowLines(
	component: AnyComponent | undefined,
	theme: Theme,
	liveMarker: string = DIAMOND,
): string[] | undefined {
	if (!isToolRow(component) || isOwnedRow(component) || hasImages(component)) {
		return undefined;
	}
	const name = component.toolName as string;
	const running = component.isPartial === true;
	if (running && !FFF.has(name)) {
		return undefined;
	}

	const title = toolRowTitle(name, component.args);
	const output = resultText(component.result);

	if (running) {
		return [emphasizeHeader(theme, `${liveMarker} ${title}`)];
	}
	const header = emphasizeHeader(theme, `${DIAMOND} ${title}`);
	if ((component.result as { isError?: unknown } | undefined)?.isError === true) {
		return [emphasizeError(theme, formatToolError(title, firstLine(output) || "error"))];
	}
	if (component.expanded !== true) {
		return [header];
	}
	return [header, ...outputLines(theme, output)];
}
