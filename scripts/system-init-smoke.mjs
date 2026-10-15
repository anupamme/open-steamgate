// Use the serving runtime’s entry point: setup hook, DDIC and seed boot.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {initializeABAP} = await import(pathToFileURL(resolve('output/init.mjs')).href);
await initializeABAP();
const db = globalThis.abap?.context.databaseConnections.DEFAULT;
if (!db) throw new Error('initialization did not connect the default database');
const result = await db.select({select: 'SELECT 1 AS smoke'});
if (Number(result.rows?.[0]?.smoke) !== 1) throw new Error('initialized database smoke failed');
await db.disconnect();
console.log('Published system initialization and database smoke passed');
