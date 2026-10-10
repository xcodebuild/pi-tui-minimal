import { countDiffStats } from "./summaries.ts";

function splitLines(text: string): string[] {
	if (text.length === 0) {
		return [];
	}
	const lines = text.split("\n");
	if (lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines;
}

export function numberedDiff(oldContent: string, newContent: string): string {
	const oldLines = splitLines(oldContent);
	const newLines = splitLines(newContent);
	const maxLineNum = Math.max(oldLines.length, newLines.length, 1);
	const width = String(maxLineNum).length;
	const format = (prefix: string, num: number, line: string) =>
		`${prefix}${String(num).padStart(width, " ")} ${line}`;

	let start = 0;
	while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
		start++;
	}
	let oldEnd = oldLines.length - 1;
	let newEnd = newLines.length - 1;
	while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
		oldEnd--;
		newEnd--;
	}

	const output: string[] = [];
	for (let index = 0; index < start; index++) {
		output.push(format(" ", index + 1, newLines[index] ?? ""));
	}
	for (let index = start; index <= oldEnd; index++) {
		output.push(format("-", index + 1, oldLines[index] ?? ""));
	}
	for (let index = start; index <= newEnd; index++) {
		output.push(format("+", index + 1, newLines[index] ?? ""));
	}
	const suffixOld = oldLines.length - 1 - oldEnd;
	for (let offset = suffixOld - 1; offset >= 0; offset--) {
		const newIndex = newLines.length - 1 - offset;
		output.push(format(" ", newIndex + 1, newLines[newIndex] ?? ""));
	}
	return output.join("\n");
}

export function additionsDiff(content: string): string {
	return numberedDiff("", content);
}

export function diffStatsFromContents(oldContent: string, newContent: string): { added: number; removed: number } {
	return countDiffStats(numberedDiff(oldContent, newContent));
}
