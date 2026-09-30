// S18: exception lists may only shrink. Compares the entry count of every file in
// structure-baseline/ with the same file on the base ref; growth fails.
import { readdirSync, readFileSync } from "node:fs";
import { BASE_REF, git, hasBaseRef, isMain } from "./lib";

const BASELINE_DIR = "structure-baseline";

/** Counts leaf entries: object keys and array items, recursively for nested containers. */
export function countEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce<number>(
      (sum, child) => sum + (child !== null && typeof child === "object" ? countEntries(child) : 1),
      0,
    );
  }
  return 0;
}

function baseCount(path: string): number {
  try {
    return countEntries(JSON.parse(git(["show", `${BASE_REF}:${path}`])));
  } catch {
    return 0;
  }
}

export function checkBaselineShrinks(): string[] {
  if (!hasBaseRef()) return [];
  const errors: string[] = [];
  const files = readdirSync(BASELINE_DIR).filter((name) => name.endsWith(".json"));
  for (const name of files) {
    const path = `${BASELINE_DIR}/${name}`;
    const now = countEntries(JSON.parse(readFileSync(path, "utf8")));
    const before = baseCount(path);
    if (now > before) {
      errors.push(
        `${path}: ${before} -> ${now} entries. Exception lists may only shrink; fix the code instead.`,
      );
    }
  }
  return errors;
}

if (isMain(import.meta.url)) {
  if (!hasBaseRef())
    console.warn(`warning: base ref ${BASE_REF} not found, baseline check skipped.`);
  const errors = checkBaselineShrinks();
  errors.forEach((error) => console.error(error));
  process.exit(errors.length > 0 ? 1 : 0);
}
