#!/usr/bin/env node
// release: the commands the release workflows run (release-flow: candidate.yml, promote.yml).
// A pushed release tag reaches every player, so only a workflow makes one: Candidate tags a main
// commit v<VERSION>-rc.N and makes the branch rc/v<VERSION>-rc.N at it; Promote, run on that
// branch, adds v<VERSION> on the same commit. The version is the file VERSION (x.y.z), its notes
// the section "## <version>" of CHANGELOG.md.
//
//   version           VERSION, checked to be x.y.z
//   check-version     refuses a VERSION that has a v<VERSION> tag or is not above the latest release,
//                     and a core-version that is not a released core tag (a commit is for developing)
//   rc                the next candidate tag of VERSION: v<VERSION>-rc.1, -rc.2, ...
//   notes             the CHANGELOG.md section of VERSION; refuses a missing or empty one
//   latest            the highest release tag v<x.y.z>, or nothing
//   check-candidate B refuses unless B is candidate/<12-character sha of HEAD>, HEAD is on
//                     origin/main and origin has no other candidate/* branch
//   checks-passed ID  reads a commit's check runs (the API's JSON) on stdin; refuses unless one
//                     ran, all finished and none failed, leaving out run ID's own jobs and the
//                     candidate workflows' jobs from any run
//   check-promote R   refuses unless R is the highest rc tag of a new version above the latest
//                     release whose commit's VERSION is that version; prints the final tag
//   rc-branch B       the rc tag of a branch rc/<rc tag>, which Candidate makes at the tag's commit
//                     for Promote to run from (the GitHub app lists no tags)
//   superseded R      origin's rc branches of R's version below R, space-separated
//   released T        origin's rc branches of version T and every older one, space-separated
//   should-candidate  prints true when HEAD is a commit Candidate would accept on version grounds
//                     (VERSION unreleased and above the latest release, its CHANGELOG.md entry,
//                     core-version a tag), else false with the reason on stderr (auto-candidate.yml)
//   ci-done W...      reads a commit's workflow runs (the API's JSON) on stdin; of the workflows
//                     named W, run by a push or dispatch, prints red if one failed, waiting if one
//                     is unfinished or none exists, else ready (auto-candidate.yml)
"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");
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
  "delete the candidate branch",
  "candidate branch unchanged",
  "decide on a candidate",
  "push the candidate branch",
]);
const FAILED = new Set(["failure", "timed_out", "cancelled", "action_required", "stale", "startup_failure"]);
const PASSED = new Set(["success", "skipped", "neutral"]);

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

function changelogEntry(text, version) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === `## ${version}` || l.startsWith(`## ${version} `));
  if (start < 0) throw new Error(`CHANGELOG.md has no entry for ${version}`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).join("\n").trim();
  if (!body) throw new Error(`the CHANGELOG.md entry for ${version} is empty`);
  return body;
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

function checkCandidate(branch, head, onMain, others) {
  const m = /^candidate\/([0-9a-f]{12})$/.exec(branch);
  if (!m) throw new Error(`${branch} is not candidate/<12-character sha>`);
  if (!head.startsWith(m[1])) throw new Error(`${branch} names ${m[1]}, not HEAD ${head}`);
  if (!onMain) throw new Error(`${head} is not on origin/main`);
  if (others.length) throw new Error(`${others.join(", ")} is left over; Kade deletes it first`);
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

function ciDone(runs, names) {
  const ours = runs.filter((w) => names.includes(w.name) && (w.event === "push" || w.event === "workflow_dispatch"));
  if (ours.some((w) => w.status === "completed" && !PASSED.has(w.conclusion))) return "red";
  if (!ours.length || ours.some((w) => w.status !== "completed")) return "waiting";
  return "ready";
}

// What Candidate would refuse on version grounds, from plain values: it throws the reason.
function shouldCandidate({ version, tags, changelog, coreVersion }) {
  checkVersion(parseVersion(version), tags);
  changelogEntry(changelog, version.trim());
  checkReleasePin(coreVersion);
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

function checkCandidateHere(branch) {
  const head = git("rev-parse", "HEAD");
  let onMain = true;
  try {
    git("merge-base", "--is-ancestor", head, "origin/main");
  } catch {
    onMain = false;
  }
  const others = originBranches("candidate/*").filter((b) => b !== branch);
  checkCandidate(branch, head, onMain, others);
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    process.chdir(git("rev-parse", "--show-toplevel"));
    if (cmd === "version") console.log(readVersion());
    else if (cmd === "check-version") {
      checkVersion(readVersion(), releaseTags());
      checkReleasePin(fs.readFileSync("core-version", "utf8"));
    }
    else if (cmd === "should-candidate") {
      try {
        shouldCandidate({
          version: fs.readFileSync("VERSION", "utf8"),
          tags: releaseTags(),
          changelog: fs.readFileSync("CHANGELOG.md", "utf8"),
          coreVersion: fs.readFileSync("core-version", "utf8"),
        });
        console.log("true");
      } catch (e) {
        console.error(e.message);
        console.log("false");
      }
    }
    else if (cmd === "ci-done") console.log(ciDone(JSON.parse(fs.readFileSync(0, "utf8")).workflow_runs || [], rest));
    else if (cmd === "rc") console.log(rcTag(readVersion(), releaseTags()));
    else if (cmd === "notes") console.log(changelogEntry(fs.readFileSync("CHANGELOG.md", "utf8"), readVersion()));
    else if (cmd === "latest") console.log(latestRelease(releaseTags()));
    else if (cmd === "check-candidate") checkCandidateHere(rest[0] || "");
    else if (cmd === "checks-passed") checksPassed(JSON.parse(fs.readFileSync(0, "utf8")).check_runs || [], rest[0]);
    else if (cmd === "check-promote") console.log(checkPromote(rest[0], releaseTags(), git("show", `${rest[0]}^{commit}:VERSION`)));
    else if (cmd === "rc-branch") console.log(rcOfBranch(rest[0]));
    else if (cmd === "superseded") console.log(supersededBranches(originBranches("rc/*"), rcOfBranch(`rc/${rest[0]}`)).join(" "));
    else if (cmd === "released") {
      if (!FINAL.test(rest[0] || "")) throw new Error(`${rest[0] || "(none)"} is not a release tag`);
      console.log(releasedBranches(originBranches("rc/*"), rest[0]).join(" "));
    } else {
      throw new Error("usage: release.cjs version | check-version | rc | notes | latest | check-candidate <branch> | checks-passed <run id> | check-promote <rc tag> | rc-branch <branch> | superseded <rc tag> | released <tag> | should-candidate | ci-done <workflow>...");
    }
  } catch (e) {
    console.error(`release: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { ciDone, shouldCandidate, CANDIDATE_JOBS, parseVersion, latestRelease, checkVersion, rcTag, changelogEntry, checkCandidate, checksPassed, checkPromote, rcOfBranch, supersededBranches, releasedBranches };
