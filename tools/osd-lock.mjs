import {readFileSync} from "node:fs";
import {basename, join} from "node:path";
import {runsAs} from "./osd-main.mjs";

import {fullCommit} from "./osd-release-git.mjs";
const githubRepo = value => typeof value === "string" && value.split("/").length === 2
  && value.split("/").every(part => part.length > 0
    && [...part].every(c => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-".includes(c)));

export function readLock(root = ".") {
  const file = join(root, "libs.lock.json");
  const lock = JSON.parse(readFileSync(file, "utf8"));
  const validate = (source, label) => {
    if (!source || typeof source.repo !== "string" || !githubRepo(source.repo)
        || typeof source.ref !== "string" || !fullCommit(source.ref)) {
      throw new Error(`libs.lock.json: ${label} must have a GitHub owner/repository and a 40-character commit SHA`);
    }
  };
  validate(lock.transpiler, "transpiler");
  if (!Array.isArray(lock.libraries)) throw new Error("libs.lock.json: libraries must be an array");
  const seen = new Set();
  for (const lib of lock.libraries) {
    if (typeof lib.folder !== "string" || lib.folder === "" || seen.has(lib.folder)) {
      throw new Error("libs.lock.json: library folders must be unique non-empty names");
    }
    seen.add(lib.folder);
    validate(lib, `library ${lib.folder}`);
  }
  return lock;
}

/** The lock and transpile config must describe the same library closure. */
export function librariesFromLock(root = ".") {
  const config = JSON.parse(readFileSync(join(root, "abap_transpile.json"), "utf8"));
  const lock = readLock(root);
  const byFolder = new Map(lock.libraries.map((lib) => [lib.folder, lib]));
  const configured = [];
  const seen = new Set();
  for (const lib of config.libs ?? []) {
    if (typeof lib.folder !== "string" || lib.folder === "") continue;
    const folder = basename(lib.folder.replaceAll("\\", "/"));
    const pin = byFolder.get(folder);
    if (pin === undefined) throw new Error(`libs.lock.json has no pin for ${lib.folder}`);
    const slashes = lib.folder.replaceAll("\\", "/");
    const normalized = slashes.startsWith("/") ? slashes.slice(1) : slashes;
    if (normalized !== `.local/lars/${folder}`) {
      throw new Error(`abap_transpile.json library ${lib.folder} is outside .local/lars/`);
    }
    configured.push({
      name: folder,
      folder: normalized,
      path: join(root, normalized),
      repo: pin.repo,
      url: `https://github.com/${pin.repo}.git`,
      ref: pin.ref,
    });
    seen.add(folder);
  }
  const extra = lock.libraries.find((lib) => !seen.has(lib.folder));
  if (extra !== undefined) throw new Error(`libs.lock.json has an unused library pin for ${extra.folder}`);
  return {libraries: configured, lock};
}

export function describeVsixPreflight(missing) {
  if (missing.length === 0) return undefined;
  return `build-vsix: missing ${missing.join(", ")}; run npm install and node tools/osd-libs.mjs as needed`;
}

export function githubWorkflowEnv(root = ".") {
  const lock = readLock(root);
  return [
    `OSD_TRANSPILER_REPO=https://github.com/${lock.transpiler.repo}.git`,
    `OSD_TRANSPILER_REF=${lock.transpiler.ref}`,
  ].join("\n") + "\n";
}

if (runsAs("osd-lock.mjs")) {
  const mode = process.argv[2];
  if (mode === "github-env") {
    process.stdout.write(githubWorkflowEnv(process.cwd()));
  } else if (mode === "json") {
    process.stdout.write(`${JSON.stringify(readLock(process.cwd()), null, 2)}\n`);
  } else {
    console.error("usage: node tools/osd-lock.mjs <github-env|json>");
    process.exitCode = 2;
  }
}
