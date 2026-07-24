import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../config.js";

function statePath(yyyyMm) {
  return path.join(PATHS.pipelineState, `${yyyyMm}.json`);
}

export function readState(yyyyMm) {
  const file = statePath(yyyyMm);
  if (!fs.existsSync(file)) {
    return { month: yyyyMm, af_fetched: false, appdb_present: false, analyzed: false, published: false };
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeState(yyyyMm, patch) {
  fs.mkdirSync(PATHS.pipelineState, { recursive: true });
  const current = readState(yyyyMm);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statePath(yyyyMm), JSON.stringify(next, null, 2));
  return next;
}
