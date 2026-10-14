import type { Theme } from "@earendil-works/pi-coding-agent";
import { escapesOf, isBlankLine, visibleText } from "./ansi.ts";
import { liveGlyph } from "./live.ts";
import { isPromptRow, promptLines } from "./prompt.ts";
import { questionnaireRow } from "./questionnaire.ts";
import { layoutQuietRow } from "./render.ts";
import { foreignToolRow } from "./rows.ts";

// The line helpers live in `ansi.ts` so the prompt marker can share them; they are re-exported
// here because this is the module the transcript patch is read from.
export { escapesOf, isBlankLine, visibleText } from "./ansi.ts";

/**
 * Tightens pi's transcript by removing the blank line pi puts in front of each of its own
 * blocks.
 *
 * pi renders every self-shell tool row as `["", ...content]` (`ToolExecutionComponent.render`)
 * and every assistant message as `[Spacer, ...content]` (`AssistantMessageComponent`), plus a
 * `Spacer(1)` between turns. A turn of one-line rows therefore spends as much height on blanks
 * as on content. pi exposes no hook for those spacers, so the extension patches the live
 * transcript container instead:
 *
 * - the editor factory receives pi's TUI proxy (`ctx.ui` is a plain object and does not expose
 *   the component tree, but the proxy forwards reads to the real renderer, so `children` is it),
 * - the container that directly holds a tool row or an assistant message is found by walking
 *   that tree and is patched once,
 * - the patched `render` drops the leading blank line from agent-output children and drops
 *   all-blank children (pi's `Spacer`s) outright, then fixes the heights in `mouseLayout` so
 *   click routing and scrolling keep matching the shorter output,
 * - an assistant message gets the same pass one level down, on its own `contentContainer`,
 *   because that is where pi puts the `Spacer(1)` between a thinking block and the answer
 *   that follows it — see `patchMessageContent`; that phase-boundary spacer is retained.
 *
 * Only the agent's blocks are tightened: a user message keeps pi's box padding, which leaves
 * exactly one blank line above and below a prompt and none inside the answer. Execution rows stay
 * tight, while one blank remains where assistant prose meets a tool row or `· Thought` label.
 *
 * The nested pass sees one container the transcript-level one cannot: `AssistantMessageComponent`
 * renders its blocks into a `contentContainer` of its own, so the blank pi writes between a
 * thinking run and the answer after it (`updateContent` adds a `Spacer(1)` when visible content
 * follows the run) is a child of *that* container, not of the transcript. The transcript pass
 * installs the pass on each message's `contentContainer` before rendering it. The pass keeps that
 * one spacer as a phase boundary, while dropping spacers between execution rows. Paragraph breaks
 * live inside a single `Markdown` child's own output, below this level, and remain untouched.
 *
 * The tree this walks is the same in pi's regular and fullscreen modes. Fullscreen wraps the
 * document container in a `ScrollView` (`document -> ScrollView -> VStack`), but `ScrollView`
 * is itself a `Container` whose child lands in `.children`, and `Container.render` records
 * `mouseLayout` either way — so the same search finds the same container and the same height
 * repair keeps click routing aligned.
 *
 * The same pass is where rows of tools this extension does not register are rewritten into `◆`
 * one-liners — see `questionnaire.ts` for `ask_user_question` and `rows.ts` for every other
 * tool (the FFF tools, the subagent tools, MCP tools). They are substituted rather than
 * tightened because pi keeps the *first* registration per tool name (`getAllRegisteredTools`),
 * so those definitions cannot be replaced with quiet renderers.
 *
 * Because the container patch is the only thing installed, a pi release that renames these
 * internals makes the search find nothing — rows then simply keep pi's spacers instead of
 * breaking.
 *
 * The pass also gives the user's own turn its `❯` back (`prompt.ts`). That one is a splice into
 * lines pi already rendered rather than a rebuild: the marker is paid for by the prompt's own
 * left padding, so the row keeps its width, its height, and everything pi's Markdown drew.
 */

type AnyComponent = Record<string, any>;

const PATCHED = "__quietTuiSpacing";
const MOUSE_OFFSET = "__quietTuiSpacingOffset";
const EXPANDED_STATE = "__quietTuiToolsExpanded";

