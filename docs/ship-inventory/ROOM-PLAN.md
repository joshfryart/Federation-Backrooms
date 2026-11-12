# Ship room plan — "Full Complement" mode

A fully staffed province-class ship (60–90 crew, 7–9 decks, see `js/ships.js`, `js/crew.js`). This plan lists every space the ship should have,
which department owns it, how it maps onto today's game rooms, and the group that gets its item inventory.
`Game` = existing room type in `js/data.js` (`ROOMS`); `NEW` = needs a new room type or a variant of an existing one.
Zones follow the deck bands in `js/ships.js`: Command (top), Habitat, Services, Engineering (keel).
Size: S ≈ 3×3 tiles, M ≈ 3×5, L ≈ 5×5, XL ≈ 7×9 (a tile is 2.5 m).

## Focus ship: USF Ontario (Cairn class)
For now the inventory targets **USF Ontario (USF-1867-ON)**, a Cairn-class deep-range explorer: a stack of discs of different sizes, nine decks, 310 m (see `js/ships.js`).
Item lists are written ship-neutral, so they apply to Ontario and to the other Cairn ship, USF Québec. Ontario's identity colours (hull 0xb9b2a0 sand, accent 0xd9733a orange)
and its role (deep-range exploration: long missions, big science and stores capacity) decide what to emphasise in later passes. Other classes come after Ontario is done.
Fit to the hull: round decks with a central core (lift, tubes, services) and rooms arranged around the rim, so Ontario's rooms read as arcs and rings, not rectangles.

