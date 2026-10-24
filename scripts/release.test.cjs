// Run: node --test scripts/release.test.cjs
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
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
  fs.writeFileSync(path.join(dev, "core-version"), "v0.0.15\n");
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

test("the CLI check-version refuses a core-version that is a commit or junk (ADR-131), accepts a tag", () => {
  const dev = repo();
  const commit = "f108f4f718557c7d41ce8ab7900ff5180d9e09eb";
  fs.writeFileSync(path.join(dev, "core-version"), `${commit}\n`);
  assert.throws(() => cli(dev, "check-version"), /core-version must hold a released core tag/);
  fs.writeFileSync(path.join(dev, "core-version"), "main\n");
  assert.throws(() => cli(dev, "check-version"), /core-version must hold/);
  fs.writeFileSync(path.join(dev, "core-version"), "v0.0.16\n");
  assert.strictEqual(cli(dev, "check-version"), "");
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

test("ciDone: red, waiting or ready from a commit's workflow runs; only the named workflows run by a push or dispatch count", () => {
  const names = ["Pack checks", "Line endings"];
  const run = (name, status, conclusion, event = "push") => ({ name, status, conclusion, event });
  const ok = [run("Pack checks", "completed", "success"), run("Line endings", "completed", "skipped")];
  assert.strictEqual(r.ciDone(ok, names), "ready");
  assert.strictEqual(r.ciDone([run("Pack checks", "completed", "neutral"), run("Line endings", "completed", "success", "workflow_dispatch")], names), "ready");
  assert.strictEqual(r.ciDone([...ok, run("Line endings", "in_progress", null)], names), "waiting");
  assert.strictEqual(r.ciDone([...ok, run("Auto-merge", "in_progress", null)], names), "ready");
  assert.strictEqual(r.ciDone([...ok, run("Line endings", "queued", null, "pull_request")], names), "ready");
  for (const c of ["failure", "timed_out", "cancelled", "action_required", "stale", "startup_failure"]) {
    assert.strictEqual(r.ciDone([...ok, run("Pack checks", "completed", c)], names), "red", c);
  }
  assert.strictEqual(r.ciDone([run("Pack checks", "completed", "failure"), run("Line endings", "in_progress", null)], names), "red");
  assert.strictEqual(r.ciDone([run("Other", "completed", "success")], names), "waiting");
  assert.strictEqual(r.ciDone([], names), "waiting");
});

test("shouldCandidate wants an unreleased VERSION above the latest, its CHANGELOG entry and a core tag", () => {
  const changelog = "# Changelog\n\n## 0.0.2\n\nSecond.\n";
  const good = { version: "0.0.2", tags: ["v0.0.1"], changelog, coreVersion: "v0.1.0\n" };
  assert.doesNotThrow(() => r.shouldCandidate(good));
  assert.throws(() => r.shouldCandidate({ ...good, tags: ["v0.0.1", "v0.0.2"] }), /v0\.0\.2 is already released/);
  assert.throws(() => r.shouldCandidate({ ...good, tags: ["v0.0.3"] }), /not above the latest release/);
  assert.throws(() => r.shouldCandidate({ ...good, version: "0.0.3" }), /no entry for 0\.0\.3/);
  assert.throws(() => r.shouldCandidate({ ...good, coreVersion: "main\n" }), /core-version must hold/);
});

test("the CLI should-candidate prints true for an unreleased version, false with the reason on stderr otherwise", () => {
  const dev = repo();
  assert.strictEqual(cli(dev, "should-candidate"), "true");
  git(dev, "tag", "v0.0.1");
  const out = spawnSync(process.execPath, [path.join(__dirname, "release.cjs"), "should-candidate"], { cwd: dev, encoding: "utf8" });
  assert.strictEqual(out.status, 0);
  assert.strictEqual(out.stdout.trim(), "false");
  assert.match(out.stderr, /v0\.0\.1 is already released/);
});

test("the CLI ci-done reads the runs API's JSON on stdin", () => {
  const dev = repo();
  const input = JSON.stringify({ workflow_runs: [{ name: "Pack checks", status: "completed", conclusion: "failure", event: "push" }] });
  const out = (...a) => execFileSync(process.execPath, [path.join(__dirname, "release.cjs"), "ci-done", ...a], { cwd: dev, input, encoding: "utf8" }).trim();
  assert.strictEqual(out("Pack checks"), "red");
  assert.strictEqual(out("Line endings"), "waiting");
});

test("the job names checksPassed leaves out are the candidate workflows' jobs", () => {
  const text = ["candidate.yml", "candidate-guard.yml", "auto-candidate.yml"]
    .map((f) => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", f), "utf8"))
    .join("\n");
  const names = [...text.matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1]);
  assert.deepStrictEqual([...r.CANDIDATE_JOBS].sort(), names.sort());
});

test("only a successful Candidate deletes the candidate branch; a failed one keeps it", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "candidate.yml"), "utf8");
  const job = (id) => text.match(new RegExp(`^  ${id}:\\n((?:    .*\\n|\\n)+)`, "m"))[1];
  const cleanup = job("cleanup");
  const cond = cleanup.match(/^    if: (.+)$/m)[1];
  assert.match(cond, /needs\.tag\.result == 'success'/);
  assert.doesNotMatch(cond, /always\(\)/);
  assert.match(cleanup, /^    needs: \[check, tag\]$/m);
});

