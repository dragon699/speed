# Engine sound research (2026-11-10)

Two research passes: how open-source projects make engine sound realistic (code read, not READMEs), and which
recordings are legally usable. teslasound.io was not inspected (paid product); its site states it synthesises
"one pulse at a time" (procedural), not loops.

## Techniques

| Technique | How | Projects |
|---|---|---|
| Single loop, pitched | one recording, rate = rpm / recorded rpm | Speed Dreams/TORCS, Rigs of Rods default |
| Idle + rev pair, phase-locked | equal cycle count + length, shared read index, unpitched per-firing "knock" | Rc_Engine_Sound_ESP32 |
| Multi-loop crossfade (rpm × load) | N steady-rpm loops, neighbours crossfaded, on/off-load sets | VDrift, Stunt Rally 3, Rigs of Rods, Wwise/FMOD, BeamNG |
| Granular / pitch-synchronous OLA | one-cycle grains from rpm ramps, concatenated at current period | Crankcase REV, AudioMotors, Forza Horizon, Jagla et al. 2012 |
| Procedural pulse synthesis | crank accumulator fires per-cylinder pulses → per-bank pipes → formants/muffler | alexmiguel19/tesla-sound (RevBox), TarrynVenneTodd/engine-sound, teslasound.io (claimed) |
| Physically-informed waveguides | Baldan et al. 2015 | Antonio-R1/engine-sound-generator (MIT), DasEtwas/enginesound (MIT) |
| Physics simulation → audio | rigid body + gas dynamics → exhaust pressure → IR convolution | ange-yaghi/engine-sim (MIT) |

## What makes it sound real (ranked)

1. Correct pulse pattern: firing order, bank grouping, unequal primaries (cross-plane burble, boxer rumble).
2. Load changes timbre, not only volume: on-load bright/raspy/intake, off-load hollow with burble and pops.
3. Resonances must not slide with rpm (no single loop stretched across the rev range).
4. Phase-coherent transitions (crossfading unaligned loops = "two engines").
5. Physical dynamics: shift cuts, downshift blips, limiter bounce 9–14 Hz, BOV on lift, overrun only above ~1.3× idle.
6. Irregularity: ~2 % cycle-to-cycle amplitude, cam lope at idle, per-cylinder spread, timing jitter, noise-modulated pulses.
7. Several sources: exhaust + intake + block/mechanical + turbo; cabin perspective (low-pass, 60–110 Hz boom).
8. Mix: leveler, soft saturation, peak limiter, no zipper noise.

## Procedural recipe used in `web/src/lib/audio/synth`

- Crank accumulator (deg/sample = rpm·6/fs), firing events with per-slot angle jitter.
- Blowdown pulse: smoothstep attack (attackDeg / sharpness, 0.15–0.6 ms) + exponential decay (decayDeg, 1.2–8 ms)
  + piston displacement bump over 240°; amplitude (0.14 + 0.86·load^0.8)·(0.78 + 0.22·rpmN)·cylinder spread·(1 + v·gauss).
- Header delay per slot = primary length / 520 m/s.
- Per bank: DC tracker, derivative "bark", rasp = bandpass(white·x), header + tailpipe fractional-delay resonators,
  2-stage muffler low-pass opening with load (base·2^(open·3.3)), chamber peak, stereo pan.
- Pops: own voice (crack 1.6 ms + 65–120 Hz thump 35 ms), rate ∝ overrun^1.5, bursty gate, partly bypass muffler.
- Intake: noise gated by intake strokes (sin⁴) through runner comb + bandpass, ∝ load²·rpm.
- Block modes 110/280/700 Hz excited by combustion.
- Turbo: spool τ 0.45 s up / 0.12 s down, whistle sine + hiss, whoosh, BOV on load drop > 0.3 with boost > 0.25.
- Limiter: 9–14 Hz spark cut, 42 % duty, −220 rpm wobble. Master: leveler 0.28, soft clip, 25 Hz HPF, 0.92 limiter.

## Recordings: legal sources

| Source | License | Use |
|---|---|---|
| Sonniss #GameAudioGDC 2016/2019/2020/2023 (Pole Position, Soundholder) | royalty-free, no redistribution as sound effects | **private only**; best real material: Ferrari 488 steady RPMs, Aventador ramps, 911 SC constant rpms, R33 ramps, Camaro ZL1 ramps, LFA & WRX designed rpm loops |
| engine-sim renders | MIT engine, renders are ours | repo-safe; ships LS V8, F136 flat-plane, LFA V10, 412 T2 V12, EJ25 equal/unequal, Audi I5, 2JZ, M52 |
| Stunt Rally 3 `data/sounds/engines` | CC-BY-4.0 (CryHam) | repo-safe; engine-sim loops at 1000 rpm steps, on-load only |
| archive.org BMW M3 E92 S65 | CC BY 4.0 | repo-safe onboard exhaust |
| Freesound per file (e.g. 238847 Chevy 350 ramp, 241083 Ferrari 360, 273334 WRX, 625702 STI idle, el-bee Volvo I5 ramps BY-NC) | CC0 / BY / BY-NC | repo-safe with attribution (NC: non-commercial only) |
| Wikimedia Commons YouTube-derived engine clips | CC BY 3.0 (unreviewed) | lossy exterior; every profile incl. Carrera GT / 911 Turbo |
| BBC RemArc, Pixabay, Mixkit, Zapsplat, Unity, Rc_Engine headers, engine-audio samples | no redistribution / unknown | do not commit |

