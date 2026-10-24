#!/usr/bin/env node
// core_pin: reads `core-version`, the core ref whose `content-pack` validates pack.json (ADR-131).
// It holds a release tag vX.Y.Z, or while developing a full 40-hex commit on core's main; a content
// release needs a tag (release.cjs check-version). The workflows and provenance.cjs call:
//
//   kind   prints `tag` or `commit`
//   ref    prints the value
//
// Anything else in the file, or a missing file, exits 1 with a fixed message.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const COMMIT = /^[0-9a-f]{40}$/;
const MESSAGE = "core-version must hold a core tag vX.Y.Z or a full 40-hex core commit";
const RELEASE_MESSAGE = "core-version must hold a released core tag vX.Y.Z in a content release, not a commit";

function parsePin(text) {
  const ref = String(text).replace(/\r?\n$/, "");
  if (TAG.test(ref)) return { kind: "tag", ref };
  if (COMMIT.test(ref)) return { kind: "commit", ref };
  throw new Error(MESSAGE);
}

function checkReleasePin(text) {
  if (parsePin(text).kind !== "tag") throw new Error(RELEASE_MESSAGE);
}

function readPin(root = path.join(__dirname, "..")) {
  const file = path.join(root, "core-version");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(MESSAGE);
  }
  return parsePin(text);
}

if (require.main === module) {
  const cmd = process.argv[2];
  try {
    if (cmd !== "kind" && cmd !== "ref") throw new Error("usage: core_pin.cjs kind | ref");
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    console.log(readPin(root)[cmd]);
  } catch (e) {
    console.error(`core_pin: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { parsePin, checkReleasePin, readPin, MESSAGE, RELEASE_MESSAGE };
