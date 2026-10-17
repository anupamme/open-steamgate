# Runner object-cache opt-in (step 4b)

`OSD_GOGEN_CACHE=1` enables the per-class frontend cache in `osd run` /
`tools/gogen/osabap.mjs` and the Go ABAP Unit runner. The default remains off.
`1` selects `$OSD_RUN_CACHE/frontend` (or `.local/osd-run/frontend`); any other
nonempty value selects that directory. Unit's whole-frontend snapshot cache is
independent: `--no-cache` bypasses the snapshot and still allows this explicit
object-cache opt-in. The opt-in does not change the kept report binary's key.

Ordinary cacheDir callers retain the globally guarded production lookup.
The runner opt-in also allows replay from the existing v3 dependency namespace,
only after validating its complete artifact/query closure, reusing proven
unchanged component certificates where eligible, and validating the ordered
program-state transcript. Unknown observations, missing providers,
changed named query answers, corrupt entries and nonportable payloads fall back
to lowering. No lexical source-word dependency approximation replaces those
checks. `GOGEN_PROVENANCE=1` additionally exposes provenance reporting.

`frontend-provenance-metadata.mjs` no longer emits scheduling rows as dependency
edges. Selection and other program-derived indexes are rebuilt for each program;
their reads during lowering are guarded by the ordered program-state transcript.
Replay therefore rejects a changed index answer that affects a cached class
without making every scheduled object a dependency of that class.

A runner content certificate selects whether to record dependency metadata.
An unchanged invocation uses the global content guard without repeating the
observer. An eligible existing-class edit uses scoped recording and can consult
validated v3 entries; other changes restore full recording. The certificate
hashes raw input bytes, logical relative filenames, layer order and tool content; it contains no filesystem timestamps or build-root
paths. It is a performance hint, never authority to reuse IR. A stale or corrupt
certificate cannot bypass the normal global key or replay validation.
Validated dependency hits are promoted atomically into the current global
generation, so the recording-off warm run following an edit has those entries.

Cache entries and graph/index files publish by unique temporary file plus atomic
rename. Concurrent writers may lose a candidate from the bounded v3 index; this
causes a miss, not partial IR. The report binary retains its separate build lock.
Fresh-process concurrent tests cover both global and dependency modes.

## Existing-class certificate fast path (step 4b.2)

The opt-in dependency cache writes a checksummed `.certificates` index beside
each immutable provenance graph. It contains effective ordered owner/file input
hashes, dependency components and their saved certificates, forward and reverse
artifact edges, interned query specifications and answer certificates, and entry
roots. Candidate keys bind the saved components and replay guards. The compact
index is linked to its exact full graph; a missing, corrupt or incomplete index
uses the existing graph validator.

Fast validation is bounded to edits of existing CLAS owners. Inventory, object
roles, file order, configuration and CDS inputs must match; the tool namespace
must also match. Changed owners invalidate the reverse dependency closure.
Query contracts describe possible answer changes independently of former
provider edges: local discovery, selected supplied contributions and CATCH answers are rebuilt
for every round; named lookups bind unchanged inventory; provider scans have
explicit type or whole-input coverage. Uncovered contracts and newly observed
unknowns invalidate their consumers and use full validation. Additions, removals,
non-class edits and order changes retain the original validation path.

Unchanged complete roots use their saved component certificates without loading
the full graph. Affected components use the original artifact/query validator,
seeded with proven unchanged component certificates. Every reused class still
passes ordered program-state replay. Saved SCC work survives rounds, while
current query answers and current component results reset at each program
boundary. Artifact projection memos survive only within the same explicit
closed-program invocation, with unchanged input/config guards and per-artifact
identity checks. Standalone compiles retain their previous reset behavior.
Observers and lowering transcripts keep their original per-compile lifetimes;
provider observations retained by the registry keep their existing validation
rules. Closure-controller discovery runs under the scheduling role. Private
frozen selections use a membership set without changing their order; mutable
selection callers retain ordinary array membership checks.
Internal caching omits the pure `rtti-owner` reporting projection, which copies
and filters growing RTTI maps for every owner although final-output rows never
enter dependency keys. Actual RTTI construction still runs. Explicit provenance
reports retain the projection. The closure algorithm, emission and whole-file
gofmt also continue to run.

