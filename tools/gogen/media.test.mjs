import {parseObserved} from "./frontend-inventory.mjs";
// node --test tools/gogen/media.test.mjs
//
// replaceWwwparams against the transpiler's own rows: PopulateTables for one
// W3MI object whose data file the registry was not given (as tools/gogen
// builds it: .abap and .xml only) writes filesize 0; after the swap exactly
// one filesize row is left and it carries the real size. (An object NAME
// with a quote is not tested: the transpiler writes it into the INSERT
// unescaped, 2026-09-23, which is broken SQL before this runs.)
import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {home} from "./home.mjs";
import {collectMedia, replaceWwwparams} from "./media.mjs";

const require = createRequire(`${home}/package.json`);
const abaplint = require("@abaplint/core");
const {PopulateTables} = require("@abaplint/transpiler/build/src/db/populate_tables.js");

const xml = (name, text) => `<?xml version="1.0" encoding="utf-8"?>
<abapGit version="v1.0.0" serializer="LCL_OBJECT_W3MI" serializer_version="v2.0.0">
 <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
   <NAME>${name}</NAME>
   <TEXT>${text}</TEXT>
   <PARAMS>
    <WWWPARAMS>
     <NAME>mimetype</NAME>
     <VALUE>text/plain</VALUE>
    </WWWPARAMS>
   </PARAMS>
  </asx:values>
 </asx:abap>
</abapGit>
`;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "gogen-media-"));
  writeFileSync(join(dir, "zgogen_t_media.w3mi.xml"), xml("ZGOGEN_T_MEDIA.TXT", "a W3MI fixture"));
  writeFileSync(join(dir, "zgogen_t_media.w3mi.data.txt"), "hello, media");
  return dir;
}

function transpilerRows(dir) {
  const reg = new abaplint.Registry();
  reg.addFile(new abaplint.MemoryFile("wwwparams.tabl.xml", readFileSync(`${home}/.local/lars/open-abap-core/src/w3mi/wwwparams.tabl.xml`, "utf8")));
  reg.addFile(new abaplint.MemoryFile("zgogen_t_media.w3mi.xml", readFileSync(join(dir, "zgogen_t_media.w3mi.xml"), "utf8")));
  parseObserved(reg);
  const obj = reg.getObject("W3MI", "ZGOGEN_T_MEDIA");
  assert.ok(obj, "the W3MI object is in the registry");
  return new PopulateTables(reg).insertWWWPARAMS(obj);
}

test("replaceWwwparams replaces the transpiler's filesize 0 by the real size", () => {
  const dir = fixture();
  try {
    const rows = transpilerRows(dir);
    assert.ok(rows.some((r) => /'filesize', '0'\);$/.test(r)), "the transpiler writes filesize 0 without the data file");
    const other = `INSERT INTO "wwwparams" ("relid", "objid", "name", "value") VALUES ('MI', 'ZOTHER', 'filesize', '7');`;
    const objects = collectMedia([dir]);
    assert.equal(objects.length, 1);
    assert.equal(objects[0].id, "ZGOGEN_T_MEDIA.TXT");
    const out = replaceWwwparams(["CREATE TABLE x (y);", ...rows, other], objects);
    const sizes = out.filter((r) => /VALUES \('MI', 'ZGOGEN_T_MEDIA.TXT', 'filesize'/.test(r));
    assert.deepEqual(sizes, [`INSERT INTO "wwwparams" ("relid", "objid", "name", "value") VALUES ('MI', 'ZGOGEN_T_MEDIA.TXT', 'filesize', '12');`]);
    assert.equal(out.filter((r) => r.includes("'ZGOGEN_T_MEDIA.TXT'")).length, rows.length, "every row replaced, none duplicated");
    assert.ok(out.includes(other) && out.includes("CREATE TABLE x (y);"), "other statements kept");
  } finally {
    rmSync(dir, {recursive: true});
  }
});

test("replaceWwwparams refuses when it recognises no row of an object", () => {
  const dir = fixture();
  try {
    const rows = transpilerRows(dir).map((r) => r.replace('INSERT INTO "wwwparams" (', 'INSERT INTO "wwwparams"  ('));
    assert.throws(() => replaceWwwparams(rows, collectMedia([dir])), /no WWWPARAMS row of the transpiler recognised for ZGOGEN_T_MEDIA.TXT/);
  } finally {
    rmSync(dir, {recursive: true});
  }
});
