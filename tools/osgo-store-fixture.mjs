#!/usr/bin/env node
import {cpSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {spawnSync} from "node:child_process";

export const fixtureRoot = new URL("../test/fixtures/osgo-store/", import.meta.url).pathname;
export const fixedTime = new Date("2026-10-01T12:34:56.789Z");
const gitEnv = {
  GIT_AUTHOR_NAME: "Fixture Author",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture Committer",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

function cleanGitEnv() {
  return {
    PATH: process.env.PATH,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    LC_ALL: "C",
    TZ: "UTC",
    ...gitEnv,
  };
}

function git(root, date, ...args) {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], {cwd: root, encoding: "utf8", env: {
    ...cleanGitEnv(), GIT_CEILING_DIRECTORIES: dirname(root),
    ...(args[0] === "init" ? {} : {GIT_DIR: join(root, ".git"), GIT_WORK_TREE: root}), GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
  }});
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

// A repository's .abapgit.xml is stored as dot-abapgit.fixture (two dots would
// make it an abapGit object): a real one under test/ breaks every build of test/.
function copyIfPresent(from, to) {
  cpSync(from, to, {recursive: true, filter: path => !path.includes("/.git/")});
  const visit = dir => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === "dot-abapgit.fixture") renameSync(path, join(dir, ".abapgit.xml"));
    }
  };
  if (statSync(to).isDirectory()) visit(to);
}

function setTimes(root) {
  const visit = dir => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else utimesSync(path, fixedTime, fixedTime);
    }
  };
  visit(root);
}

export async function buildFixture() {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const root = await fs.mkdtemp(join(os.tmpdir(), "osgo-store-"));
  for (const name of [".gitignore", "abap_transpile.json", "store.json", "src", "lib", "layer", "full", "overlay"]) {
    copyIfPresent(join(fixtureRoot, name), join(root, name));
  }
  mkdirSync(join(root, "local"), {recursive: true});
  cpSync(join(fixtureRoot, "tmp-template"), join(root, "local", "tmp"), {recursive: true});
  cpSync(join(fixtureRoot, "ignored-template/zignored.prog.abap.template"), join(root, "src/osd/zignored.prog.abap"));

  git(root, "2026-10-01T10:00:00+00:00", "init", "-q", "-b", "main");
  git(root, "2026-10-01T10:00:00+00:00", "config", "user.name", "Fixture Author");
  git(root, "2026-10-01T10:00:00+00:00", "config", "user.email", "fixture@example.invalid");
  git(root, "2026-10-01T10:00:00+00:00", "add", ".");
  git(root, "2026-10-01T10:00:00+00:00", "commit", "-q", "-m", "fixture first");
  git(root, "2026-10-01T10:01:00+00:00", "mv", "src/z_old.prog.abap", "src/z_new.prog.abap");
  writeFileSync(join(root, "src/osd/zprogram.prog.abap"), "REPORT zprogram.\nWRITE 'second'.\n");
  git(root, "2026-10-01T10:01:00+00:00", "add", ".");
  git(root, "2026-10-01T10:01:00+00:00", "commit", "-q", "-m", "fixture second");

  const source = join(root, "build/by-input/test/source");
  mkdirSync(join(source, "src/osd"), {recursive: true});
  writeFileSync(join(source, ".complete"), "1\n");
  for (const file of JSON.parse(readFileSync(join(root, "store.json"), "utf8")).activeFiles) {
    const target = join(source, file);
    mkdirSync(join(target, ".."), {recursive: true});
    cpSync(join(root, file), target);
  }
  writeFileSync(join(root, "src/osd/zprogram.prog.abap"), "REPORT zprogram.\nWRITE 'modified'.\n");
  rmSync(join(root, "src/osd/zclass.clas.locals_def.abap"));
  setTimes(root);
  return root;
}

if (process.argv[1] === new URL(import.meta.url).pathname) console.log(await buildFixture());