Frontend timing records carry explicit round IDs (1 onward; 0 denotes osabap invocation
phases). Per-round counters cover `graphLoading`, `certificateValidation`,
`observation`, `replay` and `finalization`; emission and gofmt are separate.
Observation counts query/row recording, inventory bookkeeping and inherited
transcript merges. It excludes cheap getter/edge/gap checks and named-query
intern hits, as well as parser/lowerer work inside observed calls. Timing every
hot getter added about 60–70% to an isolated million-read loop, so those hooks
remain outside this subcounter; their work remains in frontend time. These counters can overlap finalization, and are not
additive subdivisions of frontend time. Finalization covers cache graph/key/index
publication; graph loading includes compact-index preflight. Both `OSABAP_TIMING=1` and the opt-in
diagnostic stream expose them. Certificate diagnostics include changed owners,
invalidated nodes/entry variants and query evaluations for each graph and round.
Timing flags are sampled once per round, and redundant edge-index integrity
checks use set membership to avoid quadratic edge scans.

The fresh-process negative control deliberately drops a reverse edge after
integrity validation and requires the cold oracle to detect stale constant
readers in both line modes. A separate negative control requires the inner shadow validator to reject the
same fault. The outer byte-oracle control explicitly leaves that inner checker
off so it can observe stale bytes even under CI. Persisted edge, query-coverage
and owner corruption tests recompute the storage checksum and verify
full-validator fallback.

The final focused matrix passes 259 tests with `--preserve-symlinks
--test-concurrency=1` and CI's `GOGEN_CACHE_SHADOW_VALIDATE=1` (503.2 s), with no
failures or skips. Its CI oracle covers 60 supported mutations in 62 attempts
with zero mismatches (132.2 s). The production dependency-mode oracle with 300 generated
controls and the pinned real libraries passes 66 fresh-process observations:
64 supported mutations, two retained unsupported pool-constant attempts, and
zero mismatches (921.1 s). Both line modes, multi-edits and reverts are included.
The production-mode verification ran against implementation `67d444af`
in a 70 GiB / zero-swap scope with the 24 GiB Node heap.
The matrix includes closure scheduling, guarded round reuse, both reverse-edge
fault detectors, and real runner timing/round checks. The host boundary passes all four
tests; TypeScript and the 153-budget changed-file size gate also pass.

## Scoped recording (step 4b.2b)

The first edited invocation previously left the observer active throughout all
six frontend rounds. Reusing 3,048 classes still paid for provenance checks on
every preparation, syntax and RTTI registry read. The row-recording subcounter
excluded most getter/edge/gap checks, so its small value did not measure this
cost. Unchanged runner invocations already bypassed the observer completely.

The cache now publishes a checksummed `recording.plan` containing the effective
ordered owner/file hashes, config/CDS identity, tool identity, provider rows and
redundant forward/reverse provider edges. This is a recording plan, not authority
to reuse IR. Certificate validation, dependency keys and atomic ordered replay
remain the authorities for hits. A source edit seeds the affected providers;
their reverse closure and any provider with potentially changed or uncovered
query answers must refresh. Unchanged, covered provider observations can be
retained while the observer is idle. Complete ABAP syntax and successful
recorded DDIC construction are required before trusting a provider; stateless
DDIC getters need no fictitious cached `parsedType` field.

The program-level observations that remain necessary are:

