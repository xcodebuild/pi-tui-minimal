import { homedir } from "node:os";

/**
 * Heuristic one-line summaries for bash commands, used when the model does not
 * supply a `description`. Deliberately conservative: an unclassifiable command
 * returns `undefined` so the caller can fall back to the raw `Run <command>` line.
 *
 * Phrasing follows the merged inspect lines in `summaries.ts`
 * ("Read 2 files, Listed 1 dir, Searched 3 patterns").
 */

export type SummaryOptions = {
	/** Home directory used to shorten paths to `~`. Defaults to the real home. */
	home?: string;
};

const MAX_SUMMARY = 80;
const MAX_PATH = 34;
const MAX_PATTERN = 22;

type Ctx = { home: string };

function collapse(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Collapse a model-provided description into a single printable line. */
export function cleanSummary(text: string): string {
	return truncate(collapse(text), MAX_SUMMARY);
}

function shortPath(value: string, ctx: Ctx): string {
	let out = value;
	if (ctx.home && (out === ctx.home || out.startsWith(`${ctx.home}/`))) {
		out = `~${out.slice(ctx.home.length)}`;
	}
	out = out.replace(/\/+$/, "");
	return truncate(out || "/", MAX_PATH);
}

function shortPattern(value: string): string {
	return truncate(collapse(value), MAX_PATTERN);
}

/** Join up to two names, then count the rest: `a, b +2 more`. */
function nameList(values: string[]): string {
	const unique = [...new Set(values.filter(Boolean))];
	if (unique.length === 0) {
		return "";
	}
	if (unique.length <= 2) {
		return unique.join(", ");
	}
	return `${unique.slice(0, 2).join(", ")} +${unique.length - 2} more`;
}

/** Split on top-level `;`, `&&`, `||`, newline and single `&`, respecting quotes. */
export function splitSegments(command: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: '"' | "'" | undefined;

	for (let index = 0; index < command.length; index++) {
		const char = command[index]!;
		const next = command[index + 1];
		if (quote) {
			current += char;
			if (char === "\\" && quote === '"') {
				index++;
				if (index < command.length) {
					current += command[index]!;
				}
				continue;
			}
			if (char === quote) {
				quote = undefined;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			continue;
		}
		if (char === "\\") {
			index++;
			if (index < command.length) {
				current += command[index]!;
			}
			continue;
		}
		if (char === "\n" || char === ";") {
			parts.push(current);
			current = "";
			continue;
		}
		if ((char === "&" || char === "|") && next === char) {
			parts.push(current);
			current = "";
			index++;
			continue;
		}
		// A lone `&` backgrounds a command; `2>&1` keeps the `&` in the token.
		if (char === "&" && command[index - 1] !== ">") {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}

	parts.push(current);
	return parts.map((part) => part.trim()).filter(Boolean);
}

function tokenize(segment: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | undefined;
	const push = () => {
		if (current !== "") {
			tokens.push(current);
			current = "";
		}
	};

	for (let index = 0; index < segment.length; index++) {
		const char = segment[index]!;
		if (quote) {
			if (char === quote) {
				quote = undefined;
				continue;
			}
			if (char === "\\" && quote === '"') {
				index++;
				if (index < segment.length) {
					current += segment[index]!;
				}
				continue;
			}
			current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (char === "\\") {
			index++;
			if (index < segment.length) {
				current += segment[index]!;
			}
			continue;
		}
		if (/\s/.test(char)) {
			push();
			continue;
		}
		// Only the first command of a pipeline matters for the summary.
		if (char === "|") {
			push();
			return tokens;
		}
		current += char;
	}

	push();
	return tokens;
}

/** Drop redirections and leading `VAR=value` assignments. */
function stripNoise(tokens: string[]): string[] {
	const out: string[] = [];
	let index = 0;
	while (index < tokens.length) {
		const token = tokens[index]!;
		if (index === 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
			index++;
			continue;
		}
		const output = /^(?:&>>?|\d+>>?)(.*)$/.exec(token) ?? /^(?:\d*<)(.*)$/.exec(token);
		if (output) {
			// `2>` / `2>/dev/null` / `2>&1` — one token, or token plus its target.
			index += output[1] ? 1 : 2;
			continue;
		}
		if (token === "/dev/null") {
			index++;
			continue;
		}
		out.push(token);
		index++;
	}
	return out;
}

const NOISE = new Set(["echo", "printf", "true", "false", ":", "export", "unset", "clear", "pwd"]);

type Classify = (args: string[], ctx: Ctx) => string | undefined;

function positionals(args: string[]): string[] {
	return args.filter((arg) => !arg.startsWith("-"));
}

function firstPositional(args: string[]): string | undefined {
	return positionals(args)[0];
}

function flagValue(args: string[], names: string[]): string | undefined {
	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		if (names.includes(arg)) {
			return args[index + 1];
		}
	}
	return undefined;
}

const SEARCHERS = new Set(["rg", "grep", "ggrep", "egrep", "fgrep", "ag", "ack", "ffgrep"]);
const FINDERS = new Set(["find", "fd", "fffind"]);
const READERS = new Set(["cat", "bat", "head", "tail", "less", "more", "wc"]);
const TEST_RUNNERS = new Set(["vitest", "jest", "mocha", "pytest", "playwright", "cypress"]);

const CLASSIFIERS: Record<string, Classify> = {
	ls: (args, ctx) => {
		const dirs = positionals(args);
		return `Listed ${dirs.length ? nameList(dirs.map((dir) => shortPath(dir, ctx))) : "."}`;
	},
	mkdir: (args, ctx) => {
		const dir = firstPositional(args);
		return dir ? `Created ${shortPath(dir, ctx)}` : "Created a directory";
	},
	rm: (args, ctx) => {
		const targets = positionals(args);
		return targets.length ? `Removed ${nameList(targets.map((target) => shortPath(target, ctx)))}` : "Removed files";
	},
	rmdir: (args, ctx) => {
		const dir = firstPositional(args);
		return dir ? `Removed ${shortPath(dir, ctx)}` : "Removed a directory";
	},
	mv: (args, ctx) => {
		const [from, to] = positionals(args);
		if (!from) {
			return "Moved files";
		}
		return to ? `Moved ${shortPath(from, ctx)} to ${shortPath(to, ctx)}` : `Moved ${shortPath(from, ctx)}`;
	},
	cp: (args, ctx) => {
		const [from, to] = positionals(args);
		if (!from) {
			return "Copied files";
		}
		return to ? `Copied ${shortPath(from, ctx)} to ${shortPath(to, ctx)}` : `Copied ${shortPath(from, ctx)}`;
	},
	touch: (args, ctx) => {
		const targets = positionals(args);
		return targets.length ? `Created ${nameList(targets.map((target) => shortPath(target, ctx)))}` : undefined;
	},
	chmod: (args, ctx) => {
		const target = positionals(args)[1];
		return target ? `Changed permissions of ${shortPath(target, ctx)}` : "Changed file permissions";
	},
	which: (args) => {
		const target = firstPositional(args);
		return target ? `Located ${target}` : undefined;
	},
	open: (args, ctx) => {
		const target = firstPositional(args);
		return target ? `Opened ${shortPath(target, ctx)}` : "Opened a file";
	},
	git: (args) => {
		const sub = firstPositional(args);
		if (!sub) {
			return "git";
		}
		if (sub === "add" || sub === "commit") {
			const target = positionals(args)[1];
			return target && sub === "add" ? `git add ${target}` : `git ${sub}`;
		}
		return `git ${sub}`;
	},
	npm: (args) => packageManager("npm", args),
	pnpm: (args) => packageManager("pnpm", args),
	yarn: (args) => packageManager("yarn", args),
	bun: (args) => packageManager("bun", args),
	node: (args, ctx) => {
		if (args.some((arg) => arg === "-e" || arg === "--eval" || arg === "--print")) {
			return "Ran a node script";
		}
		const file = firstPositional(args);
		return file ? `Ran node ${shortPath(file, ctx)}` : "Ran node";
	},
	npx: (args, ctx) => {
		const tool = firstPositional(args);
		if (!tool) {
			return "Ran npx";
		}
		if (tool === "tsc") {
			return "Type-checked";
		}
		if (TEST_RUNNERS.has(tool)) {
			return "Ran tests";
		}
		return `Ran npx ${tool}${nextTarget(args, tool, ctx)}`;
	},
	tsc: () => "Type-checked",
	eslint: () => "Linted",
	biome: () => "Linted",
	prettier: () => "Formatted",
	ruff: () => "Linted",
	make: (args) => {
		const target = firstPositional(args);
		return target ? `Ran make ${target}` : "Ran make";
	},
	sleep: () => "Waited",
	ps: () => "Listed processes",
	top: () => "Listed processes",
	kill: () => "Stopped a process",
	pkill: () => "Stopped a process",
	df: () => "Checked disk usage",
	du: () => "Checked disk usage",
	jq: () => "Parsed JSON",
	source: (args, ctx) => {
		const file = firstPositional(args);
		return file ? `Sourced ${shortPath(file, ctx)}` : undefined;
	},
	curl: (args) => fetchLine(args),
	wget: (args) => fetchLine(args),
	docker: (args) => {
		const parts = positionals(args).slice(0, 2);
		return parts.length ? `docker ${parts.join(" ")}` : "docker";
	},
	python: (args, ctx) => runtime("python", args, ctx),
	python3: (args, ctx) => runtime("python", args, ctx),
	pip: (args) => installLine("python packages", args),
	pip3: (args) => installLine("python packages", args),
	uv: (args) => installLine("python packages", args),
	cargo: (args) => {
		const sub = firstPositional(args);
		if (sub === "test") {
			return "Ran tests";
		}
		if (sub === "build") {
			return "Built the crate";
		}
		return sub ? `cargo ${sub}` : "cargo";
	},
	go: (args) => {
		const sub = firstPositional(args);
		if (sub === "test") {
			return "Ran tests";
		}
		return sub ? `go ${sub}` : "go";
	},
	sort: () => "Sorted text",
	uniq: () => "Processed text",
	tr: () => "Processed text",
	cut: () => "Processed text",
	sed: () => "Edited text in a stream",
	awk: () => "Processed text",
};

function nextTarget(args: string[], tool: string, ctx: Ctx): string {
	const index = args.indexOf(tool);
	const target = index >= 0 ? args.slice(index + 1).find((arg) => !arg.startsWith("-")) : undefined;
	return target ? ` ${shortPath(target, ctx)}` : "";
}

function packageManager(tool: string, args: string[]): string | undefined {
	const sub = firstPositional(args);
	if (!sub) {
		return `Ran ${tool}`;
	}
	if (sub === "test" || sub === "t") {
		return "Ran tests";
	}
	if (sub === "run") {
		const script = positionals(args)[1];
		return script ? `Ran ${script}` : `Ran ${tool} run`;
	}
	if (sub === "install" || sub === "i" || sub === "ci" || sub === "add") {
		return "Installed dependencies";
	}
	if (sub === "ls" || sub === "list") {
		return "Listed dependencies";
	}
	if (sub === "exec") {
		const command = positionals(args)[1];
		return command ? `Ran ${command}` : `Ran ${tool} exec`;
	}
	if (sub === "version") {
		return "Checked tool versions";
	}
	return `Ran ${tool} ${sub}`;
}

function runtime(tool: string, args: string[], ctx: Ctx): string {
	if (args.some((arg) => arg === "-c" || arg === "-m")) {
		return `Ran a ${tool} snippet`;
	}
	const file = firstPositional(args);
	return file ? `Ran ${tool} ${shortPath(file, ctx)}` : `Ran ${tool}`;
}

function installLine(what: string, args: string[]): string | undefined {
	const sub = firstPositional(args);
	if (!sub) {
		return undefined;
	}
	if (sub === "install" || sub === "add" || sub === "sync" || sub === "i") {
		return `Installed ${what}`;
	}
	return `Ran pip ${sub}`;
}

function fetchLine(args: string[]): string {
	const url = positionals(args).find((arg) => /^[a-z]+:\/\//i.test(arg));
	if (!url) {
		return "Fetched a URL";
	}
	try {
		const parsed = new URL(url);
		return `Fetched ${truncate(parsed.host + parsed.pathname, MAX_PATH)}`;
	} catch {
		return "Fetched a URL";
	}
}

function describe(tokens: string[], ctx: Ctx): string | undefined {
	const command = tokens[0]!;
	const args = tokens.slice(1);

	if (SEARCHERS.has(command)) {
		const pattern = flagValue(args, ["-e", "--regexp", "-g", "--glob", "--type", "-t"]) ?? firstPositional(args);
		const paths = positionals(args).filter((arg) => arg !== pattern);
		const where = paths.length ? ` in ${nameList(paths.map((path) => shortPath(path, ctx)))}` : "";
		return `Searched '${shortPattern(pattern ?? "")}'${where}`;
	}
	if (FINDERS.has(command)) {
		const pattern = firstPositional(args);
		return `Found '${shortPattern(pattern ?? "")}'`;
	}
	if (READERS.has(command)) {
		const files = positionals(args);
		if (!files.length) {
			return command === "wc" ? "Counted lines" : "Read input";
		}
		return command === "wc"
			? `Counted ${nameList(files.map((file) => shortPath(file, ctx)))}`
			: `Read ${nameList(files.map((file) => shortPath(file, ctx)))}`;
	}
	if (TEST_RUNNERS.has(command)) {
		return "Ran tests";
	}

	const classifier = CLASSIFIERS[command];
	return classifier ? classifier(args, ctx) : undefined;
}

/**
 * Build a short human summary for a shell command. Returns `undefined` when the
 * command is not recognizable enough to summarize.
 */
export function summarizeCommand(command: string, options: SummaryOptions = {}): string | undefined {
	const ctx: Ctx = { home: options.home ?? homedir() };
	const described: string[] = [];

	for (const segment of splitSegments(command)) {
		const tokens = stripNoise(tokenize(segment));
		if (!tokens.length) {
			continue;
		}
		// `cd` only sets context; the expanded view still shows the full command.
		if (tokens[0] === "cd") {
			continue;
		}
		const text = describe(tokens, ctx);
		if (text) {
			described.push(text);
			continue;
		}
		if (NOISE.has(tokens[0]!)) {
			continue;
		}
		described.push(truncate(collapse(tokens.join(" ")), 48));
	}

	const deduped = described.filter((text, index) => text !== described[index - 1]);
	if (!deduped.length) {
		return undefined;
	}
	if (deduped.length === 1) {
		return truncate(deduped[0]!, MAX_SUMMARY);
	}
	const head = deduped.slice(0, 3).join("; ");
	const rest = deduped.length > 3 ? ` +${deduped.length - 3} more` : "";
	return truncate(`${head}${rest}`, MAX_SUMMARY);
}
