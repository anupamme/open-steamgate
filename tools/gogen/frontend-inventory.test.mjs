import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {core, freshRegistry, parseObserved, parseObservedAsync} from "./frontend-inventory.mjs";

const registry = () => new core.Registry().addFile(new core.MemoryFile("z.prog.abap", "REPORT z. WRITE 'old'."));

test("inventory import leaves Registry parse methods unchanged", () => {
  execFileSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import {createRequire} from 'node:module';
    const require = createRequire(import.meta.url);
    const core = createRequire(require.resolve('@abaplint/transpiler/package.json'))('@abaplint/core');
    const {parse, parseAsync} = core.Registry.prototype;
    await import('./tools/gogen/frontend-inventory.mjs');
    assert.equal(core.Registry.prototype.parse, parse);
    assert.equal(core.Registry.prototype.parseAsync, parseAsync);
  `]);
});

test("observed parse preserves receiver, arguments, result and unchanged freshness", () => {
  const reg = registry(), original = reg.parse, args = [{marker: true}, 7];
  reg.parse = function(...actual) {
    assert.equal(this, reg); assert.deepEqual(actual, args);
    return original.call(this);
  };
  assert.equal(parseObserved(reg, ...args), reg);
  assert.equal(freshRegistry(reg), reg);
  assert.equal(parseObserved(reg, ...args), reg);
  assert.equal(freshRegistry(reg), reg);
});

test("async observation certifies only on fulfillment and forwards progress options", async () => {
  const reg = registry(), original = reg.parseAsync, options = {outputPerformance: false};
  let complete;
  reg.parseAsync = function(...args) {
    assert.equal(this, reg); assert.deepEqual(args, [options]);
    return new Promise((resolve) => { complete = () => resolve(original.call(this, ...args)); });
  };
  const pending = parseObservedAsync(reg, options);
  complete();
  assert.equal(await pending, reg);
  assert.equal(freshRegistry(reg), reg);
});

test("throwing or rejected parses do not certify artifacts built by a failed parse", async () => {
  for (const async of [false, true]) {
    const reg = registry(), original = reg.parse, error = new Error("parse failed");
    const fail = function() { original.call(this); throw error; };
    if (async) {
      reg.parseAsync = async function() { return fail.call(this); };
      await assert.rejects(parseObservedAsync(reg), (actual) => actual === error);
    } else {
      reg.parse = fail;
      assert.throws(() => parseObserved(reg), (actual) => actual === error);
    }
    assert.notEqual(freshRegistry(reg), reg);
  }
});

test("first observation, edited inputs and replaced config cannot certify retained artifacts", async () => {
  for (const parse of [parseObserved, parseObservedAsync]) {
    const unobserved = registry(); unobserved.parse();
    await parse(unobserved);
    assert.notEqual(freshRegistry(unobserved), unobserved);
    for (const change of [
      (reg) => reg.updateFile(new core.MemoryFile("z.prog.abap", "REPORT z. WRITE 'new'.")),
      (reg) => reg.setConfig(new core.Config(JSON.stringify(reg.getConfig().get()))),
    ]) {
      const reg = registry(); await parse(reg); change(reg); await parse(reg);
      assert.notEqual(freshRegistry(reg), reg);
    }
  }
});

test("freshRegistry observes its own parse and memoizes replacement registries", () => {
  const reg = registry();
  assert.equal(freshRegistry(reg), reg);
  assert.equal(freshRegistry(reg), reg);
  reg.updateFile(new core.MemoryFile("z.prog.abap", "REPORT z. WRITE 'new'."));
  const fresh = freshRegistry(reg);
  assert.notEqual(fresh, reg);
  assert.equal(freshRegistry(reg), fresh);
  assert.equal(freshRegistry(fresh), fresh);
});
