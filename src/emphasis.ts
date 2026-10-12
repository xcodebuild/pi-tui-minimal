import type { Theme } from "@earendil-works/pi-coding-agent";
import { isLiveGlyph } from "./live.ts";
import { DIAMOND, ERROR_MARKER, PROMPT, THOUGHT_MARKER } from "./summaries.ts";

/**
 * Weight and accent for the one-line rows `summaries.ts` formats.
 *
 * The quiet style is dim almost everywhere, which leaves nothing to scan by. The emphasis
 * layer is the one place that decides what carries weight: the `◆` marker (or, on a row that is
 * still running, its animated glyph from `live.ts`) and the action word are accented and bold,
 * counts and paths are bold, and everything else — descriptions, merge nouns, command text, and
 * the metric column — stays in the theme's dim slot. A thinking label is the deliberate
 * exception: it wears the light `·` marker with no accent and no weight, because meta-commentary
 * should not compete with actions, and a failed row wears `×` in the error colour.
 *
 * It is a pure string transform, applied at the single choke point each row passes through
 * (`rowComponent` for tool rows, `emphasizeThinkingLabel` for thinking labels), so the
 * formatters in `summaries.ts` keep returning plain text and stay testable as text.
 */
export type EmphasisTheme = Pick<Theme, "fg" | "bold">;

/** `Read src/a.ts, test/b.ts +44 more` / `Listed 3 dirs` — one part per inspect kind. */
const MERGE_PART = /^(Read|Listed|Searched|Found) (\d+) ([a-z]+)$/;

/** `Read src/a.ts, test/b.ts +44 more` — a read part listing the paths it touched. */
const READ_PATHS = /^(Read) (.+?)( \+(\d+) more)?$/;

/**
 * Where one merged part ends and the next begins. Splitting on the kind word (rather than on
 * every `, `) keeps a read path list whole: the list carries `, ` of its own.
 */
const MERGE_BOUNDARY = /, (?=(?:Read|Listed|Searched|Found) )/;

/** `src/a.ts  +12 −3` — an expanded edit/write header. */
const DIFF_COUNTS = /^(.*) {2}(\+\d+) (−\d+)$/;

/** A metric that is a pair of line counts: `−3 +12` on an edit, `+12 −3` on a diff. */
const METRIC_EDIT = /^−(\d+) \+(\d+)$/;
const METRIC_DIFF = /^\+(\d+) −(\d+)$/;

/** A metric that is a streamed line count: `128 lines`. */
const METRIC_LINES = /^(\d+) (lines?)$/;

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

/** Splits the leading marker off a canonical row: `◆ `, `· `, `× `, or a live glyph + gap. */
function takeMarker(text: string): { marker: string; rest: string } {
	if (isMarker(text)) {
		return { marker: text, rest: "" };
	}
	const head = /^(\S) /.exec(text);
	const glyph = head?.[1];
	if (glyph !== undefined && isMarker(glyph)) {
		return { marker: glyph, rest: text.slice(glyph.length + 1) };
	}
	// A caller that left the marker off gets `◆`; only a live row ever spells its glyph out.
	return { marker: DIAMOND, rest: text };
}

/** Whether `text` is one of the markers a row may open with. */
function isMarker(text: string): boolean {
	return text === DIAMOND || text === THOUGHT_MARKER || text === ERROR_MARKER || isLiveGlyph(text);
}

/** Splits a row body into its first word (the action) and everything after it. */
function splitHead(text: string): { first: string; tail: string } | undefined {
	const match = /^(\S+)([\s\S]*)$/.exec(text);
	return match ? { first: match[1], tail: match[2] } : undefined;
}

/** Styling for a whole merged inspect line, or undefined when `rest` is not one. */
function styleMerge(theme: EmphasisTheme, rest: string, body: BodyStyle): string | undefined {
	const parts = rest.split(MERGE_BOUNDARY);
	const styled: string[] = [];
	for (const part of parts) {
		const paths = READ_PATHS.exec(part);
		if (paths && !MERGE_PART.test(part)) {
			const hidden = paths[3] ? body(paths[3]) : "";
			styled.push(`${accent(theme, paths[1])} ${strong(theme, paths[2])}${hidden}`);
			continue;
		}
		const match = MERGE_PART.exec(part);
		if (!match) {
			return undefined;
		}
		styled.push(`${accent(theme, match[1])} ${strong(theme, match[2])} ${body(match[3])}`);
	}
	return styled.join(body(", "));
}

