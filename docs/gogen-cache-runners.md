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
Validated dependency hits are promoted atomically into the current global
generation, so the recording-off warm run following an edit has those entries.

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
pre-CATCH-projection graph contains 6,184,673 artifact query rows; an offline probe computed
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

The real runner's six closure rounds exposed another overbroad guard. An
intermediate unchanged warm run still missed 57 initial classes: 42 CATCH-answer
variant evictions, seven `wanted`/signature/structure-prefix guard changes, and
the eight recording refusals. The CATCH caller consumes only whether a selected
matching subclass exists. Recording the full matching list retained unnecessary
contexts and thrashed the four-candidate index. It now records that boolean,
computed from a prebuilt current hierarchy index. Unknown hierarchy observations
still refuse dependency reuse. Tests exercise true/false transitions through
unnamed descendants, while additions leaving the predicate true keep reusing.
The twenty-member ancestry limit, cycles, local names and runtime fallback
parents retain their existing behavior.

Global entries are named by the logical program selection (sorted names); a
bounded atomic index permits cross-context fallback. This preserves differences in
ordered effects, such as which earlier class registered a shared structure.
Full replay guards still validate each variant. Dependency trials let ordered
replay fork the collections it writes, without first copying every growing map.
Dependency keys bind the class's artifact/query closure and actual program
observations.

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

## Full-shard measurements

Measured on 2026-10-17 with installed `zlnt-system` v0.5.2, implementation
`8dc0b019`, copied inputs, separate build roots, and Go compilation disabled.
The runner grows its class selection through six rounds: 3,010, 3,021, 3,037,
3,051, 3,054 and 3,055 classes. Phase times below cover the complete invocation,
not just its final round. The old 203.5-second frontend measurement used the
earlier single-pass runner and is not a control for these measurements.

| Run | Frontend (s) | Emit/gofmt (s) | Go build (s) | Total (s) |
| --- | ---: | ---: | ---: | ---: |
| Cold, cache disabled | 510.2 | 56.4 | 0 (skipped) | 568.7 |
| Cold, cache enabled | 1,246.5 | 59.9 | 0 (skipped) | 1,308.5 |
| Unchanged warm, cache disabled | 519.5 | 61.1 | 0 (skipped) | 582.9 |
| Unchanged warm, cache enabled | 218.5 | 63.2 | 0 (skipped) | 283.8 |
| Edited cold, cache disabled | 503.4 | 56.3 | 0 (skipped) | 561.9 |
| Edited warm, cache enabled | 834.6 | 63.2 | 0 (skipped) | 900.1 |

The unchanged warm invocation re-lowered eight distinct classes out of 3,055:
**99.74% reuse** across the complete invocation. Every round exceeded 99%; the
lowest was the initial round, 3,002/3,010 (99.73%). Its final round reused
3,049/3,055 (99.80%). The eight initial misses were three borrowed-value mutation
refusals, two nonportable replay arguments, one circular fingerprint, and two
transcript-budget refusals. There were no misses of stored entries from key or
replay instability.

Warm-enabled total is 0.487 times warm-disabled total, meeting the 1.10-times
limit. Its frontend phase is 58% shorter. Cold recording is expensive: its
frontend takes 1,246.5 seconds versus 510.2 seconds without the cache.

Warm diagnostic timestamps place the first class lookup at 91.1 seconds, with
about 82 seconds between closure rounds. Class processing windows total about
37 seconds, including conservative re-lowering. Emission takes another 63.2
seconds. Class-IR replay alone cannot remove registry parsing, syntax/selection
work between rounds, or emission.

The edited invocation reaches content/cache setup at 76.7 seconds, the saved
dependency-component index at 143.0 seconds, and its first class decision at
189.8 seconds (process-elapsed diagnostic times). It must observe and revalidate
dependencies after an input edit. This already exceeds the 100-second edited
total target before the first decision or emission; that target is not met.

Edited total is 900.1 seconds, including 834.6 seconds frontend and 63.2 seconds
emission. Diagnostic class-processing windows, including dependency probes,
replay and conservative lowering, total about 212 seconds. Gaps between closure
rounds total about 378 seconds, and roughly
55 seconds remain after the final class decision. This observation/validation
path is more expensive than simply lowering with caching disabled; high IR
reuse does not yet make the first edited invocation faster. Its 900.1-second
total compares with 561.9 seconds for edited-cold with caching disabled.

