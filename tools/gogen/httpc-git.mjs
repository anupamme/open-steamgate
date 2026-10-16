// ZCL_OSD_GIT's fetch on Node and on OSGo against one local git server
// (ultra/httpc).
//
//   node tools/gogen/httpc-git.mjs        after a full `node tools/gogen/osgo.mjs`
//
// The server is `git http-backend` (git's own smart HTTP, as CGI) behind a
// recording front in this process, over a bare repository made here: three
// commits, a subfolder, a binary file and a file changed in every commit, so
// the pack has deltas. No network beyond 127.0.0.1.
//
//   Node  OSG_HOME's output/ (the transpiled tree), ZCL_OSD_GIT=>REFS and
//         =>CLONE called as tools/osd-git.mjs calls them
//   Go    the same two methods of the osgo build (go/cmd/osgo/zz_generated.go),
//         through go/cmd/osgo/gitprobe_test.go (-tags gitprobe)
//
// Compared: the bytes of every request the server received, the refs, and
// the clone (commit, branch, each file's path, name, size and SHA-1).
//
// 2026-09-24 (ultra/httpc): the requests Go sends are Node's byte for byte,
// and both REFS and CLONE then stop in ZCL_OSD_GIT=>UNTIL_NULL, a
// comparison of an xstring with a c literal (iv_data+lv_at(1) = '00'),
// which the front end refuses until the byte-like comparison rules are
// measured on A4H; PACK_OF has the same (lv_hex = '5041434B').
// ultra/bytecmp (after the A4H measurement): REFS equals Node's, CLONE
// stops in ZCL_ABAPGIT_GIT_PACK=>DECODE (GET_TYPE, a generic TYPE x
// parameter); README "Byte-like comparisons" lists the rest of the path.
import {execFile, execFileSync, spawn} from "node:child_process";
import {mkdirSync, rmSync, writeFileSync} from "node:fs";
import {createServer} from "node:net";
import {dirname, join} from "node:path";
import {pathToFileURL} from "node:url";
import {home} from "./home.mjs";

const here = import.meta.dirname;
const work = join(here, ".out", "httpc-git");

/* ------------------------------------------------------------ the remote */

export function makeRepo(work = join(here, ".out", "httpc-git")) {
  rmSync(work, {recursive: true, force: true});
  const wt = join(work, "wt");
  mkdirSync(join(wt, "src", "sub"), {recursive: true});
  const git = (...a) => execFileSync("git", ["-c", "user.name=gogen", "-c", "user.email=gogen@example.invalid", "-c", "init.defaultBranch=main", ...a],
    {cwd: wt, env: {...process.env, GIT_CEILING_DIRECTORIES: dirname(wt),
      ...(a[0] === "init" ? {} : {GIT_DIR: join(wt, ".git"), GIT_WORK_TREE: wt}), GIT_AUTHOR_DATE: "2026-09-24T12:00:00Z", GIT_COMMITTER_DATE: "2026-09-24T12:00:00Z"}}).toString();
  git("init", "-q");
  const long = Array.from({length: 200}, (_, i) => `line ${i} of a file that changes a little in every commit`).join("\n");
  for (let n = 1; n <= 3; n++) {
    writeFileSync(join(wt, "README.md"), `# probe\n\ncommit ${n}\n`);
    writeFileSync(join(wt, "src", "zcl_probe.clas.abap"), `${long}\n* commit ${n}\n`);
    writeFileSync(join(wt, "src", "sub", "data.bin"), Buffer.from(Array.from({length: 300}, (_, i) => (i * n) & 0xff)));
    git("add", "-A");
    git("commit", "-q", "-m", `commit ${n}`);
  }
  git("tag", "v1");
  execFileSync("git", ["clone", "-q", "--bare", wt, join(work, "repo.git")]);
  return execFileSync("git", ["rev-parse", "HEAD"], {cwd: wt, env: {...process.env, GIT_DIR: join(wt, ".git"), GIT_WORK_TREE: wt}}).toString().trim();
}

/* ------------------------------------------------------------ the server */

