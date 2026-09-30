// Runs the structure scripts that are not ESLint, dependency-cruiser or knip.
// Called by `npm run check:structure` after lint, check:deps and check:dead.
import { execFileSync } from "node:child_process";
import { checkBaselineShrinks } from "./check-baseline-shrinks";
import { checkFileSizes } from "./check-file-sizes";
import { checkNaming } from "./check-naming";
import { checkTestsExist } from "./check-tests-exist";

type Check = { name: string; run: () => string[] };

function checkMigrations(): string[] {
  try {
    execFileSync("bash", ["scripts/structure/check-migrations.sh"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return [];
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? String(error);
    return [stderr.trim()];
  }
}

function testsExist(): string[] {
  const { errors, warnings } = checkTestsExist();
  warnings.forEach((warning) => console.warn(`warning: ${warning}`));
  return errors;
}

const CHECKS: Check[] = [
  { name: "S10 file sizes", run: checkFileSizes },
  { name: "S14 naming", run: checkNaming },
  { name: "S15 migrations", run: checkMigrations },
  { name: "S16 tests exist", run: testsExist },
  { name: "S18 baselines shrink", run: checkBaselineShrinks },
];

let failed = 0;
for (const check of CHECKS) {
  const errors = check.run();
  if (errors.length === 0) continue;
  failed += 1;
  console.error(`FAIL ${check.name}`);
  errors.forEach((error) => console.error(`  ${error}`));
}
if (failed > 0) {
  console.error(`${failed} structure check(s) failed. Fix the code; do not edit the guards.`);
  process.exit(1);
}
console.log(`structure checks passed (${CHECKS.length})`);
