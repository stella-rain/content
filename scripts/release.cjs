#!/usr/bin/env node
// release: the commands the release workflows run (release-flow: candidate.yml, promote.yml).
// A pushed release tag reaches every player, so only a workflow makes one. VERSION is exactly the
// release version: Candidate, run on main, refuses unless it is above the latest release tag, tags
// the main commit itself v<VERSION>-rc.N and makes the branch rc/v<VERSION>-rc.N at that commit;
// Promote, run on that branch, adds v<VERSION> on the same commit. Nothing is stamped or committed.
//
//   version           VERSION, checked to be x.y.z
//   check-main        refuses unless GITHUB_REF is refs/heads/main
//   check-candidate   refuses unless there is a commit since the latest release and HEAD is not
//                     a candidate's commit
//   check-version     refuses a core-version that is not a released core tag (a commit is for
//                     developing) and a VERSION that is not above the latest release
//   rc                the next candidate tag of VERSION: v<VERSION>-rc.1, -rc.2, ...
//   latest            the highest release tag v<x.y.z>, or nothing
//   checks-passed ID  reads a commit's check runs (the API's JSON) on stdin; refuses unless one
//                     ran, all finished and none failed, leaving out run ID's own jobs and the
//                     candidate workflows' jobs from any run
//   check-promote R   refuses unless R is the highest rc tag of a new version above the latest
//                     release whose commit's VERSION is that version; prints the final tag
//   rc-branch B       the rc tag of a branch rc/<rc tag>, which Candidate makes at the tag's commit
//                     for Promote to run from (the GitHub app lists no tags)
//   superseded R      origin's rc branches of R's version below R, space-separated
//   released T        origin's rc branches of version T and every older one, space-separated
//   packs PREV        prints packs.json for this release: PREV is the previous release's packs.json
//                     (a file, or - for none); its channel for the core-version's major.minor is set
//                     to v<VERSION> and pack.json's SHA-256, seq goes up by one (needs GITHUB_REPOSITORY)
//   check-minisig P S K verifies packs.json P against minisig S using public key K (an independent
//                     verifier; Promote's sign job verifies with minisign itself and calls this no more)
"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const { checkReleasePin } = require("./core_pin.cjs");

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const FINAL = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;
const CANDIDATE = /^(v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-rc\.(\d+)$/;
const RC_BRANCH = /^rc\/(v\d+\.\d+\.\d+-rc\.\d+)$/;
// The jobs of candidate.yml and candidate-guard.yml: their check runs on a main commit, from this
// run or an earlier candidate there, are not the commit's CI.
const CANDIDATE_JOBS = new Set([
  "verify and sums",
  "rc tag and prerelease",
  "candidate branch unchanged",
]);
const FAILED = new Set(["failure", "timed_out", "cancelled", "action_required", "stale", "startup_failure"]);

function parseVersion(text) {
  const v = String(text).trim();
  if (!VERSION.test(v)) throw new Error(`'${v}' is not a version x.y.z`);
  return v;
}

function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

function latestRelease(tags) {
  const finals = tags.filter((t) => FINAL.test(t));
  return finals.reduce((best, t) => (!best || compareVersions(t, best) > 0 ? t : best), "");
}

function checkVersion(version, tags) {
  const tag = `v${version}`;
  if (tags.includes(tag)) throw new Error(`${tag} is already released`);
  const latest = latestRelease(tags);
  if (latest && compareVersions(tag, latest) <= 0) throw new Error(`${tag} is not above the latest release ${latest}`);
}

function checkMain(ref) {
  if (ref !== "refs/heads/main") throw new Error(`a candidate is made on main only; this run is on ${ref || "(no ref)"}`);
}

function candidates(final, tags) {
  return tags
    .map((t) => CANDIDATE.exec(t))
    .filter((m) => m && m[1] === final)
    .map((m) => Number(m[2]));
}

function rcTag(version, tags) {
  const final = `v${version}`;
  return `${final}-rc.${Math.max(0, ...candidates(final, tags)) + 1}`;
}

function rcOfBranch(branch) {
  const m = RC_BRANCH.exec(branch || "");
  if (!m) throw new Error(`${branch || "(none)"} is not rc/<rc tag>`);
  return m[1];
}

function rcBranches(branches) {
  return branches
    .map((b) => [b, RC_BRANCH.exec(b)])
    .filter(([, m]) => m)
    .map(([b, m]) => [b, CANDIDATE.exec(m[1])])
    .filter(([, m]) => m);
}

function supersededBranches(branches, rc) {
  const [, final, n] = CANDIDATE.exec(rc);
  return rcBranches(branches)
    .filter(([, m]) => m[1] === final && Number(m[2]) < Number(n))
    .map(([b]) => b);
}

function releasedBranches(branches, final) {
  return rcBranches(branches)
    .filter(([, m]) => compareVersions(m[1], final) <= 0)
    .map(([b]) => b);
}

// rcCommits: [{tag, commit}] of every candidate tag. A candidate's commit is main's own commit.
function checkCandidate({ commitsSince, head, rcCommits, latest = "" }) {
  if (commitsSince < 1) throw new Error(`no commit since the latest release${latest ? ` ${latest}` : ""}; nothing to release`);
  const same = rcCommits.find((c) => c.commit === head);
  if (same) throw new Error(`this commit is already ${same.tag}`);
}

function checksPassed(runs, runId) {
  const own = `/actions/runs/${runId}/`;
  const others = runs.filter((c) => !String(c.details_url || "").includes(own) && !CANDIDATE_JOBS.has(c.name));
  if (!others.length) throw new Error("no check run on this commit besides this run");
  const bad = others
    .filter((c) => c.status !== "completed" || FAILED.has(c.conclusion))
    .map((c) => `${c.name}: ${c.status === "completed" ? c.conclusion : c.status}`);
  if (bad.length) throw new Error(`checks not passed: ${bad.join("; ")}`);
}

function checkPromote(rc, tags, versionAtRc) {
  const m = CANDIDATE.exec(rc || "");
  if (!m) throw new Error(`${rc || "(none)"} is not a candidate tag vX.Y.Z-rc.N`);
  const final = m[1];
  const highest = Math.max(...candidates(final, tags), Number(m[2]));
  if (highest > Number(m[2])) throw new Error(`${final}-rc.${highest} is newer than ${rc}`);
  checkVersion(final.slice(1), tags);
  const version = String(versionAtRc).trim();
  if (version !== final.slice(1)) throw new Error(`VERSION at ${rc} is '${version}', not '${final.slice(1)}'`);
  return final;
}

// packs.json (DS49 D-FETCH): {"schema":1,"seq":N,"channels":{"<major.minor>":{tag,pack_sha256,
// text_sha256,url}}}, one channel per core minor, so an app finds the pack of its own core minor.
function channelKey(coreVersion) {
  const m = /^v?(\d+)\.(\d+)\.\d+$/.exec(String(coreVersion).trim());
  if (!m) throw new Error(`core-version '${String(coreVersion).trim()}' has no minor: a channel needs a core tag vX.Y.Z`);
  return `${m[1]}.${m[2]}`;
}

// The only place the pack's download URL is built (D-ORIGIN moves the host later).
function packUrl(repo, tag) {
  return `https://github.com/${repo}/releases/download/${tag}/pack.json`;
}

function parsePacks(text) {
  if (text === null || text === undefined) return { schema: 1, seq: 0, channels: {} };
  let p;
  try {
    p = JSON.parse(text);
  } catch {
    throw new Error("the previous packs.json is not JSON");
  }
  const ok = p && typeof p === "object" && p.schema === 1 && Number.isInteger(p.seq) && p.seq >= 0 &&
    p.channels && typeof p.channels === "object" && !Array.isArray(p.channels);
  if (!ok) throw new Error("the previous packs.json is not schema 1 with a seq and channels");
  return p;
}

function packsManifest({ previous, coreVersion, tag, packSha256, textSha256 = null, repo }) {
  const key = channelKey(coreVersion);
  const prev = parsePacks(previous);
  const entry = { tag, pack_sha256: packSha256, text_sha256: textSha256, url: packUrl(repo, tag) };
  return { schema: 1, seq: prev.seq + 1, channels: { ...prev.channels, [key]: entry } };
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

function serializePacks(manifest) {
  return `${JSON.stringify(sortKeys(manifest), null, 2)}
`;
}

function packsHere(prevPath) {
  const previous = prevPath === "-" ? null : fs.readFileSync(prevPath, "utf8");
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is not set");
  return serializePacks(packsManifest({
    previous,
    coreVersion: fs.readFileSync("core-version", "utf8"),
    tag: `v${readVersion()}`,
    packSha256: crypto.createHash("sha256").update(fs.readFileSync("pack.json")).digest("hex"),
    repo,
  }));
}

// Minisign verification. Detached signature packs.json.minisig; an independent check, no workflow calls it.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function parseMinisignPublicKey(pubKeyStr) {
  if (!pubKeyStr || typeof pubKeyStr !== "string") throw new Error("public key is required");
  const b = Buffer.from(pubKeyStr.trim(), "base64");
  if (b.length !== 42) throw new Error(`minisign public key must be 42 bytes, got ${b.length}`);
  if (b[0] !== 0x45 || b[1] !== 0x64) throw new Error("minisign public key algorithm must be 'Ed'");
  const keyId = b.subarray(2, 10);
  const rawPub = b.subarray(10, 42);
  const keyObj = crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, rawPub]),
    format: "der",
    type: "spki",
  });
  return { keyId, keyObj };
}

