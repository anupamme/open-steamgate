#!/usr/bin/env node
// Materialise locked library commits and keep .local/lars as the public path.
import {execFileSync} from "node:child_process";
import {chmodSync, closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync} from "node:fs";
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";
import {runsAs} from "./osd-main.mjs";
import {librariesFromLock} from "./osd-lock.mjs";
import {libraryPath} from "./osd-lib-path.mjs";

const git = (cwd, ...args) => execFileSync("git", args, {cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: {...process.env, GIT_CEILING_DIRECTORIES: dirname(resolve(cwd)),
    ...(args[0] === "init" ? {} : {GIT_DIR: resolve(cwd, ".git"), GIT_WORK_TREE: resolve(cwd)})}}).trim();
const exists = (path) => { try { lstatSync(path); return true; } catch { return false; } };
const head = (path) => { try { return git(path, "rev-parse", "HEAD"); } catch { return "missing"; } };
const SHARED_CMD = "node tools/osd-libs.mjs --sync --shared";
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** A folder is a clone only when git's own top level is the folder itself.
 *  In a plain directory `git status` climbs to the enclosing repository, which
 *  is how a folder holding only a `src` symlink reported the main checkout's
 *  edits as its own "uncommitted changes". */
export function isClone(path) {
  try { return realpathSync(git(path, "rev-parse", "--show-toplevel")) === realpathSync(path); }
  catch { return false; }
}

/** Pins are not read-only on disk. fs.cpSync recreates a 555 directory as a
 *  555 directory and then cannot write into it (EACCES in a local
 *  build-vsix). What keeps a pin unchanged is the gate (a clean checkout at
 *  the locked commit, tools/osd-lib-path.mjs), so sync gives the owner write
 *  access to every directory of a pin. Git records no directory modes: the
 *  pin stays clean. */
export function makeWritable(path) {
  const visit = (dir) => {
    const mode = lstatSync(dir).mode;
    if (!(mode & 0o200)) chmodSync(dir, (mode & 0o7777) | 0o200);
    for (const entry of readdirSync(dir, {withFileTypes: true})) if (entry.isDirectory()) visit(join(dir, entry.name));
  };
  visit(path);
}

/** A pin made earlier as a `git worktree` of a clone names that clone's
 *  `.git/worktrees/<id>` in its `.git` file. When --shared moves the clone to
 *  .local/dev the pin loses it and reads as "missing". Re-attach it from
 *  wherever the clone is now; this is also what makes a re-run after such a
 *  half-finished sync complete. Pins made by cloneInto are standalone and
 *  never need it. */
function repairWorktreePin(lib) {
  let link;
  try {
    if (!lstatSync(join(lib.pin, ".git")).isFile()) return;
    link = readFileSync(join(lib.pin, ".git"), "utf8");
  } catch { return; }
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(link);
  if (!match || exists(match[1])) return;
  const id = basename(match[1]);
  chmodSync(join(lib.pin, ".git"), (lstatSync(join(lib.pin, ".git")).mode & 0o7777) | 0o200); // repair rewrites it
  for (const clone of [lib.dev, lib.at]) {
    if (exists(join(clone, ".git", "worktrees", id)) && isClone(clone)) {
      git(clone, "worktree", "repair", resolve(lib.pin));
      return;
    }
  }
}

export function libraries(root = ".") {
  const lars = resolve(root, ".local", "lars");
  let shared = lars;
  try { shared = realpathSync(lars); } catch { /* fresh checkout */ }
  const store = dirname(shared);
  const relativeShared = relative(resolve(root), shared);
  const external = relativeShared === ".." || relativeShared.startsWith(`..${sep}`) || isAbsolute(relativeShared);
  return librariesFromLock(root).libraries.map((lib) => ({
    ...lib, at: join(shared, lib.name), pin: join(store, "pins", `${lib.name}@${lib.ref}`),
    dev: join(store, "dev", lib.name), sharedRoot: dirname(store), external,
  }));
}

export function missing(root = ".") {
  return libraries(root).filter((lib) => !exists(lib.at));
}

function cloneInto(path, lib) {
  git(path, "init", "--quiet");
  git(path, "remote", "add", "origin", lib.url);
  git(path, "fetch", "--quiet", "--depth", "1", "origin", lib.ref);
  git(path, "checkout", "--quiet", "--detach", "FETCH_HEAD");
  if (head(path) !== lib.ref) throw new Error(`${lib.name}: fetched a different commit`);
}

// The exclusive lock covers clone and rename. Other sessions wait for the
// winner and then validate its finished directory; no session removes a peer's
// temporary checkout or treats a half-fetched directory as a pin.
function ensurePin(lib) {
  mkdirSync(dirname(lib.pin), {recursive: true});
  const lock = `${lib.pin}.lock`;
  let fd;
  for (let attempt = 0; attempt < 600; attempt++) {
    try { fd = openSync(lock, "wx"); break; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (exists(lib.pin)) break;
      pause(100);
    }
  }
  if (fd === undefined && !exists(lib.pin)) throw new Error(`${lib.name}: timed out waiting for ${lock}`);
  try {
    if (!exists(lib.pin)) {
      const temp = mkdtempSync(join(dirname(lib.pin), `.${lib.name}-`));
      try { cloneInto(temp, lib); renameSync(temp, lib.pin); }
      finally { if (exists(temp)) rmSync(temp, {recursive: true, force: true}); }
    }
    makeWritable(lib.pin);
    if (head(lib.pin) !== lib.ref) repairWorktreePin(lib);
    if (head(lib.pin) !== lib.ref) throw new Error(`${lib.name}: pin ${lib.pin} has drifted; leave it untouched and inspect it manually`);
  } finally {
    if (fd !== undefined) { closeSync(fd); rmSync(lock, {force: true}); }
  }
}