// one request's end in buf (head, then Content-Length bytes or chunks)
function requestEnd(buf) {
  const h = buf.indexOf("\r\n\r\n");
  if (h < 0) return -1;
  const head = buf.subarray(0, h).toString("latin1").toLowerCase();
  let at = h + 4;
  const len = /\r\ncontent-length:\s*(\d+)/.exec(head);
  if (len) return buf.length >= at + Number(len[1]) ? at + Number(len[1]) : -1;
  if (/\r\ntransfer-encoding:\s*chunked/.test(head)) {
    for (;;) {
      const e = buf.indexOf("\r\n", at);
      if (e < 0) return -1;
      const n = parseInt(buf.subarray(at, e).toString("latin1"), 16);
      at = e + 2 + n + 2;
      if (buf.length < at) return -1;
      if (n === 0) return at;
    }
  }
  return at;
}

// the body of a request as the CGI reads it (chunks joined)
function bodyOf(raw) {
  const h = raw.indexOf("\r\n\r\n");
  const head = raw.subarray(0, h).toString("latin1").toLowerCase();
  let rest = raw.subarray(h + 4);
  if (!/\r\ntransfer-encoding:\s*chunked/.test(head)) return rest;
  const parts = [];
  for (;;) {
    const e = rest.indexOf("\r\n");
    const n = parseInt(rest.subarray(0, e).toString("latin1"), 16);
    if (n === 0) return Buffer.concat(parts);
    parts.push(rest.subarray(e + 2, e + 2 + n));
    rest = rest.subarray(e + 2 + n + 2);
  }
}

function gitServer() {
  const log = [];
  let conns = 0;
  const server = createServer((sock) => {
    const id = ++conns;
    let buf = Buffer.alloc(0);
    let busy = Promise.resolve();
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const end = requestEnd(buf);
        if (end < 0) return;
        const raw = buf.subarray(0, end);
        buf = buf.subarray(end);
        log.push({conn: id, raw});
        busy = busy.then(() => cgi(raw)).then((answer) => sock.write(answer));
      }
    });
    sock.on("error", () => {});
  });
  return {server, log};
}

// git http-backend for one request; its CGI answer as HTTP/1.1 with a length
function cgi(raw) {
  const head = raw.subarray(0, raw.indexOf("\r\n\r\n")).toString("latin1").split("\r\n");
  const [method, target] = head[0].split(" ");
  const [path, query = ""] = target.split("?");
  const header = (n) => head.slice(1).find((l) => l.toLowerCase().startsWith(`${n}:`))?.slice(n.length + 1).trim() ?? "";
  const body = bodyOf(raw);
  return new Promise((resolve) => {
    const p = spawn("git", ["http-backend"], {env: {...process.env, GIT_PROJECT_ROOT: work, GIT_HTTP_EXPORT_ALL: "1", REQUEST_METHOD: method, PATH_INFO: path,
      QUERY_STRING: query, CONTENT_TYPE: header("content-type"), CONTENT_LENGTH: String(body.length), HTTP_CONTENT_ENCODING: header("content-encoding"), REMOTE_ADDR: "127.0.0.1"}});
    const out = [];
    p.stdout.on("data", (d) => out.push(d));
    p.on("close", () => {
      const all = Buffer.concat(out);
      const h = all.indexOf("\r\n\r\n");
      const lines = all.subarray(0, h).toString("latin1").split("\r\n");
      const payload = all.subarray(h + 4);
      let status = "200 OK";
      const kept = [];
      for (const l of lines) {
        if (/^status:/i.test(l)) status = l.slice(7).trim();
        else kept.push(l);
      }
      resolve(Buffer.concat([Buffer.from([`HTTP/1.1 ${status}`, ...kept, `Content-Length: ${payload.length}`].join("\r\n") + "\r\n\r\n", "latin1"), payload]));
    });
    p.stdin.end(body);
  });
}

/* ----------------------------------------------------------------- sides */

