import {
	SettingsManager,
	type ExtensionAPI,
	type ExtensionContext,
	type MarkdownTransformer,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	joinInlineRow,
	THINKING_HEADER,
	THOUGHT_MARKER,
	thoughtParts,
	thinkingParts,
	type RowParts,
} from "./summaries.ts";
import { liveGlyph } from "./live.ts";
import { emphasizeMetric, emphasizeThinkingLabel, type EmphasisTheme } from "./emphasis.ts";
import { GUTTER, layoutRow } from "./render.ts";

/**
 * Characters per token for the live estimate. pi uses the same divisor for its own context
 * estimate (`estimateTokens2` in the compaction helpers), so the number on screen is counted
 * the way pi counts the thinking it replays.
 */
export const CHARS_PER_TOKEN = 4;

/** Approximate tokens in a thinking run; the divisor makes it the same estimate pi would make. */
export function estimateThinkingTokens(markdown: string): number {
	return Math.ceil(markdown.length / CHARS_PER_TOKEN);
}

/** Collapsed label for a run whose text an extension never got to count. */
export const UNKNOWN_THOUGHT_LABEL = joinInlineRow(thoughtParts());

/** Finished runs kept for relabelling on re-render; FIFO so a long session cannot grow without bound. */
const FINISHED_RUN_LIMIT = 256;

export type ThinkingMessage = {
	role?: string;
	content?: string | readonly { type?: string; text?: string; thinking?: string }[];
};

/**
 * pi renders adjacent thinking blocks as one section, so a run is the longest stretch of
 * consecutive `thinking` entries in a message, joined by a blank line. Blocks are trimmed
 * exactly the way pi trims them, which makes these strings identical to the Markdown pi
 * hands to the transformer.
 */
export function thinkingRunsFromMessage(message: ThinkingMessage): string[] {
	if (message.role !== "assistant" || !Array.isArray(message.content)) {
		return [];
	}
	const runs: string[] = [];
	let run: string[] = [];
	for (const block of message.content) {
		if (block.type === "thinking") {
			const text = block.thinking?.trim();
			if (text) {
				run.push(text);
			}
			continue;
		}
		if (run.length > 0) {
			runs.push(run.join("\n\n"));
			run = [];
		}
	}
	if (run.length > 0) {
		runs.push(run.join("\n\n"));
	}
	return runs;
}

/**
 * Streaming view: the `⠸ Thinking 1,234 tokens 1.2s` label (the live glyph is the caller's;
 * `marker` defaults to the light `·` for callers that want the settled, plain form), on one line.
 *
 * The thinking text itself is not shown while it streams, so the block never changes height —
 * the clock and the count are the only things that move, and a wider number cannot push the
 * transcript below it. The count is an estimate (`CHARS_PER_TOKEN`) rather than provider usage,
 * because no usage figures reach an extension while the message is still streaming; pi only
 * folds them in when the stream ends. The elapsed seconds are only drawn once the controller
 * has stamped a start time, so a bare `thinkingStream(text)` degrades to the count alone.
 *
 * `styleLabel` restyles the line for display; it defaults to identity so the Markdown this
 * returns is still the plain, assertable text the tests read.
 */
/** How the label is painted, and how wide it may be. */
export type ThinkingLabelStyle = {
	/** Styles the label's own text: the marker, the word, the count. */
	styleLabel?: (text: string) => string;
	/** Styles the clock; defaults to the label's own styler. */
	styleMetric?: (text: string) => string;
	/** The live glyph a streaming run wears instead of the light `·`. */
	marker?: string;
	/**
	 * Columns the label may use. With a width, the clock is right-aligned into the same metric
	 * column the tool rows use; without one (the hidden-thinking label, or a test), it trails the
	 * count as ` for 1.2s`.
	 */
	width?: number;
};

/** The label's parts with the caller's styling applied, keeping the metric's plain width. */
function styleParts(parts: RowParts, style: ThinkingLabelStyle): RowParts {
	const styleLabel = style.styleLabel ?? ((text: string) => text);
	const styleMetric = style.styleMetric ?? styleLabel;
	return {
		...parts,
		title: styleLabel(parts.title),
		metric: parts.metric === undefined ? undefined : styleMetric(parts.metric),
		metricReserve: parts.metric === undefined ? 0 : visibleWidth(parts.metric),
	};
}