/** A tool row or an assistant message — the blocks whose leading blank pi inserts. */
export function isAgentOutput(component: AnyComponent | undefined): boolean {
	if (!component) {
		return false;
	}
	return (
		(typeof component.updateResult === "function" && "toolCallId" in component) ||
		(typeof component.updateContent === "function" && "contentContainer" in component)
	);
}

/**
 * A block that anchors the transcript search: pi's agent output, or the user's own prompt. The
 * prompt is *spliced* rather than tightened (`prompt.ts`), but it is the first block a turn mounts
 * — anchoring on it installs the patch the moment the prompt is submitted, before any output.
 */
function isTranscriptAnchor(component: AnyComponent | undefined): boolean {
	return isAgentOutput(component) || isPromptRow(component);
}

/**
 * The lines a child contributes to the transcript. Drops pi's leading blank from an agent
 * block (carrying its escape prefix, so the zone marker is not lost) and drops an all-blank
 * child — pi's `Spacer` between turns — entirely. User messages and unknown blocks are kept
 * as they are.
 */
export function tightenChild(component: AnyComponent | undefined, lines: string[]): string[] {
	if (lines.length === 0) {
		return lines;
	}
	if (lines.every(isBlankLine)) {
		return [];
	}
	if (!isAgentOutput(component) || !isBlankLine(lines[0] ?? "")) {
		return lines;
	}
	const kept = lines.slice(1);
	const carry = escapesOf(lines[0] ?? "");
	if (carry.length > 0 && kept.length > 0) {
		kept[0] = carry + kept[0];
	}
	return kept;
}

/** Keep a patched child's click coordinates aligned with its shorter output. */
function offsetClicks(component: AnyComponent | undefined, removed: number): void {
	if (!component || typeof component.handleMouse !== "function") {
		return;
	}
	if (typeof component[MOUSE_OFFSET] !== "number") {
		const handleMouse = component.handleMouse;
		component.handleMouse = function handleMouseAfterTrim(this: AnyComponent, event: { y: number }) {
			return handleMouse.call(this, { ...event, y: event.y + (this[MOUSE_OFFSET] ?? 0) });
		};
	}
	component[MOUSE_OFFSET] = removed;
}

/** The dropped line's escapes, carried onto the replacement's first line (pi's OSC 133 zone marker). */
function carryEscapes(from: string[], to: string[]): string[] {
	if (to.length === 0) {
		return to;
	}
	const carry = escapesOf(from[0] ?? "");
	return carry.length > 0 ? [carry + to[0], ...to.slice(1)] : to;
}

/**
 * Watch a message for a change of the Ctrl+O state and rebuild it when it flips.
 *
 * `thinking.ts` draws a thinking run as a one-line label, but hands the raw thinking text back
 * once tool output is expanded. The transcript repaints on every Ctrl+O, yet an unchanged
 * `Markdown` child would keep serving its cached label lines, so the message's blocks are rebuilt
 * here — that re-runs the Markdown transformer with the new state. Guarded by the same shape the
 * transcript patch keys on, so a pi release that renames `invalidate` leaves the label in place.
 */
function patchMessageExpansion(component: AnyComponent, isExpanded: () => boolean): void {
	if (typeof component.render !== "function" || component[EXPANDED_STATE] !== undefined) {
		return;
	}
	const render = component.render;
	component[EXPANDED_STATE] = isExpanded();
	component.render = function renderTracked(this: AnyComponent, width: number): string[] {
		const expanded = isExpanded();
		if (expanded !== this[EXPANDED_STATE]) {
			this[EXPANDED_STATE] = expanded;
			if (typeof this.invalidate === "function") {
				this.invalidate();
			}
		}
		return render.call(this, width);
	};
}

/**
 * Install the tightening pass on an assistant message's own `contentContainer` — the container
 * pi renders its thinking/text blocks into, and therefore the one holding the `Spacer(1)` pi
 * puts between a thinking run and the answer that follows it.
 *
 * Guarded by the same shape the transcript search keys on (`contentContainer` + `updateContent`),
 * so a pi release that renames them leaves the blank in place rather than breaking. `updateContent`
 * clears the container's children but keeps the container itself, so one install lasts the whole
 * message, including across the streaming updates that rebuild its blocks.
 */
