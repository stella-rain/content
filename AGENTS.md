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
- A pack is hashed as its exact bytes (SHA-256): keep it LF, and write it with
  `content-pack export` or by hand, never re-formatted by an editor.
- A pack is untrusted input to the game; `content-pack verify` is the gate, not a promise.

## Core pin

- `core-version` holds the core tag (`v0.0.12`) whose `content-pack` validates packs here and
  that the app pins. CI installs `content-pack` from exactly that tag.
- To bump it: change `core-version` only, run `content-pack verify pack.json` with the new
  tag, and say in the PR why. A bump that makes the current pack invalid also ships a fixed pack.

## Release

- Follow `release-flow`. The version is `VERSION` (x.y.z, tags `v<version>`); its notes are the
  `## <version>` section of `CHANGELOG.md`. The app fetches the latest release's `pack.json`
  (`https://github.com/stella-rain/content/releases/latest/download/pack.json`); each release
  carries `pack.json`, `pack.json.sha256` and `SHA256SUMS`, and those names never change.

## Gates

| Part | Gate |
|---|---|
| `pack.json` | `content-pack verify pack.json` at the tag in `core-version` (exit 0; CI: `checks.yml`) |
| `scripts/release.cjs` | `node --test scripts/release.test.cjs` (CI: `release-script.yml`) |
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
