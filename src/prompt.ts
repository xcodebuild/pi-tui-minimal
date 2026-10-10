import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { isBlankLine, linePrefix } from "./ansi.ts";
import { emphasizePromptMarker } from "./emphasis.ts";

/**
 * The `❯` that anchors the user's own turn in the quiet transcript.
 *
 * pi gives a prompt a filled rectangle: `UserMessageComponent.rebuild` builds its content as
 * `new Box(outputPad, 1, content => theme.bg("userMessageBg", content))`. The quiet style strips
 * that slot (`theme.ts`), so the user's turn loses the one thing that made it scannable and the
 * blank line above it carries the whole boundary. This module puts an anchor back: the first
 * line that carries text gets the accented `❯`, the marker the rest of the transcript already
 * keys off.
 *
 * The marker is paid for by the line's own left padding. It therefore costs no columns (the row
 * still fills `width`) and no rows (the line count is untouched, so `mouseLayout`, click routing
 * and the tightened transcript below all keep their coordinates). Only that one line is
 * rewritten; pi's Markdown rendering of the prompt — tables, code blocks, its wraps — is left
 * exactly as pi produced it. That is why this **splices into the rendered lines** instead of
 * rebuilding them the way `questionnaire.ts` and `rows.ts` do for rows pi does not render for us.
 *
 * The escapes the line opens with are re-emitted after the marker, because pi wraps the whole
 * padded prompt line in `bg(…)` and `fg(…)` closes with a `39m` reset: without the re-emit, the
 * prompt text would lose the colour pi opened and the marker would sit outside the band pi paints.
 *
 * The row is recognised by `UserMessageComponent`'s own fields (`text`, `outputPad` and
 * `markdownTransformers`, and neither an assistant message's `contentContainer` nor a tool row's
 * `toolCallId`), so a pi release that renames them makes this return `undefined` and the prompt
 * keeps pi's own rendering instead of breaking.
 */

type AnyComponent = Record<string, any>;

/** pi's `UserMessageComponent` — the prompt box, and nothing else in the transcript. */
export function isPromptRow(component: AnyComponent | undefined): component is AnyComponent {
	return (
		!!component &&
		typeof component.text === "string" &&
		typeof component.outputPad === "number" &&
		Array.isArray(component.markdownTransformers) &&
		!("contentContainer" in component) &&
		!("toolCallId" in component)
	);
}

/**
 * The prompt's lines with `❯` on the first line that carries text, or `undefined` for any other
 * row (and for the empty message a restored session can hold).
 */
export function promptLines(
	component: AnyComponent | undefined,
	lines: string[],
	theme: Theme,
	width: number,
): string[] | undefined {
	if (!isPromptRow(component)) {
		return undefined;
	}
	const index = lines.findIndex((line) => !isBlankLine(line));
	if (index < 0) {
		return undefined;
	}
	const line = lines[index] ?? "";
	const marker = emphasizePromptMarker(theme);
	const markerWidth = visibleWidth(marker);
	// The box's leading spaces used to sit under the background pi painted; now they pay for the
	// marker, and a padding shorter than the marker is topped up from the row's trailing filler.
	const { escapes, spaces, rest } = linePrefix(line);
	const kept = Math.max(0, spaces - markerWidth);
	const marked = `${marker}${escapes}${" ".repeat(kept)}${rest}`;
	// Markdown wraps a prompt to `width - 2`, so the shortfall is always filler and never text.
	const fitted = width > 0 && visibleWidth(marked) > width ? truncateToWidth(marked, width, "") : marked;
	return lines.map((current, at) => (at === index ? fitted : current));
}
