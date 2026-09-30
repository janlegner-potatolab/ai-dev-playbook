// Structure guards S3, S4, S5, S8, S9 (see docs, section 15): the architecture as
// forbidden arrows. Change this file only with owner approval (S18).
/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      comment: "S3: rules in domain/ never touch the DB, the network or HTTP.",
      severity: "error",
      from: { path: "^server/src/domain/" },
      to: { path: "^server/src/(db|http|integrations)/|node_modules/(pg|express|axios)/" },
    },
    {
      name: "router-no-sql",
      comment: "S3: a router calls actions and read models, never SQL.",
      severity: "error",
      from: { path: "^server/src/http/" },
      to: { path: "Sql\\.ts$" },
    },
    {
      name: "define-route-only-in-http",
      comment: "S6: only routers under http/ may import defineRoute.",
      severity: "error",
      from: { pathNot: "^server/src/http/" },
      to: { path: "^server/src/http/defineRoute\\.ts$" },
    },
    {
      name: "sql-only-in-sql-files",
      comment: "S8: only *Sql.ts and db/ may use the DB connection.",
      severity: "error",
      from: { pathNot: "(Sql\\.ts$|^server/src/db/|^server/migrations/)" },
      to: { path: "^server/src/db/|node_modules/pg/" },
    },
    {
      name: "no-foreign-area-internals",
      comment:
        "S4: an area never reaches into another area's SQL or read models; it calls that area's actions.",
      severity: "error",
      from: { path: "^server/src/([^/]+)/", pathNot: "^server/src/http/" },
      to: { path: "^server/src/[^/]+/.+(Sql|ReadModels)\\.ts$", pathNot: "^server/src/$1/" },
    },
    {
      name: "client-not-server",
      comment:
        "S5: the client never imports server code; shared shapes live in packages/contracts.",
      severity: "error",
      from: { path: "^client/" },
      to: { path: "^server/" },
    },
    {
      name: "no-circular",
      comment: "S9: no circular dependencies.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|build|coverage)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"] },
  },
};
