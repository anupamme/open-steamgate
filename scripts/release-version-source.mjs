import {publishChildEnv, devChildEnv} from '../tools/osd-env.mjs';
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gitAt = (root, release, ...args) => execFileSync("git", args, {env: release ? publishChildEnv('git') : devChildEnv(), cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();

export function expectedVersion(packageVersion, count) {
  const parts = typeof packageVersion === "string" ? packageVersion.split(".") : [];
  const decimal = value => typeof value === "string" && value.length > 0 && [...value].every(c => "0123456789".includes(c));
  if (parts.length !== 3 || !parts.every(decimal) || !decimal(count)) throw new Error("invalid VS Code package version or commit count");
  return `${parts[0]}.${parts[1]}.${count}`;
}

export function suggestedTag(at = root, release = false) {
  const source = JSON.parse(readFileSync(resolve(at, "editors/vscode/package.json"), "utf8"));
  return `vscode-v${expectedVersion(source.version, gitAt(at, release, "rev-list", "--count", "HEAD"))}`;
}