## Group A — Bridge & command (Command zone)
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 1 | Bridge | Command / Flight | L | bridge |
| 2 | Ready Room (captain's office) | Command | S | NEW |
| 3 | Briefing / Conference Room | Command | M | NEW |
| 4 | Auxiliary Control (secondary bridge) | Command / Flight | M | NEW |
| 5 | Observation Lounge | Command / Services | M | NEW |

## Group B — Command quarters & officer berths
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 6 | Captain's Quarters (suite) | Command | M | quarters (variant) |
| 7 | Senior Officer's Quarters (single cabin) | all | S | quarters |
| 8 | Officers' Wardroom | Services | M | NEW |

## Group C — Crew quarters & personal spaces
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 9 | Crew Quarters, standard two-berth | all | S | quarters |
| 10 | Junior Bunk Bay, four-berth | all | M | quarters (variant) |
| 11 | Washroom / Sonic Showers (head) | Services | S | NEW |
| 12 | Laundry & Tailoring | Services | S | NEW |
| 13 | Crew Lounge (recreation) | Services | M | NEW |
| 14 | Library & Quiet Room | Services / Medical | S | NEW |

## Group D — Food & stores
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 15 | Galley (kitchen) | Services | M | mess |
| 16 | Crew Mess (dining hall) | Services | L | mess (big) |
| 17 | Cold Store & Dry Store | Services | S | NEW |
| 18 | Replicator Hall | Services | S | NEW |
| 19 | Quartermaster's Depot | Services | M | NEW |

## Group E — Medical
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 20 | Sickbay, main ward | Medical | M | sickbay |
| 21 | Surgery & Intensive Care | Medical | S | NEW |
| 22 | Medical Lab & Pharmacy | Medical | S | NEW |
| 23 | Quarantine / Isolation Ward | Medical | S | NEW |
| 24 | Counselling Office | Medical | S | NEW |
| 25 | Morgue | Medical | S | NEW |

## Group F — Sciences
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 26 | General Science Lab | Sciences | L | NEW |
| 27 | Astrometrics (stellar cartography) | Sciences | L | NEW |
| 28 | Xenobiology / Life Sciences Lab | Sciences | M | NEW |
| 29 | Physical Sciences Lab (geology, chemistry, materials) | Sciences | M | NEW |
| 30 | Sensor Control Room | Sciences | S | NEW |
| 31 | Arboretum | Sciences | L | arboretum |
| 32 | Hydroponics Grow Deck | Sciences | L | NEW |

## Group G — Security & defence
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 33 | Security Office | Security | M | NEW |
| 34 | Armory | Security | S | NEW |
| 35 | Brig | Security | M | NEW |
| 36 | Defence Systems Bay (weapons control, torpedo magazine) | Security / Flight | M | NEW |

## Group H — Operations, computing & transport
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 37 | Operations Centre | Operations | M | NEW |
| 38 | Computer Core | Operations | M | NEW |
| 39 | Communications Room (subspace relay) | Operations | S | NEW |
| 40 | Transporter Room, main | Operations | S | transporter |
| 41 | Cargo Transporter Room | Operations | S | transporter |
| 42 | Holo-Playroom | Services | L | holodeck |
| 43 | Fitness Centre | Services | M | NEW |

## Group I — Engineering core
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 44 | Main Engineering | Engineering | L–XL | engineering |
| 45 | Reactor Core Chamber | Engineering | L | NEW (hosts warp core) |
| 46 | Auxiliary Engineering / Impulse Engine Room | Engineering | M | NEW |
| 47 | Power Distribution Hub (EPS) | Engineering | S | NEW |
| 48 | Gravity Plating Generator Room | Engineering | S | NEW |

## Group J — Engineering support
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 49 | Life Support Plant | Engineering | M | NEW |
| 50 | Coolant & Water Reclamation Plant | Engineering | M | NEW |
| 51 | Waste Processing & Recycling | Engineering / Services | M | NEW |
| 52 | Machine Shop & Fabrication | Engineering | M | NEW |
| 53 | Spare Parts Stores & Tool Crib | Engineering | M | NEW |
| 54 | Damage Control Station | Engineering / Security | S | NEW |

## Group K — Flight, cargo & hull access
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 55 | Shuttlebay | Flight | XL | shuttlebay |
| 56 | Hangar Control Room | Flight | S | NEW |
| 57 | Shuttle Maintenance Bay | Flight / Engineering | M | NEW |
| 58 | EVA Prep, Suit Room & Airlock | Flight / Security | S | NEW |
| 59 | Escape Pod Bay | Flight | S | NEW |
| 60 | Cargo Bay | Services | XL | cargo |
| 61 | Hazmat & Secure Cargo | Services / Security | M | NEW |

## Group L — Circulation
| # | Space | Dept | Size | Game |
|---|---|---|---|---|
| 62 | Main Corridors (ring and cross, each zone's finish) | all | — | corridor |
| 63 | Jiffy Tubes (maintenance crawlways) and junction boxes | Engineering | — | jefferies |
| 64 | Tubelift lobby, car and shaft | Engineering | — | lift |
| 65 | Ladder wells, hatches and emergency stairs | Engineering | — | tubes/ladders |
| 66 | Junction alcoves, fire stations and emergency locker bays (corridor furniture) | Engineering / Security | — | corridor decor |

## Group M — Added from the first inventory pass (agents' gap reports)
Spaces the first twelve agents found missing. M1–M4 are the work batches. More may be added as the remaining groups report.
| # | Space | Dept | Size | Game | Batch |
|---|---|---|---|---|---|
| 67 | Guest / Diplomatic Quarters (suite) | Command / Services | M | quarters (variant) | M1 |
| 68 | Ship's Office (yeoman, records, first officer's office) | Command / Operations | M | NEW | M1 |
| 69 | Chapel / Reflection Room | Services | S | NEW | M1 |
| 70 | Barber & Grooming Shop | Services | S | NEW | M1 |
| 71 | Wardroom Pantry | Services | S | NEW | M1 |
| 72 | Zapper Range (weapons qualification) | Security | M | NEW | M2 |
| 73 | Deflector Screen Generator Room | Engineering / Security | M | NEW | M2 |
| 74 | Zapper-Bank Emitter & Capacitor Compartments | Security / Engineering | S | NEW | M2 |
| 75 | Security Interview & Forensics Lab | Security | S | NEW | M2 |
| 76 | Ship's Store & Crew Bar | Services | M | NEW | M2 |
| 77 | Medical Staff Locker Room & Break Room | Medical | S | NEW | M3 |
| 78 | Outpatient Exam Room | Medical | S | NEW | M3 |
| 79 | Central Sterile & Medical Stores | Medical | S | NEW | M3 |
| 80 | Imaging Suite (full-body scanner) | Medical | S | NEW | M3 |
| 81 | Medical Hologram Equipment Closet (emitter matrix hardware) | Medical | S | NEW | M3 |
| 82 | Galley Waste Holding | Services | S | NEW | M4 |
| 83 | Custodial Closet (one per deck) | Services | S | NEW | M4 |
| 84 | Public Crew Head (one per deck, near the lift lobby) | Services | S | NEW | M4 |
| 85 | EPS & Data Riser Room (one per deck) | Engineering / Operations | S | NEW | M4 |
| 86 | Hull Access Alcove & Spare Locker Bay (deck-edge storage ring) | Engineering | S | NEW | M4 |
| 87 | Family / Couple's Quarters | all | M | quarters (variant) | M1 |
| 88 | Crew Baggage & Linen Store | Services | S | NEW | M4 |

Count: 66 spaces in 12 groups (A–L) plus 22 added spaces in Group M (88 in all). Existing game rooms covered: bridge, engineering, sickbay, mess, transporter, shuttlebay, cargo, holodeck, quarters, arboretum, jefferies.
