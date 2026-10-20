// Run: node --test scripts/release.test.cjs
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const r = require("./release.cjs");

test("parseVersion wants plain x.y.z", () => {
  assert.strictEqual(r.parseVersion("0.0.1\n"), "0.0.1");
  assert.strictEqual(r.parseVersion("12.3.45"), "12.3.45");
  for (const bad of ["", "1.0", "v1.0.0", "1.0.0-rc.1", "01.0.0", "1.0.0.0"]) {
    assert.throws(() => r.parseVersion(bad), /not a version x\.y\.z/, bad);
  }
});

test("latestRelease is the highest v<x.y.z> tag, ignoring candidates and other v tags", () => {
  assert.strictEqual(r.latestRelease([]), "");
  assert.strictEqual(r.latestRelease(["v0.0.1", "v0.0.10", "v0.0.2", "v0.1.0-rc.1", "v9.9.9-probe"]), "v0.0.10");
});

test("checkVersion refuses a version that has a tag or is not above the latest release", () => {
  assert.doesNotThrow(() => r.checkVersion("0.0.1", []));
  assert.doesNotThrow(() => r.checkVersion("0.0.2", ["v0.0.1", "v0.0.2-rc.1"]));
  assert.throws(() => r.checkVersion("0.0.1", ["v0.0.1"]), /v0\.0\.1 is already released/);
  assert.throws(() => r.checkVersion("0.0.1", ["v0.0.2"]), /not above the latest release v0\.0\.2/);
});

test("rcTag is the next candidate number of a version", () => {
  assert.strictEqual(r.rcTag("0.0.1", []), "v0.0.1-rc.1");
  assert.strictEqual(r.rcTag("0.0.1", ["v0.0.1-rc.1", "v0.0.1-rc.2", "v0.0.2-rc.5"]), "v0.0.1-rc.3");
});

test("changelogEntry is the body of the version's section", () => {
  const text = "# Changelog\n\n## 0.0.2 - 2026-11-01\n\nSecond.\n\n## 0.0.1\n\nFirst.\n- a\n";
  assert.strictEqual(r.changelogEntry(text, "0.0.1"), "First.\n- a");
  assert.strictEqual(r.changelogEntry(text, "0.0.2"), "Second.");
  assert.throws(() => r.changelogEntry(text, "0.0.3"), /no entry for 0\.0\.3/);
  assert.throws(() => r.changelogEntry("## 0.0.1\n\n## 0.0.0\nx\n", "0.0.1"), /entry for 0\.0\.1 is empty/);
});

test("checkCandidate wants candidate/<12-character sha of HEAD>, on main, and no other candidate", () => {
  const head = "0123456789abcdef0123456789abcdef01234567";
  assert.doesNotThrow(() => r.checkCandidate("candidate/0123456789ab", head, true, []));
  assert.throws(() => r.checkCandidate("candidate/v0.0.1", head, true, []), /candidate\/<12-character sha>/);
  assert.throws(() => r.checkCandidate("candidate/fedcba987654", head, true, []), /not HEAD/);
  assert.throws(() => r.checkCandidate("candidate/0123456789ab", head, false, []), /not on origin\/main/);
  assert.throws(() => r.checkCandidate("candidate/0123456789ab", head, true, ["candidate/aaaaaaaaaaaa"]), /candidate\/aaaaaaaaaaaa is left over/);
});

test("checksPassed wants one finished check run, none failed, this run's own left out", () => {
  const run = (name, status, conclusion, id = 1) => ({ name, status, conclusion, details_url: `https://github.com/o/r/actions/runs/${id}/job/9` });
  assert.doesNotThrow(() => r.checksPassed([run("test", "completed", "success"), run("guard", "completed", "skipped")], "7"));
  assert.doesNotThrow(() => r.checksPassed([run("test", "completed", "success"), run("verify and sums", "in_progress", null, 7)], "7"));
  assert.doesNotThrow(() => r.checksPassed([run("test", "completed", "success"), run("verify and sums", "completed", "failure", 3)], "7"));
  assert.throws(() => r.checksPassed([run("verify and sums", "in_progress", null, 7)], "7"), /no check run/);
  assert.throws(() => r.checksPassed([run("test", "in_progress", null)], "7"), /test: in_progress/);
  for (const c of ["failure", "timed_out", "cancelled", "action_required"]) {
    assert.throws(() => r.checksPassed([run("test", "completed", c)], "7"), new RegExp(`test: ${c}`));
  }
});

test("rcOfBranch, supersededBranches and releasedBranches", () => {
  assert.strictEqual(r.rcOfBranch("rc/v0.0.1-rc.2"), "v0.0.1-rc.2");
  assert.throws(() => r.rcOfBranch("rc/v0.0.1"), /not rc\/<rc tag>/);
  assert.throws(() => r.rcOfBranch("main"), /not rc\/<rc tag>/);
  const branches = ["main", "rc/v0.0.1-rc.1", "rc/v0.0.1-rc.2", "rc/v0.0.1-rc.3", "rc/v0.0.2-rc.1", "rc/v0.1.0-rc.1"];
  assert.deepStrictEqual(r.supersededBranches(branches, "v0.0.1-rc.3"), ["rc/v0.0.1-rc.1", "rc/v0.0.1-rc.2"]);
  assert.deepStrictEqual(r.supersededBranches(branches, "v0.0.1-rc.1"), []);
  assert.deepStrictEqual(r.releasedBranches(branches, "v0.0.2"), ["rc/v0.0.1-rc.1", "rc/v0.0.1-rc.2", "rc/v0.0.1-rc.3", "rc/v0.0.2-rc.1"]);
});

