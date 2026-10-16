// abapGit in a box, the half that matters: a repository's objects become
// objects of OSD.
//
// On a system, abapGit's deserialise hands each file to a serialiser class
// per object type, 325 of them, which then call SAP's own APIs to create
// the object. OSD needs none of that, because here an object already *is* a
// file in abapGit's format: deserialise is a write, serialise is a read.
// So this reads a repository the way abapGit reads one, `.abapgit.xml` for
// the starting folder and the folder logic included, and writes what it
// finds into the store.
//
// Where the files come from was the swappable half, and it has been
// swapped: a URL is fetched by OSD itself, ZCL_OSD_GIT speaking git's
// smart HTTP protocol and abapGit's transpiled pack code reading the
// answer (tools/osd-git.mjs). A folder someone already cloned still
// works, and the git binary is still there behind `via: "git"` for a
// remote OSD cannot reach, such as one that needs an ssh key.
import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, join} from "node:path";
import {Git} from "./osd-git.mjs";
import {ObjectStore, TYPES, nameOf} from "./osd-store.mjs";
import {runsAs} from "./osd-main.mjs";
import {TMP_FOLDER, TMP_PACKAGE} from "./osd-tmp.mjs";

import {ABAPGIT_XML, repositoryConfig, sourceFolder} from "./osd-abapgit-config.mjs";
export {ABAPGIT_XML, repositoryConfig} from "./osd-abapgit-config.mjs";

// every file of the source folder, deepest last so a package is created
// before what it holds
function walk(folder, prefix = "", out = []) {
  for (const entry of readdirSync(folder).sort()) {
    if (entry === ".git" || entry === "node_modules") {
      continue;
    }
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) {
      walk(path, prefix === "" ? entry : `${prefix}/${entry}`, out);
    } else {
      out.push({path, relative: prefix === "" ? entry : `${prefix}/${entry}`});
    }
  }
  return out;
}

// a file name in abapGit's shape: <name>.<type>.<extension>
export function objectOf(fileName) {
  for (const [type, meta] of Object.entries(TYPES)) {
    if (meta.sameFileAs !== undefined) {
      continue;
    }
    if (fileName.endsWith(meta.ext)) {
      return {type, name: nameOf(fileName.slice(0, -meta.ext.length))};
    }
  }
  return undefined;
}

// the extensions an object's other files carry: a class is five files, a
// function group is one per module, and every object may have its XML
const OWNED = /\.(clas|intf|prog|fugr|tabl|dtel|doma|ttyp|view|shlp|msag|ddls|srvd|enho|xslt|w3mi|smim|devc)\./;

export function ownerOf(fileName) {
  return OWNED.test(fileName) ? fileName.split(".")[0].toUpperCase() : undefined;
}

export class Import {
  constructor(store = new ObjectStore()) {
    this.store = store;
  }

  // a folder someone checked out; the repository's own layout is read, not assumed
  fromFolder(folder, options = {}) {
    const config = repositoryConfig(folder);
    const source = sourceFolder(folder, config);
    if (existsSync(source) === false) {
      throw new NotARepository(folder, config.startingFolder);
    }
    const target = options.target ?? join("local", options.name ?? basename(folder).toLowerCase());
    // local/tmp is $TMP (tools/osd-tmp.mjs), not a place for a repository
    if (target.replaceAll("\\", "/") === TMP_FOLDER) {
      throw new Error(`${TMP_FOLDER} holds ${TMP_PACKAGE}; import under another --name`);
    }
    const written = [];
    const skipped = [];
    const packages = new Set();

    for (const file of walk(source)) {
      const name = basename(file.relative);
      if (name === "package.devc.xml" || name.endsWith(".devc.xml")) {
        // a package is a folder here, so its file rides along and its text
        // is read from it later
        this.#copy(file, target, written);
        packages.add(file.relative.split("/").slice(0, -1).join("/"));
        continue;
      }
      const object = objectOf(name);
      if (object === undefined) {
        // a file that is not an object's main file still belongs to one: a
        // class carries its XML, its local includes and its test classes,
        // and a function group its includes. Anything that belongs to
        // nothing (a readme, a licence) is left behind.
        const owner = ownerOf(name);
        if (owner === undefined) {
          skipped.push({file: file.relative, why: "belongs to no object"});
        } else {
          this.#copy(file, target, written);
        }
        continue;
      }
      if (options.types !== undefined && options.types.includes(object.type) === false) {
        skipped.push({file: file.relative, why: `type ${object.type} was not asked for`});
        continue;
      }
      const existing = this.store.find(object.type, object.name);
      if (existing !== undefined && existing.imported === false && options.overwrite !== true) {
        skipped.push({file: file.relative, why: `${object.type} ${object.name} is ours already`});
        continue;
      }
      this.#copy(file, target, written, object);
    }

    // the folder joins the layers: listed last in abap_transpile.json, so
    // the build and the index both see it, and as the last layer it wins
    // a name it shares, which the build reports by file
    // The imported root is already the starting folder. Preserve its folder
    // logic so the store reads package declarations instead of inventing a pack.
    writeFileSync(join(this.store.root, target, ABAPGIT_XML),
      `<STARTING_FOLDER>/</STARTING_FOLDER><FOLDER_LOGIC>${config.folderLogic}</FOLDER_LOGIC>`);
    const listed = this.#enlist(target);
    this.store.reroot();
    this.store.build();
    return {
      folder,
      config,
      target,
      listed,
      written: written.length,
      objects: written.filter((w) => w.type !== undefined).length,
      packages: packages.size,
      skipped,
    };
  }

