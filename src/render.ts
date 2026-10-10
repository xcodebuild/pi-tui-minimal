import { Container, Text, type Component } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { emphasizeError, emphasizeHeader } from "./emphasis.ts";

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

export function emptyComponent(): Component {
	return new Text("", 0, 0);
}

export function lineComponent(text: string): Component {
	return new Text(text, 0, 0);
}

export function dimLine(theme: Theme, text: string): Component {
	return new Text(theme.fg("dim", text), 0, 0);
}

/** Tool rows go through here, so this is where the emphasis layer styles them. */
export function headerLine(theme: Theme, text: string): Component {
	return new Text(emphasizeHeader(theme, text), 0, 0);
}

export function errorLine(theme: Theme, text: string): Component {
	return new Text(emphasizeError(theme, text), 0, 0);
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
