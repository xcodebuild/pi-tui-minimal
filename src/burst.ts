import { ASK_USER_QUESTION } from "./questionnaire.ts";
import { type InspectCounts, type InspectKind, formatInspectMerge } from "./summaries.ts";

export type BurstEntry = {
	toolCallId: string;
	kind: InspectKind;
	error: boolean;
	/** Display detail for the merged line — a `read`'s path; unused by the kinds that only count. */
	detail?: string;
};

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

export class BurstTracker {
	private bursts: BurstEntry[][] = [[]];
	private invalidators = new Map<string, () => void>();

	reset(): void {
		this.bursts = [[]];
		this.invalidators.clear();
	}

	closeBurst(): void {
		const current = this.current();
		if (current.length === 0) {
			return;
		}
		this.bursts.push([]);
	}

	noteSplit(): void {
		this.closeBurst();
	}

	register(toolCallId: string, invalidate: () => void): void {
		this.invalidators.set(toolCallId, invalidate);
	}

	complete(toolCallId: string, kind: InspectKind, error: boolean, detail?: string): void {
		if (this.findBurst(toolCallId)) {
			return;
		}
		const previousLast = this.lastSuccess(this.current());
		this.current().push({ toolCallId, kind, error, detail });
		if (previousLast && previousLast.toolCallId !== toolCallId) {
			this.invalidators.get(previousLast.toolCallId)?.();
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
		return this.lastSuccess(burst)?.toolCallId === toolCallId;
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

	private findBurst(toolCallId: string): BurstEntry[] | undefined {
		return this.bursts.find((burst) => burst.some((entry) => entry.toolCallId === toolCallId));
	}

	private lastSuccess(burst: BurstEntry[]): BurstEntry | undefined {
		for (let index = burst.length - 1; index >= 0; index--) {
			if (!burst[index]?.error) {
				return burst[index];
			}
		}
		return undefined;
	}
}
