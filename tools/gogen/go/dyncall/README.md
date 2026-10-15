# Dynamic static method registry

`Registry[S, D]` stores compiled/known class names and method adapters without
importing the ABAP host. `Known` and `Register` install the generated inventory;
`Call` validates names and the RECEIVING signature before invoking the adapter.

The host supplies exception and refusal callbacks, which must not return.
Compatibility keys come from the normal declared-type assignment converter.
The registry never constructs exception objects or invents missing classes.
