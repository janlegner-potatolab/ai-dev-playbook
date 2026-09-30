// S14: names follow the language rule and the glossary.
// Walks declarations (variables, functions, classes, types, interfaces, enums,
// properties, methods, parameters) and file names via the TypeScript compiler API.
// Errors: diacritics in a name; a word listed as "forbidden" in docs/glossary.json.
// Exceptions (foreign API keys, DB columns) live in structure-baseline/naming-exceptions.json.
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import ts from "typescript";
import { isMain, listSourceFiles, readJson } from "./lib";

const GLOSSARY_PATH = "docs/glossary.json";
const EXCEPTIONS_PATH = "structure-baseline/naming-exceptions.json";
const NON_ASCII = /[^ -~]/;
const DECLARATION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Parameter,
]);

type GlossaryEntry = { term: string; code: string; meaning: string; forbidden?: string[] };
type Exceptions = { identifiers: string[]; files: string[] };

/** Splits camelCase, PascalCase, snake_case and kebab-case into lowercase words. */
export function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function loadForbidden(): Map<string, string> {
  const forbidden = new Map<string, string>();
  if (!existsSync(GLOSSARY_PATH)) return forbidden;
  for (const entry of readJson<GlossaryEntry[]>(GLOSSARY_PATH)) {
    for (const word of entry.forbidden ?? []) forbidden.set(word.toLowerCase(), entry.code);
  }
  return forbidden;
}

function loadExceptions(): Exceptions {
  if (!existsSync(EXCEPTIONS_PATH)) return { identifiers: [], files: [] };
  return readJson<Exceptions>(EXCEPTIONS_PATH);
}

export function checkName(name: string, forbidden: Map<string, string>): string | undefined {
  if (NON_ASCII.test(name))
    return `"${name}" contains diacritics or non-ASCII characters; names are English.`;
  const bad = splitWords(name).find((word) => forbidden.has(word));
  if (bad) return `"${name}" uses "${bad}"; the glossary term is "${forbidden.get(bad)}".`;
  return undefined;
}

function declaredNames(sourceFile: ts.SourceFile): Array<{ name: string; line: number }> {
  const names: Array<{ name: string; line: number }> = [];
  const visit = (node: ts.Node): void => {
    const named = node as ts.NamedDeclaration;
    const isDeclaration = DECLARATION_KINDS.has(node.kind);
    if (isDeclaration && named.name && ts.isIdentifier(named.name)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(named.name.getStart(sourceFile));
      names.push({ name: named.name.text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

export function checkNaming(files: string[] = listSourceFiles()): string[] {
  const forbidden = loadForbidden();
  const exceptions = loadExceptions();
  const errors: string[] = [];
  for (const file of files) {
    if (!exceptions.files.includes(file)) {
      const fileError = checkName(basename(file).replace(/\.(test\.)?tsx?$/, ""), forbidden);
      if (fileError) errors.push(`${file}: file name ${fileError}`);
    }
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    for (const { name, line } of declaredNames(source)) {
      if (exceptions.identifiers.includes(name)) continue;
      const error = checkName(name, forbidden);
      if (error) errors.push(`${file}:${line}: ${error}`);
    }
  }
  return errors;
}

if (isMain(import.meta.url)) {
  const errors = checkNaming();
  errors.forEach((error) => console.error(error));
  process.exit(errors.length > 0 ? 1 : 0);
}
