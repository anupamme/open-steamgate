import {spawn} from 'node:child_process';

export function runNode(root, args) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, args, {cwd: root, env: {...process.env, OSD_ROOT: root}, stdio: ['ignore', 'pipe', 'inherit']});
    let output = '';
    child.stdout.on('data', bytes => { output += bytes; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? done(output.trim()) : reject(new Error(`${args[0]} exited ${code}`)));
  });
}
