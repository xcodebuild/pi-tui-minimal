import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { BurstTracker, isBurstSplitTool } from "./burst.ts";
import { cleanSummary, summarizeCommand } from "./command-summary.ts";
import { additionsDiff, numberedDiff } from "./diff.ts";
import { createLiveGlyphs, type LiveGlyphs } from "./live.ts";
import {
	COUNT_RESERVE,
	countLines,
	countNewlines,
	DIAMOND,
	editParts,
	type RowParts,
	longPath,
	ranFullParts,
	ranParts,
	runErrorParts,
	runFullParts,
	runParts,
	shortPath,
	shortReadPath,
	toolErrorParts,
	writeParts,
	type InspectKind,
} from "./summaries.ts";
import {
	colorDiff,
	emptyComponent,
	errorRowComponent,
	headerLine,
	outputBlock,
	resultText,
	rowComponent,
	stack,
} from "./render.ts";
import { createSpacing, type Spacing } from "./spacing.ts";

type AnyDefinition = ToolDefinition<any, any, any>;

function withQuietShell(original: AnyDefinition, extras: Partial<AnyDefinition>): AnyDefinition {
	return {
		name: original.name,
		label: original.label,
		description: original.description,
		promptSnippet: original.promptSnippet,
		promptGuidelines: original.promptGuidelines,
		parameters: original.parameters,
		prepareArguments: original.prepareArguments,
		executionMode: original.executionMode,
		execute: original.execute.bind(original),
		renderShell: "self",
		...extras,
	};
}

function firstErrorLine(text: string): string {
	return text.trim().split("\n")[0] ?? "error";
}

function parseExitCode(text: string): string | undefined {
	const match = text.match(/exited with code (\d+)/i) ?? text.match(/exit code:? (\d+)/i);
	return match?.[1];
}

function resolvePath(path: string, cwd: string): string {
	return isAbsolute(path) ? path : resolve(cwd, path);
}

/**
 * Title for a run line: the model's own one-line `description` when it supplied
 * one, otherwise a heuristic summary of the command, otherwise undefined (the
 * caller falls back to the raw command).
 */
function runSummary(args: unknown): string | undefined {
	const values = (args ?? {}) as { command?: unknown; description?: unknown };
	if (typeof values.description === "string" && values.description.trim()) {
		return cleanSummary(values.description);
	}
	if (typeof values.command !== "string") {
		return undefined;
	}
	return summarizeCommand(values.command);
}

/**
 * Line count of a still-growing string, counting only what the last render had not seen.
 * The model streams a `write` body token by token, so a full recount per delta would make
 * rendering quadratic in the file size; the cache in the row's renderer state keeps it linear.
 */
function streamedLineCount(state: Record<string, any>, text: string): number {
	const cache = state.writeLines as { text: string; newlines: number } | undefined;
	let newlines: number;
	if (cache && text.length >= cache.text.length && text.startsWith(cache.text)) {
		newlines = cache.newlines + countNewlines(text.slice(cache.text.length));
	} else {
		newlines = countNewlines(text);
	}
	state.writeLines = { text, newlines };
	if (text.length === 0) {
		return 0;
	}
	return text.endsWith("\n") ? newlines : newlines + 1;
}

/**
 * The live clock a `Run` row carries. pi reports `durationMs` once a call settles, but nothing
 * while it runs, so the row keeps its own `startedAt` and asks the transcript to repaint once a
 * second — the same shape pi's built-in shell renderer uses.
 */
type RunClockState = {
	startedAt?: number;
	endedAt?: number;
	interval?: ReturnType<typeof setInterval>;
};

/**
 * Seconds a run has taken: the recorded `durationMs` when pi has it, otherwise the row's own
 * clock. Starting a run stamps `startedAt`; settling stamps `endedAt` and stops the repaint
 * ticker, so a finished row costs no timer.
 */
function runSeconds(
	state: RunClockState,
	context: { isPartial: boolean; executionStarted: boolean; durationMs?: number; invalidate: () => void },
): number | undefined {
	if (context.executionStarted && state.startedAt === undefined) {
		state.startedAt = Date.now();
	}
	if (!context.isPartial) {
		state.endedAt ??= Date.now();
		if (state.interval !== undefined) {
			clearInterval(state.interval);
			state.interval = undefined;
		}
	} else if (state.startedAt !== undefined && state.interval === undefined) {
		state.interval = setInterval(() => context.invalidate(), 1000);
		(state.interval as { unref?: () => void }).unref?.();
	}
	if (typeof context.durationMs === "number") {
		return context.durationMs / 1000;
	}
	if (state.startedAt === undefined) {
		return undefined;
	}
	return ((state.endedAt ?? Date.now()) - state.startedAt) / 1000;
}