| Observation | Recording scope and reason |
| --- | --- |
| Parser/macro expansion, global-definition construction, syntax/type resolution | Affected or uncovered providers and builds they invoke. Lowering may consume definitions, scopes, expanded statements or DDIC types that were built earlier; recording only the lowering lookups cannot recover these dependencies. |
| Supplied-signature preparation | Affected providers' declaration-owner lookups. The complete current supplied index is still rebuilt without observing unrelated providers. Its named contribution answers are recorded when a missing class consumes them, and previous answers are checked by certificate validation. |
| Local-definition discovery | Each selected discovery frame. Its answer depends on selection and test inclusion as well as source bytes, so it must refresh even without an owner edit. Provider syntax observations survive retained closure rounds. |
| Ownership safety | Affected providers' expanded-statement answer. This can change with macros and belongs in their refreshed provider metadata. Unchanged answers are retained under the provider proof. |
| Selection and actual class lowering | Selection records a temporary transcript per candidate, including function-module ownership and static-attribute lookups. Every miss, including conservative replay refusals, adopts that transcript into its complete lowering frame. All nested provider and named-answer reads are observed. Hits discard the temporary transcript, open no lowering frame and merge no old lowering transcript. |

Closure discovery, frontend preparation for other owners, certificate query
evaluation, replay, RTTI and final-output passes run with the observer idle.
Retained provider preparation keeps an idle owner frame; its proven reads
bypass recording. Replay guards and closure discovery are explicitly scheduling.
Unframed artifact queries remain observable while idle: a named or semantic
read adds a global unknown marker, and an unclassified scan retains its own
unknown marker. Both refuse current certificate reuse and make the next plan
full-only. The existing host adapters retain their synchronous invocation lifetime. No compiler-module
initialization hooks or new builtin imports are introduced. Full graph/key/index
publication still runs for newly recorded lowerings and retains validated
provider closure rows. The recording plan is atomically replaced after a
successful compile, preserving new provider edges for later edits and reverts.

Inventory additions/removals, owner roles, file order, non-class edits,
config/CDS/tool changes, missing/corrupt plans and unexplained global artifact
observations restore full recording. A supplied registry that changes its
input scope after its parse boundary gets an explicit unknown marker and
cannot publish a complete dependency entry. Unknown provider observations and
failed/unobserved construction cannot become trusted through a plan.
The published scope must match the recorder's last observed inventory/config;
inputs synthesized after that boundary make the plan full-only. Discarding a
retained build's provider rows leaves an explicit incomplete marker.

The mutation oracle now classifies its emission projections as final output
and its independent borrowed-definition replay control as scheduling. Its
production dependency mode initializes the plan before the supplied registry's
parse and reports `scopedRecording`, so a successful oracle cannot silently
exercise only full recording. The real-library smoke entered scoped mode in
both line modes with byte-identical cold output. Focused tests also cover a
newly introduced provider edge followed by an edit of that provider and a
revert, retained closure-round syntax, stateless DDIC typing, corrupt plans and
both reverse-edge negative controls.

The key computer re-reads the live provenance maps at each closure round, so
replaced maps and new unknown markers cannot be hidden by its invocation
lifetime. Immutable graph indexes remain cached across rounds. A small
eight-owner selection estimate (two simulated misses, 15 paired samples of
100 iterations) captured 16 selection rows, adopted four into the two missing
lowerings, and added about 0.03 ms per eight-owner scan (0.037 vs 0.007 ms).
This measures the selection seam, not whole-corpus build time; no new full
zlnt proof was run for these fixes.

The serial proof accepts `--baseline <source-copy>`. It primes an independent
cache for that copy, then runs baseline warm immediately before candidate warm.
The proof serializes its own large processes; other sessions may still run
concurrently and must be reported with the timings. Its report includes
recording scopes, per-round invalidations, a measured edited-disabled comparison, the 450-second
planning gate and the measured baseline warm comparison. Baseline source copies
can be made with `git archive`; no shared worktree or installed input is edited.

The matched warm comparison on implementation `163c44dd` measured `e718aa49`
at 393.2 s (317.3 s frontend), immediately followed by this branch at 364.5 s
(298.9 s frontend): 7.3% faster in total. The candidate's graph-loading,
certificate-validation and observation counters are all zero in the warm run.
The historical 346.2-versus-390.0 s comparison did not reproduce; the baseline
itself now takes 393.2 s. Those historical absolute times confounded machine/run
variation with code changes, and certificate-index work cannot explain the warm
difference because the warm path does none. This pair does not isolate the
individual causes of historical machine/run variation.

