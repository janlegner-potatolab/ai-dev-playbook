// S20: weekly structure report. Prints one line per metric for a human to read.
// Informational only: always exits 0 unless the script itself breaks.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { countEntries } from "./check-baseline-shrinks";
import { checkNaming } from "./check-naming";
import { countLines, listSourceFiles } from "./lib";

const MAX_FILE_LINES = 300;
const BASELINE_DIR = "structure-baseline";
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

type EslintResult = { messages: Array<{ ruleId: string | null; message: string }> };

function runJson<T>(command: string, args: string[]): T | undefined {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: OUTPUT_LIMIT_BYTES });
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    console.error(
      `report: could not read ${command} ${args.join(" ")} output (exit ${result.status}).`,
    );
    return undefined;
  }
}

function eslintCounts(): Record<string, number> {
  const results =
    runJson<EslintResult[]>("npx", ["--no-install", "eslint", ".", "--format", "json"]) ?? [];
  const counts: Record<string, number> = {};
  for (const message of results.flatMap((result) => result.messages)) {
    const bareUi = message.message.startsWith("Use a component from client/src/components/ui");
    const key = bareUi ? "bare-ui" : (message.ruleId ?? "parse-error");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function dependencyViolations(): number {
  const dirs = ["server", "client", "packages"].filter((dir) => existsSync(dir));
  const args = [
    "--no-install",
    "depcruise",
    ...dirs,
    "--config",
    ".dependency-cruiser.cjs",
    "--output-type",
    "json",
  ];
  const result = runJson<{ summary: { violations: unknown[] } }>("npx", args);
  return result?.summary.violations.length ?? -1;
}

function baselineEntries(): number {
  return readdirSync(BASELINE_DIR)
    .filter((name) => name.endsWith(".json"))
    .reduce(
      (sum, name) =>
        sum + countEntries(JSON.parse(readFileSync(`${BASELINE_DIR}/${name}`, "utf8"))),
      0,
    );
}

const files = listSourceFiles();
const sources = files.map((file) => readFileSync(file, "utf8"));
const lint = eslintCounts();
const clientLogicLines = files
  .filter(
    (file) =>
      file.startsWith("client/src/") &&
      !/(Model|\.test)\.tsx?$/.test(file) &&
      !file.includes("/components/"),
  )
  .reduce((sum, file) => sum + countLines(file), 0);

const rows: Array<[string, number | string]> = [
  ["Files over limit", files.filter((file) => countLines(file) > MAX_FILE_LINES).length],
  ["Functions over limit", lint["max-lines-per-function"] ?? 0],
  ["Bare UI elements", lint["bare-ui"] ?? 0],
  ["Architecture violations", dependencyViolations()],
  [
    "eslint-disable total",
    sources.reduce((sum, text) => sum + (text.match(/eslint-disable/g) ?? []).length, 0),
  ],
  ["Naming errors", checkNaming(files).length],
  ["Client lines outside *Model.ts", clientLogicLines],
  ["Baseline entries", baselineEntries()],
  ["Dead code", "run npm run check:dead"],
];

console.log(`Structure report ${new Date().toISOString().slice(0, 10)}`);
for (const [metric, value] of rows) console.log(`  ${metric.padEnd(32)} ${value}`);
