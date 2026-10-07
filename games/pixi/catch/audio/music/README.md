# Background theme

`theme.wav` is this game's own loop: light nautical accordion and plucked strings over a soft steady rhythm.

Generated 2026-09-17 with ElevenLabs `eleven_music_v2` (30 s, 900 credits):
<https://elevenlabs.io/app/flows/gRFQ5Pf97KMTTe1mFo24>

Processing: decoded to mono 44.1 kHz, the last 2 s cross-faded back over the
opening so the seam is inaudible (28.0 s), levelled to -18 dB RMS. The build
encodes it for the browser like every other sound, and the game loops it.

It plays through its own gain, outside the eight effect voices, so it never steals a
voice from an effect, and starts and stops with the Music setting. The `music` event in `assets/audio/sounds.json` sets the level; retune it in Crash Composer → Sound Studio.
