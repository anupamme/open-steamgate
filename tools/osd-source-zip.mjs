// Read ZIP metadata before writing any bytes. No shell or whitespace splitting.
import {inflateRawSync} from 'node:zlib';
const crcTable = Array.from({length: 256}, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc32 = bytes => {
  let n = 0xffffffff;
  for (const b of bytes) n = crcTable.at((n ^ b) & 255) ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
};
export function archiveFiles(bytes) {
  const fail = why => { throw new Error(`unsafe or unsupported source ZIP: ${why}`); };
  if (bytes.length > 128 * 1024 * 1024) fail('compressed archive exceeds 128 MiB');
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (bytes.readUInt32LE(end) === 0x06054b50 && end + 22 + bytes.readUInt16LE(end + 20) === bytes.length) break;
  }
  if (end < Math.max(0, bytes.length - 65557)) fail('missing ZIP directory');
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail('multi-disk ZIP');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (count === 65535 || start + size !== end || bytes.readUInt16LE(end + 8) !== count) fail('ZIP64 or inconsistent directory');
  if (count > 20000) fail('archive exceeds 20000 entries');
  const files = new Map(), names = new Set();
  let at = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) fail('invalid directory entry');
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16), packed = bytes.readUInt32LE(at + 20), unpacked = bytes.readUInt32LE(at + 24);
    const length = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32);
    const attrs = bytes.readUInt32LE(at + 38), offset = bytes.readUInt32LE(at + 42);
    if (at + 46 + length + extra + comment > end) fail('truncated directory');
    const name = bytes.subarray(at + 46, at + 46 + length).toString('utf8');
    if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)
        || name.split('/').some(p => p === '..' || p === '.') || name.includes('//')) fail(`path ${JSON.stringify(name)}`);
    const kind = (attrs >>> 16) & 0xf000;
    if (kind && kind !== 0x8000 && kind !== 0x4000) fail(`non-regular entry ${JSON.stringify(name)}`);
    if (flags & 1 || ![0, 8].includes(method)) fail('encrypted or unsupported compression');
    if (names.has(name.toLowerCase())) fail(`duplicate path ${JSON.stringify(name)}`);
    names.add(name.toLowerCase());
    total += unpacked;
    if (unpacked > 64 * 1024 * 1024) fail('entry exceeds 64 MiB');
    if (unpacked > Math.max(1048576, packed * 1000)) fail('compression ratio exceeds 1000:1');
    if (total > 512 * 1024 * 1024) fail('expanded archive exceeds 512 MiB');
    if (offset + 30 > start || bytes.readUInt32LE(offset) !== 0x04034b50) fail('invalid local header');
    const localLength = bytes.readUInt16LE(offset + 26), localExtra = bytes.readUInt16LE(offset + 28);
    const data = offset + 30 + localLength + localExtra;
    if (data + packed > start || bytes.subarray(offset + 30, offset + 30 + localLength).toString('utf8') !== name
        || bytes.readUInt16LE(offset + 8) !== method || bytes.readUInt16LE(offset + 6) !== flags) fail('local header differs from directory');
    const compressed = bytes.subarray(data, data + packed);
    const content = method === 0 ? compressed : inflateRawSync(compressed, {maxOutputLength: Math.max(1, unpacked)});
    if (content.length !== unpacked || crc32(content) !== crc) fail(`size or CRC mismatch: ${JSON.stringify(name)}`);
    if (!name.endsWith('/')) files.set(name, content);
    at += 46 + length + extra + comment;
  }
  if (at !== end) fail('directory size mismatch');
  // File/directory collisions must fail before publication, too.
  for (const name of files.keys()) {
    const parts = name.toLowerCase().split('/');
    while (parts.pop() && parts.length) if (names.has(parts.join('/'))) fail('file/directory collision');
  }
  return files;
}
