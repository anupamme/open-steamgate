// The history oracle owns its repository, even if initialization fails.
import {execFileSync} from "node:child_process";
import {mkdirSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";

export function makeHistoryRepo(historyTree) {
  rmSync(historyTree, {recursive: true, force: true});
  mkdirSync(join(historyTree, "src"), {recursive: true});
  writeFileSync(join(historyTree, "abap_transpile.json"), JSON.stringify({input_folder: ["src"]}));
  const git = (...args) => execFileSync("git", args, {cwd: historyTree,
    env: {...process.env, GIT_CEILING_DIRECTORIES: dirname(historyTree),
      ...(args[0] === "init" ? {} : {GIT_DIR: join(historyTree, ".git"), GIT_WORK_TREE: historyTree})}});
  git("init", "-q");
  git("config", "user.name", "Test Author");
  git("config", "user.email", "test@example.invalid");
  for (const subject of ["short title", "Full Atom title " + "x".repeat(100)]) {
    writeFileSync(join(historyTree, "src/zst_history.prog.abap"), `REPORT zst_history.\n* ${subject}\n`);
    git("add", ".");
    git("commit", "-q", "-m", subject);
  }
  return historyTree;
}
