# The factory in the browser

`/stf-layout` runs the cell. Both halves of what is on screen come out of the simulation
rather than being drawn or animated by hand, and the pipeline is three scripts.

## Pipeline

    sim/mjcf/export_scene.py      factory.xml       -> app/public/sim/scene-*.json
    sim/mjcf/pack_trajectory.py   *-trajectory.json -> app/public/sim/traj-*.{bin,json}
    sim/mjcf/export_events.py     *-report.json     -> app/public/sim/events-*.json

Regenerate everything:

    cd projects/stf-digital-twin
    O=../../app/public/sim
    for s in factory hbw mpo sld vgr; do python3 sim/mjcf/export_scene.py sim/mjcf/$s.xml $O/scene-$s.json; done
    python3 sim/mjcf/pack_trajectory.py sim/out/factory-trajectory.json $O/traj-factory 30 --scene $O/scene-factory.json
    python3 sim/mjcf/export_events.py   sim/out/factory-report.json     $O/events-factory.json
    # ...and the same two lines per station run

## Geometry

`export_scene.py` walks the same MJCF MuJoCo compiles. It resolves the class/default chain the
way the compiler does, drops the 84 collision proxies, and writes the visual bodies, geoms,
materials, textures and joints. So the model on the page is the model that the verification
runs drive — 267 visual geoms, 38 bodies, 17 joints for the full cell — not a second model that
has to be kept in step with the first.

MuJoCo is Z-up and three.js is Y-up. That rotation is applied once at the scene root, so every
number in `scene-*.json` still matches the MJCF.

The two fischertechnik profiles (`ft_beam.stl`, `ft_alu.stl`) are instanced per length by the
per-mesh scale the MJCF already carries. The baseplate keeps its real `grundplatte.png`.

## Motion

`pack_trajectory.py` resamples the solver's own frames to 30 fps by **nearest timestamp** and
quantises each channel to uint16 over its observed range. Nothing is smoothed, retimed or
keyed: every pose the page shows is a pose the solver stepped.

    run          solver frames   ->  30 fps      size    worst quantisation error
    factory           50,466          7,570     340 KB   4.2e-05 rad  (mpo_J_saw)
    hbw               54,656          2,050      40 KB   9.2e-07
    mpo               52,972          1,590      43 KB   4.3e-05 rad  (J_saw)
    vgr               54,224          2,034      12 KB   2.9e-05
    sld × 3          307/360/409     92/108/123   2 KB   ~1e-05

One transform is applied, and only to unbounded hinges. A continuously spinning shaft
accumulates absolute angle without bound — the saw reaches 167 rad over the loop — and
quantising that span costs 2.6e-03 rad on the single channel where the absolute value carries
no information. Those are wrapped to [-pi, pi) first, which is identical on screen and keeps
every channel's resolution at the level of the mechanism. Bounded joints are never touched.

The VGR run records three channels for its three axes and no workpiece; joints past the end of
a run's data stay at their rest pose rather than being faked.

## The step tape

Each run logs, with a timestamp, which PLC step of which station it entered:

    [35.52, "VGR 400 rotate to HBW, home vertical/horizontal"]

`export_events.py` turns that into the list beside the scene, so the page can name the step you
are watching, and clicking a step seeks the motion to it. The checks panel prints the run's
verdict on itself — 7/14 on the combined loop, 13/13 on the VGR — read out of the report rather
than typed into the page.

## What is deliberately absent

There is no mode that executes the PLC. `control/control-model.json` carries the step numbers,
their comments and their `TON` waits, but **not the axis target each step commands** — those
assignments were never pulled out of the SCL. A live executor would therefore have to invent
the motion between steps, which is the one thing this project does not do.

Making it possible is a change to `control/extract.py`: pull the target assignment per step
alongside the step number. With that, the same page could run the sequence live and compare it
against the recorded run instead of only replaying one.

## Files

    app/public/stf-factory-3d.js                        the <stf-factory-3d> engine
    app/public/sim/                                     scenes, trajectories, step tapes (700 KB)
    app/src/features/stf-layout/StfLayout3D.tsx         the page
    app/src/features/stf-layout/components/StfFactory.tsx   React wrapper

The engine has no build step and no npm dependency: it loads three r147 from
`app/public/vendor/` with a CDN fallback, and parses the two binary STLs itself.