/**
 * One label line: the count in the row, the clock in the metric column when there is a column to
 * put it in. A label that would have to wrap keeps the inline form instead — thinking is the one
 * row that has to stay a single line, so its height cannot depend on the terminal's width.
 */
function labelLine(parts: RowParts, style: ThinkingLabelStyle): string {
	const styled = styleParts(parts, style);
	if (style.width === undefined) {
		return joinInlineRow(styled);
	}
	const lines = layoutRow(styled, style.width);
	return lines.length === 1 ? (lines[0] as string) : `${" ".repeat(GUTTER)}${joinInlineRow(styled)}`;
}

export function thinkingStream(markdown: string, seconds?: number, style: ThinkingLabelStyle = {}): string {
	if (markdown.trim().length === 0) {
		return markdown;
	}
	return labelLine(thinkingParts(estimateThinkingTokens(markdown), style.marker ?? THOUGHT_MARKER, seconds), style);
}

/**
 * Whether pi is currently hiding thinking blocks. An extension cannot change that setting,
 * and hidden thinking is rendered as the `setHiddenThinkingLabel` one-liner instead of the
 * block, so the live counter has nowhere to go. Read-only, best effort.
 */
export function thinkingIsHidden(ctx: ExtensionContext): boolean {
	if (typeof ctx.cwd !== "string") {
		return false;
	}
	try {
		const settings = SettingsManager.create(ctx.cwd, undefined, { projectTrusted: ctx.isProjectTrusted() });
		return settings.getHideThinkingBlock();
	} catch {
		return false;
	}
}

export type ThinkingController = {
	onSessionStart: (ctx: ExtensionContext) => void;
	handleMessageUpdate: (message: ThinkingMessage) => void;
	handleMessageEnd: (message: ThinkingMessage, ctx: ExtensionContext) => undefined;
	handleAgentEnd: () => void;
	transform: MarkdownTransformer;
	/** Ctrl+O state: `true` means the thinking text is shown instead of the one-line label. */
	toolsExpanded: () => boolean;
};

export type ThinkingControllerOptions = {
	/** Test seam; defaults to reading pi's `hideThinkingBlock` setting. */
	isThinkingHidden?: (ctx: ExtensionContext) => boolean;
	/**
	 * Test seam for the label styling. Left out, the controller takes the session's theme at
	 * `onSessionStart` and dims the labels itself.
	 */
	styleLabel?: (text: string) => string;
	/** Test seam for the clock's styling; defaults to the metric column's dim. */
	styleMetric?: (text: string) => string;
	/** Test seam for the live clock; defaults to `Date.now`. */
	now?: () => number;
	/**
	 * Test seam for the running label's glyph; defaults to the wall-clock frame from `live.ts`,
	 * so the thinking row spins with every other running row.
	 */
	liveMarker?: () => string;
	/** Test seam for Ctrl+O; defaults to pi's `ui.getToolsExpanded()`. */
	isExpanded?: () => boolean;
};

/**
 * Thinking streams inline in the transcript, as part of the running turn: while it arrives the
 * transformer replaces the block with a single `⠸ Thinking 1,234 tokens for 1.2s` line (the
 * live glyph, `live.ts`), and once the assistant message is final it collapses in place to
 * `· Thought 1,234 tokens 2.4s`.
 *
 * Neither view draws the thinking text, so the transcript below the block never moves while the
 * model reasons — the live line is one row tall whether the count is 3 digits or 5.
 *
 * This needs pi's "Hide thinking" setting off (`Ctrl+T`): hidden thinking renders as the
 * label below instead of the block, so the extension only warns when it is on.
 */
