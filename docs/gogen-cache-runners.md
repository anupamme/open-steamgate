# Runner object-cache opt-in (step 4b)

`OSD_GOGEN_CACHE=1` enables the per-class frontend cache in `osd run` /
`tools/gogen/osabap.mjs` and the Go ABAP Unit runner. The default remains off.
`1` selects `$OSD_RUN_CACHE/frontend` (or `.local/osd-run/frontend`); any other
nonempty value selects that directory. Unit's whole-frontend snapshot cache is
independent: `--no-cache` bypasses the snapshot and still allows this explicit
object-cache opt-in. The opt-in does not change the kept report binary's key.

Ordinary cacheDir callers retain the globally guarded production lookup.
The runner opt-in also allows replay from the existing v3 dependency namespace,
only after recomputing its complete artifact/query closure and validating the
ordered program-state transcript. Unknown observations, missing providers,
changed named query answers, corrupt entries and nonportable payloads fall back
to lowering. No lexical source-word dependency approximation replaces those
checks. `GOGEN_PROVENANCE=1` additionally exposes provenance reporting.

A runner content certificate selects whether to record dependency metadata.
An unchanged invocation uses the global content guard without repeating the
observer. A changed invocation records again and can consult validated v3
entries. The certificate hashes raw input bytes, logical relative filenames,
layer order and tool content; it contains no filesystem timestamps or build-root
paths. It is a performance hint, never authority to reuse IR. A stale or corrupt
certificate cannot bypass the normal global key or replay validation.

Cache entries and graph/index files publish by unique temporary file plus atomic
rename. Concurrent writers may lose a candidate from the bounded v3 index; this
causes a miss, not partial IR. The report binary retains its separate build lock.
Fresh-process concurrent tests cover both global and dependency modes.

## Diagnosis

The recovered patch's 4,096-operation / 256-KiB recorder budget rejected valid
classes before the disk cache could write them. On the initial 3,010-class
statements selection, the cold-write census exactly accounts for the reported
1,844 misses:

| Refusal | Classes |
| --- | ---: |
| Transcript budget | 1,840 |
| Nonportable replay arguments | 2 |
| Circular input fingerprint | 1 |
| Nested mutation of a borrowed value | 1 |
| Persisted | 1,166 |

A smaller fresh-process reproduction selected four statements classes and two
runtime descriptors. Unchanged warm: four hits, two misses; both misses were the
same transcript-budget refusals. Tool, registry-input, config and DDLS component
hashes were unchanged, and emitted Go hashes matched. Paths, PIDs and timestamps
did not explain those misses. A separate repeated-static-call reproduction
showed the same refusal.

Recording now compacts repeated guards **before** applying bounded limits
(65,536 retained operations, 16 MiB transcript, 1 MiB per fingerprint). Reads
still fingerprint each borrowed value; aliases changed/restored between reads
and nested mutations still refuse reuse. Writes fence guard compaction. Replay
copies top-level collections only when it writes them and validates before
committing effects. Nonportable or oversized inputs still lower normally.

The tool identity now excludes generated `.out`, Go symbol maps and `zz_*`
outputs; rebuilding cannot invalidate it by rewriting build metadata. Folder
DDLS identities use logical filenames instead of absolute input roots. The
runner's generated wrapper already enters the registry with a logical filename.

The current runner closes dependencies in multiple rounds, unlike the old
single-pass measurement. Profiling the pre-fix runner also found repeated class
and method array searches during dynamic-static registration. Those lookups now
use indexes, preserving class/method emission order and first-method precedence.
Static READ-ONLY declaration scans now run only for external writes, the only
case that consumes their result; reads and owner/friend writes avoid that scan.
Emission indexes dynamic adapters and filters by the requested method before
resolving result conversions, rather than rebuilding every adapter per call.

Dependency keys now hash strongly connected components once per immutable
graph, then combine their content certificates. Traversal numbers never enter
the key; sorted symbolic members, artifact digests, query answers and child
certificates do. Mutable graphs supplied by callers are recomputed. The preserved
first-pass graph contains 6,184,673 artifact query rows; an offline probe computed
877 saved entry keys in 43.0 seconds, rather than revisiting the shared closure
for each entry.

The `supplied/selected-contributions` query guards its actual projection:
provider identities and the complete supplied-parameter set rebuilt from parsed
methods. An unrelated implementation-body edit no longer becomes a raw-source
dependency of every consumer of that projection. Other query contracts retain
their artifact/raw-file guards. Frozen provider lists are shared, and only
immutable scalar arrays receive memoized set certificates. Tests cover body
edits, added `IS SUPPLIED`, new implementors, dependency cycles, mutable answers
and the existing mutation oracle.

## Reproduction and evidence

`GOGEN_CACHE_DIAGNOSTICS=<file>` appends opt-in NDJSON with per-class hit/miss,
replay refusal details and cold-write refusals. Version records expose tool,
input, config and DDLS component hashes. A diagnostic-only sidecar carries prior
write refusal reasons into the next process; it never affects cache decisions.
`OSABAP_TIMING=1` prints frontend, emission, Go build and total phase records.
`osd run` also prints execution time. Normal runs print neither diagnostic stream.

The serial proof copies inputs, changes one class literal in the copy, compares
all generated Go/JSON artifact hashes (including symbols), and saves each row
before proceeding. Each large child runs in a 70-GiB / zero-swap systemd scope
with a 24-GiB Node heap. It skips Go compilation by default; `--build` enables it.
Emission includes gofmt. Use an SSD temp directory and a pre-existing Go cache:

```sh
OSD_HEAVY_RANGE=50-59 tools/osd-heavy.sh env \
  TMPDIR=/path/to/ssd/tmp NODE_OPTIONS=--max-old-space-size=24576 \
  OSD_RUN_CACHE=/path/to/ssd/tmp/run GOCACHE=/path/to/go-build \
  node tools/gogen/cache-runner-proof.mjs .local/zlnt-system \
  /path/to/ssd/tmp/evidence /path/to/ssd/tmp/input-copy
```

Both destination directories must be fresh. The input install is read only;
source symlinks are dereferenced while copying. All measured invocations use
different build roots. The report records cache-off cold/warm controls,
cache-on cold/warm, and edited warm/cold controls. Go compilation and execution
are covered separately by the real runner and Unit tests.
