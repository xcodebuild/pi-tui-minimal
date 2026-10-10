import type { Theme } from "@earendil-works/pi-coding-agent";
import { DIAMOND, PROMPT } from "./summaries.ts";

/**
 * Weight and accent for the one-line rows `summaries.ts` formats.
 *
 * The quiet style is dim almost everywhere, which leaves nothing to scan by. The emphasis
 * layer is the one place that decides what carries weight: the `◆` marker and the action
 * word are accented and bold, counts and paths are bold, and everything else — descriptions,
 * merge nouns, command text, and the elapsed clocks — stays in the theme's dim slot.
 *
 * It is a pure string transform, applied at the single choke point each row passes through
 * (`headerLine` for tool rows, `emphasizeThinkingLabel` for thinking labels), so the
 * formatters in `summaries.ts` keep returning plain text and stay testable as text.
 */
export type EmphasisTheme = Pick<Theme, "fg" | "bold">;

const MARKER = `${DIAMOND} `;

/** `Read src/a.ts, test/b.ts +44` / `Listed 3 dirs` — one part per inspect kind. */
const MERGE_PART = /^(Read|Listed|Searched|Found) (\d+) ([a-z]+)$/;

/** `Read src/a.ts, test/b.ts +44` — a read part listing the paths it touched. */
const READ_PATHS = /^(Read) (.+?)( \+(\d+))?$/;

/**
 * Where one merged part ends and the next begins. Splitting on the kind word (rather than on
 * every `, `) keeps a read path list whole: the list carries `, ` of its own.
 */
const MERGE_BOUNDARY = /, (?=(?:Read|Listed|Searched|Found) )/;

/** `src/a.ts  +12 −3` — an expanded edit/write header. */
const DIFF_COUNTS = /^(.*) {2}(\+\d+) (−\d+)$/;

/** `Write src/a.ts  128 lines` — a write row carrying its (streamed) line count. */
const WRITE_LINES = /^(Write) (.*) {2}(\d+) (lines?)$/;

/** `Edit src/a.ts  −3 +12` — an edit row carrying its old/new line counts. */
const EDIT_COUNTS = /^(Edit) (.*) {2}(−\d+) (\+\d+)$/;

/** Trailing `  exit 2` / `  error` on a failed run. */
const STATUS = /( {2}(?:exit \S+|error))$/;

/**
 * Tail of a thought label: an optional ` 1,234 tokens` and, after it, an optional ` for 1.2s`.
 * Either part may stand alone — a restored run has no duration, a streaming one has no total
 * yet. The duration shape matches `formatDuration` (seconds, then minutes and hours).
 */
const DURATION = String.raw`\d+(?:\.\d+)?s|\d+m \d+s|\d+h \d+m \d+s`;
const THOUGHT_TAIL = new RegExp(String.raw`^( ((\d[\d,]* tokens?)))?( for (${DURATION}))?$`);

/** Parses a thought tail, or undefined when the tail is something else entirely. */
function parseThoughtTail(tail: string): { tokens?: string; duration?: string } | undefined {
	const match = THOUGHT_TAIL.exec(tail);
	if (!match) {
		return undefined;
	}
	return { tokens: match[3], duration: match[5] };
}

/** Lowercase names whose row is `tool <argument>`: the inspect rows and the FFF mirrors. */
const INSPECT_NAMES = new Set(["read", "find", "grep", "ls", "ffgrep", "fffind", "fff-multi-grep"]);

/** Capitalized action words whose whole tail is a path: `◆ Edit src/a.ts`, `◆ Write src/a.ts`. */
const PATH_NAMES = new Set(["Edit", "Write"]);

function accent(theme: EmphasisTheme, text: string): string {
	return theme.bold(theme.fg("accent", text));
}

function strong(theme: EmphasisTheme, text: string): string {
	return theme.bold(text);
}

function dim(theme: EmphasisTheme, text: string): string {
	return theme.fg("dim", text);
}

/** An added-lines count (`+12`) or a removed-lines count (`−3`), in the diff colours pi uses. */
function diffCount(theme: EmphasisTheme, color: "toolDiffAdded" | "toolDiffRemoved", text: string): string {
	return theme.fg(color, theme.bold(text));
}

/**
 * The `❯` that anchors the user's own turn: accented and bold like every other marker, plus the
 * gap that separates it from the prompt text. Its visible width is what `prompt.ts` takes off
 * the line's own left padding, so the row costs no columns.
 */
export function emphasizePromptMarker(theme: EmphasisTheme): string {
	return `${theme.bold(theme.fg("accent", PROMPT))} `;
}

/** Splits the leading `◆ ` off a canonical row, whether or not the caller included it. */
function splitMarker(text: string): string {
	return text.startsWith(MARKER) ? text.slice(MARKER.length) : text;
}

/** Splits a row body into its first word (the action) and everything after it. */
function splitHead(text: string): { first: string; tail: string } | undefined {
	const match = /^(\S+)([\s\S]*)$/.exec(text);
	return match ? { first: match[1], tail: match[2] } : undefined;
}

/** Styling for a whole merged inspect line, or undefined when `rest` is not one. */
function styleMerge(theme: EmphasisTheme, rest: string): string | undefined {
	const parts = rest.split(MERGE_BOUNDARY);
	const styled: string[] = [];
	for (const part of parts) {
		const paths = READ_PATHS.exec(part);
		if (paths && !MERGE_PART.test(part)) {
			const hidden = paths[3] ? dim(theme, paths[3]) : "";
			styled.push(`${accent(theme, paths[1])} ${strong(theme, paths[2])}${hidden}`);
			continue;
		}
		const match = MERGE_PART.exec(part);
		if (!match) {
			return undefined;
		}
		styled.push(`${accent(theme, match[1])} ${strong(theme, match[2])} ${dim(theme, match[3])}`);
	}
	return styled.join(dim(theme, ", "));
}

