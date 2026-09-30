// Shared helpers for the structure scripts: git access, file listing, JSON reading.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const BASE_REF = process.env.STRUCTURE_BASE_REF ?? "origin/main";
export const SOURCE_DIRS = ["server/src", "client/src", "packages", "scripts", "e2e"];
export const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;

export function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function hasBaseRef(): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", BASE_REF]);
    return true;
  } catch {
    return false;
  }
}

/** Tracked and untracked (not ignored) source files under SOURCE_DIRS. */
export function listSourceFiles(): string[] {
  const dirs = SOURCE_DIRS.filter((dir) => existsSync(dir));
  if (dirs.length === 0) return [];
  const out = git(["ls-files", "--cached", "--others", "--exclude-standard", "--", ...dirs]);
  return out
    .split("\n")
    .filter((file) => SOURCE_EXTENSIONS.test(file) && !file.endsWith(".d.ts") && existsSync(file));
}

/** Files added or modified on this branch compared with BASE_REF (empty without it). */
export function changedFiles(filter: "A" | "AM"): string[] {
  if (!hasBaseRef()) return [];
  const out = git(["diff", "--name-only", `--diff-filter=${filter}`, `${BASE_REF}...HEAD`]);
  return out.split("\n").filter(Boolean);
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function countLines(path: string): number {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "").length;
}

/** True when the module is the script started from the command line. */
export function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && moduleUrl === pathToFileURL(entry).href;
}
