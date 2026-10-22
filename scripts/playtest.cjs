#!/usr/bin/env node
// playtest: plays this checkout's pack.json in a debug build of the side-by-side app (ADR-131).
//
//   node scripts/playtest.cjs [--app ../app] [--profile test-env] [--build]
//
// It refuses unless the app's core pin (godot-ext/Cargo.toml, `rev` or `tag` of stella-rain-core)
// equals `core-version`; runs `content-pack verify pack.json` when content-pack is on PATH (else
// says how to install it at that ref); with --build runs the app's debug build (cargo build
// --features record in godot-ext); then launches Godot on the app with --content-path and
// --profile (debug builds only, ADR-104). The Godot binary is $GODOT, else `godot` on PATH.
// It changes nothing in either checkout; the profile keeps the pack, save and replays apart.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { readPin } = require("./core_pin.cjs");

const ROOT = path.join(__dirname, "..");
const PROFILE = /^[A-Za-z0-9_-]{1,40}$/;
const CORE_URL = "https://github.com/stella-rain/core";

function parseArgs(argv) {
  const opts = { app: "../app", profile: "test-env", build: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--build") opts.build = true;
    else if (a === "--app" || a === "--profile") {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = argv[++i];
    } else throw new Error(`unknown option ${a}`);
  }
  if (!PROFILE.test(opts.profile)) throw new Error("--profile is 1 to 40 letters, digits, - or _");
  return opts;
}

// The app pins core in godot-ext/Cargo.toml as `stella-rain-core = { git = ..., rev|tag = ... }`,
// in [dependencies] and again in [dev-dependencies]; both must name the same ref.
function appPin(cargoToml) {
  const pins = new Set();
  let found = 0;
  for (const line of cargoToml.split("\n")) {
    if (!/^\s*stella-rain-core\s*=/.test(line)) continue;
    found++;
    const m = /\b(rev|tag)\s*=\s*"([^"]+)"/.exec(line);
    if (!m) throw new Error("the app's stella-rain-core has neither rev or tag (a branch pin cannot be play-tested)");
    pins.add(`${m[1] === "rev" ? "commit" : "tag"} ${m[2]}`);
  }
  if (!found) throw new Error("no stella-rain-core dependency in godot-ext/Cargo.toml");
  if (pins.size > 1) throw new Error(`the app's stella-rain-core pins disagree: ${[...pins].join(", ")}`);
  const [kind, ref] = [...pins][0].split(" ");
  return { kind, ref };
}

function checkPins(content, app) {
  if (content.kind !== app.kind || content.ref !== app.ref) {
    throw new Error(`core-version holds ${content.kind} ${content.ref}, but the app pins core ${app.kind} ${app.ref}; play-test needs them equal (bump the app's pin, or set core-version to it, then try again)`);
  }
}

function installHint(pin) {
  return `cargo install --git ${CORE_URL} ${pin.kind === "tag" ? "--tag" : "--rev"} ${pin.ref} --bin content-pack`;
}

function godotBinary(env) {
  return env.GODOT || "godot";
}

function buildCommand(app) {
  return { cmd: "cargo", args: ["build", "--features", "record"], cwd: path.join(app, "godot-ext") };
}

function launchCommand(godot, app, packPath, profile) {
  return { cmd: godot, args: ["--path", path.join(app, "godot"), "--", `--content-path=${packPath}`, `--profile=${profile}`] };
}

function run({ cmd, args, cwd }) {
  return spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
}

function main(argv, env) {
  const opts = parseArgs(argv);
  const app = path.resolve(ROOT, opts.app);
  const pack = path.join(ROOT, "pack.json");
  const content = readPin(ROOT);
  const cargo = path.join(app, "godot-ext", "Cargo.toml");
  if (!fs.existsSync(cargo)) throw new Error(`${cargo} not found; --app names the app checkout (default ../app)`);
  checkPins(content, appPin(fs.readFileSync(cargo, "utf8")));

  const verify = spawnSync("content-pack", ["verify", pack], { stdio: "inherit" });
  if (verify.error && verify.error.code === "ENOENT") {
    throw new Error(`content-pack is not on PATH; install it at this ref and run again:\n  ${installHint(content)}`);
  }
  if (verify.status !== 0) throw new Error("content-pack verify refused pack.json; fix it before play-testing");

  if (opts.build) {
    const built = run(buildCommand(app));
    if (built.error || built.status !== 0) throw new Error("the app's debug build failed");
  }
  const launch = launchCommand(godotBinary(env), app, pack, opts.profile);
  console.log(`playtest: ${launch.cmd} ${launch.args.join(" ")}`);
  const played = run(launch);
  if (played.error && played.error.code === "ENOENT") {
    throw new Error(`Godot not found (${launch.cmd}); set GODOT to the Godot 4 binary or put it on PATH`);
  }
  return played.status === null ? 1 : played.status;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2), process.env));
  } catch (e) {
    console.error(`playtest: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { parseArgs, appPin, checkPins, installHint, godotBinary, buildCommand, launchCommand };
