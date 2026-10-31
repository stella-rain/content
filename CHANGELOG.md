# Changelog

One section per release, `## <version>`, newest first. The version is the file `VERSION`; Candidate
refuses a version without a non-empty section here and puts it in the release notes.

## 0.0.7

The pack of core v0.2.1, for `sim_version` 1 (it was core v0.1.0, `sim_version` 0), with `schema_version`
1. New top-level data: the weapons (giant sword, giant hammer), nine attack presets (aimed single,
aimed spread, elite slam, slam, slash, spiral, spread 5, thrust, twin shot), the simulation rules
and the six reward rarities with their lumine costs (common 1, uncommon 2, rare 3, epic 4,
legendary 6, supernova 10). The expertise weapons lose their titles and descriptions. The free
weapon and perk set of the starting unlocks and the three modes (trial, time_limit, tutorial) change. No ID of 0.0.6 is
renamed or removed.

Promote now requires a verified `packs.json.minisig` signature before it releases.

## 0.0.6

First release that carries packs.json (one channel per core minor, FT1b); the pack is unchanged, core v0.1.0's.

## 0.0.5

The pack of core v0.1.0, byte for byte, for `sim_version` 0. New files: the starting unlocks
(giant sword, Duelist perk set, Nova stage skill, the explosion, bleed and boomerang runes), four
constellations (Summer Triangle, Orion's Belt, Big Dipper, Winter Triangle, each with tiers at
2 and 3 stars) and the Stardust banking rules (time_limit and trial: bank, pay 50% and bank 50%,
cap 1000). Rewards gain 15 star rewards (the stars of the constellations and three more), a random rune
reward, the type bonus rewards (ten damage types, six rarities each), range rewards and rune
haste rewards (six rarities each), with a rune haste cap of 500 percent. Max HP is scaled by
100 again: the max HP run stat steps by 10000 (it was 100), the max HP rewards (the common one
gives 20000, was 200), the Iron Grip expertise upgrade (20000, was 200) and the trial and
tutorial player's hit points (50000, was 500). The attack speed rewards double (common 8
percent, legendary 40 percent, were 4 and 20), and run stats gain a max attack speed of 500
percent and an enemy attack damage of 10000. The damage-over-time runes (bleed, poison, burn)
tick every 20 ticks (was 30) and stack to 6 (was 5); the explosion rune hits for 2500 over a
larger radius, every 90 ticks (was 1500 every 120); the thunder rune hits for 3000 every 60
ticks (was 2000 every 90). The trial and tutorial star tiers gain a random rune weight (53, 176
and 333 from levels 1, 3 and 5). The time_limit mode's elite types resist elements (they
resisted physical), its bosses and waves are retuned, and the trial's boss is also weak to
pyro (was strike only). No ID of 0.0.4 is renamed or removed.

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
