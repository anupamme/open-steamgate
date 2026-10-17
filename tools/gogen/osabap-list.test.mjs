import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {libraryPath} from '../osd-lib-path.mjs';
import {home} from './home.mjs';
import {repairListPosition} from './osabap-list.mjs';
const {convertProgram} = await import(pathToFileURL(join(libraryPath(home, 'open-abap-gui'), 'converter/src/api.mjs')).href);
const {parseSource} = await import(pathToFileURL(join(libraryPath(home, 'open-abap-gui'), 'converter/src/parser.mjs')).href);
const wrap = body => `CLASS zcl_osabap_list DEFINITION PUBLIC. PUBLIC SECTION. METHODS run. ENDCLASS.
CLASS zcl_osabap_list IMPLEMENTATION. METHOD run. ${body} ENDMETHOD. ENDCLASS.`;

test('only the parsed converter positioning sequence is removed', () => {
  const calls = 'lo_writer->uline( VALUE #( ) ).\nlo_writer->new_line( ).\nlo_writer->set_position( 5 ).';
  const source = wrap(`${calls}\nlo_writer->set_format( VALUE #( ) ).\n${calls}`);
  const fixed = repairListPosition(source, parseSource);
  const statements = parseSource(fixed).units[0].statements;
  assert.equal(statements.filter(s => s.kind === 'Call').length, 3);
  assert.ok(fixed.includes('lo_writer->set_format( VALUE #( ) ).'));
  assert.throws(() => repairListPosition(fixed, parseSource), /unrepaired lo_writer->uline/);
});

test('literal lookalikes and independent positioning remain intact', () => {
  for (const body of [
    "DATA text TYPE string VALUE 'lo_writer->uline( VALUE #( ) ). lo_writer->new_line( ). lo_writer->set_position( 5 ).'.",
    'other->uline( VALUE #( ) ). lo_writer->new_line( ). lo_writer->set_position( 5 ).',
  ]) {
    const source = wrap(body);
    assert.equal(repairListPosition(source, parseSource), source);
  }
});

test('every ULINE in fresh converter output must match, including the final statement', async () => {
  const converted = await convertProgram({source: "REPORT zprobe. ULINE. ULINE AT 20(10).",
    filename: 'zprobe.prog.abap', mode: 'strict', nativePassthrough: true,
    className: 'ZCL_OSABAP_LIST', transactionCode: 'ZPROBE'});
  assert.equal(converted.supported, true);
  const source = converted.classSource;
  const sequences = [...source.matchAll(/lo_writer->new_line\( \)\.\s+lo_writer->set_position\( 5 \)\./g)];
  assert.equal(sequences.length, 2);
  const sequence = sequences.at(-1)[0];
  assert.doesNotThrow(() => repairListPosition(source, parseSource));
  for (const replacement of [
    'lo_writer->new_line( ).\nlo_writer->set_position( 6 ).',
    'lo_writer->set_format( VALUE #( ) ).\n' + sequence,
    '',
  ]) {
    // Mutate only the last emitted sequence: a repaired first call must not
    // hide the changed second call after a converter pin bump.
    const at = source.lastIndexOf(sequence);
    const mutated = source.slice(0, at) + replacement + source.slice(at + sequence.length);
    assert.throws(() => repairListPosition(mutated, parseSource), /unrepaired lo_writer->uline.*converter pin/);
  }
  assert.throws(() => repairListPosition(wrap('lo_writer->uline( VALUE #( ) ).'), parseSource), /unrepaired lo_writer->uline/);
});