Across all six edited rounds, the only newly lowered classes beyond the eight
unchanged refusal cases are `ZCL_LNT_ADD_MODULE`, `ZCL_LNT_P_STATEMENTS_DEL` and
`ZCL_LNT_P_STATEMENTS_FAC`. Every one reports
`dependency:CLAS ZCL_LNT_ADD_MODULE`, matching the saved graph's reverse closure.

The unchanged warm and cold-enabled outputs are byte-identical to cold-disabled
output for `zz_app.go`, `zz_generated.go`, `zz_db.json` and `symbols.json`. Their combined
manifest SHA-256 is
`f5beb3b9bf37a16a8eeb582c2eeb723de508599e0d4052266724701d39aab863`.
The disabled warm control has the same manifest. Edited-warm and edited-cold
are also byte-identical; their manifest is
`7b4f5eb91ecc371caf45bb0421e78a68810fe4cf6fd5a8f861476edbe98a01d3`.
The literal edit changes only `zz_generated.go`, and the proof asserts that
edited output differs from the unchanged baseline.

Machine-local evidence is retained at
`/mnt/ssd-510/osg/stoker/tmp/c4b2-run/result/report.json`, with per-case logs,
NDJSON diagnostics and generated artifacts beside it. The edited input copy is
`/mnt/ssd-510/osg/stoker/tmp/c4b2-in/result`; the installed input was never edited.

## Changed files

The implementation is based on `7503cdee`; it does not require the subsequent
parse-observation work on main.

| Area | Files |
| --- | --- |
| Runner opt-in and timing | `tools/osd-run.mjs`, `tools/gogen/osabap.mjs`, `unit.mjs`, `runner-cache.mjs`, `runner-cache-recording.mjs` |
| Cache and replay | `tools/gogen/frontend.mjs`, `frontend-inventory.mjs`, `frontend-object-cache.mjs`, `frontend-replay.mjs`, `frontend-cache-diagnostics.mjs`, `frontend-cache-variants.mjs`, `frontend-cache-types.ts`, `frontend-session-types.ts`, `frontend-types.ts` |
| Dependency certificates | `tools/gogen/frontend-components.mjs`, `frontend-query-contract.mjs`, `frontend-queries.mjs`, `frontend-hierarchy.mjs`, `frontend-provenance.mjs`, `frontend-provenance-recorder.mjs`, `frontend-provenance-metadata.mjs`, `frontend-v3-key.mjs`, `frontend-v3-queries.mjs`, `frontend-v3-shadow.mjs` |
| Hot paths | `tools/gogen/frontend-dynamic-call.mjs`, `frontend-static.mjs`, `emit-dynamic-call.mjs` |
| Tests and proof | `tools/gogen/runner-cache.test.mjs`, `frontend-object-cache.test.mjs`, `frontend-replay.test.mjs`, `frontend-v3-shadow.test.mjs`, `osabap.test.mjs`, `cache-runner-proof.mjs` |
| Documentation and CI | `docs/gogen-cache-runners.md`, `docs/gogen-cache.md`, `.github/workflows/gogen.yml` |

Filenames without a directory in this table share the preceding `tools/gogen/`
prefix. `frontend.mjs` stays below the task base's line count.

## Validation

The final implementation passed 111 focused cache/query/replay/runner tests and
82 oracle/exception/provenance/portable/binary tests. The CI mutation oracle ran
60 mutations, including multi-edits and reverts, with zero mismatches. Tests ran
with `--preserve-symlinks --test-concurrency=1`; concurrent fresh compilers shared
a cache in both global and dependency modes, including a CATCH variant index.
The binary suite also exercised simultaneous real `osd run` builds.

`tsc -p tsconfig.gogen.json`, `osd-size-budget --changed origin/main`, and the
changed-path `osd-leak-scan --paths` exit-code gate passed. The size gate checked
153 budgets; the leak gate found zero matches across 36 changed paths.
`frontend.mjs` is net -13 lines against `origin/main` (`b9e20a38`) at the final
gate. Go compilation was skipped in the large phase matrix; the small binary
tests compiled and executed reports.