  // the target becomes an input of the transpiler, appended, the newest
  // layer (tools/osd-inputs.mjs); a tree without the config, a test's, is
  // left alone, and a folder already listed too
  #enlist(target) {
    const path = join(this.store.root, "abap_transpile.json");
    if (existsSync(path) === false) {
      return false;
    }
    const config = JSON.parse(readFileSync(path, "utf8"));
    const folders = config.input_folder === undefined ? [] : [config.input_folder].flat();
    if (folders.includes(target)) {
      return false;
    }
    config.input_folder = [...folders, target];
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
    return true;
  }

  // a repository nobody has yet. OSD fetches it itself; the files land in
  // a temporary folder only because the importer reads a repository the
  // way abapGit does, `.abapgit.xml` first, and that wants a tree.
  async fromGit(url, options = {}) {
    const name = options.name ?? url.split("/").pop().replace(/\.git$/, "").toLowerCase();
    const into = mkdtempSync(join(tmpdir(), "osd-clone-"));
    try {
      const clone = options.via === "git"
        ? this.#binary(url, into, options)
        : await this.#osd(url, into, options);
      const result = this.fromFolder(into, {...options, name});
      return {...result, url, commit: clone.commit.slice(0, 8), branch: clone.branch, via: clone.via, ms: clone.ms};
    } finally {
      rmSync(into, {recursive: true, force: true});
    }
  }

  // the fetch inside OSD: no git binary, and the same code a system would
  // run if abapGit were installed on it
  async #osd(url, into, options) {
    const clone = await new Git(this.store).clone(url, {branch: options.branch});
    new Git(this.store).write(clone, into);
    return {...clone, via: "osd"};
  }

  // the way out for a remote OSD cannot speak to, an ssh URL for instance
  #binary(url, into, options) {
    const env = {...process.env, GIT_CEILING_DIRECTORIES: dirname(into), GIT_DIR: join(into, ".git"), GIT_WORK_TREE: into};
    execFileSync("git", ["clone", "--depth", "1", ...(options.branch ? ["--branch", options.branch] : []), url, into], {cwd: into, env: {...process.env, GIT_CEILING_DIRECTORIES: dirname(into)}, stdio: "pipe"});
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {cwd: into, env, encoding: "utf8"}).trim();
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {cwd: into, env, encoding: "utf8"}).trim();
    return {commit, branch, via: "git", ms: 0};
  }

  #copy(file, target, written, object) {
    const to = join(target, file.relative);
    mkdirSync(join(this.store.root, to).replace(/\/[^/]*$/, ""), {recursive: true});
    writeFileSync(join(this.store.root, to), readFileSync(file.path));
    written.push({file: to, ...object});
  }
}

export class NotARepository extends Error {
  constructor(folder, startingFolder) {
    super(`${folder} has no ${startingFolder} to read: not an abapGit repository`);
    this.code = "NOT_A_REPOSITORY";
  }
}

async function main(args) {
  const where = args.find((a) => a.startsWith("-") === false);
  if (where === undefined) {
    console.log("usage: osd-import.mjs <folder|git url> [--types CLAS,INTF] [--overwrite] [--name <folder under local/>] [--branch main] [--git-binary]");
    return 2;
  }
  const at = (flag) => {
    const i = args.indexOf(flag);
    return i < 0 ? undefined : args[i + 1];
  };
  const options = {
    types: at("--types")?.split(","),
    overwrite: args.includes("--overwrite"),
    name: at("--name"),
    branch: at("--branch"),
  };
  const store = new ObjectStore();
  const before = store.list().length;
  const importer = new Import(store);
  const result = /^https?:|^git@/.test(where)
    ? await importer.fromGit(where, {...options, via: args.includes("--git-binary") ? "git" : undefined})
    : importer.fromFolder(where, options);
  const after = store.list().length;
  console.log(`${result.objects} objects from ${result.url ?? result.folder}${result.commit ? ` at ${result.commit}` : ""}${result.via ? ` (fetched by ${result.via}, ${result.ms} ms)` : ""}`);
  console.log(`  starting folder ${result.config.startingFolder}, folder logic ${result.config.folderLogic}${result.config.declared ? "" : " (assumed, no .abapgit.xml)"}`);
  console.log(`  the system went from ${before} to ${after} objects`);
  if (result.skipped.length > 0) {
    const why = new Map();
    for (const s of result.skipped) {
      why.set(s.why, (why.get(s.why) ?? 0) + 1);
    }
    console.log(`  skipped ${result.skipped.length}: ${[...why].map(([w, n]) => `${n} ${w}`).join(", ")}`);
  }
  return 0;
}

if (runsAs("osd-import.mjs")) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(`${error.code ?? "ERROR"}: ${error.message}`);
    process.exit(1);
  });
}