/**
 * Restyles a thinking tail: ` 1,234 tokens` and ` for 1.2s`, the count carrying the weight and
 * the clock staying plain. Used by a thinking header (`Thinking` / `Thought`); a run row's
 * clock is part of its dim summary instead.
 *
 * `sep` paints the plain text in the colour of the surrounding label, and `value` paints the
 * count. A tool row needs no wrapper on the value (the bold span re-opens it itself); the
 * Markdown of a thinking block does, because a nested colour span ends with a foreground reset
 * — without it ` 1,234 tokens` would fall back to the terminal's default colour.
 */
function styleThoughtTail(
	theme: EmphasisTheme,
	tail: string,
	sep: (text: string) => string,
	value: (text: string) => string,
): string {
	const parts = parseThoughtTail(tail);
	if (!parts) {
		return sep(tail);
	}
	let styled = "";
	if (parts.tokens) {
		styled += `${sep(" ")}${theme.bold(value(parts.tokens))}`;
	}
	if (parts.duration) {
		styled += sep(` for ${parts.duration}`);
	}
	return styled;
}

/**
 * Restyles a tool header: `◆ Run …`, `◆ Read src/a.ts, test/b.ts, Listed 3 dirs`,
 * `◆ Edit src/a.ts`, `◆ src/a.ts  +12 −3`, `◆ read src/a.ts`, `◆ Thought 1,234 tokens`.
 *
 * Unknown shapes fall back to an accented action word plus dim text, which is the shape the
 * quiet style used for every row before the emphasis layer existed.
 */
export function emphasizeHeader(theme: EmphasisTheme, text: string): string {
	const rest = splitMarker(text);
	const marker = accent(theme, DIAMOND);
	if (rest.length === 0) {
		return marker;
	}
	return `${marker} ${styleBody(theme, rest)}`;
}

function styleBody(theme: EmphasisTheme, rest: string): string {
	const merge = styleMerge(theme, rest);
	if (merge !== undefined) {
		return merge;
	}
	const diff = DIFF_COUNTS.exec(rest);
	if (diff) {
		return `${strong(theme, diff[1])}${dim(theme, "  ")}${diffCount(theme, "toolDiffAdded", diff[2])}${dim(theme, " ")}${diffCount(theme, "toolDiffRemoved", diff[3])}`;
	}
	const writeLines = WRITE_LINES.exec(rest);
	if (writeLines) {
		return `${accent(theme, writeLines[1])} ${strong(theme, writeLines[2])}${dim(theme, "  ")}${strong(theme, writeLines[3])}${dim(theme, ` ${writeLines[4]}`)}`;
	}
	const editCounts = EDIT_COUNTS.exec(rest);
	if (editCounts) {
		return `${accent(theme, editCounts[1])} ${strong(theme, editCounts[2])}${dim(theme, "  ")}${diffCount(theme, "toolDiffRemoved", editCounts[3])}${dim(theme, " ")}${diffCount(theme, "toolDiffAdded", editCounts[4])}`;
	}
	const head = splitHead(rest);
	if (!head) {
		return dim(theme, rest);
	}
	const { first, tail } = head;
	if (first === "Thought" || first === "Thinking") {
		return `${accent(theme, first)}${styleThoughtTail(
			theme,
			tail,
			(text) => dim(theme, text),
			(text) => text,
		)}`;
	}
	if (INSPECT_NAMES.has(first) || PATH_NAMES.has(first)) {
		return `${accent(theme, first)}${strong(theme, tail)}`;
	}
	return `${accent(theme, first)}${dim(theme, tail)}`;
}

/**
 * Restyles an error row: `◆ Run … exit 2`, `◆ edit  ENOENT: no such file`. The line keeps the
 * theme's `error` colour — the marker, the tool name and the exit code carry the weight, so a
 * failure reads as a failure without a second hue.
 */
export function emphasizeError(theme: EmphasisTheme, text: string): string {
	const rest = splitMarker(text);
	const head = splitHead(rest);
	const prefix = head ? `${strong(theme, DIAMOND)} ${strong(theme, head.first)}` : strong(theme, DIAMOND);
	const body = head ? head.tail : rest.length > 0 ? ` ${rest}` : "";
	const status = STATUS.exec(body);
	const tail = status ? `${body.slice(0, status.index)}${strong(theme, status[1])}` : body;
	return theme.fg("error", `${prefix}${tail}`);
}

/**
 * Restyles a thinking label (`◆ Thinking 1,234 tokens for 1.2s`, `◆ Thought 1,234 tokens for 0.4s`)
 * **as Markdown source**.
 *
 * pi renders a thinking block by wrapping each rendered line in `fg("thinkingText")` and
 * italic, and a nested `fg` closes with a `39m` foreground reset — so text that follows the
 * accented span has to re-open the thinking colour itself, or it would fall back to the
 * terminal's default foreground instead of the theme's dim.
 */
export function emphasizeThinkingLabel(theme: EmphasisTheme, text: string): string {
	const dimmed = (value: string) => (value.length > 0 ? theme.fg("thinkingText", value) : "");
	const marker = theme.bold(theme.fg("accent", DIAMOND));
	const head = splitHead(splitMarker(text));
	if (!head) {
		return `${marker} ${dimmed(splitMarker(text))}`;
	}
	const { first, tail } = head;
	const action = theme.bold(theme.fg("accent", first));
	if (first !== "Thought" && first !== "Thinking") {
		return `${marker} ${action}${dimmed(tail)}`;
	}
	return `${marker} ${action}${styleThoughtTail(theme, tail, dimmed, dimmed)}`;
}
