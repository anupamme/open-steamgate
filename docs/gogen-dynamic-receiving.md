# Dynamic static CALL METHOD with RECEIVING

Both Go and IR-JS support a dynamic class name and a literal method name,
including the parenthesized literal chai shape:

```abap
CALL METHOD ('ZCL_LNT_P_BASE_CHAI')=>('C_68')
  EXPORTING p0 = p0 RECEIVING result = result.
```

Dispatch resolves the method, checks the RECEIVING name against its RETURNING
parameter, and moves the result through the ordinary frontend assignment
converter using the declared return and target types. IMPORTING, CHANGING and
EXCEPTIONS remain refused. Section detection uses direct MethodParameters
token children.

The Node transpiler/runtime measurements are executable in
`tools/gogen/dynamic-call-oracle.mjs`, called by the semantics runner. The happy
path and unknown class/method rows compare against Node directly. The remaining
rows deliberately follow the requested dynamic-call exception policy:

| Case | Node measurement | Go and IR-JS |
| --- | --- | --- |
| Unknown class | CX_SY_DYN_CALL_ILLEGAL_CLASS | Same, caught by CX_ROOT |
| Lowercase literal method name (`val`) | `42` | `42` |
| Unknown method | CX_SY_DYN_CALL_ILLEGAL_METHOD | Same, caught by CX_ROOT |
| Wrong RECEIVING name | Silent success | CX_SY_DYN_CALL_PARAM_NOT_FOUND |
| No RETURNING parameter | JavaScript TypeError | CX_SY_DYN_CALL_PARAM_NOT_FOUND |
| Unknown EXPORTING name | Silent success | CX_SY_DYN_CALL_PARAM_NOT_FOUND |
| Required argument absent | JavaScript TypeError | CX_SY_DYN_CALL_PARAM_MISSING |
| String result into object reference | Silent success | CX_SY_DYN_CALL_ILLEGAL_TYPE |

The divergent rows assert the precise exception and CX_ROOT catchability on
both hosts. SAP behaviour is unmeasured; measure on A4H. No SAP system was
contacted. The reference is the [ABAP keyword documentation for CALL METHOD](https://help.sap.com/docs/abap-cloud/abap-keywords/call-method)
and its catchable exceptions; this implements the user's documented
policy, not an SAP measurement.

Lowering selects each available dynamic-call exception and its superclass
chain into the compiled closure. A genuinely absent exception still refuses
with NOT_COMPILED naming the class. The pinned
open-abap-core lacks CX_SY_DYN_CALL_PARAM_MISSING. The semantics and host tests
supply an explicitly test-only class; production dispatch supplies none.

Round 2 regressions run through the repository's Node transpiler/runtime,
semantics on both emitters, and the osgo/IR-JS unit hosts:

| Regression | Node, Go and IR-JS result |
| --- | --- |
| Unknown class caught only through CX_ROOT | `caught` |
| Inherited static method | `42` |
| Alias of a static interface method | `42` |
| RECEIVING into a typed scalar table-row field symbol | Stored row becomes `42` |
| RECEIVING into a structured table-row field symbol | Stored component becomes `42` |
| RECEIVING into TYPE any bound to a variable | Original variable becomes `42` |
| Qualified DEFAULT constant | `7` |
| By-reference structured DEFAULT | `9` |

A lowering-time dispatch table maps the called class/method key to its resolved
implementation. Adapter registration and result conversion consume that same
table, including inherited methods and aliases. Defaults register constants
before emission. RECEIVING uses ordinary assignment or generic-data MOVE,
with an internal result expression that cannot shadow an ABAP target variable.
The host regression without the test-only PARAM_MISSING class checks that its
NOT_COMPILED refusal bypasses CX_ROOT on both emitters.

Checked against the original branch commit `bbf78d3c` in an isolated worktree:
the closure row refused with NOT_COMPILED; inherited and alias calls could not
find their adapters; scalar field symbols produced invalid JavaScript assignment;
structured targets left the row at zero; generic targets returned zero on Go and
produced a JavaScript syntax error. DEFAULT probes failed with undeclared
constants, and Go also rejected the structured value assigned to a pointer.
Each new row failed on at least one original backend. Node agreed with all eight
expected results. The semantics harness now lowers JS independently so Go cannot
populate its constants before JS emission. A frontend test also checks both
emitter orders and rejects constant selection during emission.


Round 3 rebases onto main's DDLS cache-key fix (#777). The native report
builder now uses `frontend-closure.mjs`, shared with semantics: it consumes
`program.missing` and superclass dependencies until selection stops growing.
Previously only the semantics and unit hosts consumed those dependencies;
`osabap` compiled its source-derived object list once. A dynamic call discovered
in a subsequently selected class could therefore name an available exception
that the native binary never compiled. The regression starts with only an
entry class and checks the callee and every available dynamic-call exception
are actually compiled. Explicit inputs retain strict syntax checking. Newly
discovered unsupported library definitions retain their diagnostics and runtime
refusals; a separate attempted set prevents endless retries of a broken
dependency. Absent exception definitions still refuse at dispatch.

Parenthesized literal method names are normalized to uppercase, matching the
measured Node `val` row (`42`); SAP is unmeasured. Dynamic public signatures
exclude hidden `suppliedOf` parameters on both emitters: `EXPORTING sup_p = 123`
raises `CX_SY_DYN_CALL_PARAM_NOT_FOUND`, while ordinary optional arguments still
set their hidden flags. IS SUPPLIED discovery and lowering read Compare nodes
and direct tokens through a finite-state matcher, so `'p IS SUPPLIED'` inside a
string comparison creates no hidden parameter and compiles normally.

Round 3 validation: full semantics (229 rows on each emitter), dynamic-call
and frontend tests, raw-DDLS cache tests with symlink preservation and serial
tests, Go runtime tests, both unit-host suites, native optional-logger smoke,
TypeScript, size budget and host-I/O guard pass. The single E.10 attempt failed
during dependency syntax checking before the final dependency-policy correction
was loaded; it created no database and did not establish rows greater than zero.
The corrected policy passed the native smoke and full semantics afterwards.
The real-system attempt was not repeated because the request allowed one run.