function patchMessageContent(
	component: AnyComponent | undefined,
	getTheme: () => Theme | undefined,
	isExpanded: () => boolean,
	liveMarker: () => string,
): void {
	if (!component || typeof component.updateContent !== "function") {
		return;
	}
	const content = component.contentContainer;
	if (content) {
		patchMessageExpansion(component, isExpanded);
		patchContainer(content, getTheme, isExpanded, liveMarker, true);
	}
}

type BoundaryKind = "prose" | "machinery" | "other";

function isToolRow(component: AnyComponent | undefined): boolean {
	return Boolean(component && typeof component.updateResult === "function" && "toolCallId" in component);
}

function isAssistantMessage(component: AnyComponent | undefined): boolean {
	return Boolean(component && typeof component.updateContent === "function" && "contentContainer" in component);
}

function isThinkingLine(line: string): boolean {
	return /^\s*\S\s+(?:Thinking|Thought)\b/.test(visibleText(line));
}

function boundaryKind(
	component: AnyComponent | undefined,
	lines: string[],
	edge: "first" | "last",
	insideMessage: boolean,
): BoundaryKind | undefined {
	if (isToolRow(component)) {
		return "machinery";
	}
	const content = lines.filter((line) => !isBlankLine(line));
	const line = edge === "first" ? content[0] : content.at(-1);
	if (line === undefined) {
		return undefined;
	}
	if (isThinkingLine(line)) {
		return "machinery";
	}
	if (insideMessage || isAssistantMessage(component)) {
		return "prose";
	}
	return "other";
}

function isPhaseBoundary(left: BoundaryKind | undefined, right: BoundaryKind | undefined): boolean {
	return (
		(left === "prose" && right === "machinery") ||
		(left === "machinery" && right === "prose")
	);
}

/**
 * Replace a container's `render` with one that tightens each child's lines and repairs the
 * `mouseLayout` heights it just recorded. The container itself is what pi routes clicks and
 * scroll offsets through, so the repaired layout keeps both correct.
 *
 * `getTheme` supplies the theme for the substituted rows (`questionnaire.ts`, `rows.ts`);
 * without one, rows are only tightened. It is read at render time, not at patch time, because
 * the theme arrives with the session and the container may be patched before it.
 *
 * `liveMarker` is the animated glyph those substituted rows wear while they run (`live.ts`).
 * The patch owns no timer, and does not need one: pi repaints this container while a turn is in
 * flight, and the frame is a pure function of the clock, so a running row advances on every
 * repaint it gets.
 *
 * The message content pass is installed before the render being patched, not after it: a message
 * that arrives finalized (restored history) or stops streaming may never be rendered again, and
 * one frame of pi's blank would then be the last thing on screen.
 */
export function patchContainer(
	container: AnyComponent,
	getTheme: () => Theme | undefined = () => undefined,
	isExpanded: () => boolean = () => false,
	liveMarker: () => string = () => liveGlyph(),
	insideMessage = false,
): boolean {
	if (!container || typeof container.render !== "function" || container[PATCHED]) {
		return false;
	}
	const render = container.render;
	container[PATCHED] = true;
	container.render = function renderTightened(this: AnyComponent, width: number): string[] {
		const children = this.children;
		if (Array.isArray(children)) {
			for (const child of children) {
				patchMessageContent(child, getTheme, isExpanded, liveMarker);
			}
		}
		const lines = render.call(this, width);
		const layout = this.mouseLayout;
		if (!layout || layout.width !== width || !Array.isArray(layout.children)) {
			return lines;
		}
		const theme = getTheme();
		const marker = liveMarker();
		const chunks: Array<{ component?: AnyComponent; lines: string[] }> = [];
		let at = 0;
		for (const entry of layout.children) {
			const height = Number.isFinite(entry?.height) ? entry.height : 0;
			const childLines = lines.slice(at, at + height);
			at += height;
			chunks.push({ component: entry?.component, lines: childLines });
		}
		const nearestKind = (index: number, step: -1 | 1): BoundaryKind | undefined => {
			for (let cursor = index + step; cursor >= 0 && cursor < chunks.length; cursor += step) {
				const chunk = chunks[cursor];
				if (!chunk) {
					continue;
				}
				const kind = boundaryKind(
					chunk.component,
					chunk.lines,
					step < 0 ? "last" : "first",
					insideMessage,
				);
				if (kind !== undefined) {
					return kind;
				}
			}
			return undefined;
		};

		const kept: string[] = [];
		for (const [index, entry] of layout.children.entries()) {
			const childLines = chunks[index]?.lines ?? [];
			const tightened = tightenChild(entry?.component, childLines);
			// The user's own turn keeps pi's rendering and only gains its `❯`, so it is spliced into
			// the lines that came back; the substituted rows below are rebuilt from scratch instead.
			const marked = theme ? promptLines(entry?.component, tightened, theme, width) : undefined;
			// The questionnaire first (it has the richer answer view), then any other foreign tool row.
			const replaced =
				theme && !marked
					? (questionnaireRow(entry?.component, theme, marker) ?? foreignToolRow(entry?.component, theme, marker))
					: undefined;
			// pi's own rows are wrapped to the width by the `Text` they render into; a substituted
			// row has no `Text`, so it is laid out here — gutter, hanging indent and metric.
			let final =
				marked ??
				(theme && replaced
					? carryEscapes(tightened, layoutQuietRow(theme, replaced, Math.max(1, width)))
					: tightened);
			if (
				final.length > 0 &&
				!isBlankLine(final[0] ?? "") &&
				isPhaseBoundary(
					nearestKind(index, -1),
					boundaryKind(entry?.component, final, "first", insideMessage),
				)
			) {
				final = [escapesOf(childLines[0] ?? ""), ...final];
			}
			if (final.length !== childLines.length) {
				entry.height = final.length;
				offsetClicks(entry?.component, childLines.length - final.length);
			}
			kept.push(...final);
		}
		if (at < lines.length) {
			kept.push(...lines.slice(at));
		}
		return kept;
	};
	return true;
}

