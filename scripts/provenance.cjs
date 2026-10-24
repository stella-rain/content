#!/usr/bin/env node
// provenance: decides whether checks.yml re-exports the pack at `core-version` and compares it
// with pack.json byte for byte (D-REPO: pack.json is only ever core's export).
//
//   applies [ROOT]   prints `true` or `false` for the core-version file in ROOT (default: repo)
//
// The pack here was hand-authored up to core v0.1.0, so a pin of v0.1.0 or older is skipped; any
// later tag, or a commit, is checked. Once a publish PR has landed the check never skips again.
"use strict";

const path = require("path");
const { parsePin, readPin } = require("./core_pin.cjs");

const LAST_HAND_AUTHORED = [0, 1, 0];

function applies(text) {
  const pin = parsePin(text);
  if (pin.kind === "commit") return true;
  const v = pin.ref.slice(1).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (v[i] !== LAST_HAND_AUTHORED[i]) return v[i] > LAST_HAND_AUTHORED[i];
  }
  return false;
}

module.exports = { applies };

if (require.main === module) {
  const [cmd, root = path.join(__dirname, "..")] = process.argv.slice(2);
  if (cmd !== "applies") {
    console.error("usage: provenance.cjs applies [ROOT]");
    process.exit(2);
  }
  try {
    console.log(String(applies(readPin(root).ref)));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
