// Pull request gate: `tsx scripts/acceptance/ci.ts [--body-file <f>] [--base <ref>] [--timeout <s>]`.
// Runs docs/acceptance/<N>.md for every issue the PR body closes. The criteria file must
// already be on the base branch: added or changed in the same PR fails the gate.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMain } from "../structure/lib";
import { DEFAULT_TIMEOUT_SECONDS, formatMarkdown } from "./execute";
import { EXIT_FAILED, EXIT_INVALID, EXIT_PASSED, runFiles } from "./run";

const MS_PER_SECOND = 1000;
const LINKED_ISSUE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;

export type CiInput = { body: string; base: string; cwd: string; timeoutMs: number };
export type CiResult = { exitCode: number; report: string; markdown: string };

export function linkedIssues(body: string): string[] {
  return [...new Set([...body.matchAll(LINKED_ISSUE)].map((match) => match[1]))];
}

/** Paths added, modified, renamed or copied on this branch compared with the base. */
function touchedPaths(base: string, cwd: string): Set<string> {
  const out = execFileSync("git", ["diff", "--name-status", `${base}...HEAD`], {
    cwd,
    encoding: "utf8",
  });
  const paths = out
    .split("\n")
    .filter((line) => /^[AMRC]/.test(line))
    .map((line) => line.split("\t").at(-1) ?? "");
  return new Set(paths);
}

function preconditionErrors(issues: string[], input: CiInput): string[] {
  const touched = touchedPaths(input.base, input.cwd);
  return issues.flatMap((issue) => {
    const path = `docs/acceptance/${issue}.md`;
    if (!existsSync(join(input.cwd, path)))
      return [`#${issue}: ${path} is missing; add ${path} through a separate PR before the work`];
    if (touched.has(path))
      return [
        `#${issue}: ${path} changed in this PR; criteria must be merged before the work, not changed with it`,
      ];
    return [];
  });
}

export async function runCi(input: CiInput): Promise<CiResult> {
  const issues = linkedIssues(input.body);
  if (issues.length === 0) {
    const report = "no linked issue, acceptance not required";
    return { exitCode: EXIT_PASSED, report, markdown: report };
  }
  const errors = preconditionErrors(issues, input);
  if (errors.length > 0) {
    const report = errors.join("\n");
    return {
      exitCode: EXIT_FAILED,
      report,
      markdown: errors.map((error) => `- ${error}`).join("\n"),
    };
  }
  const files = issues.map((issue) => join(input.cwd, `docs/acceptance/${issue}.md`));
  const result = await runFiles(files, input.cwd, input.timeoutMs);
  const table = result.outcomes.length > 0 ? formatMarkdown(result.outcomes) : result.report;
  return { exitCode: result.exitCode, report: result.report, markdown: table };
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function readBody(argv: string[]): string {
  const bodyFile = flag(argv, "--body-file");
  if (bodyFile !== undefined) return readFileSync(bodyFile, "utf8");
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("set GITHUB_EVENT_PATH or pass --body-file");
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as {
    pull_request?: { body?: string | null };
  };
  if (event.pull_request === undefined) throw new Error("event is not a pull_request");
  return event.pull_request.body ?? "";
}

function readBase(argv: string[]): string {
  const base = flag(argv, "--base");
  if (base !== undefined) return base;
  const ref = process.env.GITHUB_BASE_REF;
  if (!ref) throw new Error("set GITHUB_BASE_REF or pass --base");
  return `origin/${ref}`;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const timeoutSeconds = Number(flag(argv, "--timeout") ?? DEFAULT_TIMEOUT_SECONDS);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0)
    throw new Error("--timeout needs a positive number of seconds");
  const input = { body: readBody(argv), base: readBase(argv), cwd: process.cwd() };
  const result = await runCi({ ...input, timeoutMs: timeoutSeconds * MS_PER_SECOND });
  console.log(result.report);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) appendFileSync(summaryPath, `## Acceptance\n\n${result.markdown}\n`);
  return result.exitCode;
}

if (isMain(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`acceptance gate error: ${String(error)}`);
      process.exit(EXIT_INVALID);
    },
  );
}
