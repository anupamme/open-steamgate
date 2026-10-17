// Compatibility adapter for the pinned GUI converter's ULINE lowering.
// The shared ABAP list writer already ends the rule at column 1 of the next
// line. The converter's extra positioning opens a phantom line at column 5.
// Work on parsed generated ABAP, before closure discovery; never on Go/IR.
// Temporary workaround: fix the lowering in oisee/open-abap-gui.
// Call once on fresh converter output; reject pin drift instead of guessing.
export function repairListPosition(source, parseSource) {
  const parsed = parseSource(source, 'zcl_osabap_list.clas.abap');
  if (parsed.diagnostics.some(d => d.severity === 'error')) {
    throw new Error('osabap list adapter: generated ABAP did not parse');
  }
  const statements = parsed.units[0].statements;
  const tokens = s => s?.node.getTokens().map(t => t.getStr().toUpperCase()) ?? [];
  const equals = (s, expected) => JSON.stringify(tokens(s)) === JSON.stringify(expected);
  const edits = [];
  for (let i = 0; i < statements.length; i++) {
    const call = tokens(statements[i]);
    if (statements[i].kind !== 'Call' || call.slice(0, 4).join(' ') !== 'LO_WRITER -> ULINE (') continue;
    if (!equals(statements[i + 1], ['LO_WRITER', '->', 'NEW_LINE', '(', ')', '.'])
        || !equals(statements[i + 2], ['LO_WRITER', '->', 'SET_POSITION', '(', '5', ')', '.'])) {
      throw new Error(`osabap list adapter: unrepaired lo_writer->uline at offset ${statements[i].span.startOffset}; expected new_line( ) then set_position( 5 ); check the open-abap-gui converter pin`);
    }
    edits.push([statements[i + 1].span.startOffset, statements[i + 2].span.endOffset]);
  }
  for (const [start, end] of edits.reverse()) source = source.slice(0, start) + source.slice(end);
  return source;
}
