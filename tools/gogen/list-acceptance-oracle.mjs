// Direct-runtime text projection for an upload report. The unchanged report
// is attempted first by the caller. This projection removes only UI events
// and FORMAT, supplies the uploaded lines, and preserves report calculations
// and FORM/PERFORM execution. It is not a full frontend-service oracle.
export function acceptanceTextSource(source, parseSource, filename, csv) {
  const statements = parseSource(source).units[0].statements;
  const edits = [];
  let eventStart;
  const literal = text => "'" + text.split("'").join("''") + "'";
  for (const s of statements) {
    const tokens = s.node.getTokens().map(t => t.getStr().toUpperCase());
    if (s.kind === 'AtSelectionScreen') eventStart = s.span.startOffset;
    if (s.kind === 'StartOfSelection' && eventStart !== undefined) {
      edits.push([eventStart, s.span.endOffset, '']);
      eventStart = undefined;
    }
    if (eventStart !== undefined) continue;
    // The direct transpiler emits a top-level JS return here, which is
    // illegal in an ES module. Nonempty upload never takes this branch;
    // assert that assumption instead of silently changing execution.
    if (s.kind === 'Return') edits.push([s.span.startOffset, s.span.endOffset, 'ASSERT 1 = 2.']);
    if (s.kind === 'Format') edits.push([s.span.startOffset, s.span.endOffset, '']);
    if (s.kind === 'Parameter') edits.push([s.span.startOffset, s.span.endOffset,
      `DATA p_file TYPE string VALUE ${literal(filename)}.`]);
    if (s.kind === 'Call' && tokens.includes('GUI_UPLOAD')) {
      const lines = csv.split('\n');
      if (lines.at(-1) === '') lines.pop();
      edits.push([s.span.startOffset, s.span.endOffset,
        lines.map(line => `APPEND ${literal(line.endsWith('\r') ? line.slice(0, -1) : line)} TO gt_lines.`).join('\n')]);
    }
  }
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + text + source.slice(end);
  return source;
}
