// SPDX-License-Identifier: MIT
// Pure compatibility shapes for frontend.mjs, whose body is unchanged in this
// slice. Only UTF-8 reads and name/isDirectory are consumed; no Node object
// crosses host-io, and every typed host call keeps its declared arity.
import {basename, listDir, listEntries, readText} from "./host-io.ts";
import {SOURCE} from "../osd-source-identity-name.mjs";

// The sole frontend encoding argument is "utf8"; retain that JS call shape
// here rather than sending an extra argument across the typed extern boundary.
/** @param {string} file @param {string} _encoding @returns {string} */
export function readFileSync(file, _encoding) {
  return readText(file);
}

/** @param {string} file @returns {boolean} */
export const isSourceIdentity = (file) => basename(file) === SOURCE;
/** @param {string} dir @returns {import("./host-io.ts").DirectoryEntry[]} */
export function readdirEntries(dir) {
  return listEntries(dir).map(([name, directory]) => {
    /** @type {import("./host-io.ts").DirectoryEntry} */ const entry = {name, isDirectory: () => directory}; return entry;
  });
}
/** @param {string} dir @returns {string[]} */
export function readdirNames(dir) {
  return listDir(dir);
}