type EditReplacement = { oldText?: unknown; newText?: unknown };

/**
 * The path a row prints: a collapsed row shortens it (`src/a.ts`, `~/notes.md`), and an expanded
 * row keeps the same shortening (it is the same file), only with a wider budget before the left
 * end is elided. Every row that prints a path goes through here.
 */
function rowPath(args: unknown, context: { cwd: string; expanded: boolean }, fallback = ""): string {
	const value = (args as { path?: unknown } | undefined)?.path;
	const path = typeof value === "string" && value ? value : fallback;
	return context.expanded ? longPath(path, context.cwd) : shortPath(path, context.cwd);
}

/**
 * The `edit` row: `◆ Edit src/a.ts` with `−3 +12` in the metric, or the bare path before
 * the counts have streamed in. The column is reserved either way, so the row does not grow a line
 * when the first replacement lands.
 */
function editHeaderParts(path: string, args: unknown, marker: string = DIAMOND): RowParts {
	const { oldLines, newLines } = editLineCounts(args);
	if (oldLines === 0 && newLines === 0) {
		return { title: `${marker} Edit ${path}`, metricReserve: COUNT_RESERVE };
	}
	return editParts(path, oldLines, newLines, marker);
}

/** The replacement pairs of an edit call, whether it streams `edits[]` or the legacy single pair. */
function editReplacements(args: unknown): EditReplacement[] {
	const values = (args ?? {}) as { edits?: unknown; oldText?: unknown; newText?: unknown };
	if (Array.isArray(values.edits)) {
		return values.edits.filter(
			(edit): edit is EditReplacement => typeof edit === "object" && edit !== null,
		);
	}
	if (typeof values.oldText === "string" || typeof values.newText === "string") {
		return [{ oldText: values.oldText, newText: values.newText }];
	}
	return [];
}

/** `−old +new` line totals across an edit call's replacements, counted while they stream. */
function editLineCounts(args: unknown): { oldLines: number; newLines: number } {
	let oldLines = 0;
	let newLines = 0;
	for (const edit of editReplacements(args)) {
		if (typeof edit.oldText === "string") {
			oldLines += countLines(edit.oldText);
		}
		if (typeof edit.newText === "string") {
			newLines += countLines(edit.newText);
		}
	}
	return { oldLines, newLines };
}

/** Extra optional bash parameter: the model describes what the command does. */
const BASH_DESCRIPTION_PARAM = {
	type: "string",
	description:
		"One short line (in the user's language) describing what this command accomplishes, shown to the user instead of the raw command text. Example: \"Check installed pi extensions\". Include it whenever the command is more than a trivial single command.",
};

function withBashSummary(original: AnyDefinition): AnyDefinition {
	const parameters = original.parameters as { properties?: Record<string, unknown> };
	return {
		...parameters,
		properties: { ...(parameters.properties ?? {}), description: BASH_DESCRIPTION_PARAM },
	} as AnyDefinition["parameters"];
}

/**
 * The detail a merged inspect line shows for a completed call: a `read` lists the path it read
 * (shortened, so the row stays readable); the other kinds only count.
 */
function inspectDetail(kind: InspectKind, args: unknown, cwd?: string): string | undefined {
	if (kind !== "read") {
		return undefined;
	}
	const path = (args as { path?: unknown } | undefined)?.path;
	return typeof path === "string" ? shortReadPath(path, cwd) : undefined;
}

