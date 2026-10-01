import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linkedIssues, runCi } from "./ci";

const TIMEOUT_MS = 10_000;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function criteria(issue: string, command: string): string {
  return `# Sample\n\nItem: #${issue}\n\n- [ ] decides it\n      \`${command}\`\n`;
}

/** Temp repo: base commit with docs/acceptance/12.md, then a work branch commit. */
function makeRepo(command = "true"): { cwd: string; base: string } {
  const cwd = mkdtempSync(join(tmpdir(), "acceptance-ci-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "test");
  mkdirSync(join(cwd, "docs/acceptance"), { recursive: true });
  writeFileSync(join(cwd, "docs/acceptance/12.md"), criteria("12", command));
  git(cwd, "add", "-A");
  git(cwd, "commit", "-qm", "criteria");
  const base = git(cwd, "rev-parse", "HEAD");
  writeFileSync(join(cwd, "work.txt"), "work\n");
  git(cwd, "add", "-A");
  git(cwd, "commit", "-qm", "work");
  return { cwd, base };
}

describe("linkedIssues", () => {
  it("finds Closes, Fixes and Resolves case-insensitively", () => {
    expect(linkedIssues("closes #1, FIXES #2 and Resolves #3. Refs #4. Closes #1")).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});

describe("runCi", () => {
  it("exits 0 with a notice when no issue is linked", async () => {
    const { cwd, base } = makeRepo();
    const result = await runCi({ body: "Refs #12", base, cwd, timeoutMs: TIMEOUT_MS });
    expect(result.exitCode).toBe(0);
    expect(result.report).toContain("no linked issue, acceptance not required");
  });

  it("exits 1 when the criteria file is missing", async () => {
    const { cwd, base } = makeRepo();
    const result = await runCi({ body: "Closes #99", base, cwd, timeoutMs: TIMEOUT_MS });
    expect(result.exitCode).toBe(1);
    expect(result.report).toContain("add docs/acceptance/99.md through a separate PR");
  });

  it("exits 1 when the criteria file is modified in the PR", async () => {
    const { cwd, base } = makeRepo();
    writeFileSync(join(cwd, "docs/acceptance/12.md"), criteria("12", "echo weaker"));
    git(cwd, "commit", "-qam", "weaken criteria");
    const result = await runCi({ body: "Fixes #12", base, cwd, timeoutMs: TIMEOUT_MS });
    expect(result.exitCode).toBe(1);
    expect(result.report).toContain("criteria must be merged before the work");
  });

  it("exits 1 when the criteria file is added in the PR", async () => {
    const { cwd, base } = makeRepo();
    writeFileSync(join(cwd, "docs/acceptance/13.md"), criteria("13", "true"));
    git(cwd, "add", "-A");
    git(cwd, "commit", "-qm", "add criteria with work");
    const result = await runCi({ body: "Resolves #13", base, cwd, timeoutMs: TIMEOUT_MS });
    expect(result.exitCode).toBe(1);
  });

  it("exits 0 for an untouched file whose commands pass", async () => {
    const { cwd, base } = makeRepo("test -f work.txt");
    const result = await runCi({ body: "Closes #12", base, cwd, timeoutMs: TIMEOUT_MS });
    expect(result.exitCode).toBe(0);
    expect(result.markdown).toContain("| PASS |");
  });

  it("exits 1 for an untouched file whose command fails", async () => {
    const { cwd, base } = makeRepo("test -f missing.txt");
    const result = await runCi({ body: "Closes #12", base, cwd, timeoutMs: TIMEOUT_MS });
    expect(result.exitCode).toBe(1);
  });
});
