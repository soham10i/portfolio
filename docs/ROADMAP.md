# Roadmap — what this portfolio is missing, and the plan to fix it

*Written 2026-09-03. Kept in the open because the reasoning is the point: the
value of a public learning trail is that the wrong turns stay visible.*

---

## 1. An honest audit

I read the engines rather than the marketing copy. The result is not what I
expected, and not what I had been telling myself.

### The SLAM robot is real, and I was underrating it

`app/public/webots-world-3d.js`, 858 lines. It contains an actual navigation
stack: a log-odds occupancy grid over `known` / `free` / `unknown` cells, LIDAR
raycast against the real wall meshes, frontier selection for exploration, an A*
planner (`open` / `best` / `g` / `h` / `f`, single-letter but structurally
correct), obstacle inflation by robot radius, and a pure-pursuit carrot with
stale-plan replanning when the pose drifts off route.

That is a navigation stack, not a demo of one. It is the strongest thing here.

### The factory "Digital Twin" is not a twin

`app/public/factory-twin-3d.js`, 699 lines. Its entire logic is eleven `lerp`
calls driven by `phaseAt(t)` against a hardcoded 16.5-second phase table in
`twin.ts`. There is no state machine, no PLC scan cycle, no material flow, no
fault injection, no way for the simulation to reach a state the script did not
already contain.

It is a well-made keyframe animation labelled as a digital twin. Anyone who
opens the file learns that in about ninety seconds, and what they learn is not
"this is shallow" — it is "this person's claims do not match their code." That
is the single largest credibility risk in the repository, and it sits on the
project with the most prominent name.

**Two honest exits, in order of preference:**

1. Make it a real discrete-event simulation. A PLC scan loop over the actual
   I/O table in `plcIo.ts`, stations as state machines with transition guards,
   a workpiece queue, cycle-time as an *emergent* number rather than a
   constant, and injectable faults (jammed gripper, sensor stuck-at, conveyor
   stall) so the model can reach states no script anticipated. `CYCLE_TOTAL`
   stops being `16.5` and starts being measured.
2. Relabel it. "Cell cycle visualisation, reconstructed from PLC I/O traces"
   is accurate, still interesting, and costs nothing but ego.

Doing neither is the only wrong answer.

---

## 2. The real diagnosis: nothing here is measured

The instinct — "my projects are shallow because I only have API access to small
models" — is wrong, and acting on it would waste months.

Nothing in this portfolio has a ground truth, a baseline, or a number. Every
project ends at "it runs and produces plausible output." That is precisely what
makes work read as integration rather than engineering, and it is unaffected by
model size. A 550B model producing unvalidated output is still unvalidated
output.

The corollary is the good news: **evaluation costs no API quota.** A labelled
set of 200 clips and a precision/recall table is free, is the thing that is
actually missing, and is what separates the two categories.

A hand-rolled CFD solver for F1 aero would not fix this either. Nobody believes
a portfolio CFD solver, because validating one is a career. A narrow problem
with a verifiable answer beats an ambitious problem with an unverifiable one,
every time and by a large margin.

**The rule adopted from here on: no project ships without an evaluation set, a
baseline it is compared against, and a number — including when the number is
bad.** Reported negative results are the most credible thing an open trail can
contain.

---

## 3. SceneLab: from generic captioning to a real problem

Current state: frames in, sentences out. True, and no use case. Two candidates
were considered.

### Rejected: sign language → speech

Not rejected for difficulty. Rejected because a hearing developer shipping a
mediocre sign-to-speech tool is a well-documented pattern that the Deaf
community criticises specifically and repeatedly — a 2026 Northeastern survey
found broad skepticism of exactly this class of project, and the "sign language
glove" genre is a standing example of technology built about a community rather
than with it. Sign languages are not word-for-word encodings of spoken language;
they have their own grammar, and non-manual markers (face, posture, mouth) carry
grammatical meaning that a hands-only pipeline discards by construction.

Building this alone would produce something technically naive and socially
tone-deaf, aimed at earning the respect of the people most likely to recognise
it as such. If this domain is worth entering later, it is worth entering with
Deaf collaborators from the first design meeting or not at all.

### Chosen: intersection conflict analysis (surrogate safety)

The original framing was "detect rule violations and issue fines." The
enforcement half gets dropped:

- Automated traffic enforcement in Germany is a regulated legal instrument, not
  a hobby target, and a public demo that processes identifiable people and
  vehicles has a GDPR problem I do not want and cannot solve.
- It also frames the work as surveillance, which narrows who will engage with
  it.

The safety-analysis half keeps everything that made the idea good and discards
the liability. **Surrogate safety measures** — time-to-collision, post-
encroachment time — are an established field with published methods, so there
is real literature to work against rather than an invented metric.