function pointAtPin(lib, shared = false, say = () => {}) {
  mkdirSync(dirname(lib.at), {recursive: true});
  const lock = `${lib.at}.lock`;
  let fd;
  for (let attempt = 0; attempt < 600; attempt++) {
    try { fd = openSync(lock, "wx"); break; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      pause(100);
    }
  }
  if (fd === undefined) throw new Error(`${lib.name}: timed out waiting for ${lock}`);
  try {
    if (exists(lib.at) && !lstatSync(lib.at).isSymbolicLink()) {
      if (lib.external && !shared) throw new Error(`${lib.name}: ${lib.at} is shared by worktrees; run ${SHARED_CMD} to migrate it (from any checkout)`);
      const clone = isClone(lib.at);
      if (shared && clone && git(lib.at, "status", "--porcelain")) throw new Error(`${lib.name}: ${lib.at} has uncommitted changes; commit or stash them before migrating`);
      if (exists(lib.dev)) throw new Error(`${lib.name}: cannot move ${lib.at} to ${lib.dev}: destination exists; move it aside manually`);
      mkdirSync(dirname(lib.dev), {recursive: true});
      renameSync(lib.at, lib.dev);
      // its worktrees (an earlier pin among them) follow the clone
      if (clone) {
        if (exists(lib.pin)) repairWorktreePin(lib);
        try { git(lib.dev, "worktree", "repair"); }
        catch (error) { say(`osd-libs: ${lib.name}: git worktree repair in ${lib.dev}: ${error.stderr?.toString().trim() || error.message}`); }
      } else say(`osd-libs: ${lib.name}: ${lib.at} is not a git clone; moved as is to ${lib.dev}`);
    }
    const target = resolve(lib.pin);
    if (exists(lib.at)) {
      if (resolve(dirname(lib.at), readlinkSync(lib.at)) === resolve(lib.pin)) return;
      rmSync(lib.at); // only our symlink, never a directory
    }
    try { symlinkSync(target, lib.at, process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      throw new Error(`${lib.name}: could not create ${lib.at} link (${error.message}); on Windows enable Developer Mode or run in an elevated terminal`);
    }
  } finally { closeSync(fd); rmSync(lock, {force: true}); }
}

/** CI keeps real .local/lars clones for the existing artifact and restore path. */
export function materialise(root = ".", say = () => {}, {ci = process.env.CI === "true", remote = {}, shared = false} = {}) {
  if (shared) ci = false; // an explicit migration is never the CI clone path
  const made = [];
  const libs = libraries(root);
  if (!ci && !shared) {
    const sharedClone = libs.find((lib) => lib.external && exists(lib.at) && !lstatSync(lib.at).isSymbolicLink());
    if (sharedClone) throw new Error(`${sharedClone.name}: ${sharedClone.at} is shared by worktrees; run ${SHARED_CMD} to migrate it (from any checkout)`);
  }
  for (const lib of libs) {
    if (remote[lib.name]) lib.url = remote[lib.name];
    if (ci) {
      if (!exists(lib.at)) {
        mkdirSync(dirname(lib.at), {recursive: true});
        const temp = mkdtempSync(join(dirname(lib.at), `.${lib.name}-`));
        try { cloneInto(temp, lib); renameSync(temp, lib.at); }
        finally { if (exists(temp)) rmSync(temp, {recursive: true, force: true}); }
        made.push(lib.name);
      }
    } else {
      ensurePin(lib);
      pointAtPin(lib, shared, say);
      made.push(lib.name);
    }
    libraryPath(root, lib.name);
    say(`osd-libs: ${lib.name} @ ${lib.ref} via ${lib.at}`);
  }
  return made;
}

export function status(root = ".", say = console.log) {
  for (const lib of libraries(root)) {
    let state;
    try { libraryPath(root, lib.name); state = "ready"; }
    catch (error) { state = error.message; }
    say(`${lib.name}: ${state}`);
  }
}

// The licence approval of a pinned ref lives with the image's approval list
// (docker/image/license-assumptions.mjs), which only the repository has. A
// shipped tree was checked when it was packaged and has nothing to check.
export async function checkLicences(root = ".") {
  const module = join(resolve(root), "docker", "image", "license-assumptions.mjs");
  if (!exists(module)) return false;
  const {checkLockLicences} = await import(pathToFileURL(module).href);
  checkLockLicences(root);
  return true;
}

if (runsAs("osd-libs.mjs")) {
  const root = process.cwd();
  if (!process.argv.includes("--status")) await checkLicences(root);
  if (process.argv.includes("--status")) status(root);
  else if (process.argv.includes("--check")) {
    for (const lib of libraries(root)) libraryPath(root, lib.name);
    console.log(`${libraries(root).length} libraries at locked commits`);
  } else materialise(root, console.log, {shared: process.argv.includes("--shared")});
}
