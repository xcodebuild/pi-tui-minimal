/**
 * Line-level ANSI helpers for the components this extension rewrites.
 *
 * Two places reason about a rendered transcript line without its escape sequences: the
 * transcript patch (`spacing.ts`), which drops pi's blank lines and measures what is left, and
 * the prompt marker (`prompt.ts`), which splices a prefix into a line pi already rendered and
 * has to see through that line's leading escapes. They live here so both can use them without
 * importing each other.
 */

/** CSI, OSC and APC sequences — pi uses all three (OSC 133 zone markers wrap a message). */
const ESCAPE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][\s\S]*?(?:\x07|\x1b\\)|_[\s\S]*?(?:\x07|\x1b\\))/g;

/** The same pattern anchored at a position, for reading a line's leading escapes. */
const ESCAPE_AT = new RegExp(ESCAPE.source, "y");

/** The line without its escape sequences. */
export function visibleText(line: string): string {
	return line.replace(ESCAPE, "");
}

/** The escape sequences of a line, in order; `\x1b]133;A\x07` and colour codes survive. */
export function escapesOf(line: string): string {
	return line.match(ESCAPE)?.join("") ?? "";
}

/**
 * A line with no visible text; also matches pi's space-padded and escape-only filler lines
 * (an assistant message's blank carries its OSC 133 zone marker).
 */
export function isBlankLine(line: string): boolean {
	return visibleText(line).trim() === "";
}

/**
 * The run a line opens with before its first visible character: the escape sequences it walks
 * past (`escapes`, in order), how many padding columns they cover (`spaces`), and the rest.
 *
 * pi paints a prompt box by wrapping the whole padded line in `bg(…)`, so a prompt line can open
 * with an escape *before* its own padding. pi's `fg` closes with a `39m` foreground reset, so the
 * escapes a prefix walks past have to be re-emitted for the text after a spliced marker to keep
 * the colour pi had opened.
 */
export function linePrefix(line: string): { escapes: string; spaces: number; rest: string } {
	let at = 0;
	let spaces = 0;
	let escapes = "";
	for (;;) {
		ESCAPE_AT.lastIndex = at;
		const escape = ESCAPE_AT.exec(line);
		if (escape) {
			escapes += escape[0];
			at = ESCAPE_AT.lastIndex;
			continue;
		}
		if (line[at] === " ") {
			spaces += 1;
			at += 1;
			continue;
		}
		return { escapes, spaces, rest: line.slice(at) };
	}
}
