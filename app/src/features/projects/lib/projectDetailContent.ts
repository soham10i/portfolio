/* Rich project detail content for non-digital-twin projects.
 * Each entry mirrors the structure of the twin detail so the page can render
 * a consistent layout: problem → approach → architecture → results → timeline. */

export interface ProjectDetailContent {
  problem: string;
  approach: string[];
  architecture?: { tier: string; parts: string[] }[];
  results?: { label: string; value: string; color?: string }[];
  timeline?: { phase: string; desc: string }[];
  technicalNotes?: string[];
  githubNote?: string;
}

export const PROJECT_DETAILS: Record<string, ProjectDetailContent> = {
  'digital-twin': {
    problem:
      'A tabletop factory cell runs a full warehouse workflow — storage, retrieval, sorting, a vacuum gripper robot — but its controllers expose nothing a maintenance team can read. Faults show up as a stopped belt, not as a signal you could have acted on an hour earlier.',
    approach: [
      'Modelled all four stations of the fischertechnik 536634 cell from the controller rather than from photographs: the manufacturer’s PLC step tables, TON timer literals and component datasheets.',
      'Solved the suction gripper’s three pulse-to-metre scales from the sorting line’s three collinear bays, because the PLC gives it no soft limits to read them from.',
      'Ran the cell as a MuJoCo rigid-body simulation and verified it against 56 checks; the worst crane move lands within 0.303 mm, inside the PLC’s own 15-pulse window.',
      'Served the twin as a web app on Google Cloud Run, with the live 3D cell, its process image and the production cycle in the browser.',
    ],
    architecture: [
      { tier: 'Sources', parts: ['Siemens SCL step tables', 'Timer literals', 'Belegungsplan I/O', 'Datasheets'] },
      { tier: 'Model', parts: ['OpenSCAD', 'MJCF', 'MuJoCo physics'] },
      { tier: 'Service', parts: ['FastAPI', 'WebSockets', 'MQTT / OPC-UA adapters'] },
      { tier: 'Web', parts: ['Three.js cell view', 'Process image', 'Cloud Run'] },
    ],
    results: [
      { label: 'Checks passed', value: '56 / 56', color: '#16a34a' },
      { label: 'Prediction', value: '1.2 mm RMS', color: 'var(--a)' },
      { label: 'Worst crane error', value: '0.303 mm', color: 'var(--p)' },
      { label: 'Process image', value: '9 DI · 14 DO', color: 'var(--s)' },
    ],
    timeline: [
      { phase: 'v3.0 — Physics twin', desc: 'MuJoCo simulation of all four stations from the PLC sources, predicting positioning to 1.2 mm RMS over 120 mm without prior measurement data.' },
      { phase: 'v2.0 — Live 3D twin', desc: 'Three.js cell on the real 15 mm grid, driven by the 9 DI / 14 DO process image over WebSockets, with an MQTT/OPC-UA adapter layer.' },
      { phase: 'v1.0 — Maintenance dashboard', desc: 'MQTT ingestion at 10 Hz, InfluxDB history and Streamlit dashboards, with an 85%-accurate failure predictor, all containerised.' },
    ],
    githubNote: 'The full twin — simulation, service and web app — lives in the stf-hw repository and runs live on Google Cloud Run.',
  },

  'wind-pdm': {
    problem:
      'Wind turbines run unattended for decades and an unplanned failure costs far more than a planned repair. The task: predict every failure event on Wind Farm C of the CARE-to-Compare benchmark early, without drowning operators in false alarms on healthy turbines.',
    approach: [
      'Isolated healthy operation first: DBSCAN on wind speed against power, a fitted piecewise ideal power curve, and a 3σ tolerance band around it, so models learn from clean behaviour.',
      'Grouped the large SCADA sensor set by physical meaning from the feature descriptions, and built leakage-free train/test splits with a pre-failure context window appended to each test event.',
      'Level 1 triage: an XGBoost classifier, validated with leave-one-out cross-validation across events.',
      'Level 2: timestamp-level unsupervised scoring from model residuals and an Isolation Forest, turning a per-event verdict into concrete alarm times, then scored with the full CARE metric including early-detection lead time.',
    ],
    architecture: [
      { tier: 'Data', parts: ['CARE-to-Compare', 'Wind Farm C SCADA', 'Event annotations'] },
      { tier: 'Cleaning', parts: ['DBSCAN', 'Ideal power curve', '3σ band'] },
      { tier: 'Models', parts: ['XGBoost (LOO-CV)', 'Residual scoring', 'Isolation Forest'] },
      { tier: 'Evaluation', parts: ['CARE score', 'Lead time', 'False-alarm check on normal turbines'] },
    ],
    githubNote: 'Notebooks for EDA, supervised and unsupervised learning, and the timestamp-level ensemble are in the repository, with the written report.',
  },

  'co2-tracker': {
    problem:
      'People who want to cut their carbon footprint rarely know where it comes from. The goal was a web app that turns everyday activity — driving, flying, household energy — into tracked CO₂ figures a user can act on.',
    approach: [
      'Spring Boot REST API with JWT authentication: sign-up, sign-in and token refresh, plus profile management.',
      'Per-activity emission calculators for transportation (car, flight) and household energy, each saving its results to the user’s history.',
      'A login, registration and dashboard front end over the API.',
      'Delivered in two iterations as an OTH team software project, with design documents and final presentation.',
    ],
    architecture: [
      { tier: 'Front end', parts: ['Login', 'Registration', 'Dashboard'] },
      { tier: 'API', parts: ['Spring Boot', 'JWT auth', 'Calculator endpoints'] },
      { tier: 'Data', parts: ['SQL schema', 'Activity history'] },
      { tier: 'Build', parts: ['Maven', 'JDK 11+'] },
    ],
    githubNote: 'The repository holds the source code, both iteration reports and the final presentation.',
  },

  'medqa-nlp': {
    problem:
      'USMLE-style medical questions need answers grounded in evidence, not a language model’s guess. The aim was a system that picks the right option by finding support for it in an external knowledge source.',
    approach: [
      'Loads MedQA questions (JSONL) and runs biomedical named-entity recognition with SciSpacy to decide which Wikipedia articles to fetch.',
      'Segments the fetched articles and embeds passages and questions with Sentence-Transformers (all-MiniLM-L6-v2).',
      'Builds a FAISS index — CPU or GPU — and scores every answer option against the retrieved evidence before an answer selector makes the final choice.',
      'Each stage is its own module with unit tests and logging, so retrievers and scorers can be swapped. The /medqa demo on this site is its successor, adding NLI verification.',
    ],
    architecture: [
      { tier: 'Input', parts: ['MedQA (JSONL)', 'SciSpacy NER'] },
      { tier: 'Knowledge', parts: ['Wikipedia (live)', 'Passage segmentation'] },
      { tier: 'Retrieval', parts: ['Sentence-Transformers', 'FAISS (CPU / GPU)'] },
      { tier: 'Answer', parts: ['Evidence scorer', 'Answer selector'] },
    ],
    githubNote: 'Modular Python pipeline with unit tests per stage.',
  },
  scene: {
    problem:
      'Most scene-understanding systems either run in the cloud (privacy risk, latency) or are limited to fixed object lists (no open-vocabulary description). The goal was a pipeline that detects objects in real time on the device, narrates what is happening in natural language, and does so without sending every frame to a server.',
    approach: [
      'YOLOv8n-seg runs in the browser through ONNX Runtime Web, so camera frames never leave the visitor\'s device. Detection happens at ~30 FPS on a modern laptop.',
      'A lightweight scene-change detector samples keyframes only when the visual content has actually changed, rate-limiting captions to avoid flooding the backend.',
      'Sampled keyframes are sent to a self-hosted BLIP / VLM service for open-vocabulary captioning. If the service is offline, the detector writes its own factual descriptions from the label set.',
      'The whole pipeline is containerised and deployable anywhere — no reliance on commercial vision APIs.',
    ],
    architecture: [
      { tier: 'Edge', parts: ['YOLOv8n-seg ONNX', 'ONNX Runtime Web', 'WebGPU / WASM backend'] },
      { tier: 'API', parts: ['FastAPI', 'BLIP / VLM captioning', 'Scene-change gating'] },
      { tier: 'Deploy', parts: ['Docker', 'Self-hosted', 'No external API keys'] },
    ],
    results: [
      { label: 'Detection FPS', value: '~30', color: 'var(--a)' },
      { label: 'Model size', value: '13 MB', color: 'var(--p)' },
      { label: 'Caption latency', value: '~800 ms', color: 'var(--s)' },
      { label: 'Privacy mode', value: 'Frames on-device', color: '#22c55e' },
    ],
    technicalNotes: [
      'The ONNX model is quantised to float16 and cached by the browser after first load.',
      'Scene-change detection uses a 64×64 luma downsample; mean absolute delta > 0.04 triggers a new keyframe.',
      'Captions are written from detection labels when the language model is unreachable, so the demo never breaks.',
    ],
  },

  slam: {
    problem:
      'A ROSBot must autonomously navigate five different Webots maze worlds, mapping unknown environments and planning collision-free paths to coloured target pillars. The challenge is doing this with only 2-D LIDAR and wheel odometry — no GPS, no prior map.',
    approach: [
      'Implemented occupancy-grid SLAM with log-odds updates from LIDAR raycasts. The grid resolution is 5 cm, fine enough to resolve doorways but coarse enough to run at 10 Hz.',
      'Frontier-based exploration selects the nearest unknown region as a fallback goal when no mission target is visible.',
      'A* plans over the occupancy grid with the robot radius inflated, guaranteeing a collision-free path.',
      'Pure-pursuit tracking steers along the planned path using a lookahead carrot point.',
    ],
    architecture: [
      { tier: 'Perception', parts: ['2-D LIDAR', 'Wheel odometry', '10 Hz scan rate'] },
      { tier: 'Mapping', parts: ['Log-odds occupancy grid', '0.05 m resolution', '120 rays'] },
      { tier: 'Planning', parts: ['Frontier detection', 'A* search', 'Radius inflation'] },
      { tier: 'Control', parts: ['Pure pursuit', 'Mission state machine', 'Recovery behaviours'] },
    ],
    results: [
      { label: 'Maps', value: '5', color: 'var(--a)' },
      { label: 'Grid res', value: '0.05 m', color: 'var(--p)' },
      { label: 'Scan rate', value: '10 Hz', color: 'var(--s)' },
      { label: 'Controller', value: 'Pure pursuit', color: '#22c55e' },
    ],
    technicalNotes: [
      'The browser re-implementation mirrors the Python controller architecture but uses simplified kinematics.',
      'Maze 4\'s exported spawn is enclosed — the engine auto-relocates to the nearest open cell.',
      'The recorded videos show the real Webots simulation; the 3D tab is a behavioural approximation.',
    ],
    githubNote: 'The recorded runs and the browser re-implementation are both derived from the same controller source in the repository.',
  },

  ble: {
    problem:
      'GPS does not work indoors. BLE beacons are cheap and ubiquitous, but RSSI alone is noisy and non-linear. The goal was sub-meter accuracy for indoor asset tracking using only an Arduino Nano BLE Sense — no external infrastructure beyond a few fixed beacons.',
    approach: [
      'Fused IMU accelerometer + gyroscope data with BLE RSSI measurements in a Kalman filter for smooth position tracking.',
      'Added a particle filter as a fallback for non-linear regions where the Kalman linearity assumption breaks down.',
      'Ran the full pipeline on the Arduino Nano BLE Sense (nRF52840) at 50 Hz, with all filtering done on-device.',
      'Calibrated beacon RSSI-to-distance models per-environment to account for multipath and wall attenuation.',
    ],
    architecture: [
      { tier: 'Hardware', parts: ['Arduino Nano BLE Sense', 'nRF52840', 'IMU + BLE'] },
      { tier: 'Sensors', parts: ['Accelerometer', 'Gyroscope', 'BLE RSSI'] },
      { tier: 'Fusion', parts: ['Kalman filter', 'Particle filter', '50 Hz update'] },
      { tier: 'Output', parts: ['Sub-metre position', 'Velocity estimate', 'Confidence ellipse'] },
    ],
    results: [
      { label: 'Update rate', value: '50 Hz', color: 'var(--a)' },
      { label: 'Accuracy', value: 'Sub-metre', color: 'var(--p)' },
      { label: 'Platform', value: 'Arduino Nano', color: 'var(--s)' },
      { label: 'Filters', value: 'Kalman + PF', color: '#22c55e' },
    ],
    technicalNotes: [
      'The Kalman filter uses a constant-velocity motion model; the particle filter resamples 200 particles.',
      'RSSI-to-distance was calibrated per room using a least-squares fit to ground-truth measurements.',
      'All computation is on-device; no cloud or phone tethering is required after calibration.',
    ],
  },

  'cv-uad': {
    problem:
      'Paediatric brain tumour segmentation requires annotated data, but expert annotations are scarce and expensive. Unsupervised anomaly detection learns only from healthy examples and flags deviations — no labels needed at training time.',
    approach: [
      'PDM (Patch Diffusion Model): trained a DDPM on healthy 96×96 patches from BraTS-PEDs. At inference, each patch is partially noised and reconstructed; the residual reveals anomalies.',
      'Multi-scale patch extraction (121 patches per slice) with Gaussian fusion to remove edge artefacts.',
      'A dense-CRF post-processes the residual map, guided by T1c contrast to sharpen boundaries.',
      'An earlier latent-diffusion approach (KL-VAE + DDPM) underperformed, which motivated the pixel-space redesign.',
    ],
    architecture: [
      { tier: 'Data', parts: ['BraTS-PEDs', 'Healthy patches only', '96×96 crops'] },
      { tier: 'Model', parts: ['UNet2DModel', 'DDPM / DDIM', 'EMA decay 0.9999'] },
      { tier: 'Inference', parts: ['Partial noise → denoise', 'Residual map', 'Dense-CRF'] },
      { tier: 'Metrics', parts: ['DICE 0.076', 'AUROC 0.713', 'Pixel-wise'] },
    ],
    results: [
      { label: 'DICE', value: '0.076', color: 'var(--a)' },
      { label: 'AUROC', value: '0.713', color: 'var(--p)' },
      { label: 'Epochs', value: '60', color: 'var(--s)' },
      { label: 'Objective', value: 'DDPM', color: '#22c55e' },
    ],
    technicalNotes: [
      'The DICE score looks low but is calibrated — BraTS-PEDs lesion masks are small, and pixel-wise AUROC is the fairer metric.',
      'EMA was critical: without it, sampling variance produced false positives at patch boundaries.',
      'The negative result (latent diffusion underperforming) is documented in the repository as `brats-uad`.',
    ],
  },

};
