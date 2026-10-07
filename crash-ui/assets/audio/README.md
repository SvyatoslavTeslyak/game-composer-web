# Shared betting panel sounds

Owned and played by `BettingSound` in the UI kit's `web/ui.js`.

- `click.ogg`: short muted feedback for button presses and stake controls.
- `confirm.ogg`: ascending cashout-ready tone, once on the inactive-to-active edge.
- `win.ogg`: the Market Stack ElevenLabs coin-tray jingle, shared across all Win popups. `WinSound` plays once per popup/payout, then a quieter and slightly faster coin sound at the wallet-transfer signal. Both voices reuse win.ogg and respect Sound off.

- `big_win_*.ogg`, `mega_win_*.ogg`, `epic_win_*.ogg`, `big_win_count_0.ogg`: the big-win celebration's cue for each tier (kompa: guitar, brass and percussion, growing from a 1.5 s sting to a 2.9 s finale with coin showers) and the count's coin click. Played by `ui.celebrate`, the same in every game; the second takes are disabled alternatives in Sound Studio.

Standard panels, the single CASH OUT action, and three-position controls use the same files. UI state (`settings.sound`, `canCash`, `showCash`/`goTitle`) controls playback. Games forward the intents without playing their own UI sounds.

Mono 24 kHz Vorbis; combined audio size 18443 bytes. No generated variations or original masters are bundled. `sources.json` records ElevenLabs generation IDs and prompts. Local filtering and gain changes use no generation credits.

Composer's preview builder and each game's build copy this directory with the rest of the kit into `crash-ui/`. Crate impacts, collapses, explosions and scene audio remain owned by the game.

Verification (in game-composer): `node tools/check_betting_sound.mjs` and `node tools/check_win_sound.mjs`.

`sounds.json` holds the tuned levels (dB) for click, confirm, win and win_transfer; `web/ui.js` applies them after load and keeps built-in levels if the file is missing. Edit it in Crash Composer → Sound Studio.
