// S10 ratchet: new file over the limit fails; a baselined file that grew fails;
// a baselined file back under the limit must be removed from the baseline.
import { writeFileSync } from "node:fs";
import { countLines, isMain, listSourceFiles, readJson } from "./lib";

const MAX_FILE_LINES = 300;
const BASELINE_PATH = "structure-baseline/file-sizes.json";

type Baseline = Record<string, number>;

export function checkFileSizes(): string[] {
  const baseline = readJson<Baseline>(BASELINE_PATH);
  const errors: string[] = [];
  const sizes = new Map(listSourceFiles().map((file) => [file, countLines(file)]));

  for (const [file, lines] of sizes) {
    if (lines <= MAX_FILE_LINES) continue;
    const allowed = baseline[file];
    if (allowed === undefined)
      errors.push(`${file}: ${lines} lines, limit ${MAX_FILE_LINES}. Split it by responsibility.`);
    else if (lines > allowed)
      errors.push(
        `${file}: grew from ${allowed} to ${lines} lines. Baselined files may only shrink.`,
      );
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const lines = sizes.get(file);
    if (lines === undefined || lines <= MAX_FILE_LINES) {
      errors.push(`${file}: no longer over the limit; remove it from ${BASELINE_PATH}.`);
    } else if (lines < allowed) {
      errors.push(
        `${file}: shrank to ${lines} lines; lower its entry in ${BASELINE_PATH} (was ${allowed}).`,
      );
    }
  }
  return errors;
}

/** Writes today's oversized files into the baseline (adopting a running project). */
export function writeFileSizeBaseline(): void {
  const oversized = listSourceFiles()
    .map((file) => [file, countLines(file)] as const)
    .filter(([, lines]) => lines > MAX_FILE_LINES);
  writeFileSync(BASELINE_PATH, `${JSON.stringify(Object.fromEntries(oversized), null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--write-baseline")) writeFileSizeBaseline();
  const errors = checkFileSizes();
  errors.forEach((error) => console.error(error));
  process.exit(errors.length > 0 ? 1 : 0);
}
