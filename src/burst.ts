import { ASK_USER_QUESTION } from "./questionnaire.ts";
import { type InspectCounts, type InspectKind, formatInspectMerge, type RowParts, runMergeParts } from "./summaries.ts";

export type BurstEntry = {
	toolCallId: string;
	kind: InspectKind;
	error: boolean;
	/** Display detail for the merged line — a `read`'s path; unused by the kinds that only count. */
	detail?: string;
};

/** One settled `bash` run, as the merged run line needs it. */
export type RunEntry = {
	toolCallId: string;
	seconds: number;
	error: boolean;
	/** The run's own title (its description or summarized command). */
	summary?: string;
};

/** A run longer than this is never covered by a merged run line. */
export const RUN_MERGE_MAX_SECONDS = 1;

const INSPECT = new Set<string>(["read", "ls", "grep", "find"]);

export function isInspectTool(name: string): name is InspectKind {
	return INSPECT.has(name);
}

/**
 * Rows that end an inspect burst. The questionnaire belongs here even though it is not an
 * inspect tool: it is a full-width row that interrupts the transcript, so reads on either side
 * of it must not merge onto one summary line.
 */
const SPLIT_TOOLS = new Set<string>(["bash", "edit", "write", ASK_USER_QUESTION]);

export function isBurstSplitTool(name: string): boolean {
	return SPLIT_TOOLS.has(name);
}

/**
 * Groups consecutive inspect calls — and consecutive quick `bash` runs — so the transcript can
 * print each group as one line.
 *
 * The merged line belongs to the burst's **first successful call**, not to its newest one. A row
 * paints it only while it is that first success (`shouldPaintCollapsed`), so the one line stays
 * where the burst began and merely grows wider as later reads, greps and lists land. Landing one
 * therefore repaints the owner — the row settled earlier — instead of the row that just finished,
 * which is what `complete` does with the invalidator each call registered in `renderCall`.
 *
 * The alternative (the newest call owns the line) reads the same when a burst is one call deep,
 * but makes every later call drag the line down the transcript: with a burst spanning several
 * thinking blocks — thinking does not split a burst, only assistant text does — the line ends up
 * below thoughts that were written after the first read, looking like it was refreshed there.
 *
 * Errors stay outside this bargain: a failed call paints its own error line wherever it sits, and
 * is skipped when the owner is picked.
 */
export class BurstTracker {
	private bursts: BurstEntry[][] = [[]];
	private runs: RunEntry[][] = [[]];
	private invalidators = new Map<string, () => void>();

	reset(): void {
		this.bursts = [[]];
		this.runs = [[]];
		this.invalidators.clear();
	}

	closeBurst(): void {
		const current = this.current();
		if (current.length === 0) {
			return;
		}
		this.bursts.push([]);
	}

	closeRunBurst(): void {
		const current = this.currentRun();
		if (current.length === 0) {
			return;
		}
		this.runs.push([]);
	}

	/**
	 * Something that ends every burst: assistant text, an `edit`, a `write`, the questionnaire.
	 */
	noteSplit(): void {
		this.closeBurst();
		this.closeRunBurst();
	}

	/**
	 * Something that ends an inspect burst but not a run of quick commands: a `bash` row. Two
	 * quick runs on either side of a `read` still belong to the same run of commands, and an
	 * inspect burst still may not cross a `bash` row.
	 */
	noteInspectSplit(): void {
		this.closeBurst();
	}

	/**
	 * Record a settled `bash` run. A run that took at least a second is never covered by a merged
	 * line — it ends the run of quick commands around it — and a failed run is recorded so it can
	 * keep its own error row, but is excluded from the merge's count and total.
	 */
	completeRun(toolCallId: string, seconds: number, error: boolean, summary?: string): void {
		this.closeBurst();
		if (seconds >= RUN_MERGE_MAX_SECONDS) {
			this.closeRunBurst();
			return;
		}
		if (this.findRunBurst(toolCallId)) {
			return;
		}
		const owner = this.firstRunSuccess(this.currentRun());
		this.currentRun().push({ toolCallId, seconds, error, summary });
		if (owner) {
			this.invalidators.get(owner.toolCallId)?.();
		}
	}