Crucially, ground truth exists:

| Dataset | What it gives | Why it matters here |
|---|---|---|
| **SinD** | Drone trajectories at a signalised intersection, **with traffic-light state** | Red-light running becomes computable ground truth, not opinion |
| **inD** | Naturalistic road-user trajectories at German intersections | German context; pedestrians and cyclists, not just cars |
| **TrafficMOT** | Multi-object tracking in dense traffic | A tracking benchmark with published baselines to lose to honestly |

With SinD's light state and labelled trajectories, "did this vehicle run the
red" has an answer to check against. That converts the project from a demo into
an experiment.

**Scope, deliberately narrow.** One intersection. One conflict type first
(vehicle–vehicle PET below threshold), pedestrian conflicts second. Detection
and tracking are the engineering; a VLM, if used at all, only writes the
human-readable incident description at the end. The model is not the project —
the geometry, homography, tracking and threshold calibration are, and none of
that is quota-limited.

**What "done" looks like:** a table of precision/recall against SinD labels, an
ablation showing which component costs the most accuracy, and a written account
of the failure cases. Not a video of boxes moving.

---

## 4. Agentic systems

Worth doing, with one caveat stated plainly: "agentic" is the most saturated
category in portfolios right now, and a tool-calling loop over an API is the
same integration work under a newer name. It inherits the exact problem in
section 2.

The defensible version is an agent evaluated on a task suite with a **measured
success rate** — n tasks, x% solved, and an analysis of the failures. The
benchmark is the contribution; the agent is the thing being measured. Anything
less is a wrapper with a personality.

Sequenced after SceneLab, and ideally *on* SceneLab: an agent that runs the
conflict-analysis pipeline over a batch of clips, decides what to re-examine at
higher resolution, and writes the incident report has a real task with a real
score. That is an agent with a job.

---

## 5. Chrome extension for voice navigation — a correction first

The stated requirement is voice control of navigation **on this portfolio
only**. That does not need a Chrome extension. The Web Speech API runs in the
page: `SpeechRecognition` for commands, `speechSynthesis` for responses, wired
to the existing React Router. An extension adds an install step, a review
process, a permissions prompt and a second codebase, and buys nothing when the
target site is the one you already control.

The extension is only justified by a requirement not yet stated — voice control
of sites where JS cannot be shipped. If that is the goal, say so and it changes
the design. Otherwise:

- **Build it in-page.** Roughly a day. Command grammar mapped to routes, a
  visible transcript so the user can see what was heard, a push-to-talk control
  rather than an always-on microphone, and a graceful message in browsers where
  the API is absent.
- Real accessibility value: keyboard-and-voice navigation with proper focus
  management and ARIA live regions, which also improves the site for screen
  readers. That is a stronger accessibility story than a novelty extension.

Priority: last. It is a garnish, not a course.

---

## 6. Free-tier limits — mostly the wrong problem

Real constraint, small consequence for this plan.

- The intersection work is **detection, tracking, homography and threshold
  calibration**. No hosted LLM is on that critical path.
- A MacBook Air M4 with 24 GB runs real models locally via MLX. Local inference
  costs no quota, has no rate limit, and exposes internals a hosted endpoint
  never will — attention maps included, which is exactly what the hosted VLM
  could not provide for SceneLab's transparency panel.
- Where a hosted model genuinely helps, NVIDIA NIM serves
  `nemotron-3-ultra-550b-a55b` free at ~5.9 s. Too slow for interactive chat,
  fine for batch reasoning over a clip. Model access is not the bottleneck.

---

## 7. Sequence

Capacity ~20 h/week. No external deadline — the driver is a public trail that
compounds, so throughput matters less than nothing on it being false.

**Now — this week.** Fix the digital-twin claim. Relabel it today; schedule the
real simulation. An overclaim in the repo devalues the SLAM work standing next
to it.

**Weeks 1–2.** Get SinD and inD. Reproduce a published TTC/PET computation on
labelled trajectories, with no perception in the loop. Establishes the metric
and the ground truth before any model is involved — and if the pipeline is
wrong, it is wrong on data where that is visible.

**Weeks 3–6.** Perception: detection and tracking on the same clips, measured
against the dataset's own trajectories. This is where the number comes from and
where the honest failure analysis lives.

**Weeks 7–8.** Conflict detection end to end. Precision/recall table, ablation,
written failure cases. Ship it, including whatever the number turns out to be.

**Weeks 9–12.** The factory twin as an actual discrete-event simulation, with
cycle time as an emergent measurement.

**Later.** The agent, evaluated on the pipeline above. Then in-page voice
navigation.

**Throughout.** Notes written as the work happens, not reconstructed afterwards.
The dead ends are the part that cannot be faked and the part worth reading.
