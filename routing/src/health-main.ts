import { text } from "node:stream/consumers";
import { runHealthChecker } from "./health-checker";

// The health check's checker: `node --import tsx src/health-main.ts <state dir> <out dir>` (health-checker.ts).
process.exitCode = await runHealthChecker(process.argv.slice(2), { env: process.env, stdin: await text(process.stdin), stdout: process.stdout });
