import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { normalizeWorkItem, validateWorkItem } from "./state-machine.mjs";

export const STORE_RELATIVE_PATH = ".cmdb-dev/state.json";

export function findRepositoryRoot(cwd = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Current directory is not inside a Git repository");
  return result.stdout.trim();
}

export function findControlRoot(cwd = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Current directory is not inside a Git repository");
  const commonDirectory = result.stdout.trim();
  if (path.basename(commonDirectory) !== ".git") {
    throw new Error("Bare repositories are not supported");
  }
  return path.dirname(commonDirectory);
}

export function emptyStore(repository = null) {
  return {
    schema_version: 2,
    repository,
    revision: 0,
    updated_at: new Date(0).toISOString(),
    items: {},
  };
}

export function storePath(root) {
  return path.join(root, STORE_RELATIVE_PATH);
}

export function readStore(root, { allowMissing = true } = {}) {
  const file = storePath(root);
  if (!fs.existsSync(file)) {
    if (!allowMissing) throw new Error(`${STORE_RELATIVE_PATH} does not exist; run init first`);
    return emptyStore();
  }
  const store = JSON.parse(fs.readFileSync(file, "utf8"));
  if (store.schema_version !== 2 || typeof store.items !== "object") throw new Error("Unsupported state store schema");
  for (const [id, item] of Object.entries(store.items)) {
    store.items[id] = normalizeWorkItem(item);
    validateWorkItem(store.items[id]);
  }
  return store;
}

export function writeStore(root, store) {
  const directory = path.dirname(storePath(root));
  fs.mkdirSync(directory, { recursive: true });
  for (const item of Object.values(store.items)) validateWorkItem(item);
  const next = structuredClone(store);
  next.schema_version = 2;
  next.revision = Number(next.revision ?? 0) + 1;
  next.updated_at = new Date().toISOString();
  const temporary = path.join(directory, `.state-${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, storePath(root));
  return next;
}

export function initializeRepositoryState(root, repository = null) {
  const existing = readStore(root);
  if (!fs.existsSync(storePath(root))) {
    writeStore(root, { ...existing, repository });
  } else if (repository && !existing.repository) {
    writeStore(root, { ...existing, repository });
  } else if (repository && existing.repository !== repository) {
    throw new Error(`State store belongs to ${existing.repository}, not ${repository}`);
  }
  for (const relative of ["plan/00_Dashboard", "plan/01_Requirements", "plan/02_Bugs", ".cmdb-dev/worktrees"]) {
    fs.mkdirSync(path.join(root, relative), { recursive: true });
  }
  updateInfoExclude(root);
  return readStore(root, { allowMissing: false });
}

export function updateInfoExclude(root) {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) return;
  const excludePath = result.stdout.trim();
  if (!fs.existsSync(path.dirname(excludePath))) return;
  const required = [
    "/plan/00_Dashboard/",
    "/plan/01_Requirements/",
    "/plan/02_Bugs/",
    "/.cmdb-dev/",
  ];
  const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
  const lines = new Set(current.split(/\r?\n/).filter(Boolean));
  let changed = false;
  for (const value of required) {
    if (!lines.has(value)) {
      lines.add(value);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(excludePath, `${[...lines].join("\n")}\n`);
}

export function putItem(root, item) {
  validateWorkItem(item);
  const store = readStore(root);
  const existing = store.items[item.id];
  if (existing && item.revision < existing.revision) throw new Error("Refusing to overwrite newer local state");
  store.items[item.id] = item;
  return writeStore(root, store);
}

export function getItem(root, id) {
  const item = readStore(root, { allowMissing: false }).items[id];
  if (!item) throw new Error(`Unknown Work Item: ${id}`);
  return item;
}
