# Changelog

One section per release, `## <version>`, newest first. The version is the file `VERSION`; Candidate
refuses a version without a non-empty section here and puts it in the release notes.

## 0.0.3

The pack of core v0.0.14, byte for byte, for `sim_version` 0. Damage, hit points and healing are
scaled by 100: the enemies' hit points and attacks in the time_limit and trial modes, the trial's
companion and player, the boss and its parts, the runes' and stage skills' damage, the rewards'
and expertise upgrades' healing, and the max HP run stat, which steps by 100 (it was 1). The
trial's boss has a big pattern: its golem's spiral is announced for its 40-tick telegraph.

## 0.0.2

The pack of core v0.0.13, byte for byte, for `sim_version` 0. The time_limit mode gains elite types
and an elite table that draws from them: the elite grades, the Treasure Goblin, the shrine, the
pack leader (it brings an escort and its aura raises the damage of nearby non-elite enemies) and
the mimic (an object until the main character comes near, then an elite).

## 0.0.1

The first pack: the content pack bundled with core v0.0.12, byte for byte, for `sim_version` 0.