export function createQuietTools(cwd: string, burst: BurstTracker, live: LiveGlyphs = createLiveGlyphs()): AnyDefinition[] {
	/**
	 * The marker a row wears this frame: the live glyph while it runs, `◆` once it has settled.
	 * Every renderer calls it on every render — that is both what advances the glyph and what
	 * releases the row from the shared repaint ticker when it settles.
	 */
	const rowMarker = (context: { state: unknown; isPartial: boolean; invalidate: () => void }): string =>
		live.marker(context.state, context.isPartial === true, context.invalidate);

	const originals = {
		read: createReadToolDefinition(cwd),
		bash: createBashToolDefinition(cwd),
		edit: createEditToolDefinition(cwd),
		write: createWriteToolDefinition(cwd),
		find: createFindToolDefinition(cwd),
		grep: createGrepToolDefinition(cwd),
		ls: createLsToolDefinition(cwd),
	};

	/**
	 * A `read`/`ls`/`grep`/`find` row. Collapsed, these rows do not draw themselves: the burst's
	 * first successful call paints the one merged line for all of them (`burst.ts`), so the line
	 * holds the position where the burst started and only its counts change as the rest land.
	 */
	const inspect = (
		kind: InspectKind,
		original: AnyDefinition,
		headerOf: (args: any, context: any) => string,
	): AnyDefinition =>
		withQuietShell(original, {
			renderCall(args, theme, context) {
				burst.register(context.toolCallId, context.invalidate);
				const marker = rowMarker(context);
				if (context.expanded) {
					return headerLine(theme, `${marker} ${headerOf(args, context)}`);
				}
				return emptyComponent();
			},
			renderResult(result, options, theme, context) {
				// Keep the invalidator registered in `renderCall` fresh: the row that owns the merged
				// line is repainted from a render well after the one that registered it.
				burst.register(context.toolCallId, context.invalidate);
				const marker = rowMarker(context);
				if (context.isPartial) {
					// Running, the row is its own one-line header; the output is the `Ctrl+O` detail, so
					// nothing the row draws can change the transcript's height before it settles.
					return headerLine(theme, `${marker} ${headerOf(context.args, context)}`);
				}
				if (context.isError) {
					burst.complete(context.toolCallId, kind, true);
					return errorRowComponent(theme, toolErrorParts(kind, firstErrorLine(resultText(result))));
				}
				burst.complete(context.toolCallId, kind, false, inspectDetail(kind, context.args, context.cwd));
				if (options.expanded) {
					const output = resultText(result);
					return output ? outputBlock(theme.fg("toolOutput", output)) : emptyComponent();
				}
				if (!burst.shouldPaintCollapsed(context.toolCallId, false)) {
					// Not the burst's owner: the merged line is drawn further up, in the row that opened
					// the burst. An empty row is what keeps the merge on one line.
					return emptyComponent();
				}
				return headerLine(theme, burst.summaryFor(context.toolCallId));
			},
		});

	const bash = withQuietShell(originals.bash, {
		parameters: withBashSummary(originals.bash),
		promptGuidelines: [
			...(originals.bash.promptGuidelines ?? []),
			"Pass bash a short `description` (one line, in the user's language, at most 8 words) stating what the command accomplishes; it is shown to the user in place of the raw command.",
		],
		renderCall(args, theme, context) {
			const command = String(args?.command ?? "");
			const summary = runSummary(args);
			const seconds = runSeconds(context.state as RunClockState, context);
			const marker = rowMarker(context);
			// Expanded, the result renderer owns the row: full command plus the output.
			if (context.isError || context.expanded) {
				return emptyComponent();
			}
			if (context.isPartial) {
				// The row that opened the run of quick commands is repainted from here when a later
				// one lands, so the merged line stays where it started.
				burst.register(context.toolCallId, context.invalidate);
				return rowComponent(theme, runParts(command, summary, seconds, marker));
			}
			// A settled run is either its own `Ran …` row or part of a merged line: the burst's
			// first quick run owns that line, and the rest of the covered runs draw nothing.
			if (!burst.shouldPaintRunCollapsed(context.toolCallId)) {
				return emptyComponent();
			}
			return rowComponent(theme, burst.runMergeFor(context.toolCallId) ?? ranParts(command, summary, seconds));
		},
		renderResult(result, options, theme, context) {
			const command = String(context.args?.command ?? "");
			const output = resultText(result);
			const seconds = runSeconds(context.state as RunClockState, context);
			const marker = rowMarker(context);
			if (!context.isPartial) {
				// Settled: hand the run to the tracker, which decides whether it merges with the
				// quick runs around it.
				burst.completeRun(context.toolCallId, seconds ?? 0, context.isError === true, runSummary(context.args));
			}
			if (context.isError) {
				return errorRowComponent(theme, runErrorParts(command, parseExitCode(output), runSummary(context.args)));
			}
			if (options.expanded) {
				const head = context.isPartial
					? runFullParts(command, seconds, marker)
					: ranFullParts(command, seconds);
				return stack(
					rowComponent(theme, head),
					output ? outputBlock(theme.fg("toolOutput", output)) : undefined,
				);
			}
			// Collapsed, the header `renderCall` draws (with its live clock while running) is the
			// whole row; the output is the `Ctrl+O` detail. Nothing here changes the row's height.
			return emptyComponent();
		},
	});

	const edit = withQuietShell(originals.edit, {
		renderCall(args, theme, context) {
			const marker = rowMarker(context);
			// A failed row belongs to the result renderer; the call header would repeat it above the error.
			if (context.isError) {
				return emptyComponent();
			}
			return rowComponent(theme, editHeaderParts(rowPath(args, context), args, marker));
		},
		renderResult(result, options, theme, context) {
			// Settling the row also releases its live marker from the shared repaint ticker.
			rowMarker(context);
			if (context.isError) {
				return errorRowComponent(theme, toolErrorParts("edit", firstErrorLine(resultText(result))));
			}
			// Collapsed, the call renderer's `−old +new` header is the whole row; the diff is the detail.
			if (!options.expanded) {
				return emptyComponent();
			}
			const diff = String((result.details as { diff?: string } | undefined)?.diff ?? "");
			return diff ? outputBlock(colorDiff(theme, diff)) : emptyComponent();
		},
	});

	const originalWrite = originals.write;
	const write = withQuietShell(originalWrite, {
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const path = String(params.path ?? "");
			const written = String(params.content ?? "");
			let previous: string | undefined;
			try {
				previous = await readFile(resolvePath(path, ctx.cwd), "utf8");
			} catch {
				previous = undefined;
			}
			const result = await originalWrite.execute(toolCallId, params, signal, onUpdate, ctx);
			const diff = previous === undefined ? additionsDiff(written) : numberedDiff(previous, written);
			return {
				...result,
				details: { previous, written, diff, created: previous === undefined },
			};
		},
		renderCall(args, theme, context) {
			const marker = rowMarker(context);
			// A failed row belongs to the result renderer; the call header would repeat it above the error.
			if (context.isError) {
				return emptyComponent();
			}
			const path = rowPath(args, context);
			const lines = streamedLineCount(context.state, typeof args?.content === "string" ? args.content : "");
			if (lines === 0) {
				return rowComponent(theme, { title: `${marker} Write ${path}`, metricReserve: COUNT_RESERVE });
			}
			return rowComponent(theme, writeParts(path, lines, marker));
		},
		renderResult(result, options, theme, context) {
			// Settling the row also releases its live marker from the shared repaint ticker.
			rowMarker(context);
			if (context.isError) {
				return errorRowComponent(theme, toolErrorParts("write", firstErrorLine(resultText(result))));
			}
			// Collapsed, the call renderer's line-count header is the whole row; the diff is the detail.
			if (!options.expanded) {
				return emptyComponent();
			}
			const details = result.details as { diff?: string } | undefined;
			const diff = details?.diff ?? additionsDiff(String(context.args?.content ?? ""));
			return diff ? outputBlock(colorDiff(theme, diff)) : emptyComponent();
		},
	});

	return [
		inspect("read", originals.read, (args, context) => `read ${rowPath(args, context)}`),
		bash,
		edit,
		write,
		inspect("find", originals.find, (args) => `find ${args?.pattern ?? ""}`),
		inspect("grep", originals.grep, (args) => `grep ${args?.pattern ?? ""}`),
		inspect("ls", originals.ls, (args, context) => `ls ${rowPath(args, context, ".")}`),
	];
}

