import assert from "node:assert/strict";
import childProcess from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {syncBuiltinESMExports} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fetchSource} from "../tools/osd-fetch.mjs";
import {materialise} from "../tools/osd-libs.mjs";
import {loadLibs} from "../tools/osd-transpile.mjs";
import {Import} from "../tools/osd-import.mjs";
import {ObjectStore} from "../tools/osd-store.mjs";
import {buildFixture} from "../tools/osgo-store-fixture.mjs";
import {makeHistoryRepo} from "../tools/gogen/storecmp-history.mjs";
import {makeRepo} from "../tools/gogen/httpc-git.mjs";

const exec = childProcess.execFileSync;
const spawn = childProcess.spawnSync;
const git = (cwd, ...args) => exec("git", args, {cwd, encoding: "utf8", stdio: "pipe"}).trim();
const paths = {
  checkout: (root, remote, ref) => fetchSource({name: "test", dir: root}, {
    folder: "upstream", dir: join(root, "upstream"), repo: remote, ref, path: "src", exclude: [],
  }),
  cloneInto: (root, remote, ref) => {
    writeFileSync(join(root, "libs.lock.json"), JSON.stringify({
      transpiler: {repo: "test/transpiler", ref}, libraries: [{folder: "example", repo: "test/example", ref}],
    }));
    writeFileSync(join(root, "abap_transpile.json"), JSON.stringify({libs: [{folder: "/.local/lars/example"}]}));
    return materialise(root, () => {}, {ci: true, remote: {example: remote}});
  },
  loadLibs: (root, remote) => loadLibs(root, {libs: [{url: remote}]}),
  importBinary: (root, remote) => new Import(new ObjectStore({root,
    roots: [{path: "local", writable: true, imported: true}], libs: [],
  })).fromGit(remote, {name: "example", via: "git"}),
  buildFixture: () => buildFixture(),
  makeHistoryRepo: root => makeHistoryRepo(join(root, "history")),
  makeRepo: root => makeRepo(join(root, "probe")),
};

describe("temporary Git directories cannot discover an enclosing repository", function () {
  this.timeout(15000);
  let outer, root, remote, ref, oldTmp;
  beforeEach(() => {
    outer = mkdtempSync(join(tmpdir(), "git-isolation-"));
    root = join(outer, "R");
    remote = join(outer, "remote");
    for (const dir of [root, remote]) {
      mkdirSync(dir);
      git(dir, "init", "-q");
      git(dir, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "initial");
    }
    mkdirSync(join(remote, "src"));
    writeFileSync(join(remote, "src/zcl_example.clas.abap"), "CLASS zcl_example DEFINITION PUBLIC.\nENDCLASS.\nCLASS zcl_example IMPLEMENTATION.\nENDCLASS.\n");
    writeFileSync(join(remote, "src/zcl_example.clas.xml"), "<abapGit/>");
    git(remote, "add", ".");
    git(remote, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "source");
    ref = git(remote, "rev-parse", "HEAD");
    oldTmp = process.env.TMPDIR;
    process.env.TMPDIR = join(root, "scratch");
    mkdirSync(process.env.TMPDIR);
  });
  afterEach(() => {
    childProcess.execFileSync = exec;
    childProcess.spawnSync = spawn;
    syncBuiltinESMExports();
    if (oldTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = oldTmp;
    rmSync(outer, {recursive: true, force: true});
  });

  for (const [name, run] of Object.entries(paths)) {
    it(`${name}: successful initialization still works`, async () => {
      const config = readFileSync(join(root, ".git/config"), "utf8");
      assert(await run(root, remote, ref));
      assert.equal(readFileSync(join(root, ".git/config"), "utf8"), config);
      assert.equal(existsSync(join(root, ".git/shallow")), false);
    });
    for (const mode of ["init fails", "init leaves no repository"]) {
      it(`${name}: ${mode}`, async () => {
        const config = readFileSync(join(root, ".git/config"), "utf8");
        const head = git(root, "rev-parse", "HEAD");
        let first, later = 0;
        const subsequent = [];
        const failed = new Error("injected init failure");
        const intercept = (original, command, args, options) => {
          if (command !== "git") return original(command, args, options);
          const init = args.includes("init") || args[0] === "clone";
          if (init) {
            const dir = args[0] === "clone" && args.at(-1) !== "." ? args.at(-1)
              : args.includes("init") && args.at(-1).startsWith("/") ? args.at(-1) : options.cwd;
            first = {dir, env: options.env};
            assert(existsSync(dir), "target D exists");
            assert(!existsSync(join(dir, ".git")), "target D is not a repository");
            if (mode === "init fails") throw failed;
            if (args[0] === "clone") {
              // Simulate clone's Git subprocesses after an init that left no .git.
              // These are real Git writes, confined to our temporary R.
              exec("git", ["remote", "add", "origin", remote], {...options, cwd: dir});
              exec("git", ["fetch", "--depth", "1", "origin", ref], {...options, cwd: dir});
              throw new Error("clone has no repository");
            }
            return original === spawn ? {status: 0, stdout: "", stderr: ""} : "";
          }
          later++;
          subsequent.push(options);
          // Never let a broken implementation check out or stage the outer tree.
          if (args.includes("checkout") || args.includes("add") && args[0] !== "remote") throw new Error("stop before staging");
          return original(command, args, options);
        };
        childProcess.execFileSync = (...args) => intercept(exec, ...args);
        childProcess.spawnSync = (...args) => intercept(spawn, ...args);
        syncBuiltinESMExports();
        let error;
        try { await run(root, remote, ref); } catch (caught) { error = caught; }
        assert(first, "real function attempted init/clone");
        assert.equal(existsSync(join(root, ".git/shallow")), false, "R must not become shallow");
        assert.equal(readFileSync(join(root, ".git/config"), "utf8"), config, "R config must not change");
        assert(error, "function must throw");
        if (mode === "init fails") {
          assert.equal(error, failed);
          assert.equal(later, 0, "no Git call after failed init");
        }
        assert.equal(first.env?.GIT_CEILING_DIRECTORIES, dirname(first.dir));
        for (const options of subsequent) {
          assert.equal(options.env?.GIT_DIR, join(first.dir, ".git"));
          assert.equal(options.env?.GIT_WORK_TREE, first.dir);
        }
        assert.equal(git(root, "rev-parse", "HEAD"), head);
      });
    }
  }
});
