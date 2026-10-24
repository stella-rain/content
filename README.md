# Stella Rain content

Public content packs for **Stella Rain**, an action shooter for phones and computers.

- `pack.json` is the current content pack: the game's content (stats, runes, rewards, ...) as one
  JSON file. The game downloads it from the latest release:
  <https://github.com/stella-rain/content/releases/latest/download/pack.json>
- Each release also carries `pack.json.sha256`, the file's SHA-256 in `sha256sum` format, and
  `SHA256SUMS` for both files. Releases are tagged `v<version>` (see `VERSION` and `CHANGELOG.md`);
  a prerelease `v<version>-rc.N` is a candidate that no player gets. Candidate runs on `main`;
  `VERSION` is a floor: when it is at or below the latest release, the release is that tag's next
  patch, written into a `Release v<version>` commit on top of the main commit.
- Each release also carries `packs.json`, the manifest that keeps one channel per core minor, so a
  game built for one core minor finds the pack made for it:
  `{"schema":1,"seq":N,"channels":{"0.2":{"tag":"v<version>","pack_sha256":"<hex>","text_sha256":null,"url":"<pack.json URL>"}}}`.
  The channel is the `major.minor` of `core-version`; a release sets its channel and leaves the others,
  and `seq` goes up by one. `text_sha256` is `null` until the text pack exists.
- A pack names the simulation version it is for (`sim_version`) and is checked with the
  `content-pack` tool from [stella-rain/core](https://github.com/stella-rain/core) before it is
  released. The core tag in `core-version` is the one used here.

To check a pack yourself:

```sh
cargo install --git https://github.com/stella-rain/core --tag "$(cat core-version)" --bin content-pack --locked stella-rain-core
content-pack verify pack.json
```

## License

The data in this repository is dedicated to the public domain under [CC0 1.0](LICENSE).