Both warm runs reuse 3,048 of 3,055 classes in the final round. Their Go and
database artifacts are byte-identical across versions. The symbol maps are also
identical except for the build stamp: the Git archive reports `unknown`, while
the checkout reports the implementation commit. All within-version oracle
comparisons retain the stamp and require byte identity for `symbols.json` too.

The unchanged-input scoped rounds refresh 14 provider ledgers: eleven domains
without observed type construction, the round-dependent local discovery owner,
and its two reverse-dependent core providers. The other 3,979 provider ledgers
stay retained. These are conservative metadata refreshes, not fourteen class
cache misses.

### Resumed full-shard measurements (step 4b.2b)

Measured on 2026-10-17 at implementation `163c44dd`, with installed
`zlnt-system` v0.5.2, copied inputs, six closure rounds, a 24 GiB Node heap,
and a separate 70 GiB / zero-swap systemd scope for every large child.
Go compilation was skipped. Each total is the child’s `total` phase.

The six completed pre-reset cases were retained. The interrupted edited
attempt was discarded: it had already replaced the recording plan, published
3,077 cache payloads and changed four dependency candidate indexes. The plan
checksum passed, but the pre-edit state could not be reconstructed reliably.
One fresh cold-enabled recovery rebuilt that state before edited-enabled and
edited-disabled ran back to back in separate processes. The recovery artifacts
match the original cold-enabled artifacts byte for byte. No completed case was
rerun as a replacement measurement.

**Concurrent-load caveat:** These are shared-host timings. The pre-reset cases
have incomplete concurrent-load history; the abandoned partial edit is not a
measurement. Before recovery, uptime was 16 minutes, load was 2.99 / 2.15 / 1.54,
106 GiB memory was available and swap use was zero. Other sessions were running
abapiti step4 frontend/self-host jobs (including Go compilation), and HANA
services were active. Light validation overlapped only recovery and finished
before the edited pair. The resumed timings below also carry a concurrent-load
caveat; the load snapshots are in the local
evidence. The pair is observational and does not isolate the effect of load.

The 30-second load samples during the edited pair show:

| Run | One-minute load range | Minimum available memory (GiB) |
| --- | ---: | ---: |
| edited-enabled | 3.74–10.70 | 91.5 |
| edited-disabled | 4.06–9.06 | 89.6 |

| Run | Cache | Frontend (s) | Emission + gofmt (s) | Total (s) |
| --- | --- | ---: | ---: | ---: |
| Cold | on | 1,227.9 | 63.3 | 1,293.3 |
| Baseline `e718aa49` cold | on | 1,578.6 | 60.6 | 1,641.3 |
| Baseline `e718aa49` warm | on | 317.3 | 72.5 | 393.2 |
| Warm | on | 298.9 | 63.1 | 364.5 |
| Cold | off | 524.6 | 54.7 | 581.4 |
| Warm | off | 507.1 | 57.8 | 567.1 |
| Recovery cold | on | 1,246.1 | 64.0 | 1,313.2 |
| Edited | on | 566.5 | 104.0 | 672.6 |
| Edited | off | 541.6 | 60.8 | 604.6 |

Edited-enabled does not beat edited-disabled: 672.6 s versus 604.6 s (11.3% slower).
The 450 s planning gate is missed. Enabled/disabled emission is 83.836 /
39.488 s; gofmt is 20.205 / 21.318 s. The frontend difference is 24.844 s.
The larger emission difference is measured under the changing load above;
this pair cannot attribute it to a code change.

`edited-enabled` reports `dependencyRecording=true`, 9 lowered and 3,046 reused
in its final round. `edited-disabled` reports `dependencyRecording=false`,
3,055 lowered and 0 reused in its final round.

