// Parses docs/acceptance/<issue>.md into entries. Fail closed: any line that reads as a
// task item by shape but does not parse as one rejects the whole file with its line number.
import { basename } from "node:path";

export type Entry = { line: number; text: string; command: string };
export type ParseResult = { ok: true; entries: Entry[] } | { ok: false; errors: string[] };

// Genuine entry: indentation, marker (-, *, +, digits with . or )), space, box, space, text.
const ENTRY = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[([ xX])\][ \t]+(\S.*)$/;
// Shape of a task item: optional blockquote prefix, a marker-like run without whitespace
// or "[" (optionally carrying one bracketed token), optional whitespace, then a short box.
const TASK_SHAPE = /^\s*(?:>\s*)*[^\s[]*(?:\[[^\]]*\][^\s[]*)?\s*\[[^[\]]{0,3}\]/;
// Command line: indented, exactly one inline code span.
const COMMAND = /^[ \t]+`([^`]+)`[ \t]*$/;
const ITEM = /^Item:[ \t]*#(\d+)[ \t]*$/;

/** Issue number expected from a file name such as 123.md, or null. */
export function issueFromFileName(path: string): string | null {
  const match = /^(\d+)\.md$/.exec(basename(path));
  return match ? match[1] : null;
}

function checkItem(lines: string[], path: string): string[] {
  const expected = issueFromFileName(path);
  if (expected === null) return [`${path}: file name must be <issue-number>.md`];
  const items = lines.map((line) => ITEM.exec(line)).filter((match) => match !== null);
  if (items.length !== 1) return [`${path}: expected exactly one "Item: #${expected}" line`];
  const found = items[0][1];
  return found === expected ? [] : [`${path}: Item #${found} does not match file #${expected}`];
}

function parseEntries(lines: string[], path: string): { entries: Entry[]; errors: string[] } {
  const entries: Entry[] = [];
  const errors: string[] = [];
  const commandLines = new Set<number>();
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (commandLines.has(index)) return;
    const entry = ENTRY.exec(line);
    if (entry === null) {
      if (TASK_SHAPE.test(line))
        errors.push(`${path}:${lineNumber}: reads as a task item but does not parse: ${line}`);
      return;
    }
    const command = COMMAND.exec(lines[index + 1] ?? "");
    if (command === null) {
      errors.push(`${path}:${lineNumber}: entry has no indented \`command\` on the next line`);
      return;
    }
    commandLines.add(index + 1);
    entries.push({ line: lineNumber, text: entry[2].trim(), command: command[1].trim() });
  });
  return { entries, errors };
}

export function parseAcceptance(content: string, path: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const { entries, errors } = parseEntries(lines, path);
  errors.push(...checkItem(lines, path));
  if (entries.length === 0) errors.push(`${path}: no entries; at least one is required`);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, entries };
}
