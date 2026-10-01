import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "./execute";
import { runFiles } from "./run";

const TIMEOUT_MS = 10_000;

function writeCriteria(entries: [string, string][], issue = "5"): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "acceptance-"));
  const body = entries.map(([text, command]) => `- [ ] ${text}\n      \`${command}\``).join("\n");
  const file = join(dir, `${issue}.md`);
  writeFileSync(file, `# Sample\n\nItem: #${issue}\n\n${body}\n`);
  return { dir, file };
}

describe("runFiles", () => {
  it("exits 0 when every command passes", async () => {
    const { dir, file } = writeCriteria([
      ["true passes", "true"],
      ["echo passes", "echo hello"],
    ]);
    const result = await runFiles([file], dir, TIMEOUT_MS);
    expect(result.exitCode).toBe(0);
    expect(result.report).toContain("2 of 2 criteria passed");
  });

  it("exits 1 on one failure and still runs the remaining commands", async () => {
    const { dir, file } = writeCriteria([
      ["fails", "echo broken >&2; exit 3"],
      ["runs after the failure", "touch ran-after"],
    ]);
    const result = await runFiles([file], dir, TIMEOUT_MS);
    expect(result.exitCode).toBe(1);
    expect(result.outcomes.map((outcome) => outcome.passed)).toEqual([false, true]);
    expect(result.outcomes[0].exitCode).toBe(3);
    expect(result.outcomes[0].tail).toContain("broken");
    expect(readFileSync(join(dir, "ran-after"), "utf8")).toBe("");
  });

  it("runs commands from the given directory", async () => {
    const { dir, file } = writeCriteria([["in dir", "test -f 5.md"]]);
    expect((await runFiles([file], dir, TIMEOUT_MS)).exitCode).toBe(0);
  });

  it("counts a timeout as a failure", async () => {
    const { dir, file } = writeCriteria([["hangs", "sleep 5"]]);
    const result = await runFiles([file], dir, 300);
    expect(result.exitCode).toBe(1);
    expect(result.outcomes[0].timedOut).toBe(true);
    expect(result.report).toContain("TIMEOUT");
  });

  it("exits 2 and runs nothing when a file is invalid", async () => {
    const { dir, file } = writeCriteria([["would create", "touch must-not-exist"]]);
    writeFileSync(file, `${readFileSync(file, "utf8")}- [] broken\n`);
    const result = await runFiles([file], dir, TIMEOUT_MS);
    expect(result.exitCode).toBe(2);
    expect(result.outcomes).toEqual([]);
    expect(result.report).toContain("REJECTED");
  });

  it("exits 2 for an unreadable file or no file", async () => {
    expect((await runFiles(["/nonexistent/9.md"], tmpdir(), TIMEOUT_MS)).exitCode).toBe(2);
    expect((await runFiles([], tmpdir(), TIMEOUT_MS)).exitCode).toBe(2);
  });
});

describe("parseArgs", () => {
  it("reads --timeout in seconds and defaults to 300", () => {
    expect(parseArgs(["a.md"]).timeoutMs).toBe(300_000);
    expect(parseArgs(["--timeout", "2", "a.md"])).toEqual({ files: ["a.md"], timeoutMs: 2000 });
  });

  it("throws on a bad timeout", () => {
    expect(() => parseArgs(["--timeout", "x"])).toThrow();
    expect(() => parseArgs(["--timeout"])).toThrow();
  });
});
