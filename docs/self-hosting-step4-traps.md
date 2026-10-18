# Self-hosting step 4: remaining lowering traps

Snapshot: 2026-10-18. This report describes the compiler failures still seen
when abapiti compiles gogen's `compileProgram` and `emitGo` for
`ZCL_GOGEN_T_RUNTIME`. A trap means that the TypeScript-to-Go compiler could
not lower a reached function body. It does **not** mean the generated Go has
failed a test: compilation has not yet reached that stage.

## Measurement and scope

The measured pair is OSG `ca0f308c9bbf8d62b7a83b5cb4f3fa6fa4a37ce3`
(a **private, unmerged** G candidate based on main
`602822731dda56d5b44ce3ec5e5282e7bbdda7c8`) and abapiti core2 source
`44546af481277e414b01a13bf9a3e12280145fd3`. The typed step-4 driver
has SHA-256 `c95ac603d410ad9ce284de04ef2c94cc6dd53d464cf85661622a85e8b12c924e`.
The Node-gogen reference Go has SHA-256
`b90648781967b2cf3eaa4787f6dc9d41618682c26d18092e7608db18cfff5261`;
the trap run checked that reference hash. These identifiers pin the **inputs
to the diagnostic**, not a completed self-hosting result.

The reached-function scan reports **8 root trap locations, 2,648 hits**,
`0/35 unknown`, and **321 unreached functions**. A hit is
one occurrence attributed to a trapped root in the lowering/reachability
report; it is not an independent defect or a count of failed unit tests. The
unreached functions have not been proved compilable. Locations below refer to
the measured OSG commit; line numbers can move on later branches.

## What is left

| Area | Root function and hits | First reported failure | Nature and next investigation |
| --- | --- | --- | --- |
| Front end | `frontend.mjs:65` `compileProgram` · 1 | HIR assignment type mismatch | An assignment in the entry-point closure fails typed lowering. Inspect the inferred source and target types at the recorded node before changing the initialization path. |
| Front end | `frontend.mjs:874` `classIr` · 41 | `IMethodDefinition` interface passed where a concrete structural class shape is expected by `fn_addSig` | Method-definition typing crosses an abaplint interface/shape boundary. A broader union exposed another failure in `fn_addSig`; this needs a compatible contract or a compiler fix, not only a wider annotation. |
| Front end | `frontend.mjs:1740` `statement` · 839 | Recursive union literal has no admitted tag or compatible payload | IR statement construction, first reported at the `REFRESH`/`FREE` mapped `clear`/`clear_data` literals, is rejected as a recursive discriminated union. Check the produced tag and payload against the IR type, then the compiler's recursive-union admission. |
| Front end | `frontend.mjs:5085` `call` · 117 | Structural node shape passed as `ExpressionNode` | The hand-built chain prefix satisfies the JavaScript use site but is not accepted as abaplint's concrete `ExpressionNode`. Check whether the helper can consume an explicit smaller interface. |
| Front end | `frontend.mjs:3515` `constructor_function` · 20 | Boxed `Map` allocation needs value-based `SameValueZero` | A compiler capability gap in JavaScript `Map` semantics, reached by constructor argument handling. A source change is safe only if key identity and lookup behavior remain identical. |
| Emitter | `emit-go.mjs:319` `emitGo` · 1 | Dynamic collection key | A collection in emitter setup has a key type the Go prototype cannot lower. Narrowing one collection has previously exposed another at the next line, so inspect the whole setup path. |
| Emitter | `emit-go.mjs:953` `method` · 209 | `Method` passed to `sinkLocals`, which expects `SinkMethod` | Two emitter method contracts disagree at a helper boundary. Compare the actual fields used by `sinkLocals` with both declared shapes. |
| Emitter | `emit-go.mjs:1111` `place` · 1,420 | Union field incompatible in some alternatives | Reference-attribute and place handling reads a field across a union whose alternatives do not all carry the same type. A local cast moved the failure but did not remove the trap. |

The remaining high-hit emitter root `place` accounts for 1,420 of
2,648 hits. That makes it a useful integration target, but hit count is not
an effort estimate: a one-hit root can still block `compileProgram` or
`emitGo` as an entry point. Several failures are source contract mismatches;
the boxed `Map`, dynamic key and recursive-union errors may require abapiti
lowering support. That division is a diagnostic hypothesis until a candidate
removes the exact root without introducing another one.

On the same abapiti binary and typed driver, private G candidate
`9299a46fea7274ad9a49662e23e64b8bca2042cf` had **11 roots / 5,214
hits**; `fc8b0702fc5608d1016289335df7579bfb79361e` cleared the 822-hit
`stmtLines` root for **10 / 4,392**; `2461ab76d2ec4419baa8391fb32df12f03a68ff3`
cleared the four-hit `whereOf` root for **9 / 4,388**; and the measured
candidate cleared the 1,740-hit `expr` root for **8 / 2,648**. No step added a
new root. Each candidate type-checks, passes its changed-path tests, and
produces 243 byte-identical artifacts in each of six sink/cache comparison
modes against its respective parent. These G changes are still **private
and unmerged**, pending review and PR checks; the table reports their measured
state rather than the state of main.

## Completion gate

For each candidate, compare the reached trap locations and hit counts on the
same pinned inputs, type-check gogen, run the tests for the changed path, and
compare Node output across the sink/cache modes. Moving the first reported
error inside a function is useful diagnostic progress, but does not clear its
root. The private G candidates need review before integration into main.

Step 4 remains open until a **named OSG main commit** and a **named abapiti
selfhost commit** produce byte-equal Go for the target test, that Go builds
and passes the same unit test, and independent M1, M2 and 11,060-case corpus
checks show no regression. None of those final claims follows from this trap
snapshot.
