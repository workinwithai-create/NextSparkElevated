# NextSpark Elevated

Next-level four-bar live spark desk for bedroom producers and AI-music finishers.

Elevated from NextSpark / SparkFour. Live FluidR3 chairs add hat patterns, snare ghosts, bass fills, and chord-tone piano stabs so a static loop has life and the track can finish.

**Free.**

## Next-level upgrades

- Explicit tap-to-start audio overlay
- Full visibilitychange handling: stops cleanly on hidden tab, no stacked notes
- Hardware MIDI keyboard support (Web MIDI note on/off)
- Improved envelope ramps (≥10 ms release)
- Separate folded (seamless loop) and with-tail WAV exports
- Matching multi-track MIDI with tempo + time signature
- Per-chair mute live
- User BPM / key / 4-chord persisted in localStorage
- Samples pinned to PreEight@d58301e4a494555f411a2afbc448b724136eee76
- Missing sample detection names instruments

## Features

- User BPM (60–180) and key / 4-chord progression. Persisted in localStorage.
- Lookahead scheduler on AudioContext clock (LOOKAHEAD_MS=25, SCHEDULE_AHEAD=0.12).
- Live changes (recipe, mutes, BPM, chords) apply within one bar.
- Grid-perfect 48 kHz 24-bit stereo WAV, first downbeat at sample 0, tail folded for seamless loop, peak ≤ −1 dBFS.
- No Math.random in export path. No @main / @gh-pages.

## Acceptance (rules 1–4 + section 9)

Engine follows WorkinWithAI rules 1–4. Export length is exact: for 92 BPM / 8 bars / 48 kHz → 1,001,739 samples. First transient within 1 ms of sample 0. No Math.random in export path. No @main / @gh-pages.

## Punch list

The problem: static loops have no life.  
The move: live chairs write sparks so the pocket finishes.  
Drop the folded WAV on bar 1 of your DAW. Loop is seamless.
