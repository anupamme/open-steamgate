// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import {readdirSync, existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, relative} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {test as nodeTest} from "node:test";
import ts from "typescript";

// Suite fragments run under Mocha; focused node --test runs use node:test.
// Register with the active runner so Mocha cannot overwrite a node:test failure.
const test = globalThis.it
  ? (name, run) => globalThis.it(name, run).timeout(30_000)
  : nodeTest;

// Parse source rather than matching imports in comments or generated-code strings.
// Keep walking after a TS edge so every reachable TS file gets a diagnostic.
function typescriptInClosure(entries) {
  const seen = new Set(), violations = [];
  function visit(url, chain) {
    const file = fileURLToPath(url);
    if (seen.has(file)) return;
    seen.add(file);
    const nextChain = [...chain, relative(process.cwd(), file)];
    if (file.endsWith(".ts")) violations.push(nextChain.join(" -> "));
    if (![".mjs", ".cjs", ".js", ".ts"].some(ext => file.endsWith(ext))) return;
    // Build products and optional library clones may be absent in a checkout.
    // TS edges are reported above even when their target is not materialized.
    const local = relative(fileURLToPath(new URL("..", import.meta.url)), file);
    if (!existsSync(file) && [".local/", "output/", "web/generated/"].some(dir => local.startsWith(dir))) return;
    const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    assert.equal(ast.parseDiagnostics.length, 0, `Cannot parse ${file}`);
    function scan(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        // Type-only edges cannot load code at runtime.
        if (!node.isTypeOnly && !node.importClause?.isTypeOnly) specifier = node.moduleSpecifier;
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        specifier = node.arguments[0];
      }
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith(".")) {
        visit(new URL(specifier.text, url), nextChain);
      }
      ts.forEachChild(node, scan);
    }
    scan(ast);
  }
  for (const entry of entries) visit(entry, []);
  return violations.sort();
}

test("osd CLI runtime import closure contains no TypeScript files", () => {
  const violations = typescriptInClosure([
    new URL("../bin/osd.mjs", import.meta.url),
    // Some CLI tool dispatch uses computed paths; cover every osd tool too.
    ...readdirSync(new URL("../tools/", import.meta.url))
      .filter(file => file.startsWith("osd-") && file.endsWith(".mjs"))
      .map(file => new URL(`../tools/${file}`, import.meta.url)),
  ]);
  assert.deepEqual(violations, [], `TypeScript on the osd runtime path:\n${violations.join("\n")}`);
});

test("closure follows static, side-effect, re-export and literal dynamic imports, including cycles", () => {
  const scratch = mkdtempSync(join(tmpdir(), "osd-no-ts-"));
  try {
    writeFileSync(join(scratch, "root.mjs"), `import {value} from './static.mjs';
export * from './export.mjs'; import './side.mjs';
async function later() { await import('./dynamic.mjs'); }
// import './comment.ts';
const generated = "import './string.ts'";`);
    for (const name of ["static", "export", "side", "dynamic"]) {
      writeFileSync(join(scratch, `${name}.mjs`), `export {value} from './${name}.ts';`);
      writeFileSync(join(scratch, `${name}.ts`), "import './root.mjs'; export const value: number = 1;");
    }
    const violations = typescriptInClosure([pathToFileURL(join(scratch, "root.mjs"))]);
    assert.equal(violations.length, 4);
    for (const name of ["static", "export", "side", "dynamic"]) {
      assert.ok(violations.some(chain => chain.endsWith(`${name}.mjs -> ${relative(process.cwd(), join(scratch, `${name}.ts`))}`)));
    }
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
});
