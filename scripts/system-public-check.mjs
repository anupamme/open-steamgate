// Deliberately uses bare fetch: never the OCI client's credential environment.
import {readFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseRef, sha256, MEDIA} from '../tools/osd-oci.mjs';
import {activeSystem} from '../tools/osd-system.mjs';
import {verifySystem} from '../tools/osd-system-verify.mjs';
import {runNode} from './system-run-node.mjs';
import {runsAs} from '../tools/osd-main.mjs';
export async function checkPublic(report, request = fetch) {
for (const ref of [...report.layers.map(layer => layer.ref), report.ref]) {
  const {registry, repository, digest} = parseRef(ref);
  if (registry !== 'ghcr.io' || !digest) throw new Error('expected pinned GHCR reference');
  const url = new URL('https://ghcr.io/token');
  url.searchParams.set('service', 'ghcr.io');
  url.searchParams.set('scope', `repository:${repository}:pull`);
  const response = await request(url, {redirect: 'error'});
  if (!response.ok) throw new Error(`anonymous token refused: ${repository} (${response.status})`);
  const {token} = await response.json();
  if (typeof token !== 'string' || !token) throw new Error(`no anonymous pull token: ${repository}`);
  const manifest = await request(`https://ghcr.io/v2/${repository}/manifests/${digest}`, {redirect: 'error', headers: {Authorization: `Bearer ${token}`, Accept: `${MEDIA.index}, ${MEDIA.manifest}`}});
  if (!manifest.ok || sha256(Buffer.from(await manifest.arrayBuffer())) !== digest) throw new Error(`package is not anonymously readable by digest: ${repository}`);
  console.log(`Public: ${ref}`);
}
}

// The tools/config are from the tag; all source layers come from its published digest.
export async function verifyPublishedSystem(report, root, {run = runNode, verify = at => verifySystem(at, activeSystem(at), console.log)} = {}) {
  mkdirSync(root, {recursive: true});
  const checkout = fileURLToPath(new URL('..', import.meta.url));
  for (const path of ['tools', 'scripts', 'test', 'gen', 'abap_transpile.json', 'libs.lock.json', 'package.json']) {
    if (existsSync(join(checkout, path))) cpSync(join(checkout, path), join(root, path), {recursive: true});
  }
  symlinkSync(join(checkout, 'node_modules'), join(root, 'node_modules'), 'dir');
  await run(root, [join(root, 'tools/osd-fetch.mjs'), '--system', report.ref]);
  verify(root);
  await run(root, [join(root, 'tools/osd-build.mjs')]);
  await run(root, [join(root, 'scripts/system-init-smoke.mjs')]);
}

if (runsAs('system-public-check.mjs')) {
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
await checkPublic(report);
const root = mkdtempSync(join(tmpdir(), 'system-release-install-'));
try {
  await verifyPublishedSystem(report, root);
} finally { rmSync(root, {recursive: true, force: true}); }
}
