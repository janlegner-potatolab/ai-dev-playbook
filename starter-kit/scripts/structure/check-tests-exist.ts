// S16: new or changed business logic ships with a test next to it.
// Errors: server/src/**/<x>Actions.ts and server/src/domain/<x>.ts without <x>.test.ts.
// Warnings: client/src/modules/**/<x>Model.ts without <x>Model.test.ts.
import { existsSync } from "node:fs";
import { changedFiles, isMain } from "./lib";

const REQUIRED = [/^server\/src\/.+Actions\.ts$/, /^server\/src\/domain\/.+\.ts$/];
const RECOMMENDED = [/^client\/src\/modules\/.+Model\.ts$/];

function testPathFor(file: string): string {
  return file.replace(/\.ts$/, ".test.ts");
}

function isSourceFile(file: string): boolean {
  return !file.endsWith(".test.ts") && !file.endsWith(".d.ts");
}

export function checkTestsExist(files: string[] = changedFiles("AM")): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const file of files.filter(isSourceFile)) {
    const missing = !existsSync(testPathFor(file));
    if (!missing || !existsSync(file)) continue;
    if (REQUIRED.some((pattern) => pattern.test(file)))
      errors.push(`${file}: missing test ${testPathFor(file)}.`);
    else if (RECOMMENDED.some((pattern) => pattern.test(file)))
      warnings.push(`${file}: no test ${testPathFor(file)} (recommended).`);
  }
  return { errors, warnings };
}

if (isMain(import.meta.url)) {
  const { errors, warnings } = checkTestsExist();
  warnings.forEach((warning) => console.warn(`warning: ${warning}`));
  errors.forEach((error) => console.error(error));
  process.exit(errors.length > 0 ? 1 : 0);
}
