# Changelog

One section per release, `## <version>`, newest first. The version is the file `VERSION`; Candidate
refuses a version without a non-empty section here and puts it in the release notes.

## 0.0.4

The pack of core v0.0.15, byte for byte, for `sim_version` 0. New files: the perk sets (Vanguard,
Duelist, Scout, Scholar), the difficulties (easy, normal, hard, rainy: hit point and damage
percents, a rarity range, easy's 10-minute Time Limit, rainy's own Stardust tiers) and the
tutorial mode, a three-minute stage. The Time Limit mode gains bosses (four mid-bosses and the
core pair, with the elite call by boss time and a list of no-call times), mid-boss hit points
by slot (100%, 130%, 160%), the six regular enemy roles in its waves (swarmer, chaser, ranged
shooter, tank, exploder, splitter), a level table, and a Stardust tier table (100% rising to
150% by the fifth 5-minute step). Stardust earners: regular kills 10, elites 200, bosses 2,000,
the Treasure Goblin 10,000, a won shrine 200, a summon 10. Rewards gain the uncommon, epic and
supernova rarities, and ordinary rewards stack by rarity: 5 common, 4 uncommon, 3 rare, 2
epic, legendary and supernova (legendary was 1). The trial gains a heal block (a boss kill
heals a quarter, a regular kill may drop a heal pickup), and the elite mid fires an aimed
spread. The expertise weapons are the giant sword and the giant hammer, each with three styles
and five common upgrades; run stats gain stun rules (60 ticks of immunity, elites take 50%).

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
