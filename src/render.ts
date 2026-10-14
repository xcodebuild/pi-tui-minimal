import { Container, Text, type Component, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { emphasizeError, emphasizeErrorMetric, emphasizeHeader, emphasizeMetric } from "./emphasis.ts";
import { METRIC_COLUMN_MAX, type RowParts } from "./summaries.ts";

/**
 * The components the quiet rows are built from.
 *
 * A still-running tool row is only its one-line header: no output block is drawn while a call
 * runs, so the row's height does not change between the running and the settled view (the output
 * is what `Ctrl+O` expands). An output block that appeared and then collapsed would move the
 * transcript by its height twice per call, and pi repaints the whole screen — clearing the
 * scrollback with it — when the content it is drawing shrinks (`TuiMainScreen`'s clear-on-shrink
 * branch), which reads as a flash.
 */

/** Columns every agent row starts with, so prose and machinery do not share a left edge. */
export const GUTTER = 2;

/** Extra columns a wrapped continuation line gets, so it clears the row's marker. */
export const HANGING_INDENT = 2;

/** Least gap between a title and its metric, so a number never touches the text before it. */
export const METRIC_GAP = 2;

function spaces(count: number): string {
	return " ".repeat(Math.max(0, count));
}

/**
 * Wrap `text` so that every line fits `width`, with continuation lines indented past the marker.
 *
 * `wrapTextWithAnsi` wraps every line of a paragraph to one width, and a continuation line here
 * is indented, so it would be `HANGING_INDENT` columns too wide if the text were wrapped at the
 * full width. The text is wrapped at `width` first — a single line then costs nothing — and only
 * a title that actually wraps is re-wrapped at the narrower width.
 */
function wrapIndented(text: string, width: number): string[] {
	const lines = wrapTextWithAnsi(text, width);
	if (lines.length <= 1) {
		return lines;
	}
	return wrapTextWithAnsi(text, Math.max(1, width - HANGING_INDENT));
}

/**
 * One row, laid out for a given width: the gutter, the hanging indent, and the metric.
 *
 * A row's metric trails its title on the same line, after the minimum gap — normal left-to-right
 * flow, with no fixed column to line the numbers up against. Room for a late metric is booked
 * *before* wrapping (`metricReserve`), so a clock that appears after a second, or a line count
 * that climbs while a file streams, cannot add a line and shift the transcript below it. When the
 * title has used the whole width and the metric no longer fits, the metric takes a line of its
 * own below the title.
 *
 * A measurement too wide to be a metric is prose: it goes back into the title and wraps with it,
 * which is what keeps a long error message readable instead of forcing it into a margin.
 */
export function layoutRow(parts: RowParts, width: number): string[] {
	const rowWidth = Math.max(1, width);
	// The width a metric occupies is the width of its *text*, which is what `metricReserve` carries
	// when the string handed in is styled: a styled metric's escapes are not measurable without the
	// theme that produced them, and a caller that reserved room for one knows its plain width.
	const plainWidth = parts.metric === undefined ? 0 : visibleWidth(parts.metric);
	const columnWidth = Math.max(parts.metricReserve ?? 0, plainWidth);
	const asColumn = parts.metric !== undefined && parts.metric.length > 0 && columnWidth <= METRIC_COLUMN_MAX;
	const metric = asColumn ? parts.metric : undefined;
	// A measurement too wide to be a column is prose: it goes back into the title and wraps with it.
	const title = metric === undefined && parts.metric ? `${parts.title}  ${parts.metric}` : parts.title;
	if (title.length === 0 && metric === undefined) {
		return [];
	}
	const avail = Math.max(1, rowWidth - GUTTER);
	const ceiling = Math.max(0, avail - METRIC_GAP - 1);
	const wanted = metric !== undefined ? columnWidth : parts.metric === undefined ? (parts.metricReserve ?? 0) : 0;
	const reserve = Math.min(wanted, ceiling);
	const titleWidth = reserve > 0 ? Math.max(1, avail - METRIC_GAP - reserve) : avail;
	const lines = (title.length > 0 ? wrapIndented(title, titleWidth) : []).map(
		(line, index) => `${spaces(GUTTER + (index === 0 ? 0 : HANGING_INDENT))}${line}`,
	);
	if (metric === undefined) {
		return lines;
	}
	if (lines.length === 0) {
		return [`${spaces(GUTTER)}${metric}`];
	}
	const last = lines.length - 1;
	const used = visibleWidth(lines[last] as string);
	if (used + METRIC_GAP + columnWidth <= rowWidth) {
		lines[last] = `${lines[last]}${spaces(METRIC_GAP)}${metric}`;
		return lines;
	}
	lines.push(`${spaces(GUTTER)}${metric}`);
	return lines;
}

/**
 * An expanded block of captured output (a diff, a command's stdout): wrapped, then indented the
 * same way a row is, so it reads as belonging to the row above it rather than to the transcript.
 * The text arrives already coloured (one line at a time, or as one span), so the wrapping has to
 * preserve its escapes — `wrapTextWithAnsi` does.
 */
export function layoutOutput(text: string, width: number): string[] {
	if (text.length === 0) {
		return [];
	}
	const avail = Math.max(1, width - GUTTER);
	const lines: string[] = [];
	for (const raw of text.split("\n")) {
		for (const [index, line] of wrapIndented(raw, avail).entries()) {
			lines.push(`${spaces(GUTTER + (index === 0 ? 0 : HANGING_INDENT))}${line}`);
		}
	}
	return lines;
}

/**
 * The component a quiet row is drawn with: `render(width)` is `layoutRow`, so the gutter, the
 * hanging indent and the metric are all decided where the width is known.
 */
class RowComponent implements Component {
	private readonly parts: RowParts;

	constructor(parts: RowParts) {
		this.parts = parts;
	}

	render(width: number): string[] {
		return layoutRow(this.parts, width);
	}

	invalidate(): void {
		// The parts are immutable strings; there is no cache to drop.
	}
}

/** An expanded block of captured output, laid out the way a row is. */
class OutputComponent implements Component {
	private readonly text: string;

	constructor(text: string) {
		this.text = text;
	}

	render(width: number): string[] {
		return layoutOutput(this.text, width);
	}

	invalidate(): void {}
}

export function emptyComponent(): Component {
	return new Text("", 0, 0);
}

export function lineComponent(text: string): Component {
	return new RowComponent({ title: text });
}

export function dimLine(theme: Theme, text: string): Component {
	return new RowComponent({ title: theme.fg("dim", text) });
}

/** Tool rows go through here, so this is where the emphasis layer styles them. */
export function rowComponent(theme: Theme, parts: RowParts): Component {
	return new RowComponent(styleParts(theme, emphasizeHeader, emphasizeMetric, parts));
}

/** The plain width of a metric, carried alongside the styled one so it can be measured. */
function styleParts(
	theme: Theme,
	styleTitle: (theme: Theme, title: string) => string,
	styleMetric: (theme: Theme, metric: string) => string,
	parts: RowParts,
): RowParts {
	const styled = styleTitle(theme, parts.title);
	if (parts.metric === undefined) {
		return { ...parts, title: styled };
	}
	return {
		...parts,
		title: styled,
		metric: styleMetric(theme, parts.metric),
		metricReserve: Math.max(parts.metricReserve ?? 0, visibleWidth(parts.metric)),
	};
}

/** A failed row: the error colour and the bold marker, name and status, laid out like any row. */
export function errorRowComponent(theme: Theme, parts: RowParts): Component {
	return new RowComponent(styleParts(theme, emphasizeError, emphasizeErrorMetric, parts));
}

export function headerLine(theme: Theme, text: string): Component {
	return rowComponent(theme, { title: text });
}

export function errorLine(theme: Theme, text: string): Component {
	return errorRowComponent(theme, { title: text });
}

/** An expanded block of captured output; the caller colours it, this only lays it out. */
export function outputBlock(text: string): Component {
	return new OutputComponent(text);
}

/**
 * A row that is substituted into the transcript instead of being rendered by a component of its
 * own (the questionnaire, the FFF tools, any other package's tool). `parts` is plain text — the
 * emphasis layer styles it here — and `output` is the expanded detail, already coloured, one line
 * each. `error` picks the failed-row emphasis: the `×` marker and the error colour.
 */
export type QuietRow = {
	parts: RowParts;
	error?: boolean;
	output?: string[];
};

/** Lay a substituted row out: emphasis first, then the gutter, the hanging indent and the column. */
export function layoutQuietRow(theme: Theme, row: QuietRow, width: number): string[] {
	const component = row.error ? errorRowComponent(theme, row.parts) : rowComponent(theme, row.parts);
	const lines = component.render(width);
	if (!row.output || row.output.length === 0) {
		return lines;
	}
	return [...lines, ...layoutOutput(row.output.join("\n"), width)];
}

export function stack(header: Component, body?: Component): Component {
	const container = new Container();
	container.addChild(header);
	if (body) {
		container.addChild(body);
	}
	return container;
}

/**
 * Colours a unified diff: added lines in `toolDiffAdded`, removed ones in `toolDiffRemoved`.
 */
export function colorDiff(theme: Theme, diffText: string): string {
	return diffText
		.split("\n")
		.map((line) => {
			if (line.startsWith("+") && !line.startsWith("+++")) {
				return theme.fg("toolDiffAdded", line);
			}
			if (line.startsWith("-") && !line.startsWith("---")) {
				return theme.fg("toolDiffRemoved", line);
			}
			return theme.fg("toolDiffContext", line);
		})
		.join("\n");
}

export function resultText(
	result:
		| {
				content?: Array<{ type: string; text?: string }>;
		  }
		| undefined,
): string {
	if (!result?.content) {
		return "";
	}
	return result.content
		.filter((block) => block.type === "text" && block.text)
		.map((block) => block.text ?? "")
		.join("\n");
}