export function registerQuietTools(
	pi: ExtensionAPI,
	burst = new BurstTracker(),
	spacing: Spacing = createSpacing(),
	live: LiveGlyphs = createLiveGlyphs(),
): BurstTracker {
	const cache = new Map<string, AnyDefinition[]>();

	const toolsFor = (cwd: string) => {
		let tools = cache.get(cwd);
		if (!tools) {
			tools = createQuietTools(cwd, burst, live);
			cache.set(cwd, tools);
		}
		return tools;
	};

	for (const tool of toolsFor(process.cwd())) {
		pi.registerTool({
			...tool,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const current = toolsFor(ctx.cwd).find((item) => item.name === tool.name) ?? tool;
				return current.execute(toolCallId, params, signal, onUpdate, ctx);
			},
			renderCall(args, theme, context) {
				// A tool row is the first agent block of a turn to render; this is where the
				// transcript patch gets installed.
				spacing.sweep();
				if (tool.name === "bash") {
					// A bash row ends an inspect burst but not a run of quick commands: consecutive
					// quick runs are what the merged run line is for.
					burst.noteInspectSplit();
				} else if (isBurstSplitTool(tool.name)) {
					burst.noteSplit();
				}
				const current = toolsFor(context.cwd).find((item) => item.name === tool.name) ?? tool;
				return current.renderCall?.(args, theme, context) ?? emptyComponent();
			},
			renderResult(result, options, theme, context) {
				spacing.sweep();
				const current = toolsFor(context.cwd).find((item) => item.name === tool.name) ?? tool;
				return current.renderResult?.(result, options, theme, context) ?? emptyComponent();
			},
		});
	}

	pi.on("tool_execution_start", async (event) => {
		if (event.toolName === "bash") {
			burst.noteInspectSplit();
		} else if (isBurstSplitTool(event.toolName)) {
			burst.noteSplit();
		}
	});
	pi.on("message_update", async (event) => {
		const message = event.message as { role?: string; content?: Array<{ type: string; text?: string }> };
		if (message.role === "assistant" && message.content?.some((block) => block.type === "text" && block.text?.trim())) {
			burst.noteSplit();
		}
	});

	return burst;
}