Edited-enabled per-round `OSABAP_TIMING` counters (seconds):

| Round | Graph loading | Certificate validation | Observation rows | Replay | Finalization | Lowered / reused | Refresh / retained providers |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 25.677 | 20.544 | 0.082 | 5.989 | 49.727 | 13 / 2997 | 17 / 3962 |
| 2 | 7.218 | 20.948 | 0.088 | 1.891 | 15.839 | 12 / 3009 | 14 / 3979 |
| 3 | 8.880 | 0.775 | 0.079 | 2.125 | 1.380 | 25 / 3012 | 14 / 3979 |
| 4 | 6.794 | 0.177 | 0.063 | 1.937 | 1.342 | 21 / 3030 | 14 / 3979 |
| 5 | 7.280 | 0.115 | 0.062 | 1.827 | 1.451 | 10 / 3044 | 14 / 3979 |
| 6 | 8.037 | 0.046 | 0.064 | 2.162 | 1.204 | 9 / 3046 | 14 / 3979 |

These counters overlap and do not partition frontend time. Edited-disabled
has zero for all five counters in every round. Dependency recording remains
enabled throughout the edited-enabled invocation; scoped idle regions account
for its reduced observation work, rather than disabling dependency validation.

The source edit is `CLAS ZCL_LNT_ADD_MODULE`, changing the existing test literal
from `add 2` to `add 3`. Round 1 refreshes that provider and its affected
`ZCL_LNT_P_STATEMENTS_DEL` / `ZCL_LNT_P_STATEMENTS_FAC` providers, together with
the conservative refresh set. Later rounds refresh fourteen providers: eleven
domains without observed type construction, the local discovery owner
`CL_ABAP_UNIT_ASSERT`, and `CL_ABAP_TESTDOUBLE` / `CL_AUNIT_AUTHORITY_CHECK`.
Other proven provider rows remain retained. Parser/macro, syntax/type, supplied
declaration, local-discovery and ownership observations remain recorded in
affected/selected frames; every actual lowering miss records a complete frame.
Hits still pass ordered replay and do not import old lowering transcripts.

This resumed edit follows one cold prime, without an extra unchanged warm
pass. Across all closure rounds it lowers 47 distinct classes; three lowering
decisions explicitly cite the edited owner as their dependency invalidation.
Other misses cite absent candidates, replay refusals or supplied-query changes.
They remain fully recorded and are not all source dependency invalidations.

Edited warm and edited cache-disabled cold are byte-identical for all four
artifacts: `zz_app.go`, `zz_generated.go`, `zz_db.json`, and `symbols.json`.
Only `zz_generated.go` differs from the unedited output.

| Artifact | Edited SHA-256 (both runs) |
| --- | --- |
| `symbols.json` | `123e899453e3d8cd2984fe8104150ce8ddf8dabe0a4b11f484e833e59cfc2fd8` |
| `zz_app.go` | `0f9c674325764e70e1ab344d955df38c6cfa09223864655c95d853af72d5b74c` |
| `zz_db.json` | `96f34c8d2780b008a708b9f1de6e7c5edaed9fe7aed5a15b04768b252b2d37f8` |
| `zz_generated.go` | `5d035242edf8115d0b53b3e6de9efadd7fcf587d31e340ae9bc2d9b7d6576425` |

Edited manifest SHA-256: `ee31d4a1e69d630f148899245afb252b063e4f62be17a78359833532136454a5`.

Light validation on this implementation passed 266 focused cache/runner tests
(no failures or skips), all four host-I/O tests, TypeScript, and all 153
changed-file size budgets. The explicit changed-path leak scan also passed.

Machine-local evidence: `/mnt/ssd-510/osg/stoker/tmp/c4b2b-scoped-proof/report.json`,
per-case logs/diagnostics/build roots beside it, and
`/mnt/ssd-510/osg/stoker/tmp/c4b2b-resume-load.ndjson`. Interrupted evidence has
`.interrupted` suffixes; the six-case report is `report.before-resume.json`.

