import {readEnvironment} from './osd-env.mjs';
// $TMP, the local package of every ABAP system, as a package of this one.
//
// What a real system has, measured on the A4H sandbox (2026-10-02,
// test/fixtures/tmp-package/a4h.json):
//
// - One TDEVC row named $TMP, not one per user: DLVUNIT (software component)
//   LOCAL, PARENTCL empty, PDEVCLASS (transport layer) empty, KORRFLAG
//   empty, delivered by SAP. Its text is "Temporary Objects (never
//   transported!)".
// - An object created in it carries its author (TADIR-AUTHOR, the logged-on
//   user), and needs no transport.
// - The tree of $TMP (repository/nodestructure, no user filter sent) is the
//   logged-on user's: their objects in $TMP and their local packages that
//   hang under $TMP or under nothing. Another user's objects and packages in
//   $TMP are not in it.
// - $TMP CAN be a parent. Sub-packages of $TMP exist on the system and a new
//   one created through ADT with superPackage $TMP was accepted (deleted
//   again). A spike note said otherwise; the system does not agree.
//
// Here a package is a folder (tools/osd-store.mjs), so $TMP is the folder
// TMP_FOLDER, under local/ because local/ is what git ignores: an object of
// $TMP is never transported, and the closest thing to a transport here is a
// commit. It is a layer of the build when it exists (tools/osd-packs.mjs), so
// what is created in it activates and runs like anything else. It never
// leaves for a system: tools/osd-deploy-manifest.mjs and
// tools/osd-abapgit-zip.mjs refuse it, closed rather than open.
//
// Who created an object is not something an abapGit file says, so it is kept
// beside the objects in TMP_AUTHORS, the TADIR of this one package.
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync} from "node:fs";
import {isAbsolute, join, relative, resolve} from "node:path";

export const TMP_PACKAGE = "$TMP";
export const TMP_FOLDER = "local/tmp";
export const TMP_TEXT = "Temporary Objects (never transported!)";
export const TMP_AUTHORS = "tadir.json";

/** The TDEVC attributes of $TMP as measured on A4H; what the package
 *  document and the refusals below say about it. */
export const TMP_ATTRIBUTES = Object.freeze({
  devclass: TMP_PACKAGE, parentcl: "", pdevclass: "", dlvunit: "LOCAL", korrflag: "",
});

export const isTmpPackage = (name) => String(name ?? "").toUpperCase() === TMP_PACKAGE;

/** the store root that holds $TMP */
export function tmpRoot() {
  return {path: TMP_FOLDER, writable: true, library: false, package: TMP_PACKAGE, tmp: true};
}

/** whether a path (absolute, or relative to `root`) is $TMP or inside it */
export function insideTmp(root, path) {
  const rel = relative(resolve(root, TMP_FOLDER), resolve(root, path));
  return rel === "" || (!isAbsolute(rel) && rel.split(/[\\/]/)[0] !== "..");
}

/** the package object of $TMP, written the first time something goes in */
export function ensureTmp(root) {
  const folder = join(root, TMP_FOLDER);
  refuseLinks(root);
  mkdirSync(folder, {recursive: true});
  refuseLinks(root);
  const devc = join(folder, "package.devc.xml");
  if (!existsSync(devc)) {
    writeFileSync(devc, `<?xml version="1.0" encoding="utf-8"?>
<abapGit version="v1.0.0" serializer="LCL_OBJECT_DEVC" serializer_version="v1.0.0">
 <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
   <DEVC>
    <CTEXT>${TMP_TEXT}</CTEXT>
   </DEVC>
  </asx:values>
 </asx:abap>
</abapGit>
`);
  }
  return folder;
}

/** local/ and local/tmp/ are real folders: a link at either would steer
 *  every write of $TMP somewhere else */
export function refuseLinks(root) {
  let at = root;
  for (const step of TMP_FOLDER.split("/")) {
    at = join(at, step);
    let info;
    try {
      info = lstatSync(at);
    } catch {
      return;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`${relative(root, at)} is a symbolic link; ${TMP_PACKAGE} is written only into a real folder`);
    }
  }
}

/** "TYPE NAME" -> {author, createdAt}, for the objects of $TMP. `{}` when
 *  nothing was recorded yet; `null` when the record exists and cannot be
 *  read, which the store answers by showing nobody anything (fail closed):
 *  an unreadable ownership record is not a licence to show every user's
 *  objects to everyone. Said loudly, once per reading. */
export function tmpAuthors(root) {
  const file = join(root, TMP_FOLDER, TMP_AUTHORS);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed;
  } catch (e) {
    console.error(`osd-tmp: ${join(TMP_FOLDER, TMP_AUTHORS)} cannot be read (${e.message}); `
      + `no object of ${TMP_PACKAGE} is shown to anyone until it is repaired or removed`);
    return null;
  }
}

export function recordAuthor(root, type, name, author) {
  const all = readForUpdate(root);
  Object.assign(all, {[`${type} ${String(name).toUpperCase()}`]: {author: String(author).toUpperCase(), createdAt: new Date().toISOString()}});
  writeAuthors(root, all);
}

export function forgetAuthor(root, type, name) {
  const all = readForUpdate(root);
  const key = `${type} ${String(name).toUpperCase()}`;
  const entries = Object.entries(all);
  if (entries.some(([name, value]) => name === key && value !== undefined)) {
    writeAuthors(root, Object.fromEntries(entries.filter(([name]) => name !== key)));
  }
}

