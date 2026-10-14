import { homedir } from "node:os";

/**
 * The settled-row marker. A row that is still running wears an animated glyph from `live.ts`
 * in its place, so the marker is what tells a finished line from a line that is still moving.
 */
export const DIAMOND = "◆";

/**
 * The marker a thinking label wears (`· Thinking 1,234 tokens`). Thinking is meta-commentary
 * rather than an action, so it steps back: a light marker, dim text, no accent, no weight.
 */
export const THOUGHT_MARKER = "·";

/** The marker a failed row wears, so a failure reads as one before its colour does. */
export const ERROR_MARKER = "×";

/** Anchor on the user's own turn; the quiet theme strips the background pi would paint there. */
export const PROMPT = "❯";

/**
 * One row, split where its layout needs it: the title is what the row says, the metric is the
 * measurement that trails it. Keeping the two apart is what lets the layout book room for a late
 * measurement before wrapping; the formatters below stay plain text so they stay assertable, and
 * `joinRow` rebuilds the one-line shape the transcript used before the split existed.
 */
export type RowParts = {
	title: string;
	metric?: string;
	/**
	 * Columns to keep free for a metric that appears or grows later — a clock that starts at 1s, a
	 * line count that climbs while the file streams. Reserving them is what keeps a row's height
	 * the same while it runs and after it settles.
	 */
	metricReserve?: number;
};

/** The widest a measurement may be and still trail its title rather than fold back into it as prose. */
export const METRIC_COLUMN_MAX = 24;

/** Room for the widest clock (`1h 2m 3s`); rows that can carry one reserve it from the start. */
export const CLOCK_RESERVE = 8;

/** Room for the widest streamed count (`12,345 lines` / `−1,234 +5,678`). */
export const COUNT_RESERVE = 12;

/** The one-line shape of a row: the metric trails the title. Used by the pre-split callers. */
export function joinRow(parts: RowParts): string {
	return parts.metric === undefined ? parts.title : `${parts.title}  ${parts.metric}`;
}

/**
 * The clock a row carries as its metric, or nothing while the row has no duration to show.
 *
 * A run that took a tenth of a second is not worth a measurement: drawing `0.0s` next to it
 * spends nine columns of the row and a metric slot on nothing. The
 * live glyph is what says a row is still moving, so a sub-second row drops its clock too.
 */
function clockMetric(seconds?: number): string | undefined {
	return seconds === undefined || !Number.isFinite(seconds) || seconds < 1 ? undefined : formatDuration(seconds);
}

/**
 * The shape of a clocked row with no column to align to — a one-line label drawn by a renderer
 * this extension does not own (the hidden-thinking label): the measurement trails as ` for 1.2s`.
 */
export function joinInlineRow(parts: RowParts): string {
	return parts.metric === undefined ? parts.title : `${parts.title} for ${parts.metric}`;
}

/** The same, for the callers that predate the metric. */
function inlineClock(parts: RowParts): string {
	return joinInlineRow(parts);
}

export type InspectKind = "read" | "ls" | "grep" | "find";

export type InspectCounts = Partial<Record<InspectKind, number>>;