### Full-shard proof for step 4b.2 (historical)

Measured on 2026-10-17 from the implementation based on `e718aa49`, with
installed `zlnt-system` v0.5.2 and tool identity `b723301a419c`. All six cases
used fresh processes and distinct build roots. The proof copied the inputs,
kept the six closure rounds, capped every large child at 70 GiB with zero swap
and a 24 GiB Node heap, and skipped Go compilation. Cold production overlapped
small regression tests; warm, edited and disabled controls ran after those tests
finished. The installed input was unchanged.

| Run | Cache | Frontend (s) | Emission (s) | gofmt (s) | Total (s) |
| --- | --- | ---: | ---: | ---: | ---: |
| Cold | off | 537.8 | 38.0 | 21.2 | 599.3 |
| Cold | on | 1,487.9 | 42.4 | 19.0 | 1,551.5 |
| Warm | off | 522.7 | 38.7 | 19.9 | 583.7 |
| Warm | on | 318.2 | 48.7 | 20.7 | 390.0 |
| Edited | off | 524.2 | 39.0 | 19.5 | 585.2 |
| Edited | on | 797.8 | 42.7 | 20.0 | 862.7 |

Totals are the child’s `total` phase; the proof also records wall time. Go build
is 0 (skipped) in every case.

| Enabled run | Graph loading (s) | Certificate validation (s) | Observation rows (s) | Replay (s) | Finalization (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold | 37.7 | 3.0 | 11.7 | 11.2 | 126.0 |
| Warm | 0.0 | 0.0 | 0.0 | 12.1 | 0.0 |
| Edited | 23.4 | 24.6 | 11.5 | 17.1 | 41.6 |

These are the defined subcounters above, aggregated over rounds 1–6. They
can overlap and do not partition frontend time.

The edit changes one existing owner, `CLAS ZCL_LNT_ADD_MODULE`. In the main
6,429-node saved graph, its reverse closure invalidates 6 nodes and
3 entry roots; the first round evaluates 73,624 round-sensitive queries.

| Saved graph | Rounds checked | Nodes | Invalidated nodes | Invalidated entry roots | Queries evaluated |
| --- | --- | ---: | ---: | ---: | ---: |
| `0df3e54490ed` | 1 | 6429 | 6 | 3 | 73624 |
| `9050128e09c5` | 1, 2 | 2747 | 0–13 | 0–13 | 436 |
| `96203a126505` | 1, 2, 3 | 378 | 0–20 | 0–20 | 387 |
| `71163e8db675` | 2, 3, 4 | 290 | 0–18 | 0–18 | 303 |
| `2b9117aeca15` | 2, 3, 4, 5 | 275 | 0–3 | 0–3 | 98 |
| `ff3ee99ea720` | 5, 6 | 21 | 0–1 | 0–1 | 1 |

Smaller saved graphs also reject query answers from a different closure-round
selection. Their context invalidations are not additional source edits.

The dependency-invalidated classes lowered are `ZCL_LNT_ADD_MODULE`, `ZCL_LNT_P_STATEMENTS_DEL`, `ZCL_LNT_P_STATEMENTS_FAC`.

Additional lowering beyond unchanged refusal cases: `CL_ABAP_UNIT_ASSERT` (ordered replay/candidate refusal).

Unchanged warm lowers 9 distinct classes and reuses
3,048/3,055 classes in the final round. Every reused class still
passes ordered replay.

All four artifacts—`zz_app.go`, `zz_generated.go`, `zz_db.json` and
`symbols.json`—are byte-identical for cold on/off, unchanged warm on/off,
and fresh-process edited warm versus edited cache-disabled cold. The edit
changes `zz_generated.go` only. Baseline manifest SHA-256: `e480151e44fe7e62c99c14bfe4a0be8f1e8538a829b950972201ff5406bde300`;
edited manifest: `2f86760fe30835c4a725952db0b233b503c6e0f3b1d893b8aeb25a435c083db8`.

**Performance gates: edited missed; unchanged warm
missed.** Edited takes 862.7 s against the
561.9 s target and 585.2 s for this run's cache-disabled edited control.
Unchanged warm takes 390.0 s against the 346.0 s ceiling.

The edited result is faster than the historical 965.1 s
cache-enabled result, and misses the 280–400 s planning range.

Certificate reuse passes the correctness checks, but the end-to-end
performance objective remains open. Remaining work is to profile and reduce
repeated artifact/query observation and parsed-program rebuilding, and avoid
redundant provenance serialization during promotion/publication. A certified
previous selection and emission caching remain separate planned steps; neither
is implemented here. Warm runs have dependency recording off, so their remaining
fixed parsing/signature/RTTI/selection and emission/gofmt costs also need work.
Ordered replay and unknown/nonportable/audit refusal paths must remain intact.

Machine-local evidence: `/mnt/ssd-510/osg/stoker/tmp/c4b2b-cert-proof-release/report.json`,
with per-case logs, round diagnostics and generated artifacts beside it. The
edited copy is `/mnt/ssd-510/osg/stoker/tmp/c4b2b-cert-input-release`.

Step 4b.2 changes these files (unqualified names below share `tools/gogen/`):

| Area | Files |
| --- | --- |
| Compact proofs and validation | `frontend-certificates.mjs` (new), `frontend-v3-key.mjs`, `frontend-v3-shadow.mjs` |
| Round lifetimes and replay integration | `frontend-closure.mjs`, `frontend-provenance.mjs`, `frontend-provenance-recorder.mjs`, `frontend-queries.mjs`, `frontend-artifact-digests.mjs`, `frontend-object-cache.mjs`, `frontend-session-types.ts`, `frontend.mjs` |
| Timing and runner proof | `frontend-timing.mjs` (new), `frontend-cache-diagnostics.mjs`, `osabap.mjs`, `cache-runner-proof.mjs` |
| Tests and CI | `frontend-certificates.test.mjs` (new), `frontend-artifact-digests.test.mjs`, `osabap.test.mjs`, `cache-oracle-capture.mjs`, `.github/workflows/gogen.yml` |
| Documentation | `docs/gogen-cache-runners.md` |

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

## Full-shard measurements (step 4b, historical)

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

The same proof was repeated on the final branch (after the review fixes:
shared typed guard keys, typed guard values, fail-closed unowned artifact reads,
tracked-and-untracked tool identity), rebased on `46fd4738`:

| Run | Frontend (s) | Emit/gofmt (s) | Go build (s) | Total (s) |
| --- | ---: | ---: | ---: | ---: |
| Cold, cache disabled | 497.4 | 56.8 | 0 (skipped) | 556.3 |
| Cold, cache enabled | 1,506.7 | 57.5 | 0 (skipped) | 1,566.3 |
| Unchanged warm, cache disabled | 484.4 | 54.4 | 0 (skipped) | 541.1 |
| Unchanged warm, cache enabled | 279.7 | 64.5 | 0 (skipped) | 346.2 |
| Edited cold, cache disabled | 501.7 | 58.4 | 0 (skipped) | 562.3 |
| Edited warm, cache enabled | 900.8 | 62.0 | 0 (skipped) | 965.1 |

Unchanged warm reused 3,048 of 3,055 classes in the final round; all four
artifact comparisons were byte-identical, and no `unowned-artifact-read`
refusal occurred in any run. Typed guard values cost about 60 s of the warm
run against the earlier measurement. The edited run is still slower than the
cache-off control; making it faster is the next step (certificate fast path,
then a certified previous selection, then emission caching).

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

## Changed files (step 4b, historical)

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

## Validation (step 4b, historical)

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

## Final proof at 3619f752 (2026-10-17, rebased on 1bb46530)

This is a fresh six-case proof on the final branch, with the review fixes
included: selection rows recorded for scoped misses, idle global artifact rows
failing closed, and the provenance graph re-read in every round. The setup is
the same as the earlier runs: Go build skipped, every large child in a 70 GiB
scope.

| Run | Cache | Total (s) | Lowered / reused |
| --- | --- | ---: | ---: |
| Cold | off | 544.6 | 3,055 / 0 |
| Cold | on | 1,310.6 | 9 / 3,046 |
| Unchanged warm | off | 552.2 | 3,055 / 0 |
| Unchanged warm | on | 339.6 | 7 / 3,048 |
| Edited | off | 519.7 | 3,055 / 0 |
| Edited | on | 692.8 | 7 / 3,048 |

- **Byte-identity.** All four comparisons were byte-identical: unchanged warm
  against recorded, cold on against off, disabled control against cold, and
  edited warm against edited cold.
- **Edited run.** It is now 692.8 s, down from 965.1 s on step 4b (#800). It is
  still slower than the cache-off edited run. Most of the remaining cost repeats
  in each of the runner's six closure rounds, which is what step 4b.3
  (collapsing the rounds by certified previous selection) targets.

## Certified runner selections (step 4b.3)

The report runner's existing `OSD_GOGEN_CACHE` opt-in now also permits selection
seeding. Default-off invocations retain discovery from the original roots.
`compileClosedProgram` receives a host adapter; it imports no new builtins and
performs no module-initialization I/O. The adapter lives outside the compiler
import closure, alongside the existing runner recording certificate.

The atomically published, checksummed `runner-selection.json` binds the original
ordered roots, ordered layer-relative input names and raw content hashes, tool
identity, runner syntax/skip policy, tolerant mode and test inclusion. Its round
ledger records the input and expanded selections, lowering-time missing names,
owner/superclass edges and additions. The reader checks the derivation from the
original roots to the final selection, including a terminating closed round.
Missing, malformed or inconsistent metadata starts discovery from roots.
Supplied registries and sessions are conservatively ineligible.

Unchanged inputs certify the previous selection directly. Across edits, this
first implementation uses a deliberately narrow AST proof: only the plain,
noninterpolated template in a method-local
`DATA(name) = CONV string( |literal| ).` initializer may change. The parser must
recognize the complete statement and method context; macros, INCLUDEs, unknown
statements, interpolation, escape sequences and multiline literals do not
qualify. Raw text outside qualifying template values remains bound byte for
byte. The initializer's string type, declaration, references and all other
statements therefore remain unchanged. Discovery does not propagate this local
runtime value into class selection, supplied signatures or CATCH membership.
This covers the proof's existing literal edit without claiming support for
arbitrary method-body edits. Dependency, superclass, declaration, macro,
inventory and other unsupported changes restart from roots, allowing obsolete
classes to disappear. Object-cache certificates and replay still independently
validate every IR hit.

A certified invocation compiles the saved final selection once, then runs the
existing missing-class/superclass check and continues rounds if necessary.
Explicit roots retain strict syntax diagnostics; discovered dependencies remain
tolerant. Timing reports identify the actual number of executed rounds and
whether certification used exact input identity, local string initializers, or
discovery from roots. The proof still saves each completed case immediately.

The fresh-process selection oracle disables both object caching and selection
seeding on its reference side. It covers additions/removals, superclass changes,
macro-hidden references, supplied redefinitions, CATCH descendants, broken
discovered dependencies and repeated edits/reverts in both line modes. A
negative control deliberately compiles a stale closed superset and requires
its bytes to differ from discovery from roots.

Pre-proof validation passed 264 focused cache, certificate, replay, provenance,
closure and osabap tests (598.0 s), plus 20 fresh-process selection tests
(77.5 s), with no failures or skips. The CI oracle inside that matrix exercised
60 supported mutations in 62 attempts with zero mismatches (125.0 s). Both
reverse-edge negative controls passed. Node suites used `--preserve-symlinks
--test-concurrency=1`; the four host-boundary checks, TypeScript, the 153-budget
size gate and the explicit ten-path leak-scan exit-code gate also passed.
`frontend.mjs` is net zero lines and one byte smaller than `origin/main`
`c9dad34f`.