// a broken record is not overwritten with a fresh one: that would make the
// loss of everybody's ownership permanent
function readForUpdate(root) {
  const all = tmpAuthors(root);
  if (all === null) {
    throw new Error(`${join(TMP_FOLDER, TMP_AUTHORS)} cannot be read; repair or remove it before changing ${TMP_PACKAGE}`);
  }
  return all;
}

// temp file + rename: an interrupted write leaves the old record or the new
// one, never a truncated file
function writeAuthors(root, all) {
  ensureTmp(root);
  const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const file = join(root, TMP_FOLDER, TMP_AUTHORS);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, JSON.stringify(sorted, undefined, 1) + "\n");
  renameSync(temp, file);
}

/** every file under $TMP, relative to its folder, sorted; the deploy gate
 *  names the objects in them (tools/osd-deploy-manifest.mjs localObjectKeys) */
export function tmpFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry !== TMP_AUTHORS && !entry.endsWith(".tmp")) out.push(full);
    }
  };
  walk(join(root, TMP_FOLDER));
  return out;
}

/** OSD_TMP=off leaves $TMP out of the layers and the store: what a preview
 *  or any other published build runs with (scripts/build-preview.mjs) */
export const tmpDisabled = (env = readEnvironment(["OSD_TMP"])) => String(env.OSD_TMP ?? "").toLowerCase() === "off";

/** The one switch every publishing path throws (preview/Pages, VSIX and the
 *  binary's seed, Docker, osd-build --publish): $TMP is left out of what it
 *  builds. The caller supplies the env to mutate; returns that same object. */
export function forPublishing(env) {
  env.OSD_TMP = "off";
  return env;
}

/** Why a generation may not be published, from its own provenance: the
 *  layer list the build recorded (manifest.json inputs.folders, and the
 *  abap_transpile.json it handed the transpiler). A module whose source was
 *  deleted after the build is still in that list's generation, so this is
 *  decided by what the build read, not by what the tree holds now. Without
 *  a record there is no knowing, and that is a refusal too. */
export function generationTmpProblem(generationDir) {
  const layers = [];
  try {
    const manifest = JSON.parse(readFileSync(join(generationDir, "manifest.json"), "utf8"));
    layers.push(...(manifest.inputs?.folders ?? []));
    if (!Array.isArray(manifest.inputs?.folders)) throw new Error("it lists no input folders");
  } catch (e) {
    return `${generationDir} has no readable record of its layers (manifest.json: ${e.message}); it cannot be shown to be free of ${TMP_PACKAGE}`;
  }
  try {
    layers.push(...[JSON.parse(readFileSync(join(generationDir, "abap_transpile.json"), "utf8")).input_folder ?? []].flat());
  } catch {
    // the manifest's list is the record; the config is a second witness only
  }
  // and the active copies of inactive objects an activation built from
  // (build/inactive/active/<file>, ObjectStore#overlay): a copy of a $TMP file
  // is a $TMP object as much as the file is
  let copies = [];
  try {
    copies = JSON.parse(readFileSync(join(generationDir, "manifest.json"), "utf8")).inputs?.overlay ?? [];
  } catch {
    // read above already; nothing more to learn
  }
  const local = [...layers.filter((f) => f === TMP_FOLDER || String(f).startsWith(TMP_FOLDER + "/")),
    ...copies.filter((f) => String(f).includes(`/active/${TMP_FOLDER}/`))];
  return local.length === 0 ? undefined
    : `${generationDir} was built with ${TMP_FOLDER} as a layer (${local.slice(0, 3).join(", ")}): it holds ${TMP_PACKAGE} objects and is never published. Rebuild with OSD_TMP=off (osd-build --publish).`;
}

// ------------------------------------------------------------ names
//
// SAP's character set for repository names: A-Z, 0-9 and _, an optional
// /NAMESPACE/ in front, and for a local package a leading $. Anything else --
// a dot, a slash outside a namespace, a space -- is not a name, and a name
// here becomes a path, so the check is also what keeps a create inside its
// folder.
export {nameProblem} from "./osd-object-name.mjs";

// ------------------------------------------------------------ the generation

/** The modules of a transpiled generation that came from $TMP: a preview
 *  that carries one publishes a local object. `keys` are "TYPE NAME". */
export function tmpModulesIn(outputDir, keys) {
  let files;
  try {
    files = new Set(readdirSync(outputDir));
  } catch {
    return [];
  }
  const found = [];
  for (const key of keys) {
    const [type, ...rest] = key.split(" ");
    const stem = rest.join(" ").toLowerCase().replace(/\//g, "#");
    if (files.has(`${stem}.${type.toLowerCase()}.mjs`)) found.push(key);
  }
  return found.sort();
}

/** The transpiler files every object under devclass $TMP. Here that is the
 *  package of a few objects only, so the TADIR rows it hands over are
 *  rewritten: $TMP for an object of $TMP (`keys`, "TYPE NAME"), empty --
 *  "not known to the build" -- for the rest. ABAP that asks TADIR whether an
 *  object is local (zcl_stg_segw_repo) then gets a true answer. */
export function tadirWithTmp(statements, keys) {
  const re = /^(\s*INSERT INTO "tadir" \([^)]*\)\s*VALUES \('R3TR', '([^']*)', '([^']*)', )'\$TMP'/;
  return statements.map((statement) => {
    const m = re.exec(statement);
    if (m === null) return statement;
    const key = `${m[2].toUpperCase()} ${m[3].toUpperCase()}`;
    return statement.replace(re, `$1'${keys.has(key) ? TMP_PACKAGE : ""}'`);
  });
}