async function nodeSide(url) {
  const {initializeABAP} = await import(pathToFileURL(join(home, "output", "init.mjs")).href);
  await initializeABAP();
  const abap = globalThis.abap;
  const git = abap.Classes.ZCL_OSD_GIT;
  const str = (v) => new abap.types.String().set(v);
  const dump = (e) => {
    const name = e?.constructor?.name ?? "?";
    return /^(zcx|cx)_/i.test(name) ? `DUMP ${name.toUpperCase()}` : `DUMP host|${e?.message ?? e}`;
  };
  const refs = {};
  try {
    refs.Refs = (await git.refs({iv_url: str(url)})).array().map((r) => [r.get().sha1.get(), r.get().name.get()]);
  } catch (e) { refs.Dump = dump(e); }
  const clone = {};
  try {
    const c = (await git.clone({iv_url: str(url), iv_branch: str("")})).get();
    clone.Commit = c.commit.get();
    clone.Branch = c.branch.get();
    const {createHash} = await import("node:crypto");
    clone.Files = c.files.array().map((r) => {
      const data = Buffer.from(r.get().data.get(), "hex");
      return {Path: r.get().path.get(), Filename: r.get().filename.get(), SHA1: createHash("sha1").update(data).digest("hex"), Size: data.length};
    });
  } catch (e) { clone.Dump = dump(e); }
  return {refs, clone};
}

function goSide(url) {
  return new Promise((resolve, reject) => {
    execFile("go", ["test", "-vet=off", "-tags", "gitprobe", "-count=1", "./cmd/osgo", "-run", "TestGitProbe", "-v"], {cwd: join(here, "go"), maxBuffer: 1 << 28,
      env: {...process.env, GOPROXY: "off", OSGO_GIT_URL: url}}, (err, stdout, stderr) => {
      const line = stdout.split("\n").find((l) => l.startsWith("GITPROBE "));
      if (line === undefined) reject(new Error(`gitprobe: ${err?.message ?? ""}\n${stdout.slice(-3000)}\n${stderr.slice(-3000)}`));
      else resolve(JSON.parse(line.slice(9)));
    });
  });
}

/* ------------------------------------------------------------------- main */

if (process.argv[1] === new URL(import.meta.url).pathname) {
const head = makeRepo();
const srv = gitServer();
await new Promise((r) => srv.server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${srv.server.address().port}/repo.git`;
let bad = 0;
try {
  const node = await nodeSide(url);
  const nodeLog = srv.log.splice(0);
  const go = await goSide(url);
  const goLog = srv.log.splice(0);
  const show = (x) => JSON.stringify(x);
  console.log(`remote: ${url}, HEAD ${head}`);
  for (const part of ["refs", "clone"]) {
    const same = show(node[part]) === show(go[part]);
    if (!same) bad += 1;
    console.log(`${same ? "ok  " : "FAIL"} ${part}: Go ${show(go[part]).slice(0, 400)}`);
    if (!same) console.log(`     Node ${show(node[part]).slice(0, 400)}`);
  }
  const conns = (log) => { const ids = [...new Set(log.map((r) => r.conn))]; return log.map((r) => ({conn: ids.indexOf(r.conn) + 1, raw: r.raw.toString("latin1")})); };
  const wire = show(conns(nodeLog)) === show(conns(goLog));
  if (!wire) bad += 1;
  // when Go stops early, whether what it did send is what Node sent first
  const prefix = show(conns(goLog)) === show(conns(nodeLog).slice(0, goLog.length));
  console.log(`${wire ? "ok  " : "FAIL"} wire: ${goLog.length} requests from Go, ${nodeLog.length} from Node${wire ? ", byte for byte the same" : prefix ? `; Go's ${goLog.length} byte for byte Node's first ${goLog.length}` : ""}`);
  for (const [who, log] of [["Node", nodeLog], ["Go", goLog]]) {
    if (!wire || process.argv.includes("-v")) for (const r of conns(log)) console.log(`     ${who} conn ${r.conn}: ${JSON.stringify(r.raw.length > 600 ? `${r.raw.slice(0, 600)}...` : r.raw)}`);
  }
  if (node.clone.Files) console.log(`clone: ${node.clone.Files.length} files at ${node.clone.Commit} (${node.clone.Branch}); HEAD is ${head}`);
} finally {
  srv.server.close();
}
process.exit(bad ? 1 : 0);
}
