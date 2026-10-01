import { describe, expect, it } from "vitest";
import { parseAcceptance } from "./parse";

const HEADER = "# Title\n\nItem: #7\n\n";
const GOOD = "- [ ] it builds\n      `true`\n";

function parse(body: string, path = "docs/acceptance/7.md") {
  return parseAcceptance(HEADER + body, path);
}

describe("parseAcceptance", () => {
  it("accepts every genuine marker and box form", () => {
    const body = [
      "- [ ] dash",
      "  `true`",
      "* [x] star",
      "  `true`",
      "+ [X] plus",
      "\t`true`",
      "1. [ ] dot",
      "   `echo [x] ok`",
      "\t12) [ ] paren",
      "    `true`",
    ].join("\n");
    const result = parse(body);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries.map((entry) => entry.line)).toEqual([5, 7, 9, 11, 13]);
  });

  const malformed = [
    "- []",
    "- [-] dash box",
    "- [/] slash box",
    "- [x ] wide box",
    "• [ ] bullet",
    "a) [ ] letter",
    "> - [ ] quoted",
    "AC1. [ ] labelled",
    "[AC12] [ ] bracketed label",
    "- [ ]no space after box",
    "[ ] bare box",
  ];
  it.each(malformed)("rejects the whole file for %j with its line number", (line) => {
    const result = parse(`${GOOD}${line}\n      \`true\`\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("7.md:7:");
  });

  it("rejects an entry without a command line", () => {
    const result = parse(`${GOOD}- [ ] no command\nplain text\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/:7: entry has no indented/);
  });

  it("rejects a command line that is not exactly one code span", () => {
    expect(parse("- [ ] two spans\n  `true` `true`\n").ok).toBe(false);
  });

  it("rejects a file with zero entries", () => {
    const result = parse("Just prose.\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("no entries");
  });

  it("rejects a missing Item line", () => {
    const result = parseAcceptance(`# Title\n\n${GOOD}`, "docs/acceptance/7.md");
    expect(result.ok).toBe(false);
  });

  it("rejects a mismatching Item line", () => {
    const result = parse(GOOD, "docs/acceptance/8.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("does not match");
  });

  it("does not treat ordinary prose or headings as task items", () => {
    expect(parse(`${GOOD}Some prose with [link](x) inside.\n## Notes\n`).ok).toBe(true);
  });
});
