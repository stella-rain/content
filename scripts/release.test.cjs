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

test("checkMain: a candidate is made on main only", () => {
  assert.doesNotThrow(() => r.checkMain("refs/heads/main"));
  for (const bad of ["refs/heads/candidate/0123456789ab", "refs/heads/rc/v0.0.1-rc.1", "refs/heads/claude/x", "refs/tags/v0.0.1", ""]) {
    assert.throws(() => r.checkMain(bad), /on main only/, bad);
  }
});

test("checkCandidate wants a commit since the latest release and a main commit that is no candidate", () => {
  const ok = { commitsSince: 3, head: "aaa", rcCommits: [{ tag: "v0.0.6-rc.1", commit: "bbb" }] };
  assert.doesNotThrow(() => r.checkCandidate(ok));
  assert.doesNotThrow(() => r.checkCandidate({ ...ok, rcCommits: [] }));
  assert.throws(() => r.checkCandidate({ ...ok, commitsSince: 0 }), /no commit since the latest release/);
  assert.throws(() => r.checkCandidate({ ...ok, rcCommits: [{ tag: "v0.0.6-rc.1", commit: "aaa" }] }), /already v0\.0\.6-rc\.1/);
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

// One origin, one clone on main with VERSION 0.0.1.
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
  git(dev, "add", "-A");
  git(dev, "commit", "-q", "-m", "first");
  git(dev, "push", "-q", "origin", "main");
  return dev;
}

test("the CLI reads VERSION and the tags of the clone", () => {
  const dev = repo();
  assert.strictEqual(cli(dev, "version"), "0.0.1");
  assert.strictEqual(cli(dev, "check-version"), "");
  assert.strictEqual(cli(dev, "rc"), "v0.0.1-rc.1");
  git(dev, "tag", "v0.0.1-rc.1");
  assert.strictEqual(cli(dev, "rc"), "v0.0.1-rc.2");
  assert.strictEqual(cli(dev, "latest"), "");
  git(dev, "tag", "v0.0.1");
  assert.strictEqual(cli(dev, "latest"), "v0.0.1");
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

test("the CLI check-candidate: main only, a commit since the latest release, not already a candidate", () => {
  const dev = repo();
  const env = { ...process.env, GITHUB_REF: "refs/heads/main" };
  const run = (e, ...a) => spawnSync(process.execPath, [path.join(__dirname, "release.cjs"), ...a], { cwd: dev, encoding: "utf8", env: e });
  assert.strictEqual(run(env, "check-candidate").status, 0);
  assert.match(run({ ...env, GITHUB_REF: "refs/heads/candidate/0123456789ab" }, "check-candidate").stderr, /on main only/);
  const head = git(dev, "rev-parse", "HEAD");
  git(dev, "tag", "v0.0.1-rc.1");
  assert.match(run(env, "check-candidate").stderr, /already v0\.0\.1-rc\.1/);
  git(dev, "tag", "-d", "v0.0.1-rc.1");
  git(dev, "tag", "v0.0.1");
  assert.match(run(env, "check-candidate").stderr, /no commit since the latest release v0\.0\.1/);
  fs.writeFileSync(path.join(dev, "x"), "x");
  git(dev, "add", "-A");
  git(dev, "commit", "-q", "-m", "second");
  assert.strictEqual(run(env, "check-candidate").status, 0);
  // the main commit itself is the candidate once tagged
  git(dev, "tag", "v0.0.2-rc.1");
  assert.match(run(env, "check-candidate").stderr, /already v0\.0\.2-rc\.1/);
  assert.ok(head);
});

test("Candidate runs on main only, tags main's own commit and the guard watches rc/** only", () => {
  const wf = (f) => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", f), "utf8");
  const cand = wf("candidate.yml");
  assert.match(cand, /release\.cjs check-main/);
  assert.match(cand, /release\.cjs check-candidate/);
  assert.doesNotMatch(cand, /candidate\//);
  assert.doesNotMatch(wf("candidate-guard.yml"), /candidate\/\*\*|candidate\/\[/);
  assert.match(wf("candidate-guard.yml"), /branches: \["rc\/\*\*"\]/);
  assert.ok(!fs.existsSync(path.join(__dirname, "..", ".github", "workflows", "auto-candidate.yml")));
});

// VERSION is exactly the release version: no floor, no next-patch fallback, no stamp, no changelog.
test("a VERSION equal to the latest tag is refused, with no next-patch fallback", () => {
  const dev = repo();
  git(dev, "tag", "v0.0.1");
  assert.throws(() => cli(dev, "check-version"), /v0\.0\.1 is already released/);
  assert.strictEqual(cli(dev, "rc"), "v0.0.1-rc.1");
});

test("a VERSION below the latest tag is refused, one above it is the release", () => {
  const dev = repo();
  git(dev, "tag", "v0.0.1");
  git(dev, "tag", "v0.0.3");
  fs.writeFileSync(path.join(dev, "VERSION"), "0.0.2\n");
  assert.throws(() => cli(dev, "check-version"), /v0\.0\.2 is not above the latest release v0\.0\.3/);
  fs.writeFileSync(path.join(dev, "VERSION"), "0.0.4\n");
  assert.strictEqual(cli(dev, "check-version"), "");
  assert.strictEqual(cli(dev, "rc"), "v0.0.4-rc.1");
});

test("a VERSION above the latest tag is accepted as is, without a CHANGELOG.md", () => {
  const dev = repo();
  git(dev, "tag", "v0.0.1");
  fs.writeFileSync(path.join(dev, "VERSION"), "0.0.2\n");
  assert.strictEqual(cli(dev, "check-version"), "");
  assert.strictEqual(cli(dev, "rc"), "v0.0.2-rc.1");
  git(dev, "tag", "v0.0.2-rc.1");
  assert.strictEqual(cli(dev, "rc"), "v0.0.2-rc.2");
  for (const gone of ["final", "stamp", "notes"]) {
    assert.throws(() => cli(dev, gone), /usage: release\.cjs/, gone);
  }
});

test("Candidate makes no release commit, stamps nothing and reads no changelog; the repository has none", () => {
  const root = path.join(__dirname, "..");
  const wf = (f) => fs.readFileSync(path.join(root, ".github", "workflows", f), "utf8");
  const cand = wf("candidate.yml");
  assert.doesNotMatch(cand, /release\.cjs (stamp|final|notes)/);
  assert.doesNotMatch(cand, /CHANGELOG/i);
  assert.doesNotMatch(cand, /Release v/);
  assert.doesNotMatch(cand, /git\/commits"/);
  assert.doesNotMatch(cand, /steps\.stamp/);
  assert.doesNotMatch(cand, /STAMPED/);
  assert.doesNotMatch(cand, /TREE/);
  assert.match(cand, /release\.cjs check-version/);
  assert.match(cand, /release\.cjs version/);
  assert.match(cand, /target=\$GITHUB_SHA/);
  assert.match(wf("promote.yml"), /release\.cjs check-promote/);
  assert.ok(!fs.existsSync(path.join(root, "CHANGELOG.md")));
});

test("checkCandidate refuses only a head that is a candidate's commit", () => {
  const rcCommits = [{ tag: "v0.0.6-rc.1", commit: "bbb" }];
  assert.doesNotThrow(() => r.checkCandidate({ commitsSince: 2, head: "ccc", rcCommits }));
  assert.throws(() => r.checkCandidate({ commitsSince: 2, head: "bbb", rcCommits }), /already v0\.0\.6-rc\.1/);
});

test("the job names checksPassed leaves out are the candidate workflows' jobs", () => {
  const text = ["candidate.yml", "candidate-guard.yml"]
    .map((f) => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", f), "utf8"))
    .join("\n");
  const names = [...text.matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1]);
  assert.deepStrictEqual([...r.CANDIDATE_JOBS].sort(), names.sort());
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

function createMinisigFixture(data) {
  const crypto = require("crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const keyId = crypto.randomBytes(8);
  const pubBuf = Buffer.concat([Buffer.from([0x45, 0x64]), keyId, rawPub]);
  const pubKeyStr = pubBuf.toString("base64");

  const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sig64 = crypto.sign(null, dataBuf, privateKey);
  const sigBuf = Buffer.concat([Buffer.from([0x45, 0x64]), keyId, sig64]);
  const sigStr = sigBuf.toString("base64");

  const trustedComment = `timestamp:${Math.floor(Date.now() / 1000)}`;
  const trustedSig = crypto.sign(null, Buffer.concat([sig64, Buffer.from(trustedComment, "utf8")]), privateKey);
  const trustedSigStr = trustedSig.toString("base64");

  const minisigText = `untrusted comment: test signature\n${sigStr}\ntrusted comment: ${trustedComment}\n${trustedSigStr}\n`;
  return { pubKeyStr, minisigText, keyId: keyId.toString("hex") };
}

test("Promote workflow downloads, verifies and carries packs.json.minisig", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "promote.yml"), "utf8");
  assert.match(text, /--pattern packs\.json\.minisig/, "Promote downloads packs.json.minisig");
  assert.match(text, /MINISIGN_PUBLIC_KEY/, "Promote uses MINISIGN_PUBLIC_KEY");
  assert.match(text, /minisign/, "Promote verifies with minisign");
  assert.match(text, /assets\/packs\.json\.minisig/, "Promote carries packs.json.minisig in assets");
  assert.match(text, /Kade signs offline[\s\S]*minisign -Sm/i, "Promote documents offline signing");
  assert.doesNotMatch(text, /RWQf/, "Promote has no hard-coded public key");
  assert.match(text, /-z "\$\{MINISIGN_PUBLIC_KEY:-\}"/, "Promote guards an empty or unset MINISIGN_PUBLIC_KEY");
  assert.match(text, /::error::MINISIGN_PUBLIC_KEY/, "the guard reports with ::error::");
  const guard = text.indexOf("::error::MINISIGN_PUBLIC_KEY");
  assert.ok(guard > 0 && guard < text.indexOf("minisign -Vm"), "the guard comes before minisign runs");
  assert.doesNotMatch(text, /MINISIGN_PUBLIC_KEY:-[^}"]/, "no default value for MINISIGN_PUBLIC_KEY");
});

test("checkMinisig refuses missing packs.json.minisig", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minisig-"));
  const packsPath = path.join(dir, "packs.json");
  const sigPath = path.join(dir, "packs.json.minisig");
  fs.writeFileSync(packsPath, '{"test":true}');
  const { pubKeyStr } = createMinisigFixture('{"test":true}');
  assert.throws(() => r.checkMinisig(packsPath, sigPath, pubKeyStr), /missing/);
});

test("checkMinisig refuses invalid signature or wrong key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minisig-"));
  const packsPath = path.join(dir, "packs.json");
  const sigPath = path.join(dir, "packs.json.minisig");
  const { pubKeyStr, minisigText } = createMinisigFixture('{"test":true}');
  fs.writeFileSync(packsPath, '{"test":true}');
  fs.writeFileSync(sigPath, minisigText);

  // Tampered packs.json
  fs.writeFileSync(packsPath, '{"test":false}');
  assert.throws(() => r.checkMinisig(packsPath, sigPath, pubKeyStr), /verification failed/);

  // Wrong public key
  const other = createMinisigFixture('{"test":true}');
  assert.throws(() => r.checkMinisig(packsPath, sigPath, other.pubKeyStr), /does not match/);
});

test("checkMinisig accepts valid packs.json.minisig signature", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minisig-"));
  const packsPath = path.join(dir, "packs.json");
  const sigPath = path.join(dir, "packs.json.minisig");
  const data = '{"schema":1,"seq":1,"channels":{}}';
  const { pubKeyStr, minisigText } = createMinisigFixture(data);
  fs.writeFileSync(packsPath, data);
  fs.writeFileSync(sigPath, minisigText);
  assert.doesNotThrow(() => r.checkMinisig(packsPath, sigPath, pubKeyStr));
});

test("simulate Promote workflow asset check: missing, invalid and valid minisig", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promote-sim-"));
  const data = '{"schema":1,"seq":1,"channels":{}}';
  const packsPath = path.join(dir, "packs.json");
  const sigPath = path.join(dir, "packs.json.minisig");
  const { pubKeyStr, minisigText } = createMinisigFixture(data);
  fs.writeFileSync(packsPath, data);

  const simulateStep = (key) => {
    if (!fs.existsSync(sigPath)) {
      throw new Error("packs.json.minisig is missing from candidate release");
    }
    r.checkMinisig(packsPath, sigPath, key);
  };

  // Missing minisig -> job fails
  assert.throws(() => simulateStep(pubKeyStr), /packs\.json\.minisig is missing/);

  // Invalid minisig -> job fails
  fs.writeFileSync(sigPath, "corrupted");
  assert.throws(() => simulateStep(pubKeyStr));

  // Valid minisig -> job succeeds
  fs.writeFileSync(sigPath, minisigText);
  assert.doesNotThrow(() => simulateStep(pubKeyStr));
});
