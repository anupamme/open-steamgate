import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readEnvironment} from './osd-env.mjs';
export const libraryEnvKey = folder => 'OSD_LIB_' + [...folder.toUpperCase()].map(c => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.includes(c) ? c : '_').join('');
export function layerEnvironment(root, installed = []) {
  const lock = join(root, 'libs.lock.json');
  const libraries = existsSync(lock) ? JSON.parse(readFileSync(lock, 'utf8')).libraries.map(lib => lib.folder) : [];
  return readEnvironment(['OSD_PACKS', 'OSD_WEB_PACKS', 'OSD_LAYERS', 'OSD_TMP', 'OSD_LAYER_PACKAGE', 'OSD_LAYER_DISCOVERY_ONLY', ...libraries.map(libraryEnvKey), ...installed.map(libraryEnvKey)]);
}
