// SPDX-License-Identifier: MIT
// Pure SAMC source parser shared by the generator and the AMC host.
// Missing tags remain own properties with undefined values, not omitted keys.
// @ts-check
/**
 * @typedef {object} SamcAuthority
 * @property {string | undefined} path
 * @property {string | undefined} program
 * @property {string | undefined} activity
 */

/**
 * @typedef {object} SamcChannel
 * @property {string} applicationId
 * @property {string | undefined} path
 * @property {string | undefined} type
 * @property {string | undefined} scope
 * @property {SamcAuthority[]} authorities
 * @property {string | undefined} source
 */

/** @param {string} xml @param {string} name @returns {string | undefined} */
const tag = (xml, name) => new RegExp(`<${name}>([^<]*)</${name}>`, "i").exec(xml)?.[1]?.trim();
/** @param {string} xml @param {string} name @returns {string[]} */
const rows = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "gi"))].map((m) => m[1]);

/**
 * @param {string} xml
 * @param {string} [source]
 * @returns {SamcChannel[]}
 */
export function parseSamc(xml, source) {
  const app = tag(xml, "APPLICATION_ID");
  if (!app) return [];
  const authorities = rows(xml, "AMC_CHNL_AUTH").map((row) => ({
    path: tag(row, "CHANNEL_ID")?.toLowerCase(),
    program: tag(row, "PROGRAM_ID")?.toUpperCase(),
    activity: tag(row, "ACTIVITY"),
  }));
  return rows(xml, "AMC_CHANNEL").map((row) => ({
    applicationId: app.toUpperCase(),
    path: tag(row, "CHANNEL_ID")?.toLowerCase(),
    type: tag(row, "MESSAGE_TYPE_ID")?.toUpperCase(),
    scope: tag(row, "SCOPE"),
    authorities,
    source,
  })).filter((row) => row.path && row.type);
}