test("checkPromote wants the highest rc of a new version whose commit holds that VERSION", () => {
  const tags = ["v0.0.1", "v0.0.2-rc.1", "v0.0.2-rc.2"];
  assert.strictEqual(r.checkPromote("v0.0.2-rc.2", tags, "0.0.2\n"), "v0.0.2");
  assert.throws(() => r.checkPromote("v0.0.2-rc.1", tags, "0.0.2"), /v0\.0\.2-rc\.2 is newer/);
  assert.throws(() => r.checkPromote("v0.0.2", tags, "0.0.2"), /not a candidate tag/);
  assert.throws(() => r.checkPromote("v0.0.1-rc.1", ["v0.0.1", "v0.0.1-rc.1"], "0.0.1"), /already released/);
  assert.throws(() => r.checkPromote("v0.0.1-rc.1", ["v0.0.2", "v0.0.1-rc.1"], "0.0.1"), /not above the latest release v0\.0\.2/);
  assert.throws(() => r.checkPromote("v0.0.2-rc.2", tags, "0.0.3"), /VERSION at v0\.0\.2-rc\.2 is '0\.0\.3', not '0\.0\.2'/);
});

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function cli(cwd, ...args) {
  return execFileSync(process.execPath, [path.join(__dirname, "release.cjs"), ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// One origin, one clone on main with VERSION 0.0.1 and a CHANGELOG entry for it.
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-"));
  const origin = path.join(root, "origin.git");
  const dev = path.join(root, "dev");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, dev);
  git(dev, "symbolic-ref", "HEAD", "refs/heads/main");
  git(dev, "config", "user.email", "t@t");
  git(dev, "config", "user.name", "t");
  fs.writeFileSync(path.join(dev, "VERSION"), "0.0.1\n");
  fs.writeFileSync(path.join(dev, "CHANGELOG.md"), "# Changelog\n\n## 0.0.1\n\nFirst pack.\n");
  git(dev, "add", "-A");
  git(dev, "commit", "-q", "-m", "first");
  git(dev, "push", "-q", "origin", "main");
  return dev;
}

test("the CLI reads VERSION, CHANGELOG.md and the tags of the clone", () => {
  const dev = repo();
  assert.strictEqual(cli(dev, "version"), "0.0.1");
  assert.strictEqual(cli(dev, "check-version"), "");
  assert.strictEqual(cli(dev, "notes"), "First pack.");
  assert.strictEqual(cli(dev, "rc"), "v0.0.1-rc.1");
  git(dev, "tag", "v0.0.1-rc.1");
  assert.strictEqual(cli(dev, "rc"), "v0.0.1-rc.2");
  assert.strictEqual(cli(dev, "latest"), "");
  git(dev, "tag", "v0.0.1");
  assert.strictEqual(cli(dev, "latest"), "v0.0.1");
  assert.throws(() => cli(dev, "check-version"), /v0\.0\.1 is already released/);
});

test("the CLI refuses a candidate whose branch is not at HEAD, and finds leftover candidate branches", () => {
  const dev = repo();
  const head = git(dev, "rev-parse", "HEAD");
  assert.strictEqual(cli(dev, "check-candidate", `candidate/${head.slice(0, 12)}`), "");
  git(dev, "push", "-q", "origin", `${head}:refs/heads/candidate/aaaaaaaaaaaa`);
  assert.throws(() => cli(dev, "check-candidate", `candidate/${head.slice(0, 12)}`), /candidate\/aaaaaaaaaaaa is left over/);
});

test("the CLI check-promote reads VERSION at the rc tag, superseded and released read origin's rc branches", () => {
  const dev = repo();
  git(dev, "tag", "v0.0.1-rc.1");
  const head = git(dev, "rev-parse", "HEAD");
  git(dev, "push", "-q", "origin", `${head}:refs/heads/rc/v0.0.1-rc.1`);
  assert.strictEqual(cli(dev, "check-promote", "v0.0.1-rc.1"), "v0.0.1");
  assert.strictEqual(cli(dev, "released", "v0.0.1"), "rc/v0.0.1-rc.1");
  assert.strictEqual(cli(dev, "superseded", "v0.0.1-rc.2"), "rc/v0.0.1-rc.1");
  assert.strictEqual(cli(dev, "rc-branch", "rc/v0.0.1-rc.1"), "v0.0.1-rc.1");
  fs.writeFileSync(path.join(dev, "VERSION"), "0.0.2\n");
  git(dev, "commit", "-q", "-am", "bump");
  git(dev, "tag", "v0.0.1-rc.2");
  assert.throws(() => cli(dev, "check-promote", "v0.0.1-rc.2"), /VERSION at v0\.0\.1-rc\.2 is '0\.0\.2', not '0\.0\.1'/);
});
