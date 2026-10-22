// Run: node --test scripts/playtest.test.cjs
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const t = require("./playtest.cjs");

const COMMIT = "f108f4f718557c7d41ce8ab7900ff5180d9e09eb";
const OTHER = "0123456789abcdef0123456789abcdef01234567";

test("parseArgs: defaults, each option, and refusals", () => {
  assert.deepStrictEqual(t.parseArgs([]), { app: "../app", profile: "test-env", build: false });
  assert.deepStrictEqual(t.parseArgs(["--app", "/x/app", "--profile", "my_1", "--build"]), { app: "/x/app", profile: "my_1", build: true });
  assert.throws(() => t.parseArgs(["--nope"]), /unknown option --nope/);
  assert.throws(() => t.parseArgs(["--app"]), /--app needs a value/);
  assert.throws(() => t.parseArgs(["--profile", "a b"]), /--profile/);
  assert.throws(() => t.parseArgs(["--profile", "x".repeat(41)]), /--profile/);
  assert.throws(() => t.parseArgs(["--profile", ""]), /--profile/);
});

const TOML = `[dependencies]
# a comment mentioning stella-rain-core = { git = "x", rev = "${OTHER}" }
stella-rain-core = { git = "https://github.com/stella-rain/core", rev = "${COMMIT}" }
serde_json = "1"

[dev-dependencies]
stella-rain-core = { git = "https://github.com/stella-rain/core", rev = "${COMMIT}", features = ["record"] }
`;

test("appPin reads rev or tag of stella-rain-core, ignoring comments", () => {
  assert.deepStrictEqual(t.appPin(TOML), { kind: "commit", ref: COMMIT });
  assert.deepStrictEqual(t.appPin('stella-rain-core = { git = "u", tag = "v0.0.15" }\n'), { kind: "tag", ref: "v0.0.15" });
});

test("appPin refuses no pin, a branch pin and pins that disagree", () => {
  assert.throws(() => t.appPin("[dependencies]\n"), /no stella-rain-core/);
  assert.throws(() => t.appPin('stella-rain-core = { git = "u", branch = "main" }\n'), /rev or tag/);
  assert.throws(() => t.appPin(`stella-rain-core = { git = "u", rev = "${COMMIT}" }\nstella-rain-core = { git = "u", rev = "${OTHER}" }\n`), /disagree/);
});

test("checkPins: a tag equals a tag, a commit equals a rev, else both values are named", () => {
  assert.doesNotThrow(() => t.checkPins({ kind: "tag", ref: "v0.0.15" }, { kind: "tag", ref: "v0.0.15" }));
  assert.doesNotThrow(() => t.checkPins({ kind: "commit", ref: COMMIT }, { kind: "commit", ref: COMMIT }));
  assert.throws(() => t.checkPins({ kind: "commit", ref: COMMIT }, { kind: "commit", ref: OTHER }), (e) => e.message.includes(COMMIT) && e.message.includes(OTHER));
  assert.throws(() => t.checkPins({ kind: "tag", ref: "v0.0.15" }, { kind: "commit", ref: COMMIT }), (e) => e.message.includes("v0.0.15") && e.message.includes(COMMIT));
});

test("installHint: cargo install at the tag or the commit", () => {
  const base = "cargo install --git https://github.com/stella-rain/core";
  assert.strictEqual(t.installHint({ kind: "tag", ref: "v0.0.15" }), `${base} --tag v0.0.15 --bin content-pack`);
  assert.strictEqual(t.installHint({ kind: "commit", ref: COMMIT }), `${base} --rev ${COMMIT} --bin content-pack`);
});

test("godotBinary: $GODOT first, else godot", () => {
  assert.strictEqual(t.godotBinary({ GODOT: "/opt/godot" }), "/opt/godot");
  assert.strictEqual(t.godotBinary({}), "godot");
  assert.strictEqual(t.godotBinary({ GODOT: "" }), "godot");
});

test("buildCommand and launchCommand are the app's documented debug build and run", () => {
  const app = path.resolve("/w/app");
  assert.deepStrictEqual(t.buildCommand(app), { cmd: "cargo", args: ["build", "--features", "record"], cwd: path.join(app, "godot-ext") });
  const pack = path.resolve("/w/content/pack.json");
  assert.deepStrictEqual(t.launchCommand("godot", app, pack, "test-env"), {
    cmd: "godot",
    args: ["--path", path.join(app, "godot"), "--", `--content-path=${pack}`, "--profile=test-env"],
  });
});
