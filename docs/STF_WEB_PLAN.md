# STF in the browser — closing the gap between what exists and what is shown

*2026-09-03.*

## The finding that changes the question

The question was "how do I make the three.js scene industrial-grade." That is
the wrong question, because the industrial-grade simulation **already exists** —
it is just private, and the public site does not use it.

What is in `projects/stf-digital-twin/` right now:

| Asset | Substance |
|---|---|
| `control/control-model.json` | **89 I/O points** extracted from fischertechnik's own S7-1500 SCL sources — terminal, PLC address, symbol, manufacturer description |
| | Real axis setpoints in **encoder pulses** (VGR 37, HBW 12, SSC 6), soft limits, position windows, PWM per-mille |
| | Real colour-sensor thresholds (9690 / 15447 raw), SLD counter values |
| | **181 sequence steps** across VGR/SSC/HBW/MPO/SLD with the manufacturer's IEC TIME literals |
| `sim/` | MuJoCo scene, ~3 900 lines of Python, per-station layouts and drivers |
| `cad/lib/` | Parametric fischertechnik part library on the 15 mm raster, every uncertain dimension tagged `[EXACT]` / `[MEASURED]` / `[NOMINAL]` |
| `reference/` | Labelled photography of the real cell, including a sim-vs-photo comparison |
| `_incoming/*.mp4` | **Cycle videos of the physical hardware** for HBW, VGR, MPO, SLD |

And in `app/public/factory-twin-3d.js`, what the public actually sees: 699
lines whose whole logic is eleven `lerp` calls against a hardcoded 16.5-second
phase table.

**The best work is hidden and the weakest artefact is the one on display.**
Nothing needs to be invented. The pipeline needs to be connected.

The single most valuable file in the repository is `sim/plc_timing.py`, and not
for its 44 lines:

> *"The second extraction pass over `Main.scl` settled it, and I had two of the
> big ones wrong: step 130 processing time 4 s (I had 5 s), step 240 start
> sawing 4 s (I had 2 s). Every wait the driver takes now comes from
> `control-model.json`, so the reported cycle time is a consequence of their
> program instead of my reading of it."*

That paragraph — a documented wrong assumption, the evidence that corrected it,
and a structural change so the class of error cannot recur — is worth more to a
hiring engineer than the entire public site. It is currently invisible.

---

## The fidelity ladder

Four levels. The current viewer is at 1. Ship 2, then 3. Level 4 for one
station only, if at all.

### Level 1 — scripted animation *(current)*
`phaseAt(t)` interpolates poses along a fixed timeline. Cycle time is a
constant because someone typed it. No state the script did not anticipate is
reachable. **This is not a twin and should not be labelled as one.**

### Level 2 — recorded trajectory playback *(ship first)*
Run the existing MuJoCo scene offline. Record joint/body state per timestep,
decimate, ship as a compact binary or gzipped JSON. The browser becomes a
player for a real simulation instead of an author of a fake one.

- Effort: low. The simulator already runs; this is an exporter plus a player.
- Honest gain: every pose on screen is a physics result. The timeline comes
  from fischertechnik's own step table.
- Limit: still a recording. The viewer cannot be interacted with.

### Level 3 — the PLC sequence running in the browser *(the real target)*
The manufacturer's control is a **step table with timers and I/O bits**. That
structure ports almost directly to TypeScript — roughly 300 lines for an
interpreter that reads `control-model.json` and executes the same 181 steps the
S7-1500 does, at the same waits.

Drive the geometry kinematically from the real encoder setpoints (the axis
tables are already extracted, in pulses, with soft limits and position windows).
Most of this cell is positioning, not contact — it does not need a physics
engine to be correct.

What this unlocks, and what makes it a twin rather than a video:

- **Cycle time becomes emergent.** It is the sum of what the program actually
  does, not `CYCLE_TOTAL = 16.5`. If the number moves when a parameter changes,
  the model is alive.
- **Fault injection.** Stick `IX_MPO_RefSwitchTurnTable_PosVac_I1` low and watch
  the sequence stall at a named step, with the I/O table showing why. That is
  what virtual commissioning *is for*, and it is impossible at level 1.
- **The I/O panel becomes real.** 89 addressed points updating live from an
  executing program, not a decorative list.
- **Scenario control.** Choose a rack cell (all twelve positions are extracted),
  choose a workpiece colour against the real thresholds, watch it route.