/**
 * Restyles a thinking tail: ` 1,234 tokens` and ` for 1.2s`, both deliberately plain. Used by a
 * thinking header (`Thinking` / `Thought`); a run row's clock is part of its dim summary instead.
 *
 * `sep` paints the plain text in the colour of the surrounding label, and `value` paints the
 * count. A tool row needs no wrapper on the value (the bold span re-opens it itself); the
 * Markdown of a thinking block does, because a nested colour span ends with a foreground reset
 * — without it ` 1,234 tokens` would fall back to the terminal's default colour.
 */
function styleThoughtTail(
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
		styled += `${sep(" ")}${value(parts.tokens)}`;
	}
	if (parts.duration) {
		styled += sep(` for ${parts.duration}`);
	}
	return styled;
}

/**
 * The marker as it is painted: `◆` accented, a live glyph accented and bold, `·` dim, `×` in the
 * error colour. Nothing else about a row changes while it runs, so the marker is the whole
 * running/settled cue.
 */
function markerAccent(theme: EmphasisTheme, marker: string): string {
	if (marker === DIAMOND) {
		return accent(theme, DIAMOND);
	}
	if (marker === THOUGHT_MARKER) {
		return dim(theme, THOUGHT_MARKER);
	}
	if (marker === ERROR_MARKER) {
		return theme.bold(theme.fg("error", ERROR_MARKER));
	}
	return theme.bold(theme.fg("accent", marker));
}

/**
 * Restyles a tool header: `◆ Run …`, `◆ Read src/a.ts, test/b.ts, Listed 3 dirs`,
 * `◆ Edit src/a.ts`, `◆ src/a.ts  +12 −3`, `◆ read src/a.ts`, `· Thought 1,234 tokens` — or the
 * same line with a live glyph in place of `◆` while the row is still running.
 *
 * Unknown shapes fall back to an accented action word plus dim text, which is the shape the
 * quiet style used for every row before the emphasis layer existed.
 */
export function emphasizeHeader(theme: EmphasisTheme, text: string): string {
	const { marker, rest } = takeMarker(text);
	const styled = markerAccent(theme, marker);
	if (rest.length === 0) {
		return styled;
	}
	// A row that is still running is the one the eye should find first, and the marker already
	// says that it is running — so the row's own text is lifted out of the dim the settled rows
	// wear. Nothing else about the row changes, and no hue is added.
	const body: BodyStyle =
		marker === DIAMOND || marker === THOUGHT_MARKER || marker === ERROR_MARKER
			? (value) => dim(theme, value)
			: (value) => theme.fg("text", value);
	return `${styled} ${styleBody(theme, rest, body)}`;
}

/** How a row paints its own text: `dim` at rest, the brighter `text` slot while it is running. */
type BodyStyle = (text: string) => string;

function styleBody(theme: EmphasisTheme, rest: string, body: BodyStyle): string {
	const merge = styleMerge(theme, rest, body);
	if (merge !== undefined) {
		return merge;
	}
	const diff = DIFF_COUNTS.exec(rest);
	if (diff) {
		return `${strong(theme, diff[1])}${body("  ")}${diffCount(theme, "toolDiffAdded", diff[2])}${body(" ")}${diffCount(theme, "toolDiffRemoved", diff[3])}`;
	}
	const writeLines = WRITE_LINES.exec(rest);
	if (writeLines) {
		return `${accent(theme, writeLines[1])} ${strong(theme, writeLines[2])}${body("  ")}${strong(theme, writeLines[3])}${body(` ${writeLines[4]}`)}`;
	}
	const editCounts = EDIT_COUNTS.exec(rest);
	if (editCounts) {
		return `${accent(theme, editCounts[1])} ${strong(theme, editCounts[2])}${body("  ")}${diffCount(theme, "toolDiffRemoved", editCounts[3])}${body(" ")}${diffCount(theme, "toolDiffAdded", editCounts[4])}`;
	}
	const head = splitHead(rest);
	if (!head) {
		return body(rest);
	}
	const { first, tail } = head;
	if (first === "Thought" || first === "Thinking") {
		return `${theme.fg("dim", first)}${styleThoughtTail(
			tail,
			body,
			(text) => theme.fg("thinkingText", text),
		)}`;
	}
	if (INSPECT_NAMES.has(first) || PATH_NAMES.has(first)) {
		return `${accent(theme, first)}${strong(theme, tail)}`;
	}
	return `${accent(theme, first)}${body(tail)}`;
}