function verifyMinisig(data, sigText, pubKeyStr) {
  const { keyId, keyObj } = parseMinisignPublicKey(pubKeyStr);
  if (!sigText || typeof sigText !== "string") throw new Error("signature is required");
  const lines = sigText.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("minisig file must have at least 2 lines");
  const sigBytes = Buffer.from(lines[1].trim(), "base64");
  if (sigBytes.length !== 74) throw new Error(`minisig signature line must be 74 bytes, got ${sigBytes.length}`);
  if (sigBytes[0] !== 0x45 || sigBytes[1] !== 0x64) throw new Error("signature algorithm must be 'Ed'");
  const sigKeyId = sigBytes.subarray(2, 10);
  if (!keyId.equals(sigKeyId)) throw new Error("signature key id does not match public key id");
  const rawSig = sigBytes.subarray(10, 74);
  const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const ok = crypto.verify(null, dataBuf, keyObj, rawSig);
  if (!ok) throw new Error("signature verification failed");

  let trustedComment = null;
  if (lines.length >= 4 && lines[2].startsWith("trusted comment: ")) {
    trustedComment = lines[2].slice("trusted comment: ".length);
    const commentSigBytes = Buffer.from(lines[3].trim(), "base64");
    if (commentSigBytes.length === 64) {
      const commentPayload = Buffer.concat([rawSig, Buffer.from(trustedComment, "utf8")]);
      const commentOk = crypto.verify(null, commentPayload, keyObj, commentSigBytes);
      if (!commentOk) throw new Error("trusted comment signature verification failed");
    }
  }

  return { verified: true, keyId: keyId.toString("hex"), trustedComment };
}

