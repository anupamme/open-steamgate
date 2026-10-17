// SPDX-License-Identifier: MIT
// Pure Go naming: no emitter, filesystem or provenance dependencies.
// @ts-check
/** @param {string} s @returns {string} */
export const typeName = (s) => {
  const name = String(s).toUpperCase().replace(/=>|~|-/g, "__").replace(/[^A-Z0-9_]/g, "_");
  return name.startsWith("_") ? `N${name}` : name;
};
/** @param {string} cls @param {string} method @returns {string} */
export const funcName = (cls, method) => `${typeName(cls)}${cls.includes(":") ? "__OSD_METHOD__" : "_"}${typeName(method)}`;
