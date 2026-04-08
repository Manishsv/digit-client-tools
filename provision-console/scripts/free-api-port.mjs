#!/usr/bin/env node
/**
 * Free PROVISION_CONSOLE_API_PORT (default 3847) before `npm run dev`.
 * macOS: /usr/sbin/lsof. Linux: lsof on PATH.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const port = process.env.PROVISION_CONSOLE_API_PORT || "3847";
const lsof =
  process.platform === "darwin" && existsSync("/usr/sbin/lsof") ? "/usr/sbin/lsof" : "lsof";

try {
  const pids = execSync(`${lsof} -ti :${port}`, { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  if (pids.length) console.log(`Stopped process(es) on port ${port}: ${pids.join(", ")}`);
} catch {
  /* lsof: nothing listening or command failed */
}
