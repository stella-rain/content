// Run: node --test scripts/core_pin.test.cjs
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const p = require("./core_pin.cjs");

const COMMIT = "f108f4f718557c7d41ce8ab7900ff5180d9e09eb";

test("parsePin reads a release tag vX.Y.Z", () => {
  assert.deepStrictEqual(p.parsePin("v0.0.15\n"), { kind: "tag", ref: "v0.0.15" });
  assert.deepStrictEqual(p.parsePin("v10.2.30"), { kind: "tag", ref: "v10.2.30" });
});

test("parsePin reads a full 40-hex core commit", () => {
  assert.deepStrictEqual(p.parsePin(`${COMMIT}\n`), { kind: "commit", ref: COMMIT });
});

test("parsePin refuses anything else with one fixed message", () => {
  const junk = ["", "\n", "0.0.15", "v0.0", "v01.0.0", "v0.0.15-rc.1", "main", COMMIT.slice(0, 12), `${COMMIT}0`, COMMIT.toUpperCase(), "v0.0.15 v0.0.16", `${COMMIT}\n${COMMIT}`, "-rf"];
  for (const bad of junk) assert.throws(() => p.parsePin(bad), (e) => e.message === p.MESSAGE, JSON.stringify(bad));
});

test("checkReleasePin accepts a tag, refuses a commit and junk", () => {
  assert.doesNotThrow(() => p.checkReleasePin("v0.0.15\n"));
  assert.throws(() => p.checkReleasePin(COMMIT), (e) => e.message === p.RELEASE_MESSAGE);
  assert.throws(() => p.checkReleasePin("main"), (e) => e.message === p.MESSAGE);
});

function cli(cwd, ...args) {
  return execFileSync(process.execPath, [path.join(__dirname, "core_pin.cjs"), ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repoWith(pin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "core-pin-"));
  execFileSync("git", ["-C", dir, "init", "-q"]);
  fs.writeFileSync(path.join(dir, "core-version"), pin);
  return dir;
}

test("the CLI prints kind and ref", () => {
  const tag = repoWith("v0.0.15\n");
  assert.strictEqual(cli(tag, "kind"), "tag");
  assert.strictEqual(cli(tag, "ref"), "v0.0.15");
  const commit = repoWith(`${COMMIT}\n`);
  assert.strictEqual(cli(commit, "kind"), "commit");
  assert.strictEqual(cli(commit, "ref"), COMMIT);
});

test("the CLI exits 1 on junk, a missing file or an unknown command", () => {
  for (const [dir, cmd] of [[repoWith("main\n"), "kind"], [repoWith("main\n"), "ref"], [repoWith("v0.0.15\n"), "nope"], [fs.mkdtempSync(path.join(os.tmpdir(), "core-pin-")), "kind"]]) {
    if (!fs.existsSync(path.join(dir, ".git"))) execFileSync("git", ["-C", dir, "init", "-q"]);
    assert.throws(() => cli(dir, cmd), (e) => e.status === 1 && /core_pin: /.test(e.stderr), cmd);
  }
});