function checkMinisig(packsFile, sigFile, pubKeyStr) {
  if (!fs.existsSync(sigFile)) throw new Error("packs.json.minisig is missing");
  if (!fs.existsSync(packsFile)) throw new Error("packs.json is missing");
  const data = fs.readFileSync(packsFile);
  const sigText = fs.readFileSync(sigFile, "utf8");
  return verifyMinisig(data, sigText, pubKeyStr);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function releaseTags() {
  return git("tag", "-l", "v*").split("\n").filter(Boolean);
}

function readVersion() {
  return parseVersion(fs.readFileSync("VERSION", "utf8"));
}
function originBranches(pattern) {
  return git("ls-remote", "--heads", "origin", pattern)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("refs/heads/")[1]);
}

function checkCandidateHere() {
  checkMain(process.env.GITHUB_REF);
  const head = git("rev-parse", "HEAD");
  const latest = latestRelease(releaseTags());
  const commitsSince = Number(git("rev-list", "--count", latest ? `refs/tags/${latest}..HEAD` : "HEAD"));
  const rcCommits = releaseTags().filter((t) => CANDIDATE.test(t)).map((tag) => {
    return { tag, commit: git("rev-parse", `refs/tags/${tag}^{commit}`) };
  });
  checkCandidate({ commitsSince, head, rcCommits, latest });
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    process.chdir(git("rev-parse", "--show-toplevel"));
    if (cmd === "version") console.log(readVersion());
    else if (cmd === "check-main") checkMain(process.env.GITHUB_REF);
    else if (cmd === "check-candidate") checkCandidateHere();
    else if (cmd === "check-version") {
      checkReleasePin(fs.readFileSync("core-version", "utf8"));
      checkVersion(readVersion(), releaseTags());
    }
    else if (cmd === "packs") process.stdout.write(packsHere(rest[0] || "-"));
    else if (cmd === "rc") console.log(rcTag(readVersion(), releaseTags()));
    else if (cmd === "latest") console.log(latestRelease(releaseTags()));
    else if (cmd === "checks-passed") checksPassed(JSON.parse(fs.readFileSync(0, "utf8")).check_runs || [], rest[0]);
    else if (cmd === "check-promote") console.log(checkPromote(rest[0], releaseTags(), git("show", `${rest[0]}^{commit}:VERSION`)));
    else if (cmd === "rc-branch") console.log(rcOfBranch(rest[0]));
    else if (cmd === "superseded") console.log(supersededBranches(originBranches("rc/*"), rcOfBranch(`rc/${rest[0]}`)).join(" "));
    else if (cmd === "released") {
      if (!FINAL.test(rest[0] || "")) throw new Error(`${rest[0] || "(none)"} is not a release tag`);
      console.log(releasedBranches(originBranches("rc/*"), rest[0]).join(" "));
    }
    else if (cmd === "check-minisig") checkMinisig(rest[0], rest[1], rest[2]);
    else {
      throw new Error("usage: release.cjs version | check-main | check-candidate | check-version | rc | latest | checks-passed <run id> | check-promote <rc tag> | rc-branch <branch> | superseded <rc tag> | released <tag> | packs <previous packs.json or -> | check-minisig <packs.json> <packs.json.minisig> <pubkey>");
    }
  } catch (e) {
    console.error(`release: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { channelKey, packUrl, packsManifest, serializePacks, CANDIDATE_JOBS, parseVersion, latestRelease, checkMain, checkVersion, rcTag, checkCandidate, checksPassed, checkPromote, rcOfBranch, supersededBranches, releasedBranches, parseMinisignPublicKey, verifyMinisig, checkMinisig };
