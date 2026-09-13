# Third-party material — what is not in this repository, and why

This project is derived from fischertechnik's Training Factory Industry 4.0 (24 V, art. 536634):
its PLC source, its occupancy plans, its component datasheets, and its product photographs.

**None of that material is redistributed here.** Not because it is hard to find — all of it is
public — but because I do not have a licence to republish it, and a simulation that plays fast
and loose with someone else's copyright is not a good advertisement for careful engineering.

What this repository contains instead is the **pipeline**: the code that reads their material and
derives a model from it. Run `scripts/fetch-sources.sh`, point `control/extract.py` at your own
checkout, and you get the same `control-model.json` I did — byte for byte, since the extractor is
deterministic.

That is a better design anyway. Shipping the extract would have made this repository a snapshot;
shipping the extractor makes it reproducible, and it means anyone who finds a mistake in how I
read the SCL can fix the reading rather than the numbers.

---

## What you need to fetch

### PLC source — the control model

    github.com/fischertechnik/plc_training_factory_24v
    → PLC_SCL_sources/TP/Main.scl
    → PLC_SCL_sources/TP/Cyclic interrupt.scl

**Licence status: unresolved.** That repository carries no `LICENSE` file at the time of writing.
Absence of a licence is not permission, so nothing derived from it is published here, and
`control/control-model.json` is `.gitignore`d. I have written to
`fischertechnik-technik@fischer.de` to ask; if the answer permits redistribution, the derived
model can be committed and step 2 of the build becomes optional.

`extract.py` reads:

| what | where in the SCL |
|---|---|
| I/O tag table | `PLCTags.xml` / tag declarations |
| step tables | `PRG_*_Ablauf` function blocks |
| timer literals | `#lt_TON_Wait := T#…` per step |
| axis targets | `di_Pos_*` in each station's `DATA_BLOCK` |
| soft limits & windows | `*_Axis.Config.di_Pos_Soft_Switch` / `di_Pos_Window` |
| window default | the `:=` initialiser in `TYPE "typ_Axis_Data"` |
| PWM per axis | `*_Axis.i_PWM` |
| colour thresholds | `w_Threshold_*` — **hex** word literals, `16#…` |

### Datasheets — the component model

Downloaded by `scripts/fetch-sources.sh` into `docs/hw/`, which is `.gitignore`d.

| article | part | what it settled |
|---|---|---|
| 144643 | 24 V encoder motor | 440 rpm no-load, 1800 g·cm stall, 60×30×30 mm, 1 kHz encoder |
| 37783 | Mini-switch | 30 × 15 × 7.5 mm, 3.4 g — I had it at 15 × 8 × 12 |
| 36134 | Phototransistor | 15 × 15 × 7.5 mm, 1.7 g |
| 128599 | Colour sensor | 30 × 15 × 15 mm, analogue 0–2 VDC — **not** an RGB sensor |
| 536634 | Factory, extended description | 10 ms minimum controller cycle; per-station I/O counts |
| 536634 | Belegungsplan | terminal-by-terminal assignment |

The occupancy plans (`occupancyPlan*.ods`) come from the same product page.

### Photographs

The reference photographs used to check the layout are fischertechnik product images. They are
not redistributed. `reference/` is `.gitignore`d; the file names in the code comments tell you
which view each one is, and the equivalents are on the product page.

---

## One error found in fischertechnik's own documents

`occupancyPlanOven.ods`, terminal 17: the German reads *"Motor Drehkranz im Uhrzeigersinn"*
(clockwise) while the English on the same row reads *"Motor turn-table counterclockwise"*.
Terminal 18 says counterclockwise in both. The PLC tag is
`QX_MPO_M1_TurnTableClockwise_Q1`, so **Q1 is clockwise** and the English on terminal 17 is a
translation slip. Worth knowing before someone wires a controller from the English column alone.

---

## This repository's own licence

MIT, see `LICENSE`. That covers the simulation, the extractor, the CAD, the viewer and the
documentation — all of which are mine. It does not and cannot cover the manufacturer's material,
which is why none of it is here.

This project is not affiliated with or endorsed by fischertechnik GmbH.
