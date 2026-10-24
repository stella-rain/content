# Stella Rain: content

The game's content packs. `pack.json` holds the current pack; a GitHub release publishes it to
every player. Data only: no code of the game lives here. CC0 1.0 (`LICENSE`).

## This repository is public

- Private planning goes in `stella-rain/app` issues, never here; nothing here names internal
  URLs or personal data. Actions logs and issues are public too.
- Architecture decisions live in the private app repository; cite them by number (ADR-080),
  copy no text from them.

## The pack

- `pack.json` is the content pack of ADR-080: values only (numbers, lists, ids), no code and no
  schema. The schema and the parser live in `stella-rain/core` (`schema/pack.schema.json`,
  `src/pack.rs`); change them there first and bump `core-version` here.
- A pack names the `sim_version` it is for. Content that needs new rules is a new `sim_version`
  in core first; never edit a released pack to fit rules it was not made for.
- Released content IDs are never renamed or removed, only deprecated (ADR-026).
- A pack is hashed as its exact bytes (SHA-256): keep it LF, and it is written by core's
  `content-pack export`, never by hand or re-formatted by an editor.
- A pack is untrusted input to the game; `content-pack verify` is the gate, not a promise.

## Core pin

- `core-version` names the core ref whose `content-pack` validates packs here: a release tag
  (`v0.0.15`) or, while developing, a full 40-hex commit on core's `main` (ADR-131, as ADR-125
  for the app). `scripts/core_pin.cjs kind|ref` reads it and refuses anything else. CI installs
  `content-pack` at whatever it names (`--tag` for a tag, `--rev` for a commit).
- A content release needs a tag: `release.cjs check-version` (Candidate) refuses a commit. The
  release's version PR sets the tag the latest app release pins.
- `core-version` is set by core's publish PR together with `pack.json`; a bump alone is not made
  here (a pin whose `content-pack verify` fails on the pack is a core bug: fix it in core).

## Publish-only (D-REPO, ADR-131)

- Core is the only writer of balance numbers. They are tuned and play-tested in core's `tune/`
  lane; there is no hand-authored pack and no balancing on this side.
- `pack.json` and `core-version` change only through core's publish PR: branch
  `bot/publish-<ref>`, title `Publish core <version>`, opened by core's `content-publish.yml`
  on a core release. Never edit `pack.json` by hand; a PR that does is wrong.
- Provenance (`checks.yml`): `content-pack export` at `core-version` must equal `pack.json`
  byte for byte. `scripts/provenance.cjs applies` decides whether it runs: it is skipped while
  `core-version` is `v0.1.0` or older (the last hand-authored pack, before the first publish
  PR), and never skipped after. Merge the publish PR, then follow the release flow.
- Two-way sync with core's `content/` stays dropped; nothing here syncs back.

## Release

- Follow `release-flow`. The version is `VERSION` (x.y.z, tags `v<version>`); its notes are the
  `## <version>` section of `CHANGELOG.md`. The app fetches the latest release's `pack.json`
  (`https://github.com/stella-rain/content/releases/latest/download/pack.json`); each release
  carries `pack.json`, `pack.json.sha256` and `SHA256SUMS`, and those names never change.

## Gates

| Part | Gate |
|---|---|
| `pack.json` | `content-pack verify pack.json` at the ref in `core-version` (exit 0; CI: `checks.yml`) |
| `scripts/*.cjs` | `node --test scripts/*.test.cjs` (CI: `release-script.yml`) |
| Workflows | YAML parses; `actionlint` with shellcheck (CI: `actionlint.yml`); NOT VERIFIED until they have run on GitHub |
| `CLAUDE.md`, `AGENTS.md` | `python3 ../.github/scripts/claude_md_check.py .` (CI runs it too); `AGENTS.md` at most 100 lines |
| Line endings, secrets | CI `eol-check` and `repo-check` (`git ls-files --eol` shows no CRLF) |

## State

- Work is tracked in `stella-rain/app` issues; this repository's issues are not synced to the
  organization Project. No `MEMORY.md`, no handoff files.
- What a change did, what was verified and the wrong turns: the PR, or the commit body.

## Version control

- Work on `claude/<task>`; one task, one PR, which says `Part of stella-rain/app#N` or the
  issue it closes. A PR that touches `.github/workflows/`, `AGENTS.md` or `CLAUDE.md` is a
  draft for Kade.
- Never commit to `main`; never rewrite pushed history.

## Overrides of global rules

- **No auto-merge.** Kade merges every PR here by hand, since a merged pack reaches every
  player once he promotes it. Do not enable GitHub auto-merge.
- `CLAUDE.md` holds only `@AGENTS.md`.
