// Run: node --test scripts/provenance.test.cjs
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const p = require("./provenance.cjs");

const COMMIT = "f108f4f718557c7d41ce8ab7900ff5180d9e09eb";

test("applies is false for the hand-authored pins, v0.1.0 and older", () => {
  for (const v of ["v0.1.0\n", "v0.0.15", "v0.0.1", "v0.1.0"]) assert.strictEqual(p.applies(v), false, v);
});

test("applies is true for a tag after v0.1.0 and for a commit", () => {
  for (const v of ["v0.1.1\n", "v0.2.0", "v1.0.0", "v0.10.0", COMMIT]) assert.strictEqual(p.applies(v), true, v);
});

test("applies refuses a pin that core_pin refuses", () => {
  assert.throws(() => p.applies("main"));
});

test("the CLI prints true or false for the core-version in the given root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
  const run = () => execFileSync("node", [path.join(__dirname, "provenance.cjs"), "applies", root]).toString().trim();
  fs.writeFileSync(path.join(root, "core-version"), "v0.1.0\n");
  assert.strictEqual(run(), "false");
  fs.writeFileSync(path.join(root, "core-version"), "v0.1.1\n");
  assert.strictEqual(run(), "true");
});
