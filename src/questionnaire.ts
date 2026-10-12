import type { Theme } from "@earendil-works/pi-coding-agent";
import type { QuietRow } from "./render.ts";
import { DIAMOND, toolErrorParts } from "./summaries.ts";

/**
 * The quiet row for `ask_user_question` (the questionnaire tool registered by the
 * `@juicesharp/rpiv-ask-user-question` package).
 *
 * The questionnaire draws its own overlay while it runs, but the tool row pi leaves in the
 * transcript is the generic boxed fallback: one space of indent, a blank line above and below,
 * and up to ten lines of answer envelope. That is the only tool row in the transcript that is
 * not a `◆` one-liner, which is what this module fixes: `◆ Asking <chips>` while the
 * questionnaire is open, `◆ Asked <chips>` once it is answered (or `declined`), and one
 * `"<chip>"="<answer>"` line per question when the row is expanded.
 *
 * This extension cannot register that row itself — pi keeps the *first* registration per tool
 * name (`ExtensionRunner.getAllRegisteredTools`), and the questionnaire package loads before
 * this one in practice. The substitution therefore happens where the other pi-internal
 * couplings already are: inside the transcript container patch (`spacing.ts`), which asks for
 * these lines once per row per render and otherwise leaves the row alone. It keys off the row
 * component's own fields (`toolName`, `args`, `result`, `isPartial`, `expanded`), so a pi
 * release that renames them makes `questionnaireRow` returns `undefined` and the row falls
 * back to pi's default rendering instead of breaking.
 */

/** Canonical tool name, mirroring `ASK_USER_QUESTION_TOOL_NAME` in the questionnaire package. */
export const ASK_USER_QUESTION = "ask_user_question";

/** Placeholder for an unanswered option, matching the questionnaire's own envelope. */
export const NO_INPUT = "(no input)";

type AnyComponent = Record<string, any>;

/** One question as the model authored it — only the chip is read here. */
type QuestionShape = { header?: unknown };

/** One answer as the questionnaire records it on the tool result's `details`. */
type AnswerShape = {
	questionIndex?: unknown;
	question?: unknown;
	kind?: unknown;
	answer?: unknown;
	selected?: unknown;
	notes?: unknown;
};

type ResultShape = {
	content?: Array<{ type?: unknown; text?: unknown }>;
	details?: { answers?: unknown; cancelled?: unknown; error?: unknown };
};

/**
 * A questionnaire row: pi's own tool-execution component, recognised by the shape
 * `ToolExecutionComponent` gives it. Everything else — including rows other extensions
 * register — is left to its own renderer.
 */
export function isQuestionnaireRow(component: AnyComponent | undefined): component is AnyComponent {
	return !!component && component.toolName === ASK_USER_QUESTION && typeof component.updateResult === "function";
}

/**
 * What follows `Asked` / `Asking`: the model's own chips (`header`), in order. Falls back to a
 * count so a questionnaire authored without chips still says something.
 */
export function headerLabel(questions: readonly QuestionShape[]): string {
	const headers = questions
		.map((question) => (typeof question?.header === "string" ? question.header.trim() : ""))
		.filter((header) => header.length > 0);
	if (headers.length > 0) {
		return headers.join(", ");
	}
	return questions.length === 1 ? "1 question" : `${questions.length} questions`;
}

/** The row while the questionnaire is awaited: the live glyph, because it is still running. */
export function formatAsking(headers: string, marker: string = DIAMOND): string {
	return `${marker} Asking ${headers}`;
}

/** The row once the questionnaire has been answered. */
export function formatAsked(headers: string): string {
	return `${DIAMOND} Asked ${headers}`;
}

/** The row when the user abandoned the questionnaire (Esc). */
export function formatDeclined(headers: string): string {
	return `${DIAMOND} Asked ${headers}  declined`;
}

/** One answer as a scalar, mirroring the envelope's `option` / `custom` / `multi` handling. */
export function answerValue(answer: AnswerShape): string {
	if (answer.kind === "multi") {
		const selected = Array.isArray(answer.selected)
			? answer.selected.filter((item): item is string => typeof item === "string" && item.length > 0)
			: [];
		return selected.length > 0 ? selected.join(", ") : NO_INPUT;
	}
	return typeof answer.answer === "string" && answer.answer.length > 0 ? answer.answer : NO_INPUT;
}

