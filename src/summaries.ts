import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

/**
 * The settled-row marker. A row that is still running wears an animated glyph from `live.ts`
 * in its place, so the marker is what tells a finished line from a line that is still moving.
 */
export const DIAMOND = "◆";

/** Anchor on the user's own turn; the quiet theme strips the background pi would paint there. */
export const PROMPT = "❯";

export type InspectKind = "read" | "ls" | "grep" | "find";

export type InspectCounts = Partial<Record<InspectKind, number>>;

function plural(count: number, singular: string, pluralForm: string): string {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Up to two names, then the count of the rest: `a, b +44`. Same shape `command-summary.ts` uses. */
function nameList(values: readonly string[]): string {
	const unique = [...new Set(values.filter(Boolean))];
	if (unique.length <= 2) {
		return unique.join(", ");
	}
	return `${unique.slice(0, 2).join(", ")} +${unique.length - 2}`;
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
 * A read path as the merged row lists it: the shortening every collapsed row wears, cut to
 * `MAX_READ_PATH` characters because up to two of them share a line with the rest of the burst.
 */
export function shortReadPath(path: string, cwd?: string, home = homedir()): string {
	const out = shortPath(path, cwd, home);
	return out.length <= MAX_READ_PATH ? out : `${out.slice(0, MAX_READ_PATH - 1)}…`;
}

/**
 * A path as an expanded row writes it: always absolute, because the row that gave up its
 * one-line shape spends the room on the one thing worth spelling out. A `~` resolves against
 * the home directory, any other relative path against the session cwd.
 */
export function absolutePath(path: string, cwd?: string, home = homedir()): string {
	const out = path.trim();
	if (!out) {
		return "";
	}
	if (out === "~") {
		return home;
	}
	if (out.startsWith("~/")) {
		return `${home}${out.slice(1)}`;
	}
	if (isAbsolute(out)) {
		return out;
	}
	return cwd ? resolve(cwd, out) : out;
}

/**
 * One merged inspect line. Reads list the paths they touched (`Read src/a.ts, test/b.ts +44`)
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
 * Header for a run that is still going: the marker, the summary (or the raw command), and the
 * live ` for 1.2s` clock once the command has started executing. `marker` is the live glyph the
 * call site took from `live.ts`; it defaults to `◆` so the formatter stays plain text.
 */
export function formatRunLine(command: string, summary?: string, seconds?: number, marker: string = DIAMOND): string {
	const head = `${marker} Run ${summary ? summary : formatRunTitle(command)}`;
	return seconds === undefined ? head : `${head} for ${formatDuration(seconds)}`;
}

/** Header for a finished run: the verb turns past tense and the duration settles. */
export function formatRanLine(command: string, summary?: string, seconds?: number): string {
	const head = `${DIAMOND} Ran ${summary ? summary : formatRunTitle(command)}`;
	return seconds === undefined ? head : `${head} for ${formatDuration(seconds)}`;
}

/** Header for an expanded run that is still going: the full, untruncated command. */
export function formatRunFull(command: string, seconds?: number, marker: string = DIAMOND): string {
	const head = `${marker} Run ${compactCommand(command)}`;
	return seconds === undefined ? head : `${head} for ${formatDuration(seconds)}`;
}

/** Header for an expanded run that has finished: full command plus its duration. */
export function formatRanFull(command: string, seconds?: number): string {
	const head = `${DIAMOND} Ran ${compactCommand(command)}`;
	return seconds === undefined ? head : `${head} for ${formatDuration(seconds)}`;
}

export function formatRunError(command: string, exitCode?: number | string, summary?: string): string {
	const code = exitCode === undefined || exitCode === "" ? "error" : `exit ${exitCode}`;
	return `${DIAMOND} Run ${summary ? summary : formatRunTitle(command)}  ${code}`;
}

/** Header line for thinking that is still streaming; collapsed runs use `formatThought`. */
export const THINKING_HEADER = `${DIAMOND} Thinking`;

/** Thousands separators, hand-rolled because `toLocaleString` depends on the host locale. */
export function formatCount(count: number): string {
	return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `1,234 tokens` / `1 token` — the unit matches the estimator that produced the number. */
export function formatTokenCount(tokens: number): string {
	return `${formatCount(tokens)} ${tokens === 1 ? "token" : "tokens"}`;
}

/**
 * The moving parts of a thinking label, one space apart and in reading order: the count first
 * (`1,234 tokens`), then the clock (`for 1.2s`). Either part is left off when it is unknown, so
 * a restored run (`12 tokens`) and a run with no count yet (`for 1.2s`) both degrade cleanly.
 */
function thoughtTail(seconds?: number, tokens?: number): string {
	const parts: string[] = [];
	if (tokens !== undefined) {
		parts.push(formatTokenCount(tokens));
	}
	if (seconds !== undefined && !Number.isNaN(seconds)) {
		parts.push(`for ${formatDuration(seconds)}`);
	}
	return parts.join(" ");
}

/**
 * The whole live thinking view: `◆ Thinking 1,234 tokens` (or `◆ Thinking 1,234 tokens for 1.2s`
 * once the clock is running). One line, so the block below it cannot move as thinking arrives —
 * the number only grows wider, it never adds a row.
 */
export function formatThinkingTokens(tokens: number): string {
	return `${THINKING_HEADER} ${formatTokenCount(tokens)}`;
}

/** `◆ Thought 1,234 tokens for 0.4s`; either tail part is left off when it is unknown. */
export function formatThought(seconds?: number, tokens?: number): string {
	const tail = thoughtTail(seconds, tokens);
	return tail ? `${DIAMOND} Thought ${tail}` : `${DIAMOND} Thought`;
}

/**
 * The live thinking view once a run has begun: `⠸ Thinking 1,234 tokens for 1.2s`. With no
 * elapsed time yet it degrades to the count alone (`⠸ Thinking 1,234 tokens`). Thinking is the
 * longest-running row there is, so the caller hands in the live glyph it is spinning on.
 */
export function formatThinkingLive(seconds: number | undefined, tokens: number, marker: string = DIAMOND): string {
	const tail = thoughtTail(seconds, tokens);
	const head = `${marker} Thinking`;
	return tail ? `${head} ${tail}` : head;
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

export function formatDiffCounts(path: string, added: number, removed: number): string {
	return `${DIAMOND} ${path}  +${added} −${removed}`;
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
export function formatWriteLines(path: string, lines: number, marker: string = DIAMOND): string {
	return `${marker} Write ${path}  ${lines} ${lines === 1 ? "line" : "lines"}`;
}

/** `◆ Edit src/a.ts  −3 +12` — the header an `edit` row wears, old lines replaced by new ones. */
export function formatEditCounts(
	path: string,
	oldLines: number,
	newLines: number,
	marker: string = DIAMOND,
): string {
	return `${marker} Edit ${path}  −${oldLines} +${newLines}`;
}

export function formatToolError(name: string, detail: string): string {
	const trimmed = detail.trim().split("\n")[0] ?? "error";
	return `${DIAMOND} ${name}  ${trimmed}`;
}

export function diamondLine(text: string): string {
	return text.startsWith(DIAMOND) ? text : `${DIAMOND} ${text}`;
}