Gaps: no free clean recordings of Carrera GT or 911 Turbo; inline-5 only Volvo (BY-NC) or Commons.

## Second pass (2026-11-10): more projects, papers, ranked improvements

Strongest new finds (all MIT, code reusable with attribution):

| Project | What it is |
|---|---|
| [Atvriders/tesbox](https://github.com/Atvriders/tesbox) | Tesla-browser AudioWorklet synth with our architecture: blowdown pulse (1−e^−αφ)²e^−βφ with sub-sample onsets, passive waveguide exhaust (N-port admittance junctions, turbine 2-port, side-branch muffler chambers, valve bypass), cabin "lowpass-leak" biquad, virtual bass, feature scoring + CMA-ES auto-tuning against recordings (`src/dsp/*`, `src/lab/features.ts`, `tools/tune.ts`) |
| [zolaski333/EngineLab](https://github.com/zolaski333/EngineLab) | C++ physics; portable audio-rate parts: finite-amplitude steepening (`NonlinearDuctAcoustics.hpp`), Silva tailpipe radiation, √f wall loss shelf, valve-port termination, Kelly–Lochbaum expansion-chamber muffler, AR(1) cycle variation, measured afterfire statistics, auto-gain + tanh output stage |
| [Agent00PED/ice-simulator](https://github.com/Agent00PED/ice-simulator) | browser AudioWorklet waveguide exhaust in ~130 lines (`waveguide.js`), Helmholtz side branches, temperature zones, cabin model (README says MIT, no LICENSE file) |
| [ATG-Simulator/VehicleNoiseSynthesizer](https://github.com/ATG-Simulator/VehicleNoiseSynthesizer) | Unity loops; transient rules (filters on raw load, volume on smoothed load, tip-in/tip-out one-shots, burble rules) |

Literature: Pieren 2016 (order + firing-synchronous noise model), Min/Park/Park 2018 (combustion noise =
C·M_f·noise·(tonal + C_r·M_f)), EONE 2026 (orders alone 35/100 realism, with rpm×load noise bands 61–71/100),
Silva 2009 (tailpipe radiation), expired patents US 6,959,094 (Staccato/ADI) and US 5,835,605 (Yamaha waveguide).

Ranked improvements for our synth:

1. Structured irregularity: AR(1) per-cylinder amplitude/burn variation (σ 0.02–0.05, idle 0.10–0.15, ρ 0.55),
   per-cycle pulse-shape variation, fixed per-cylinder spread (1–4 dB), correlated jitter, rare weak cycles.
2. Coupled noise: rasp = noise × (pulse + C_r·level), pink AM of pulses, firing-synchronous noise bands with rpm×load gains.
3. Finite-amplitude steepening in delay lines: read delay D/(1 + β·p/ρc²), β ≈ 1.175, clamp ±30 %.
4. Passive waveguide exhaust network instead of feedback combs (headers → junction → collector → muffler → tailpipe → radiation).
5. Moving delays: gas temperature per zone, load-dependent, slow slew; allpass dispersion.
6. Valve-end termination (closed ≈ +0.7…+1, open lower).
7. Physical excitation (Wiebe burn, orifice blowdown) — optional, heavy.
8. Overrun: motored pulses during cut, Poisson pops injected into the exhaust, crank-synchronous limiter (N on / M off).
9. Transients: filters on raw load, level on smoothed load, tip-in emphasis, shift wobble.
10. Crank-locked order-correction layer + auto-tuning (order profile, tilt, centroid, sub-order dB, per-cycle RMS CV).
11. Cabin: mass-law low-pass 380–800 Hz + HF leak, little or no added boom (the Tesla cabin supplies it), L/R decorrelation, virtual bass.
12. Output: slow auto-gain (5 Hz envelope, 1 s hold, ≤10×) into tanh; target crest ≈ 6–7 dB, tilt ≈ −4.6 dB/oct.
13. Turbo: turbine 2-port low-passing exhaust pulses, whistle 1000 + 3000·shaft Hz, whoosh 4–12 kHz ∝ boost².
14. Gear/driveline whine: mesh = teeth × shaft frequency with sidebands.

Free tuning data: CC0 Freesound recordings listed in EngineLab `references/real-engine-audio/manifest.json`.