/** One line of the expanded view: `"Reminder"="Type something"`. */
export function formatAnswerLine(key: string, value: string): string {
	return `"${key}"="${value}"`;
}

function questionsOf(args: unknown): QuestionShape[] {
	const questions = (args as { questions?: unknown } | undefined)?.questions;
	return Array.isArray(questions) ? (questions as QuestionShape[]) : [];
}

function answersOf(details: ResultShape["details"]): AnswerShape[] {
	return Array.isArray(details?.answers) ? (details.answers as AnswerShape[]) : [];
}

function textOf(result: ResultShape): string {
	return (result.content ?? [])
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text as string)
		.join("\n");
}

/**
 * The failure text without the questionnaire's own `Error: ` prefix (`◆ ask_user_question
 * UI not available …`), falling back to the error code when the text carries nothing.
 */
function errorDetail(text: string, error: unknown): string {
	const line = text.trim().split("\n")[0]?.replace(/^Error:\s*/, "") ?? "";
	if (line.length > 0) {
		return line;
	}
	return typeof error === "string" && error.length > 0 ? error : "error";
}

/**
 * The key of an expanded answer line: the question's chip when the call still carries it,
 * otherwise the question text the answer itself recorded.
 */
function answerKey(questions: QuestionShape[], answer: AnswerShape): string {
	const index = typeof answer.questionIndex === "number" ? answer.questionIndex : -1;
	const header = index >= 0 ? questions[index]?.header : undefined;
	if (typeof header === "string" && header.trim().length > 0) {
		return header.trim();
	}
	if (typeof answer.question === "string" && answer.question.length > 0) {
		return answer.question;
	}
	return index >= 0 ? `Question ${index + 1}` : "Answer";
}

/**
 * The expanded view: one `"<chip>"="<answer>"` line per answer, with the user's notes on their
 * own line. A selected option's `preview` is not repeated — the user read it in the overlay, and
 * it is markdown that would swamp the transcript. When a session was recorded before the
 * answers were stored as details, the envelope text stands in for them.
 */
function expandedLines(theme: Theme, questions: QuestionShape[], result: ResultShape): string[] {
	const answers = answersOf(result.details);
	if (answers.length === 0) {
		const text = textOf(result);
		return text.length > 0 ? text.split("\n").map((line) => theme.fg("dim", line)) : [];
	}
	const ordered = [...answers].sort(
		(left, right) => Number(left.questionIndex ?? 0) - Number(right.questionIndex ?? 0),
	);
	const lines: string[] = [];
	for (const answer of ordered) {
		const line = formatAnswerLine(answerKey(questions, answer), answerValue(answer));
		lines.push(theme.fg("toolOutput", line));
		if (typeof answer.notes === "string" && answer.notes.trim().length > 0) {
			lines.push(`${theme.fg("dim", "notes: ")}${theme.fg("toolOutput", answer.notes)}`);
		}
	}
	return lines;
}

/**
 * The quiet lines for a questionnaire row, or `undefined` when the component is not one (the
 * caller keeps pi's rendering then). Pending, answered, declined and failed each collapse to a
 * single line; only the expanded view adds the per-question answers. `liveMarker` is the
 * animated glyph the pending row wears instead of `◆`.
 */
export function questionnaireRow(
	component: AnyComponent | undefined,
	theme: Theme,
	liveMarker: string = DIAMOND,
): QuietRow | undefined {
	if (!isQuestionnaireRow(component)) {
		return undefined;
	}
	const questions = questionsOf(component.args);
	const headers = headerLabel(questions);
	const result = component.result as ResultShape | undefined;
	if (!result || component.isPartial === true) {
		return { parts: { title: formatAsking(headers, liveMarker) } };
	}
	const details = result.details;
	if (details?.error !== undefined) {
		return {
			error: true,
			parts: toolErrorParts(ASK_USER_QUESTION, errorDetail(textOf(result), details.error)),
		};
	}
	const declined = details?.cancelled === true;
	const header = declined ? formatDeclined(headers) : formatAsked(headers);
	if (component.expanded !== true) {
		return { parts: { title: header } };
	}
	return { parts: { title: header }, output: expandedLines(theme, questions, result) };
}
