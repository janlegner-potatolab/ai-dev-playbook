// Structure guards S1, S2, S6, S10, S12, S13, S17, S19 (see docs, section 15).
// no-restricted-syntax does NOT merge across blocks that match the same file: the
// last matching block wins. Every block below therefore carries the full selector set
// for its file group. Change this file only with owner approval (S18).
import js from "@eslint/js";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const MAX_FILE_LINES = 300;
const MAX_FUNCTION_LINES = 50;
const MAX_TEST_FILE_LINES = 600;
const MAX_COMPLEXITY = 12;

// S12: no mutable module-level state.
const noModuleState = [
  {
    selector: "Program > VariableDeclaration[kind='let']",
    message: "No mutable module-level state; the app runs in several instances.",
  },
  {
    selector: "Program > ExportNamedDeclaration > VariableDeclaration[kind='let']",
    message: "No mutable module-level state; the app runs in several instances.",
  },
  {
    selector:
      "Program > VariableDeclaration > VariableDeclarator > NewExpression.init[callee.name=/^(Map|Set|WeakMap)$/]",
    message: "Caches and counters belong in the DB or a shared cache.",
  },
  {
    selector:
      "Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > NewExpression.init[callee.name=/^(Map|Set|WeakMap)$/]",
    message: "Caches and counters belong in the DB or a shared cache.",
  },
];

// S6: routes only through defineRoute.
const noAdHocRoutes = [
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(app|router)$/][callee.property.name=/^(get|post|put|patch|delete)$/]",
    message: "Register routes only through defineRoute in http/<area>Router.ts.",
  },
];

// S1: bare UI elements only inside the component library.
const noBareUiElements = [
  {
    selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]",
    message: "Use a component from client/src/components/ui (Button, TextField, Select, TextArea).",
  },
];

// S19: design values only from tokens. A local rule, so it can warn while the
// no-restricted-syntax selectors above stay errors.
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const ARBITRARY_PX = /\[[0-9]+px\]/;
const designTokensRule = {
  meta: { type: "suggestion", schema: [] },
  create(context) {
    const check = (node, text) => {
      if (typeof text !== "string") return;
      if (HEX_COLOR.test(text))
        context.report({ node, message: "Colors only from design tokens." });
      else if (ARBITRARY_PX.test(text))
        context.report({ node, message: "Sizes from tokens, not arbitrary values." });
    };
    return {
      Literal: (node) => check(node, node.value),
      TemplateElement: (node) => check(node, node.value.cooked),
    };
  },
};
const structurePlugin = { rules: { "design-tokens": designTokensRule } };

export default defineConfig([
  { ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/*.d.ts"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { "@eslint-community/eslint-comments": eslintComments, structure: structurePlugin },
    rules: {
      // S10
      "max-lines": ["error", { max: MAX_FILE_LINES, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true },
      ],
      complexity: ["warn", MAX_COMPLEXITY],
      // S13 (type-free part)
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // S17
      "@eslint-community/eslint-comments/require-description": "error",
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
  },
  {
    // S13 (type-aware part)
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.ts"],
    rules: {
      "max-lines": [
        "error",
        { max: MAX_TEST_FILE_LINES, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": "off",
    },
  },
  {
    // Scripts under scripts/ print results by design.
    files: ["scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
  // Server: S6 + S12.
  {
    files: ["server/src/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", ...noAdHocRoutes, ...noModuleState] },
  },
  {
    // defineRoute is the one place allowed to call app/router methods.
    files: ["server/src/http/defineRoute.ts"],
    rules: { "no-restricted-syntax": ["error", ...noModuleState] },
  },
  {
    // The DB connection pool is the one allowed module-level state.
    files: ["server/src/db/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", ...noAdHocRoutes] },
  },
  // Client: S12 everywhere, S1 outside the component library, S19 as a warning.
  {
    files: ["client/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...noModuleState],
      "structure/design-tokens": "warn",
    },
  },
  {
    files: ["client/src/**/*.tsx"],
    ignores: ["client/src/components/ui/**"],
    rules: { "no-restricted-syntax": ["error", ...noBareUiElements, ...noModuleState] },
  },
  {
    // Token definitions are where raw values live.
    files: ["client/src/**/tokens.{ts,tsx}", "client/src/**/tokens/**"],
    rules: { "structure/design-tokens": "off" },
  },
  // S2: server calls only through api.ts.
  {
    files: ["client/src/**/*.{ts,tsx}"],
    ignores: ["client/src/**/api.ts", "client/src/lib/http.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Server calls belong in the module api.ts." },
      ],
    },
  },
]);
