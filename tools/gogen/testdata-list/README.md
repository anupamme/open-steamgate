These are direct-Node list semantics probes, not SAP measurements.

Run with the session's heavy wrapper and TMPDIR/GOCACHE settings:

```
node --preserve-symlinks tools/gogen/list-position-oracle.mjs --native --check
```

Each supported case compares the actual converted Node list with the direct
transpiler runtime, then checks native Go stdout against converted Node.
FORMAT is refused by direct Node, so those cases also execute a separately
labelled projection that elides only parsed FORMAT statements. Only whole
132-dash rules are mapped to the direct runtime's 50-dash rules for comparison.
Blank lines, indentation and every other character are preserved.

Plain WRITE after ULINE, NEW-LINE and TOP-OF-PAGE expose direct-runtime gaps;
the runner asserts the individual observations explicitly. See the list-position
entry in ANORMALIES.md for the baseline, local repair and width decision.

Optional LIST_ACCEPTANCE_REPORT and LIST_ACCEPTANCE_CSV paths also measure the
unchanged CSV report and a separately labelled direct text projection. That
projection supplies upload data and removes unsupported UI/attribute syntax;
it is not a full GUI_UPLOAD oracle. The report and CSV stay local.