/**
 * Restyles the measurement a row carries in its metric column: `1.2s`, `128 lines`, `−3 +12`,
 * `exit 2`. Line counts keep pi's diff colours so an added and a removed count never look alike;
 * everything else — clocks, exit codes, error text — is dim, because a measurement is not news.
 */
export function emphasizeMetric(theme: EmphasisTheme, metric: string): string {
	const lines = METRIC_LINES.exec(metric);
	if (lines) {
		return `${strong(theme, lines[1])}${dim(theme, ` ${lines[2]}`)}`;
	}
	const edit = METRIC_EDIT.exec(metric);
	if (edit) {
		return `${diffCount(theme, "toolDiffRemoved", `−${edit[1]}`)}${dim(theme, " ")}${diffCount(theme, "toolDiffAdded", `+${edit[2]}`)}`;
	}
	const diff = METRIC_DIFF.exec(metric);
	if (diff) {
		return `${diffCount(theme, "toolDiffAdded", `+${diff[1]}`)}${dim(theme, " ")}${diffCount(theme, "toolDiffRemoved", `−${diff[2]}`)}`;
	}
	return dim(theme, metric);
}

/**
 * A failed row's measurement (`exit 2`, `ENOENT: no such file`): bold, in the row's own error
 * colour rather than the dim the other measurements wear. A failure is the one thing on screen
 * that has to be found without reading.
 */
export function emphasizeErrorMetric(theme: EmphasisTheme, metric: string): string {
	return theme.bold(theme.fg("error", metric));
}

/**
 * Restyles an error row: the marker, the tool name and the exit-code or error status carry the
 * weight, and the line keeps the theme's `error` colour — so a failure reads as a failure
 * without a second hue.
 */
export function emphasizeError(theme: EmphasisTheme, text: string): string {
	// An error row is never a settled row, so the `×` marker is re-imposed whatever came in.
	const rest = takeMarker(text).rest;
	const head = splitHead(rest);
	const prefix = head
		? `${strong(theme, ERROR_MARKER)} ${strong(theme, head.first)}`
		: strong(theme, ERROR_MARKER);
	const body = head ? head.tail : rest.length > 0 ? ` ${rest}` : "";
	const status = STATUS.exec(body);
	const tail = status ? `${body.slice(0, status.index)}${strong(theme, status[1])}` : body;
	return theme.fg("error", `${prefix}${tail}`);
}

/**
 * Restyles a thinking label (`· Thinking 1,234 tokens`, `· Thought 1,234 tokens 2.4s`)
 * **as Markdown source**. A streaming label carries the live glyph instead of `·`, and keeps the
 * same plain dim treatment: the label is rebuilt on every render, so it must not settle early.
 *
 * pi renders a thinking block by wrapping each rendered line in `fg("thinkingText")` and
 * italic, and a nested `fg` closes with a `39m` foreground reset — so text that follows the
 * accented span has to re-open the thinking colour itself, or it would fall back to the
 * terminal's default foreground instead of the theme's dim.
 */
export function emphasizeThinkingLabel(theme: EmphasisTheme, text: string): string {
	const dimmed = (value: string) => (value.length > 0 ? theme.fg("thinkingText", value) : "");
	const { marker: glyph, rest } = takeMarker(text);
	const marker = dim(theme, glyph);
	const head = splitHead(rest);
	if (!head) {
		return `${marker} ${dimmed(rest)}`;
	}
	const { first, tail } = head;
	const action = theme.fg("dim", first);
	if (first !== "Thought" && first !== "Thinking") {
		return `${marker} ${action}${dimmed(tail)}`;
	}
	return `${marker} ${action}${styleThoughtTail(tail, dimmed, dimmed)}`;
}
