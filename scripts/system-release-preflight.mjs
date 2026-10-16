#!/usr/bin/env node
// Offline proof of the exact staged release trees. Never prints matched text.
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {stageSystem} from './system-stage.mjs';
import {OMITTED} from './system-publish.mjs';
import {build, leakGate, prepareSystem, readLeakAllow} from '../tools/osd-layer.mjs';
const root = process.cwd(), temp = mkdtempSync(join(tmpdir(), 'release-preflight-'));
process.env.OSD_LEAK_REDACT = '1';
try {
  const allow = readLeakAllow(join(root, '.leak-allow.release.json'));
  const identifiers = JSON.parse(readFileSync(process.env.OSD_LEAK_IDENTIFIERS ?? join(root, '.local/leak-identifiers.json'), 'utf8'));
  const probe = Object.values(identifiers).flat()[0];
  const built = [];
  let guesses = 0;
  for (const layer of stageSystem(root, temp).filter(l => !(l.kind === 'pack' && Object.hasOwn(OMITTED, l.name)))) {
    const b = build(layer.folder, layer), entries = allow.filter(e => e.layer === layer.name);
    leakGate([b.files], {config: b.config, manifest: b.manifest}, [b.configBytes, b.manifestBytes], entries, [layer.name]);
    for (const entry of entries) {
      if ('value' in entry) throw new Error('value fingerprints are forbidden');
      const bytes = b.files.find(f => f.path === entry.file).bytes;
      const tokens = new Set([...(bytes.toString('utf8').match(/[A-Za-z0-9_]+/g) ?? []), ...bytes.toString('utf8').split(/\s+/)]);
      const serialized = JSON.stringify(entry);
      for (const token of tokens) {
        guesses++;
        const digest = createHash('sha256').update(token.toLowerCase()).digest('hex');
        if (serialized.includes(digest)) throw new Error(`token guess recovered an exception fingerprint: ${layer.name}:${entry.file}`);
      }
    }
    for (const injected of [[192, 168, 247, 231].join('.'), probe]) {
      const path = entries[0]?.file ?? b.files.find(f => f.path !== '.abapgit.xml').path;
      const files = b.files.map(f => f.path === path ? {...f, bytes: Buffer.concat([f.bytes, Buffer.from('\n' + injected)])} : f);
      let refused = false;
      try { leakGate([files], {}, [], entries, [layer.name]); }
      catch (error) { if (!['BAD_ALLOW', 'LEAK'].includes(error.code)) throw error; refused = true; }
      if (!refused) throw new Error(`injection accepted: ${layer.kind}:${layer.name}`);
      // Also exercise the scanner itself outside any excepted path.
      let scanned = false;
      try { leakGate([[...b.files, {path: 'release-probe.txt', bytes: Buffer.from(injected)}]], {}, [], entries, [layer.name]); }
      catch (error) { if (error.code !== 'LEAK') throw error; scanned = true; }
      if (!scanned) throw new Error(`scanner injection accepted: ${layer.kind}:${layer.name}`);
    }
    built.push({files: b.files, layer: {config: b.config, configBytes: b.configBytes, manifest: {json: b.manifest, bytes: b.manifestBytes}}});
    console.log(`PASS ${layer.kind} ${layer.name}: gate and both injection probes`);
  }
  prepareSystem('ghcr.io/example/open-steamgate/osd-system:preflight', built, {root, allow});
  console.log(`PASS system gate: ${built.length} layers; no exception fingerprints recovered`);
} finally { rmSync(temp, {recursive: true, force: true}); }
