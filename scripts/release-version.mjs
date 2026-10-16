#!/usr/bin/env node
// Keep a VS Code release tag tied to the version build-vsix.mjs stamps from HEAD.
import {execFileSync} from "node:child_process";
import {basename} from "node:path";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gitAt = (root, ...args) => execFileSync("git", args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();

export {expectedVersion, suggestedTag} from "./release-version-source.mjs";
import {suggestedTag} from "./release-version-source.mjs";

export function checkReleaseVersion(tag, vsix, {requireTag = true, root: at = root} = {}) {
  const git = (...args) => gitAt(at, ...args);
  if (!/^vscode-(?:stable-)?v\d+\.\d+\.\d+$/.test(tag ?? "")) {
    throw new Error("release tag must be vscode-v<major>.<minor>.<patch> or vscode-stable-v<major>.<minor>.<patch>");
  }
  const head = git("rev-parse", "HEAD");
  const tagExists = (() => {
    try { git("show-ref", "--verify", `refs/tags/${tag}`); return true; }
    catch { return false; }
  })();
  if (!tagExists && requireTag) throw new Error(`${tag} does not exist; a tag-push release requires an existing tag`);
  const tagged = tagExists ? git("rev-parse", `refs/tags/${tag}^{commit}`) : undefined;
  if (tagged && tagged !== head) throw new Error(`${tag} points to ${tagged}, but checkout HEAD is ${head}`);
  const version = suggestedTag(at).slice("vscode-v".length);
  const prefix = tag.startsWith("vscode-stable-v") ? "vscode-stable-v" : "vscode-v";
  if (tag !== `${prefix}${version}`) {
    throw new Error(`tag ${tag} disagrees with stamped VSIX version ${version}; tag this commit as ${prefix}${version}`);
  }
  if (vsix) {
    if (basename(vsix) !== `open-steamgate-${version}.vsix`) {
      throw new Error(`VSIX filename ${basename(vsix)} disagrees with ${version}`);
    }
    const packaged = JSON.parse(execFileSync("unzip", ["-p", vsix, "extension/package.json"], {cwd: root, encoding: "utf8"}));
    if (packaged.version !== version) throw new Error(`VSIX manifest version ${packaged.version} disagrees with ${version}`);
  }
  return version;
}

export function parseReleaseArgs(args) {
  const allowUntagged = args.includes("--allow-untagged");
  const positional = args.filter((arg) => arg !== "--allow-untagged");
  if (positional.length > 2 || positional.some((arg) => arg.startsWith("--"))) {
    throw new Error("usage: release-version.mjs <tag> [vsix] [--allow-untagged]");
  }
  return {tag: positional[0], vsix: positional[1], requireTag: !allowUntagged};
}

export function validateReleaseTarget({tag, head, tagCommit, release}) {
  if (!/^vscode-(?:stable-)?v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error("invalid release tag");
  if (!/^[0-9a-f]{40}$/.test(head ?? "")) throw new Error("invalid checkout commit");
  if (tagCommit) {
    if (tagCommit !== head) throw new Error(`Release ${tag} tag resolves to ${tagCommit}, but this run builds ${head}`);
  } else if (!release.isDraft || release.targetCommitish !== head) {
    throw new Error(`Untagged release ${tag} must be a draft targeting ${head}; recorded target is ${release.targetCommitish}`);
  }
}

export function checkReleaseTarget(tag) {
  const git = (...args) => gitAt(root, ...args);
  const head = git("rev-parse", "HEAD");
  const release = JSON.parse(execFileSync("gh", ["release", "view", tag, "--json", "isDraft,targetCommitish"], {cwd: root, encoding: "utf8"}));
  let tagCommit;
  try { tagCommit = git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`); }
  catch { /* An untagged draft receives its tag when GitHub publishes it. */ }
  validateReleaseTarget({tag, head, tagCommit, release});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "--suggest") console.log(suggestedTag());
    else if (process.argv[2] === "--check-target") checkReleaseTarget(process.argv[3]);
    else {
      const {tag, vsix, requireTag} = parseReleaseArgs(process.argv.slice(2));
      console.log(checkReleaseVersion(tag, vsix, {requireTag}));
    }
  } catch (error) {
    console.error(`release-version: ${error.message}`);
    process.exitCode = 1;
  }
}
