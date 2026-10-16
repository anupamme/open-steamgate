// One staging recipe for the local roundtrip and release publication.
import {cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {packsOf} from '../tools/osd-packs.mjs';
import {readLock} from '../tools/osd-lock.mjs';
import {libraryPath} from '../tools/osd-lib-path.mjs';
import {abapgitXml} from '../tools/osd-abapgit-xml.mjs';

export function stageSystem(root, temp) {
  const layers = readLock(root).libraries.map(lib => ({folder: realpathSync(libraryPath(root, lib.folder, undefined, true)), name: lib.folder, kind: 'lib', source: `https://github.com/${lib.repo}@${lib.ref}:.`}));
  const own = join(temp, 'own'); mkdirSync(own, {recursive: true});
  for (const folder of ['src', 'data', 'webapp']) if (existsSync(join(root, folder))) cpSync(join(root, folder), join(own, folder), {recursive: true});
  writeFileSync(join(own, '.abapgit.xml'), abapgitXml());
  layers.push({folder: own, name: 'src', kind: 'input'}, {folder: join(root, 'test'), name: 'test', kind: 'input'});
  for (const pack of packsOf(root)) {
    if (pack.missing.length) throw new Error(`unfetched pack: ${pack.name}`);
    const folder = join(temp, 'resolved-packs', pack.name);
    cpSync(pack.dir, folder, {recursive: true, filter: path => !['.osd-source.json', '.osd-fetched.json'].includes(path.split('/').at(-1))});
    const declared = JSON.parse(readFileSync(join(folder, 'osd-pack.json')));
    // Preserve every resolved folder, including those outside the ABAP projection.
    delete declared.sources;
    writeFileSync(join(folder, 'osd-pack.json'), JSON.stringify(declared, null, 2) + '\n');
    layers.push({folder, name: pack.name, kind: 'pack'});
  }
  return layers;
}