	/**
	 * The merged line a row shows, or `undefined` when the row draws its own: it is a single
	 * covered run (a lone run is never "1 commands"), it is not the owner of the line, or it was
	 * never covered at all.
	 */
	runMergeFor(toolCallId: string): RowParts | undefined {
		const burst = this.findRunBurst(toolCallId);
		if (!burst) {
			return undefined;
		}
		const covered = burst.filter((entry) => !entry.error);
		if (covered.length < 2) {
			return undefined;
		}
		if (this.firstRunSuccess(burst)?.toolCallId !== toolCallId) {
			return undefined;
		}
		const seconds = covered.reduce((total, entry) => total + entry.seconds, 0);
		return runMergeParts(covered.length, covered.map((entry) => entry.summary ?? ""), seconds);
	}

	register(toolCallId: string, invalidate: () => void): void {
		this.invalidators.set(toolCallId, invalidate);
	}

	complete(toolCallId: string, kind: InspectKind, error: boolean, detail?: string): void {
		this.closeRunBurst();
		if (this.findBurst(toolCallId)) {
			return;
		}
		const owner = this.firstSuccess(this.current());
		this.current().push({ toolCallId, kind, error, detail });
		// The owner is the row showing the merged line, and its counts just changed. When this call
		// *is* the owner (the burst's first success) there is nothing to repaint: it is rendering
		// the line right now.
		if (owner) {
			this.invalidators.get(owner.toolCallId)?.();
		}
	}

	shouldPaintCollapsed(toolCallId: string, expanded: boolean): boolean {
		if (expanded) {
			return true;
		}
		const burst = this.findBurst(toolCallId);
		if (!burst) {
			return true;
		}
		const entry = burst.find((item) => item.toolCallId === toolCallId);
		if (entry?.error) {
			return true;
		}
		return this.firstSuccess(burst)?.toolCallId === toolCallId;
	}

	/** The same bargain as `shouldPaintCollapsed`, for the run of quick commands. */
	shouldPaintRunCollapsed(toolCallId: string): boolean {
		const burst = this.findRunBurst(toolCallId);
		if (!burst) {
			return true;
		}
		const entry = burst.find((item) => item.toolCallId === toolCallId);
		if (entry?.error) {
			return true;
		}
		if (burst.filter((item) => !item.error).length < 2) {
			return true;
		}
		return this.firstRunSuccess(burst)?.toolCallId === toolCallId;
	}

	summaryFor(toolCallId: string): string {
		const burst = this.findBurst(toolCallId) ?? this.current();
		return formatInspectMerge(this.counts(burst), this.readDetails(burst));
	}

	/** The paths a burst's successful reads touched, in order, for the merged line. */
	private readDetails(burst: BurstEntry[]): string[] {
		return burst
			.filter((entry) => !entry.error && entry.kind === "read" && entry.detail)
			.map((entry) => entry.detail as string);
	}

	counts(burst: BurstEntry[] = this.current()): InspectCounts {
		const counts: InspectCounts = {};
		for (const entry of burst) {
			if (entry.error) {
				continue;
			}
			counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
		}
		return counts;
	}

	private current(): BurstEntry[] {
		return this.bursts[this.bursts.length - 1] ?? (this.bursts[0] = []);
	}

	private currentRun(): RunEntry[] {
		return this.runs[this.runs.length - 1] ?? (this.runs[0] = []);
	}

	private findBurst(toolCallId: string): BurstEntry[] | undefined {
		return this.bursts.find((burst) => burst.some((entry) => entry.toolCallId === toolCallId));
	}

	private findRunBurst(toolCallId: string): RunEntry[] | undefined {
		return this.runs.find((burst) => burst.some((entry) => entry.toolCallId === toolCallId));
	}

	/** The run that owns the merged line: the earliest success, failures skipped. */
	private firstRunSuccess(burst: RunEntry[]): RunEntry | undefined {
		for (const entry of burst) {
			if (!entry.error) {
				return entry;
			}
		}
		return undefined;
	}

	/** The entry that owns the burst's merged line: its earliest success, errors skipped. */
	private firstSuccess(burst: BurstEntry[]): BurstEntry | undefined {
		for (const entry of burst) {
			if (!entry.error) {
				return entry;
			}
		}
		return undefined;
	}
}
