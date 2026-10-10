import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";

/**
 * pi's editor with dim top/bottom rules and nothing else: no filled interior, no prompt prefix,
 * and no rewriting of the render output. Every line stays as pi produced it, so the `↑ N more` /
 * `↓ N more` scroll indicators, the working-status text `CustomEditor` embeds in the top rule, and
 * the autocomplete list's own `→` selection marker all keep their original formatting.
 */
export class QuietEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		colorize: (text: string) => string,
	) {
		super(tui, { ...theme, borderColor: colorize }, keybindings);
	}
}
