// Runs validated acceptance entries with a shell and reports the results.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { type Entry, parseAcceptance } from "./parse";

export const DEFAULT_TIMEOUT_SECONDS = 300;
const OUTPUT_TAIL_CHARS = 2000;
const MS_PER_SECOND = 1000;

export type Outcome = {
  file: string;
  entry: Entry;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  tail: string;
};

export type Loaded = { ok: true; file: string; entries: Entry[] } | { ok: false; errors: string[] };

/** Reads and validates one file. Unreadable counts as invalid. */
export function loadFile(file: string): Loaded {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch (error) {
    return { ok: false, errors: [`${file}: cannot read (${String(error)})`] };
  }
  const parsed = parseAcceptance(content, file);
  return parsed.ok ? { ok: true, file, entries: parsed.entries } : parsed;
}

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    console.error(`could not kill process group ${pid}: ${String(error)}`);
  }
}

export function runEntry(file: string, entry: Entry, cwd: string, timeoutMs: number) {
  return new Promise<Outcome>((resolve) => {
    const started = Date.now();
    let output = "";
    let timedOut = false;
    const child = spawn(entry.command, { cwd, shell: true, detached: true });
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-OUTPUT_TAIL_CHARS);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);
    const finish = (exitCode: number | null, extra = "") => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const passed = exitCode === 0 && !timedOut;
      resolve({ file, entry, passed, exitCode, timedOut, durationMs, tail: output + extra });
    };
    child.on("error", (error) => finish(null, `\nspawn error: ${error.message}`));
    child.on("close", (code) => finish(code));
  });
}

export async function runAll(
  files: { file: string; entries: Entry[] }[],
  cwd: string,
  timeoutMs: number,
): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const { file, entries } of files) {
    for (const entry of entries) outcomes.push(await runEntry(file, entry, cwd, timeoutMs));
  }
  return outcomes;
}

function status(outcome: Outcome): string {
  if (outcome.passed) return "PASS";
  return outcome.timedOut ? "TIMEOUT" : "FAIL";
}

export function formatReport(outcomes: Outcome[]): string {
  const rows = outcomes.map((outcome) => {
    const seconds = (outcome.durationMs / MS_PER_SECOND).toFixed(1);
    const where = `${outcome.file}:${outcome.entry.line}`;
    return `${status(outcome).padEnd(7)}  ${seconds.padStart(6)}s  ${where}  ${outcome.entry.text}\n         $ ${outcome.entry.command}`;
  });
  const failures = outcomes
    .filter((outcome) => !outcome.passed)
    .map((outcome) => `--- ${outcome.entry.text} (exit ${outcome.exitCode})\n${outcome.tail}`);
  const passed = outcomes.filter((outcome) => outcome.passed).length;
  const summary = `${passed} of ${outcomes.length} criteria passed`;
  return [...rows, ...failures, summary].join("\n");
}

export function formatMarkdown(outcomes: Outcome[]): string {
  const escape = (text: string) => text.replace(/\|/g, "\\|");
  const rows = outcomes.map((outcome) => {
    const seconds = (outcome.durationMs / MS_PER_SECOND).toFixed(1);
    return `| ${status(outcome)} | ${escape(outcome.entry.text)} | \`${escape(outcome.entry.command)}\` | ${seconds}s |`;
  });
  return ["| Status | Criterion | Command | Duration |", "| --- | --- | --- | --- |", ...rows].join(
    "\n",
  );
}

export type Parsed = { files: string[]; timeoutMs: number };

/** Parses `--timeout <seconds>` and file arguments; throws on bad input. */
export function parseArgs(argv: string[]): Parsed {
  const files: string[] = [];
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--timeout") {
      files.push(arg);
      continue;
    }
    timeoutSeconds = Number(argv[index + 1]);
    index += 1;
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0)
      throw new Error(`--timeout needs a positive number of seconds`);
  }
  return { files, timeoutMs: timeoutSeconds * MS_PER_SECOND };
}