function plural(count: number, singular: string, pluralForm: string): string {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Up to two names, then the count of the rest: `a, b +44 more`. */
function nameList(values: readonly string[]): string {
	const unique = [...new Set(values.filter(Boolean))];
	if (unique.length <= 2) {
		return unique.join(", ");
	}
	return `${unique.slice(0, 2).join(", ")} +${unique.length - 2} more`;
}

const MAX_READ_PATH = 40;

/**
 * A path as a collapsed row writes it: relative to the session's cwd when it is inside it,
 * `~`-shortened when it is under the home directory, otherwise as the model wrote it. The
 * expanded row uses `absolutePath` instead, so the two states describe the same file.
 */
export function shortPath(path: string, cwd?: string, home = homedir()): string {
	let out = path.trim().replace(/^\.\//, "");
	if (!out) {
		return "";
	}
	if (cwd && out.startsWith(`${cwd.replace(/\/+$/, "")}/`)) {
		out = out.slice(cwd.replace(/\/+$/, "").length + 1);
	} else if (home && (out === home || out.startsWith(`${home}/`))) {
		out = `~${out.slice(home.length)}`;
	}
	return out;
}

/**
 * A read path as the merged row lists it: the shortening every collapsed row wears, elided to
 * `MAX_READ_PATH` characters because up to two of them share a line with the rest of the burst.
 */
export function shortReadPath(path: string, cwd?: string, home = homedir()): string {
	return elideMiddle(shortPath(path, cwd, home), MAX_READ_PATH);
}

/** Longest path an expanded row prints before it, too, is elided. */
const MAX_EXPANDED_PATH = 72;

/**
 * A path as an expanded row writes it: the same shortening a collapsed row wears — relative to
 * the session's cwd, `~`-prefixed under the home directory — because a full absolute path spends
 * the whole row on directories the user already knows. Only a path outside both roots, and one
 * longer than `MAX_EXPANDED_PATH`, is elided; the elision is from the left, so the file name is
 * the last thing given up.
 */
export function longPath(path: string, cwd?: string, home = homedir()): string {
	return elideStart(shortPath(path, cwd, home), MAX_EXPANDED_PATH);
}

/** `…/to/file.ts` — everything before the tail is dropped, so the tail stays readable. */
function elideStart(value: string, max: number): string {
	return value.length <= max ? value : `…${value.slice(value.length - max + 1)}`;
}

/**
 * A path elided in the middle so its file name survives: `src/very/…/file.ts`.
 *
 * The name is what identifies the file, so cutting from the right — which is what this used to
 * do — loses the only part of the path worth reading. The head keeps as many leading directory
 * segments as fit; a file name longer than the whole budget is cut from the left instead.
 */
export function elideMiddle(path: string, max: number): string {
	if (path.length <= max || max < 3) {
		return path;
	}
	const slash = path.lastIndexOf("/");
	const name = slash >= 0 ? path.slice(slash + 1) : path;
	if (name.length + 2 >= max) {
		return elideStart(name, max);
	}
	const head = path.slice(0, max - name.length - 2);
	const cut = head.lastIndexOf("/");
	const kept = cut >= 0 ? head.slice(0, cut + 1) : "";
	return `${kept}…/${name}`;
}

/**
 * One merged inspect line. Reads list the paths they touched (`Read src/a.ts, test/b.ts +44 more`)
 * when the callers recorded them, and fall back to their count when they did not; every other
 * kind counts.
 */
export function formatInspectMerge(counts: InspectCounts, reads: readonly string[] = []): string {
	const parts: string[] = [];
	if (counts.read) {
		const listed = nameList(reads);
		parts.push(listed ? `Read ${listed}` : `Read ${plural(counts.read, "file", "files")}`);
	}
	if (counts.ls) {
		parts.push(`Listed ${plural(counts.ls, "dir", "dirs")}`);
	}
	if (counts.grep) {
		parts.push(`Searched ${plural(counts.grep, "pattern", "patterns")}`);
	}
	if (counts.find) {
		parts.push(`Found ${plural(counts.find, "pattern", "patterns")}`);
	}
	return parts.join(", ");
}

/**
 * One merged line for a run of quick commands: `Ran 3 commands: git status, npm test +1 more`, with the
 * time they took together in the metric. Only runs that each settled in under a second are
 * covered, so the line never hides work that took real time.
 */
export function runMergeParts(count: number, summaries: readonly string[], seconds?: number): RowParts {
	return {
		title: `${DIAMOND} Ran ${plural(count, "command", "commands")}: ${nameList(summaries)}`,
		metric: clockMetric(seconds),
		metricReserve: CLOCK_RESERVE,
	};
}

const MAX_RUN_TITLE = 72;

/** Collapse a command into a single readable line, dropping redirect noise. */
export function compactCommand(command: string): string {
	return command
		.replace(/\s*\d?>>?&?\d*\s*\/dev\/null/g, "")
		.replace(/\s*\d?>&\d+/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Fallback title for commands the heuristic summarizer cannot classify. */
export function formatRunTitle(command: string): string {
	const compact = compactCommand(command);
	if (compact.length <= MAX_RUN_TITLE) {
		return compact;
	}
	return `${compact.slice(0, MAX_RUN_TITLE - 3)}...`;
}

/**
 * A duration the way pi's own shell renderer writes it: `1.2s`, `1m 5s`, `1h 2m 3s`.
 * Used by the live run clock and by the thinking header, so both tick in the same shape.
 */
export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) {
		return "0.0s";
	}
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const total = Math.floor(seconds);
	const minutes = Math.floor(total / 60);
	const remainder = total % 60;
	if (minutes < 60) {
		return `${minutes}m ${remainder}s`;
	}
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${remainder}s`;
}

/**
 * Header for a run that is still going: the marker, the title, and (once the command has started)
 * the live clock. `marker` is the live glyph the call site took from `live.ts`; `◆` keeps the
 * formatter plain-text for callers that do not have one.
 */
export function runParts(command: string, summary?: string, seconds?: number, marker: string = DIAMOND): RowParts {
	return {
		title: `${marker} Run ${summary ? summary : formatRunTitle(command)}`,
		metric: clockMetric(seconds),
		metricReserve: CLOCK_RESERVE,
	};
}

/** Header for a finished run: the verb turns past tense and the clock settles. */
export function ranParts(command: string, summary?: string, seconds?: number): RowParts {
	return {
		title: `${DIAMOND} Ran ${summary ? summary : formatRunTitle(command)}`,
		metric: clockMetric(seconds),
		metricReserve: CLOCK_RESERVE,
	};
}

/** Header for an expanded run that is still going: the full, untruncated command. */
export function runFullParts(command: string, seconds?: number, marker: string = DIAMOND): RowParts {
	return {
		title: `${marker} Run ${compactCommand(command)}`,
		metric: clockMetric(seconds),
		metricReserve: CLOCK_RESERVE,
	};
}

/** Header for an expanded run that has finished: full command plus its duration. */
export function ranFullParts(command: string, seconds?: number): RowParts {
	return {
		title: `${DIAMOND} Ran ${compactCommand(command)}`,
		metric: clockMetric(seconds),
		metricReserve: CLOCK_RESERVE,
	};
}

/** A failed run: the title, with the exit code as the measurement. */
export function runErrorParts(command: string, exitCode?: number | string, summary?: string): RowParts {
	const code = exitCode === undefined || exitCode === "" ? "error" : `exit ${exitCode}`;
	return {
		title: `${ERROR_MARKER} Run ${summary ? summary : formatRunTitle(command)}`,
		metric: code,
	};
}

export function formatRunLine(command: string, summary?: string, seconds?: number, marker: string = DIAMOND): string {
	return inlineClock(runParts(command, summary, seconds, marker));
}

export function formatRanLine(command: string, summary?: string, seconds?: number): string {
	return inlineClock(ranParts(command, summary, seconds));
}

export function formatRunFull(command: string, seconds?: number, marker: string = DIAMOND): string {
	return inlineClock(runFullParts(command, seconds, marker));
}

export function formatRanFull(command: string, seconds?: number): string {
	return inlineClock(ranFullParts(command, seconds));
}

export function formatRunError(command: string, exitCode?: number | string, summary?: string): string {
	return joinRow(runErrorParts(command, exitCode, summary));
}

/** Header line for thinking that is still streaming; collapsed runs use the `Thought` form. */
export const THINKING_HEADER = `${THOUGHT_MARKER} Thinking`;

/** Thousands separators, hand-rolled because `toLocaleString` depends on the host locale. */
export function formatCount(count: number): string {
	return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `1,234 tokens` / `1 token` — the unit matches the estimator that produced the number. */
export function formatTokenCount(tokens: number): string {
	return `${formatCount(tokens)} ${tokens === 1 ? "token" : "tokens"}`;
}

/**
 * The whole live thinking view: the header, then the count of what has arrived so far. One line,
 * so the block below it cannot move as thinking arrives — the number only grows wider.
 *
 * The count stays in the title rather than the metric: it is what makes the row worth
 * reading, and keeping it next to the word leaves the column for the clock.
 */
export function thinkingParts(tokens?: number, marker: string = THOUGHT_MARKER, seconds?: number): RowParts {
	const head = `${marker} Thinking`;
	return {
		title: tokens === undefined ? head : `${head} ${formatTokenCount(tokens)}`,
		metric: clockMetric(seconds),
		metricReserve: CLOCK_RESERVE,
	};
}

export function formatThinkingTokens(tokens: number): string {
	return joinRow(thinkingParts(tokens));
}

/** `· Thought 1,234 tokens` plus, once it is known, the clock as the row's measurement. */
export function thoughtParts(seconds?: number, tokens?: number, marker: string = THOUGHT_MARKER): RowParts {
	const head = `${marker} Thought`;
	return {
		title: tokens === undefined ? head : `${head} ${formatTokenCount(tokens)}`,
		metric: clockMetric(seconds),
		metricReserve: CLOCK_RESERVE,
	};
}

export function formatThought(seconds?: number, tokens?: number): string {
	return inlineClock(thoughtParts(seconds, tokens));
}

/**
 * The live thinking view once a run has begun: the marker (the live glyph the caller is spinning
 * on), the word, the count so far, and the clock as the row's measurement.
 */
export function formatThinkingLive(seconds: number | undefined, tokens: number, marker: string = THOUGHT_MARKER): string {
	return inlineClock(thinkingParts(tokens, marker, seconds));
}

export function countDiffStats(diffText: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diffText.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) {
			added++;
		} else if (line.startsWith("-") && !line.startsWith("---")) {
			removed++;
		}
	}
	return { added, removed };
}

export function diffParts(path: string, added: number, removed: number): RowParts {
	return { title: `${DIAMOND} ${path}`, metric: `+${added} −${removed}` };
}

export function formatDiffCounts(path: string, added: number, removed: number): string {
	return joinRow(diffParts(path, added, removed));
}

/** Newlines in a text block; the basis for the incremental counter `tools.ts` keeps per stream. */
export function countNewlines(text: string): number {
	let count = 0;
	for (let index = 0; index < text.length; index++) {
		if (text.charCodeAt(index) === 10) {
			count++;
		}
	}
	return count;
}

/** Lines in a text block: a trailing newline closes the last line instead of adding one. */
export function countLines(text: string): number {
	if (text.length === 0) {
		return 0;
	}
	const newlines = countNewlines(text);
	return text.endsWith("\n") ? newlines : newlines + 1;
}

/** `◆ Write src/a.ts  128 lines` — the header a `write` row wears while and after it streams. */
/** `◆ Write src/a.ts` with `128 lines` as the row's measurement. */
export function writeParts(path: string, lines: number, marker: string = DIAMOND): RowParts {
	return {
		title: `${marker} Write ${path}`,
		metric: `${lines} ${lines === 1 ? "line" : "lines"}`,
		metricReserve: COUNT_RESERVE,
	};
}

export function formatWriteLines(path: string, lines: number, marker: string = DIAMOND): string {
	return joinRow(writeParts(path, lines, marker));
}

/** `◆ Edit src/a.ts` with `−3 +12` as the row's measurement. */
export function editParts(path: string, oldLines: number, newLines: number, marker: string = DIAMOND): RowParts {
	return {
		title: `${marker} Edit ${path}`,
		metric: `−${oldLines} +${newLines}`,
		metricReserve: COUNT_RESERVE,
	};
}

export function formatEditCounts(path: string, oldLines: number, newLines: number, marker: string = DIAMOND): string {
	return joinRow(editParts(path, oldLines, newLines, marker));
}

/** A failed row: the tool name and its argument, with the failure as the measurement. */
export function toolErrorParts(name: string, detail: string): RowParts {
	const trimmed = detail.trim().split("\n")[0] ?? "error";
	return { title: `${ERROR_MARKER} ${name}`, metric: trimmed };
}

export function formatToolError(name: string, detail: string): string {
	return joinRow(toolErrorParts(name, detail));
}

export function diamondLine(text: string): string {
	return text.startsWith(DIAMOND) ? text : `${DIAMOND} ${text}`;
}
