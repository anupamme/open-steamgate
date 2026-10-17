import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {libraryPath} from '../osd-lib-path.mjs';
import {home} from './home.mjs';
import {repairListPosition} from './osabap-list.mjs';
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
  assert.equal(repairListPosition(fixed, parseSource), fixed);
});

test('literal lookalikes and independent positioning remain intact', () => {
  for (const body of [
    "DATA text TYPE string VALUE 'lo_writer->uline( VALUE #( ) ). lo_writer->new_line( ). lo_writer->set_position( 5 ).'.",
    'lo_writer->uline( VALUE #( ) ). lo_writer->new_line( ). lo_writer->set_position( 6 ).',
    'lo_writer->uline( VALUE #( ) ). lo_writer->set_format( VALUE #( ) ). lo_writer->new_line( ). lo_writer->set_position( 5 ).',
    'other->uline( VALUE #( ) ). lo_writer->new_line( ). lo_writer->set_position( 5 ).',
  ]) {
    const source = wrap(body);
    assert.equal(repairListPosition(source, parseSource), source);
  }
});
