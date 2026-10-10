export const fakeTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	italic: (text: string) => text,
} as any;

/**
 * A theme that makes styling visible: `fg` wraps in `[color]…[/]`, `bold` in `<b>…</b>`.
 * Used to assert what the emphasis layer accents, since `fakeTheme` renders identity.
 */
export const markerTheme = {
	fg: (color: string, text: string) => `[${color}]${text}[/]`,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => `<b>${text}</b>`,
	italic: (text: string) => text,
} as any;

export function renderContext(overrides: Record<string, unknown> = {}) {
	return {
		args: {},
		toolCallId: "t1",
		invalidate: () => {},
		lastComponent: undefined,
		state: {},
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: false,
		showImages: false,
		isError: false,
		...overrides,
	} as any;
}