// packs.json: one channel per core minor (DS49 D-FETCH). FT1a's parser and FT1c's fetch read it.
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const entry = (tag, sha, url) => ({ tag, pack_sha256: sha, text_sha256: null, url: url || r.packUrl("stella-rain/content", tag) });
const release = (previous, coreVersion, tag, sha) =>
  r.packsManifest({ previous, coreVersion, tag, packSha256: sha, repo: "stella-rain/content" });

test("channelKey is the major.minor of a core tag, and a commit has none", () => {
  assert.strictEqual(r.channelKey("v0.2.5\n"), "0.2");
  assert.strictEqual(r.channelKey("v10.31.0"), "10.31");
  assert.throws(() => r.channelKey("f108f4f718557c7d41ce8ab7900ff5180d9e09eb"), /no minor/);
  assert.throws(() => r.channelKey("main"), /no minor/);
});

test("packUrl is the release asset URL of the tag's pack.json", () => {
  assert.strictEqual(r.packUrl("stella-rain/content", "v0.0.2"), "https://github.com/stella-rain/content/releases/download/v0.0.2/pack.json");
});

test("the first release starts at seq 1 with one channel", () => {
  const m = release(null, "v0.2.5", "v0.0.1", SHA_A);
  assert.deepStrictEqual(m, { schema: 1, seq: 1, channels: { "0.2": entry("v0.0.1", SHA_A) } });
  assert.strictEqual(m.channels["0.2"].text_sha256, null);
});

test("a second release for the same minor replaces that channel and gives seq 2", () => {
  const first = release(null, "v0.2.5", "v0.0.1", SHA_A);
  const m = release(r.serializePacks(first), "v0.2.6", "v0.0.2", SHA_B);
  assert.deepStrictEqual(m, { schema: 1, seq: 2, channels: { "0.2": entry("v0.0.2", SHA_B) } });
});

test("a release for a new minor adds a channel and keeps the old one", () => {
  const first = release(null, "v0.2.5", "v0.0.1", SHA_A);
  const m = release(r.serializePacks(first), "v0.3.0", "v0.0.2", SHA_B);
  assert.strictEqual(m.seq, 2);
  assert.deepStrictEqual(m.channels, { "0.2": entry("v0.0.1", SHA_A), "0.3": entry("v0.0.2", SHA_B) });
});

test("a core-version that is a commit refuses the release", () => {
  assert.throws(() => release(null, "f108f4f718557c7d41ce8ab7900ff5180d9e09eb", "v0.0.1", SHA_A), /no minor/);
});

test("a previous manifest that is not schema 1 is refused", () => {
  for (const bad of ["", "{", "[]", '{"schema":2,"seq":1,"channels":{}}', '{"schema":1,"seq":-1,"channels":{}}', '{"schema":1,"seq":1}']) {
    assert.throws(() => release(bad, "v0.2.5", "v0.0.2", SHA_A), /packs\.json/, bad);
  }
});

test("serializePacks is byte-stable: sorted keys, 2-space indent, LF, one trailing newline", () => {
  const prev = JSON.stringify({
    channels: { "0.3": { url: "u3", text_sha256: null, tag: "v0.0.2", pack_sha256: SHA_B }, "0.2": entry("v0.0.1", SHA_A) },
    seq: 1,
    schema: 1,
  });
  const text = r.serializePacks(release(prev, "v0.2.9", "v0.0.3", SHA_C));
  assert.ok(text.endsWith("}\n") && !text.endsWith("\n\n") && !text.includes("\r"));
  assert.deepStrictEqual(Object.keys(JSON.parse(text)), ["channels", "schema", "seq"]);
  assert.deepStrictEqual(Object.keys(JSON.parse(text).channels), ["0.2", "0.3"]);
  assert.deepStrictEqual(Object.keys(JSON.parse(text).channels["0.2"]), ["pack_sha256", "tag", "text_sha256", "url"]);
  assert.strictEqual(r.serializePacks(JSON.parse(text)), text);
});

test("the CLI packs prints the manifest of this clone's pack.json, VERSION and core-version", () => {
  const dev = repo();
  fs.writeFileSync(path.join(dev, "pack.json"), '{"sim_version":1}\n');
  const sha = require("crypto").createHash("sha256").update('{"sim_version":1}\n').digest("hex");
  const run = (...a) => execFileSync(process.execPath, [path.join(__dirname, "release.cjs"), "packs", ...a], { cwd: dev, encoding: "utf8", env: { ...process.env, GITHUB_REPOSITORY: "stella-rain/content" } });
  const first = run("-");
  assert.deepStrictEqual(JSON.parse(first), { schema: 1, seq: 1, channels: { "0.0": entry("v0.0.1", sha) } });
  fs.writeFileSync(path.join(dev, "previous.json"), first);
  assert.strictEqual(JSON.parse(run("previous.json")).seq, 2);
  fs.writeFileSync(path.join(dev, "core-version"), "f108f4f718557c7d41ce8ab7900ff5180d9e09eb\n");
  assert.throws(() => run("-"), /no minor/);
});

test("Candidate and Promote carry packs.json beside pack.json", () => {
  for (const f of ["candidate.yml", "promote.yml"]) {
    const text = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", f), "utf8");
    assert.match(text, /assets\/packs\.json/, f);
    assert.match(text, /packs\.json/, f);
  }
});
