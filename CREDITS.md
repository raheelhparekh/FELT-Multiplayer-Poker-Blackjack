# CREDITS.md

All third-party assets and procedural audio/art specifications in FELT are documented here.

## Fonts

- **Inter** — SIL Open Font License 1.1 — https://rsms.me/inter/

## Audio

- **Procedural Web Audio Synthesis Engine** (`apps/web/src/audio/sound-engine.ts`)
  - All sound effects (card deals, flips, shuffles, chip clacks/stacks, payouts, win/blackjack chimes, busts, turn ticks) are procedurally synthesized via the standard browser Web Audio API using mathematical oscillators (sine, triangle, sawtooth) and biquad filters.
  - 100% Royalty-Free & CC0 public domain.
  - Zero external media asset downloads, zero licensing encumbrances.

## Card & Chip Art

- **FELT Procedural SVG Playing Cards** (`apps/web/src/components/CardView.tsx`)
  - Clean mathematical vectors with standard Unicode playing card suits (♠, ♥, ♦, ♣).
  - High-contrast 4-color accessibility option (Hearts: Red, Diamonds: Blue, Clubs: Green, Spades: Black).
  - 100% CC0 public domain original vector art.
- **FELT Casino Clay Chips** (`apps/web/src/components/ChipView.tsx`)
  - Procedural CSS gradients and SVG dashed inserts styled after authentic casino clay chips.
  - 100% CC0 public domain original vector art.