export function createThinkingController(options: ThinkingControllerOptions = {}): ThinkingController {
	const isHidden = options.isThinkingHidden ?? thinkingIsHidden;
	const now = options.now ?? (() => Date.now());
	const liveMarker = options.liveMarker ?? (() => liveGlyph());
	/** Finalized run text -> its numbers, so each block keeps its own count and duration. */
	const finished = new Map<string, { seconds?: number; tokens: number }>();
	let startedAt: number | undefined;
	let ui: ExtensionContext["ui"] | undefined;
	let styleLabel = options.styleLabel ?? ((text: string) => text);
	let styleMetric = options.styleMetric ?? styleLabel;

	const elapsedSeconds = (): number | undefined =>
		startedAt === undefined ? undefined : (now() - startedAt) / 1000;

	const isExpanded =
		options.isExpanded ??
		(() => {
			try {
				return ui?.getToolsExpanded?.() ?? false;
			} catch {
				return false;
			}
		});

	const remember = (run: string, numbers: { seconds?: number; tokens: number }) => {
		finished.delete(run);
		finished.set(run, numbers);
		while (finished.size > FINISHED_RUN_LIMIT) {
			const oldest = finished.keys().next().value;
			if (oldest === undefined) {
				return;
			}
			finished.delete(oldest);
		}
	};

	return {
		onSessionStart(ctx) {
			ui = ctx.ui;
			if (!ctx.hasUI) {
				return;
			}
			const theme = ctx.ui.theme as unknown as EmphasisTheme;
			const themes = theme && typeof theme.bold === "function" && typeof theme.fg === "function";
			if (!options.styleLabel && themes) {
				styleLabel = (text) => emphasizeThinkingLabel(theme, text);
			}
			if (!options.styleMetric && themes) {
				styleMetric = (text) => emphasizeMetric(theme, text);
			}
			ctx.ui.setHiddenThinkingLabel(styleLabel(THINKING_HEADER));
			if (isHidden(ctx)) {
				ctx.ui.notify(
					"quiet-tui: thinking is hidden, so the live token count has no inline slot. Press Ctrl+T to show it in the transcript.",
					"warning",
				);
			}
		},
		handleMessageUpdate(message) {
			if (startedAt !== undefined || message.role !== "assistant" || !Array.isArray(message.content)) {
				return;
			}
			for (const block of message.content) {
				if (block.type === "thinking" && block.thinking?.trim()) {
					startedAt = now();
					return;
				}
			}
		},
		handleMessageEnd(message, ctx) {
			if (message.role !== "assistant") {
				return undefined;
			}
			const runs = thinkingRunsFromMessage(message);
			const seconds = elapsedSeconds();
			for (const run of runs) {
				remember(run, { seconds, tokens: estimateThinkingTokens(run) });
			}
			const last = runs.at(-1);
			if (last !== undefined && ctx.hasUI) {
				// The hidden label is drawn by pi's own one-line renderer, which is never given a
				// width: the clock stays inline there, and only the transcript gets the column.
				ctx.ui.setHiddenThinkingLabel(
					joinInlineRow(styleParts(thoughtParts(seconds, estimateThinkingTokens(last)), { styleLabel, styleMetric })),
				);
			}
			startedAt = undefined;
			return undefined;
		},
		handleAgentEnd() {
			startedAt = undefined;
		},
		transform(markdown, context) {
			if (context.messageType !== "assistant-thinking") {
				return markdown;
			}
			// Ctrl+O hands the thinking text back to pi instead of the one-line label.
			if (isExpanded()) {
				return markdown;
			}
			if (context.isStreaming) {
				return thinkingStream(markdown, elapsedSeconds(), {
					styleLabel,
					styleMetric,
					marker: liveMarker(),
					width: context.availableWidth,
				});
			}
			// A restored run has no duration in the session, but its text is here to count.
			const remembered = finished.get(markdown);
			const parts = remembered
				? thoughtParts(remembered.seconds, remembered.tokens)
				: markdown.trim().length === 0
					? thoughtParts()
					: thoughtParts(undefined, estimateThinkingTokens(markdown));
			return labelLine(parts, { styleLabel, styleMetric, width: context.availableWidth });
		},
		toolsExpanded: isExpanded,
	};
}

export function attachThinking(pi: ExtensionAPI): ThinkingController {
	const controller = createThinkingController();
	pi.registerMarkdownTransformer(controller.transform);
	pi.on("message_update", async (event) => {
		controller.handleMessageUpdate(event.message);
	});
	pi.on("message_end", async (event, ctx) => {
		controller.handleMessageEnd(event.message, ctx);
	});
	pi.on("agent_end", async () => {
		controller.handleAgentEnd();
	});
	return controller;
}
