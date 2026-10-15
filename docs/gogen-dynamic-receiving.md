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

Every dynamic-call exception requires its class in the compiled closure;
otherwise dispatch refuses with NOT_COMPILED naming the class. The pinned
open-abap-core lacks CX_SY_DYN_CALL_PARAM_MISSING. The semantics and host tests
supply an explicitly test-only class; production dispatch supplies none.