### Level 4 — contact physics in the browser
MuJoCo WASM or Rapier, only where contact genuinely decides the outcome: the
SLD ejection and the vacuum pick. Everywhere else it costs bundle size and
frame time for no fidelity. Do this for one station or not at all.

---

## One source of truth

The reason level 3 is cheap is that the hard artefact already exists.

```
    fischertechnik PLC_SCL_sources/TP
                 │
                 │  control/extract.py          (hand-written, the only one)
                 ▼
        control-model.json
         ├──────────────┬────────────────┐
         ▼              ▼                ▼
    MuJoCo driver   TS step-table    docs / I/O panel
    (sim/*.py)      interpreter      (generated tables)
                    (web viewer)
```

Both simulators consume the same file. A wrong constant is wrong in both places
at once and gets fixed once — which is the difference between a model and two
models that disagree.

Geometry follows the same rule: export glTF from `cad/out/` rather than
hand-modelling boxes in three.js. The web mesh and the MuJoCo visual mesh then
come from one OpenSCAD source, and a corrected caliper measurement propagates
to both.

---

## The licence blocker — solvable, and worth solving well

`control/README.md` already flags it: fischertechnik's repository has no LICENSE
file, so publishing derived constants is not clearly permitted.

**Ship the extractor, not the extract.** `extract.py` is original work. The
repository contains the extractor, the schema, and an instruction to run it
against fischertechnik's public sources; `control-model.json` stays out of git
and is generated locally at build time.

This is standard practice for derived datasets, it resolves the licence
question without waiting on an email, and it demonstrates something stronger
than compliance: an understanding of provenance. It also makes the build
reproducible from first sources, which is the property that separates an
engineering artefact from a folder of numbers.

Email `fischertechnik-technik@fischer.de` anyway. A written "yes" turns a
constraint into a footnote, and the reply is worth having on record.

---

## The validation shot

This is what converts the project from "impressive-looking" to "verified", and
the material is already on disk.

Split screen: **real hardware video on the left, simulation on the right,
time-synchronised**, with a running clock and a delta. Four stations, four
clips — HBW, VGR, MPO, SLD — already recorded.

Underneath, the number:

| Station | PLC-programmed | Simulated | Measured on hardware | Error |
|---|---|---|---|---|
| MPO | 27.0 s of timed waits | *(measure)* | *(from video)* | |
| VGR | 14.0 s | | | |
| SLD | 5.5 s | | | |
| HBW | 0 s explicit — motion-bound | | | |

The last column is the whole project. **Nobody in a portfolio publishes a
reality-gap number**, because publishing one requires having measured it and
being willing to show it when it is bad. That table, with an honest error and a
paragraph on where the error comes from, is worth more than another station
being modelled.

Note what HBW's zero says: its cycle is bounded by axis travel, not by timers,
so its cycle time is a *prediction* of the model rather than a readback of the
program. That is the strongest validation target in the cell.

---

## Time-critical: lab access

`docs/measurement-sheet.md` opens with *"Lab access is the scarce resource on
this project, not modelling time"* and plans one 90-minute session at OTH with a
caliper.

Exmatriculation took effect at the end of August 2026. **That window may already
be closed.** Confirm this week, because it changes the plan rather than the
schedule:

- If access remains (alumni, a lecturer's goodwill, a friend still enrolled),
  take the session immediately. Everything tagged `[NOMINAL]` becomes
  `[MEASURED]` in ninety minutes, and "validated against the physical cell" is
  the one sentence in the whole write-up a hiring engineer will actually weigh.
- If it is closed, the Training Factory 24V is a standard, widely-owned rig.
  Other universities and training centres have one, and asking to spend ninety
  minutes with a caliper is a small ask that people say yes to. It is worth a
  cold email.
- Failing both: the model stays honest by keeping `[NOMINAL]` tags visible and
  reporting cycle-time error only against the PLC program and the video, not
  against dimensions. Stated as a limitation, that is still a real result.

---

## Order of work

1. **Relabel the public twin today.** "Cell cycle visualisation" until level 3
   lands. The overclaim is the only thing here actively costing credibility.
2. **Resolve lab access.** One email, this week. It gates the strongest claim.
3. **Level 2**: MuJoCo trajectory export plus a browser player. Fastest route to
   a public artefact that is not a fabrication.
4. **The split-screen validation view** with the cycle-time table. Highest
   signal per hour of anything on this list.
5. **Level 3**: the step-table interpreter in TypeScript, fault injection, live
   I/O panel. This is the centrepiece.
6. **Publish the pipeline**: extractor, schema, CAD library, MJCF. Not the
   derived constants.