/** The container that directly holds agent output: the transcript's chat container. */
export function findTranscriptContainer(root: unknown): AnyComponent | undefined {
	const seen = new Set<unknown>();
	const pending: Array<{ node: unknown; parent?: AnyComponent }> = [{ node: root }];
	while (pending.length > 0) {
		const item = pending.pop();
		if (!item) {
			continue;
		}
		const { node, parent } = item;
		if (!node || typeof node !== "object" || seen.has(node)) {
			continue;
		}
		seen.add(node);
		const component = node as AnyComponent;
		if (parent && isTranscriptAnchor(component)) {
			return parent;
		}
		const children = component.children;
		if (Array.isArray(children)) {
			for (const child of children) {
				pending.push({ node: child, parent: component });
			}
		}
	}
	return undefined;
}

export type Spacing = {
	/** Remember the live TUI whose tree the transcript is found in. Safe on every session start. */
	attachTui(tui: unknown): void;
	/** Remember the theme the questionnaire row is styled with. Safe on every session start. */
	attachTheme(theme: Theme): void;
	/** Remember how to read pi's Ctrl+O state. Safe on every session start. */
	attachExpansion(isExpanded: () => boolean): void;
	/** Install the transcript patch once a tool row or assistant message is mounted. */
	sweep(): void;
};

/** Bounded retries, so a session with nothing to find does not re-walk on every render. */
const MAX_RETRIES = 3;

export type SpacingOptions = {
	/** Test seam for the live glyph the substituted rows wear; defaults to the wall clock. */
	liveMarker?: () => string;
};

export function createSpacing(options: SpacingOptions = {}): Spacing {
	const liveMarker = options.liveMarker ?? (() => liveGlyph());
	let root: unknown;
	let theme: Theme | undefined;
	let isExpanded: () => boolean = () => false;
	let patched = false;
	let retries = 0;

	const install = (): boolean => {
		if (patched) {
			return true;
		}
		if (!root) {
			return false;
		}
		const container = findTranscriptContainer(root);
		if (!container) {
			return false;
		}
		patched = patchContainer(
			container,
			() => theme,
			() => isExpanded(),
			liveMarker,
		);
		return patched;
	};

	return {
		attachTui(tui) {
			root = tui;
		},
		attachTheme(next) {
			theme = next;
		},
		attachExpansion(next) {
			isExpanded = next;
		},
		sweep() {
			if (patched) {
				return;
			}
			if (install() || retries >= MAX_RETRIES) {
				return;
			}
			// pi builds a component and mounts it in the same tick, so the first sweep (from a
			// row constructor's render) can run before the transcript exists. A microtask still
			// lands before the next frame.
			retries += 1;
			queueMicrotask(install);
		},
	};
}
