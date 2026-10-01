// Acceptance runner: `tsx scripts/acceptance/run.ts [--timeout <s>] <file...>`.
// Exit 0 all criteria passed, 1 at least one failed, 2 a file is invalid or unreadable
// (nothing run) or an internal error. Commands run with a shell from the current directory.
import { isMain } from "../structure/lib";
import { type Outcome, formatReport, loadFile, parseArgs, runAll } from "./execute";

export const EXIT_PASSED = 0;
export const EXIT_FAILED = 1;
export const EXIT_INVALID = 2;

export type RunResult = { exitCode: number; outcomes: Outcome[]; report: string };

export async function runFiles(files: string[], cwd: string, timeoutMs: number) {
  if (files.length === 0)
    return { exitCode: EXIT_INVALID, outcomes: [], report: "no acceptance file given" };
  const loaded = files.map(loadFile);
  const errors = loaded.flatMap((result) => (result.ok ? [] : result.errors));
  if (errors.length > 0) {
    const report = ["REJECTED, nothing was run:", ...errors].join("\n");
    return { exitCode: EXIT_INVALID, outcomes: [], report };
  }
  const valid = loaded.flatMap((result) => (result.ok ? [result] : []));
  const outcomes = await runAll(valid, cwd, timeoutMs);
  const exitCode = outcomes.every((outcome) => outcome.passed) ? EXIT_PASSED : EXIT_FAILED;
  return { exitCode, outcomes, report: formatReport(outcomes) } satisfies RunResult;
}

async function main(): Promise<number> {
  const { files, timeoutMs } = parseArgs(process.argv.slice(2));
  const result = await runFiles(files, process.cwd(), timeoutMs);
  console.log(result.report);
  return result.exitCode;
}

if (isMain(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`acceptance runner error: ${String(error)}`);
      process.exit(EXIT_INVALID);
    },
  );
}
