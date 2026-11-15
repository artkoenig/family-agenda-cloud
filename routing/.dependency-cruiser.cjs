/**
 * Boundaries of the Routing module.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-public-repo-packages",
      comment: "The Routing module talks HTTP to an unmodified public core and imports none of its packages (#90).",
      severity: "error",
      from: {},
      to: { path: "(^|/)node_modules/@family-agenda/" },
    },
    {
      name: "src-does-not-import-tests",
      comment: "The stand-in core and the test harness are for tests only.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^test/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".js", ".mjs", ".cjs", ".json", ".d.ts"],
    },
  },
};
