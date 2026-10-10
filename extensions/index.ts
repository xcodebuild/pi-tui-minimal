import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BurstTracker } from "../src/burst.ts";
import { applyQuietChrome } from "../src/chrome.ts";
import { createSpacing } from "../src/spacing.ts";
import { registerQuietTools } from "../src/tools.ts";
import { attachThinking } from "../src/thinking.ts";

// Themes are declared in package.json (`pi.themes`). Do not also return the theme
// directory from `resources_discover`: pi merges the manifest's *file* paths with the
// hook's *directory* path, loads quiet.json twice under the same name, and reports a
// `"quiet" collision` (same source path wins, same source path skipped).
export default function (pi: ExtensionAPI) {
	const thinking = attachThinking(pi);
	const spacing = createSpacing();
	// The transcript patch rebuilds an assistant message when Ctrl+O flips, so the thinking
	// transformer runs again and hands the raw thinking text back instead of its one-line label.
	spacing.attachExpansion(() => thinking.toolsExpanded());
	registerQuietTools(pi, new BurstTracker(), spacing);

	// Assistant messages carry a blank line of their own; these events are the earliest the
	// patch can be installed in a turn that never runs a tool.
	for (const event of ["message_start", "message_update", "message_end"] as const) {
		pi.on(event, async () => {
			spacing.sweep();
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) {
			return;
		}
		applyQuietChrome(ctx, spacing);
		thinking.onSessionStart(ctx);
	});
}
