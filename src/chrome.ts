import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { QuietEditor } from "./composer.ts";
import { createSpacing, type Spacing } from "./spacing.ts";
import { applyThemePatch } from "./theme.ts";

/**
 * Installs the quiet chrome and returns the transcript-spacing handle.
 *
 * The editor factory is the only place pi hands out the TUI proxy, and that proxy is the only
 * route to the live component tree — so this is where the spacing patcher learns where to look.
 */
export function applyQuietChrome(ctx: ExtensionContext, spacing: Spacing = createSpacing()): Spacing {
	if (!ctx.hasUI) {
		return spacing;
	}
	applyThemePatch(ctx.ui);
	const theme = ctx.ui.theme;
	spacing.attachTheme(theme);
	const dim = (text: string) => theme.fg("dim", text);
	ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => {
		spacing.attachTui(tui);
		return new QuietEditor(tui, editorTheme, keybindings, dim);
	});
	return spacing;
}
