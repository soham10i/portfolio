/* Project write-ups: problem → approach → architecture → results → notes.
 * Formatted for both general users (clear problem, business impact, intuitive summary)
 * and technical recruiters (concrete algorithms, math, benchmarks, constraints, and trade-offs).
 */

export interface ArchitectureTier {
  tier: string;
  role?: string;
  description?: string;
  parts: string[];
  dataOut?: string;
}

export interface ProjectDetailContent {
  problem: string;
  approach: string[];
  architecture?: ArchitectureTier[];
  results?: { label: string; value: string; color?: string }[];
  timeline?: { phase: string; desc: string }[];
  technicalNotes?: string[];
  githubNote?: string;
}

export const PROJECT_DETAILS: Record<string, ProjectDetailContent> = {
  'digital-twin': {
    problem:
      'The fischertechnik training factory runs an industrial warehouse cycle — storage, retrieval, pneumatic vacuum handling, and color sorting. The only definition of how it operates is embedded in proprietary Siemens SCL PLC code and wiring schematics. A viable digital twin must reproduce exact physical timings, pin states, and kinematics to test software against before hardware deployment, rather than merely rendering a 3D visual shell.',
    approach: [
      'Extracted the ground truth directly from controller source files: Siemens SCL step tables, TON timer literals (0.1s resolution), and the hardware Belegungsplan pin assignments (9 DI / 14 DO).',
      'Solved the suction crane’s three pulse-to-meter coordinate scales mathematically from the sorting line’s 3 collinear physical bays, overcoming the hardware limitation where the PLC provides no software limit switches.',
      'Constructed a physics simulation in Python verified across 56 automated regression checks; crane travel errors remained under 0.303 mm (within the controller’s own 15-pulse deadband), achieving 1.2 mm RMS over a 120 mm stroke.',
      'Built a browser-native Three.js digital twin deployed on Google Cloud Run, synchronized in real time over WebSockets with dual MQTT and OPC-UA protocol adapters.',
    ],
    architecture: [
      {
        tier: 'Sources & Controller',
        role: 'Hardware ground-truth extraction',
        description: 'Parses manufacturer PLC step tables, TON timer literals, and Belegungsplan pinout tables into structured state definitions.',
        parts: ['Siemens SCL Step Tables', 'TON Timer Literals', 'Belegungsplan I/O (9 DI / 14 DO)', 'Drive Datasheets'],
        dataOut: 'Calibrated step sequences & I/O tables',
      },
      {
        tier: 'Kinematic & Physics Model',
        role: 'Mathematical simulation engine',
        description: 'Simulates multi-axis crane kinematics, vacuum pressure dynamics, and collinear bay coordinates in continuous space.',
        parts: ['Python Simulation Core', 'NumPy Kinematics', 'OpenSCAD Geometry', 'Pulse-to-Meter Resolver'],
        dataOut: 'Simulated station poses & sensor events',
      },
      {
        tier: 'Service & Middleware',
        role: 'Telemetry & protocol abstraction',
        description: 'Bridges simulated sensor state and physical controller protocols, broadcasting updates over low-latency WebSockets.',
        parts: ['FastAPI Asynchronous Gateway', 'WebSockets (10 Hz)', 'MQTT Broker Bridge', 'OPC-UA Client Adapter'],
        dataOut: 'Bidirectional process image events',
      },
      {
        tier: 'Web Presentation',
        role: 'Interactive 3D digital twin',
        description: 'Renders the factory on the physical 15 mm construction grid with live DI/DO indicator lights and production cycle controls.',
        parts: ['Three.js WebGL Engine', 'Process Image Inspector', 'Cloud Run Container', 'Cycle State Machine UI'],
        dataOut: 'Operator controls & live telemetry view',
      },
    ],
    results: [
      { label: 'Checks passed', value: '56 / 56', color: '#16a34a' },
      { label: 'Positioning accuracy', value: '1.2 mm RMS', color: 'var(--a)' },
      { label: 'Worst crane error', value: '0.303 mm', color: 'var(--p)' },
      { label: 'Process image', value: '9 DI · 14 DO', color: 'var(--s)' },
    ],
    timeline: [
      { phase: 'v3.0 — Physics Twin', desc: 'Python simulation of all 4 stations directly from PLC sources, predicting multi-axis travel to 1.2 mm RMS over 120 mm without empirical sensor calibration.' },
      { phase: 'v2.0 — Live 3D Twin', desc: 'Browser Three.js cell on the real 15 mm grid, driven by the 9 DI / 14 DO process image over WebSockets with an MQTT / OPC-UA bridge layer.' },
      { phase: 'v1.0 — Predictive Maintenance', desc: 'MQTT sensor ingestion at 10 Hz, InfluxDB time-series storage, and Streamlit dashboard with an 85% accurate failure classifier.' },
    ],
    technicalNotes: [
      'The vacuum gripper crane uses magnetic pulse encoders (214 min⁻¹ at 25:1 gearbox ratio, giving 75 pulses per output shaft revolution). The resolver converts pulse counts directly to metric Cartesian coordinates.',
      'Because the vacuum suction gripper has no limit sensors in the physical factory, calibration was achieved by solving an overdetermined system of linear equations across the three collinear sorting bays.',
      'The worst-case positioning deviation observed was 0.303 mm, well within the Siemens PLC 15-pulse deadband tolerance (equivalent to ~0.8 mm).',
      'The web visualizer avoids frame-dropping under heavy WebSocket bursts by decoupling the network message queue from Three.js render loops with double-buffering.',
    ],
    githubNote: 'The complete twin — simulation core, protocol adapters, and web visualizer — lives in the stf-hw repository and is deployed on Google Cloud Run.',
  },

  slam: {
    problem:
      'An autonomous differential-drive robot (ROSBot) must explore and map five unknown maze environments in Webots and plan collision-free paths to target pillars. The system must operate reliably without GPS, external motion capture, or prior maps, relying exclusively on noisy 2D LIDAR range scans and wheel encoder odometry.',
    approach: [
      'Implemented 2D occupancy-grid SLAM utilizing log-odds probability updates. Bresenham raycasting updates free cells (-0.4 log-odds) and latches obstacle boundaries (+0.85 log-odds) at a 0.05 m grid resolution.',
      'Formulated an 8-connected A* path planner incorporating dynamic obstacle radius inflation (robot radius + 0.12 m safety margin) to eliminate clipping hazards around sharp maze corners.',
      'Engineered a lookahead pure-pursuit path tracker with an adaptive carrot distance (0.15 m – 0.40 m) and an angular velocity clamp (1.5 rad/s) for smooth trajectory following.',
      'Designed an autonomous mission state machine featuring frontier exploration, pillar approach sequences, and stuck-recovery pivot maneuvers.',
    ],
    architecture: [
      {
        tier: 'Perception',
        role: 'Sensor ingestion & dead reckoning',
        description: 'Samples 2D planar LIDAR scans and differential wheel encoders, calculating Runge-Kutta odometry integration.',
        parts: ['2-D LIDAR (120 rays)', 'Wheel Odometry', '10 Hz Scan Rate', 'Pose Estimator (x, y, θ)'],
        dataOut: 'Robot pose & range-bearing arrays',
      },
      {
        tier: 'Mapping',
        role: 'Probabilistic spatial modeling',
        description: 'Updates a 2D log-odds grid using inverse sensor models with log-odds limits clamped between -3.0 and +4.0.',
        parts: ['Log-Odds Occupancy Grid', '0.05 m Spatial Resolution', 'Bresenham Raycaster', 'Occupancy Latch (> 0.70)'],
        dataOut: 'Occupancy probability grid',
      },
      {
        tier: 'Planning',
        role: 'Global path & frontier exploration',
        description: 'Extracts frontiers between known-free and unmapped territory, inflating obstacles and planning optimal paths via A*.',
        parts: ['Frontier Detection', 'Obstacle Radius Inflation (R=0.22m)', '8-Connected A* Search', 'Euclidean Heuristic'],
        dataOut: 'Waypoint trajectory list',
      },
      {
        tier: 'Control',
        role: 'Trajectory tracking & recovery',
        description: 'Computes target curvature steering commands via pure pursuit, monitored by an autonomous mission state machine.',
        parts: ['Pure Pursuit Steering', 'Curvature Solver (γ=2sinα/L)', 'Mission State Machine', 'Recovery In-Place Pivot'],
        dataOut: 'Differential motor velocities (v, ω)',
      },
    ],
    results: [
      { label: 'Maze worlds', value: '5 / 5 solved', color: '#16a34a' },
      { label: 'Grid resolution', value: '0.05 m (5 cm)', color: 'var(--a)' },
      { label: 'Scan rate', value: '10 Hz', color: 'var(--p)' },
      { label: 'Replay points', value: '27,612 pts', color: 'var(--s)' },
    ],
    timeline: [
      { phase: 'Simulation in Webots', desc: 'Full ROSBot kinematics and sensor simulation in Webots across 5 distinct mazes with unknown obstacles and color-coded destination pillars.' },
      { phase: 'Browser Engine & Replay', desc: 'Ported the core SLAM and A* controller to browser TypeScript, rendering real recorded runs with 27,612 LIDAR points across 831 robot poses.' },
    ],
    technicalNotes: [
      'Log-odds formulation prevents numerical underflow: L(m|z) = L(m) + log(P(m|z)/(1-P(m|z))) - log(P(m)/(1-P(m))). Thresholding at log-odds 0.7 corresponds to >67% probability of obstacle occupancy.',
      'Obstacle inflation uses a circular kernel radius of 0.22 m (robot footprint 0.10 m + 0.12 m safety margin), transforming the robot into a point-mass representation for efficient A* graph search.',
      'Pure pursuit steering computes curvature γ = 2·sin(α) / L, where α is the angle between the robot heading and the lookahead carrot point. Dynamic carrot distance shortens in tight corridors and lengthens on open straights.',
      'In Maze 4, the initial Webots spawn coordinates placed the robot inside an enclosed corner; the controller automatically detects zero-free-cell enclosures and triggers an auto-relocation routine to the nearest frontier.',
    ],
    githubNote: 'The Webots simulation code, controller modules, and interactive browser replay are derived from the same source in the repository.',
  },

  scene: {
    problem:
      'Computer vision and video narration systems typically require streaming high-resolution camera feeds to centralized cloud services. This introduces severe privacy risks, high bandwidth overhead, and latency bottlenecks. The objective was an edge-native pipeline that executes real-time object detection directly in the browser and selectively requests natural language scene captions without uploading persistent video streams.',
    approach: [
      'Packaged YOLOv8n-seg into ONNX format, running client-side through ONNX Runtime Web with WebGPU hardware acceleration and WebAssembly SIMD fallback (~30 FPS on standard laptops).',
      'Engineered an adaptive scene-change detector: frames are downscaled to 64×64 grayscale to calculate temporal mean absolute delta (MAD). Captions are only triggered when visual variance exceeds 0.04, eliminating redundant API calls.',
      'Constructed a containerized FastAPI captioning microservice hosting BLIP / Vision-Language Models (VLM). If the service is unreachable, a local rule-based narrator synthesizes factual descriptions from detection tensors.',
      'Enforced strict zero-retention data privacy: camera buffers remain in GPU volatile memory; only sampled, user-authorized keyframes ever leave the device.',
    ],
    architecture: [
      {
        tier: 'Edge Detection',
        role: 'Client-side neural inference',
        description: 'Runs YOLOv8n-seg in-browser via ONNX Runtime Web; detects 80 COCO classes and instance segmentation masks at 30 FPS.',
        parts: ['YOLOv8n-seg ONNX (14 MB)', 'ONNX Runtime Web', 'WebGPU / WASM SIMD', 'Tensor Pre/Post-processing'],
        dataOut: 'Bounding boxes, masks, class confidences',
      },
      {
        tier: 'Temporal Gating',
        role: 'Scene-change keyframe filter',
        description: 'Computes frame-to-frame luma deltas on downsampled buffers, preventing duplicate caption queries when the camera is static.',
        parts: ['64×64 Luma Downsample', 'Mean Absolute Delta (MAD)', 'Adaptive Threshold (Δ > 0.04)', 'Keyframe Cooldown Lock'],
        dataOut: 'Filtered keyframe image buffers',
      },
      {
        tier: 'Captioning Microservice',
        role: 'VLM open-vocabulary narration',
        description: 'Translates visual keyframes into natural language captions using self-hosted vision-language models or fallback rule narration.',
        parts: ['FastAPI Backend', 'BLIP / VLM Model', 'Local Rule Narrator', 'Async Task Queue'],
        dataOut: 'Timestamped natural language captions',
      },
      {
        tier: 'Interactive Lab UI',
        role: 'Real-time inspection & analytics',
        description: 'Displays live bounding boxes, segmentation masks, object frequency charts, keyframe contact sheets, and conversational scene Q&A.',
        parts: ['Canvas Bounding Overlays', 'Object Frequency Chart', 'Timeline Scrubber', 'Scene Q&A Assistant'],
        dataOut: 'Interactive browser visualization',
      },
    ],
    results: [
      { label: 'Inference speed', value: '~30 FPS (WebGPU)', color: '#16a34a' },
      { label: 'Model footprint', value: '14 MB (FP16)', color: 'var(--a)' },
      { label: 'Caption latency', value: '~800 ms', color: 'var(--p)' },
      { label: 'Privacy guarantee', value: 'Zero raw video egress', color: 'var(--s)' },
    ],
    technicalNotes: [
      'The ONNX model is quantized to float16 and stored locally in browser IndexedDB after first fetch, ensuring sub-second startup on return visits.',
      'Non-Maximum Suppression (NMS) and bilinear mask resizing are executed in typed arrays to maintain 60 FPS UI rendering alongside 30 FPS ML inference.',
      'The 64×64 luma difference metric uses an exponential moving average threshold to adapt smoothly between low-light and bright outdoor camera environments.',
      'When offline, the client-side rule narrator infers relational context directly from bounding box geometry (e.g. overlap, containment, relative scale).',
    ],
    githubNote: 'The complete pipeline — edge detector, temporal gating, and FastAPI captioning container — is open-source and runs locally with Docker.',
  },

  'cv-uad': {
    problem:
      'Paediatric brain tumors (BraTS-PEDs benchmark) exhibit extreme anatomical diversity. Supervised deep learning models require extensive pixel-level annotations from specialized radiologists, which are expensive and scarce. Unsupervised Anomaly Detection (UAD) models must learn exclusively from healthy brain tissue, identifying pathological lesions as anomalies that cannot be reconstructed.',
    approach: [
      'Developed PDM (Patch Diffusion Model): trained a 2D UNet with a Denoising Diffusion Probabilistic Model (DDPM) objective exclusively on healthy 96×96 multi-parametric MRI patches (T1, T1c, T2, FLAIR).',
      'Designed a partial noise-and-denoise inference protocol: test patches are perturbed to timestep t*=250/1000 via DDIM and deterministically reconstructed. Healthy tissue reconstructs cleanly; neoplastic lesions deviate sharply.',
      'Eliminated boundary seams across 121 patches per axial slice using 2D Gaussian weight blending, followed by a dense Conditional Random Field (dense-CRF) guided by T1c contrast gradients to refine anomaly boundaries.',
      'Documented and analyzed a prior failure mode: an earlier 4-channel latent-diffusion architecture (KL-VAE + DDPM) lost high-frequency lesion textures in latent space (Superseded by PDM, reported as a baseline).',
    ],
    architecture: [
      {
        tier: 'Data & Preprocessing',
        role: 'Multi-parametric MRI normalization',
        description: 'Processes 4 MRI modalities (T1, T1c, T2, FLAIR) with skull-stripping, intensity z-score normalization, and axial slicing.',
        parts: ['BraTS-PEDs Dataset', '4-Channel MRI Stacking', 'Z-Score Normalization', 'Healthy Slice Masking'],
        dataOut: 'Normalized 4-channel axial slices',
      },
      {
        tier: 'Patch Extraction',
        role: 'Multi-scale spatial sampling',
        description: 'Extracts 96×96 overlapping patches with a stride of 32, generating 121 patches per slice to ensure high local resolution.',
        parts: ['96×96 Multi-Scale Patches', 'Stride-32 Grid', 'Healthy Patch Classifier', 'Edge Padding'],
        dataOut: '121 patches per MRI slice',
      },
      {
        tier: 'Diffusion Core (PDM)',
        role: 'Generative prior reconstruction',
        description: 'UNet2DModel trained with DDPM ε-prediction; performs partial noise-reconstruction with DDIM at timestep t*=250.',
        parts: ['UNet2DModel with Attention', 'DDPM / DDIM Scheduler', 'EMA Decay (0.9999)', 't*=250 Partial Inversion'],
        dataOut: 'Reconstructed healthy patch approximations',
      },
      {
        tier: 'Residual & CRF Refinement',
        role: 'Spatial fusion & boundary sharpening',
        description: 'Blends reconstructed patches with 2D Gaussian kernels and applies dense-CRF guided by T1c intensity gradients.',
        parts: ['2D Gaussian Patch Fusion', 'Residual L1/L2 Difference Map', 'T1c-Guided Dense-CRF', 'Calibrated Dice Thresholding'],
        dataOut: 'Binary tumor segmentation mask',
      },
    ],
    results: [
      { label: 'Pixel-wise AUROC', value: '0.713', color: '#16a34a' },
      { label: 'Calibrated DICE', value: '0.076 (baseline)', color: 'var(--a)' },
      { label: 'Training epochs', value: '60 epochs', color: 'var(--p)' },
      { label: 'EMA coefficient', value: '0.9999', color: 'var(--s)' },
    ],
    timeline: [
      { phase: 'PDM (Pixel-Space)', desc: 'Multi-scale patch diffusion in pixel space with DDIM partial inversion, Gaussian fusion, and dense-CRF boundary refinement.' },
      { phase: 'brats-uad (Latent-Space)', desc: 'From-scratch 4-channel KL-VAE with latent DDPM. Proved that latent compression discards subtle micro-tumour margins; kept as an empirical negative result.' },
    ],
    technicalNotes: [
      'Exponential Moving Average (EMA) with decay 0.9999 was critical: without EMA, checkpoint sampling variance caused severe intensity flickers across patch seams.',
      'Pixel-level AUROC of 0.713 demonstrates significant anomaly signal in the raw residual maps; however, calibrated DICE (0.076) reflects the clinical difficulty of thresholding diffuse infiltrative glioma margins without labels.',
      'DDIM sampling at t*=250 achieved the optimal trade-off: lower timesteps (t* < 150) failed to alter tumor tissue, while higher timesteps (t* > 400) hallucinated non-existent cortical structures.',
      'Dense-CRF optimization uses bilateral filtering with parameters θ_α=80, θ_β=0.0625, θ_γ=3, balancing spatial smoothness against sharp contrast edges in T1c.',
    ],
    githubNote: 'Model training scripts, evaluation notebooks, and comparative analysis with the latent-diffusion baseline are available on GitHub.',
  },

  'embedded-intelligence': {
    problem:
      'GPS is entirely unavailable indoors, while standalone Bluetooth Low Energy (BLE) Received Signal Strength Indication (RSSI) is plagued by multipath interference, body shadowing (4–8 dB attenuation), and wall reflections. Low-cost wearable pedestrian tracking requires fusing noisy RF beacons with high-frequency Inertial Measurement Unit (IMU) kinematics in real time.',
    approach: [
      'Collected synchronized 3-beacon BLE RSSI and 6-DOF IMU (BMI270 accelerometer + BMM150 magnetometer) data on an Arduino Nano 33 BLE Sense in a 10×10 m indoor room.',
      'Engineered a Sequential Importance Resampling (SIR) Particle Filter operating directly in RSSI space under an empirical log-distance path-loss model, enforcing room wall boundaries in the log-weight calculation.',
      'Implemented Augmented Monte Carlo Localization (AMCL): tracks short-term and long-term average measurement likelihoods (w_fast, w_slow) to inject random samples and autonomously recover from kidnapped-robot states.',
      'Built a ground-truth simulator replicating multipath RF shadowing, sensor noise, and clock jitter. Boosted positioning accuracy from 11.13 m RMSE (course baseline) down to 1.79 m RMSE (v2 at 50 Hz, CEP95 = 3.37 m).',
    ],
    architecture: [
      {
        tier: 'Embedded Acquisition',
        role: 'Hardware sensing & data logging',
        description: 'Acquires 6-DOF inertial data and 3-beacon RSSI values on an Arduino Nano 33 BLE Sense at a fixed 50 Hz rate.',
        parts: ['Arduino Nano 33 BLE Sense', 'BMI270 6-DOF IMU', 'BMM150 Magnetometer', 'BLE Beacon Scanner (50 Hz)'],
        dataOut: 'Raw accelerometer, gyro & RSSI packets',
      },
      {
        tier: 'Signal Conditioning',
        role: 'Pre-filtering & orientation tracking',
        description: 'Isolates linear acceleration by stripping gravity, and tracks heading through a wrap-safe circular Kalman filter.',
        parts: ['Gravity Vector Extraction', 'Circular Heading Kalman Filter', 'Peak-to-Peak Step Detector', 'RSSI Median Filter'],
        dataOut: 'Step events, heading angle, filtered RSSI',
      },
      {
        tier: 'Particle Filter (AMCL)',
        role: 'Bayesian non-linear state estimation',
        description: '1,000-particle cloud updated via log-distance RF observation model, kinematic dead reckoning, and AMCL recovery.',
        parts: ['1,000 Particle Distribution', 'Log-Distance RF Path Loss', 'Systematic Resampling (N_eff < N/2)', 'AMCL Recovery Injection'],
        dataOut: 'Estimated 2D user coordinate (x, y)',
      },
      {
        tier: 'Simulation & Analytics',
        role: 'Ground-truth validation harness',
        description: 'Simulates synthetic pedestrian walks with known ground truth to benchmark RMSE, CEP50, and CEP95 across filter variations.',
        parts: ['Ground-Truth Walk Simulator', 'RMSE / CEP95 Metric Calculator', '<ei-viewer> Web Component', 'Pytest Regression Suite'],
        dataOut: 'Interactive trajectory error visualizer',
      },
    ],
    results: [
      { label: 'RMSE · v2 (50 Hz)', value: '1.79 m', color: '#16a34a' },
      { label: 'RMSE · baseline', value: '11.13 m', color: '#ef4444' },
      { label: 'CEP95 accuracy', value: '3.37 m', color: 'var(--a)' },
      { label: 'Bugs diagnosed & fixed', value: '11 defects', color: 'var(--p)' },
    ],
    technicalNotes: [
      'Diagnosed 11 critical defects in the inherited course baseline: e.g., the step detector compared raw magnitude (~9.8 m/s² with gravity) against a 1.2 m/s² threshold, causing every sample to register as a step.',
      'The inherited boundary condition never took effect: particles outside room boundaries were set to weight 1e-100 in predict(), but weights were reset uniformly to 1.0 in update(). Fixed by evaluating wall constraints inside the observation step.',
      'Magnetometer heading calculations suffered from coordinate inversion (swapping X/Y axes) and an arithmetic average bug that averaged 359° and 1° to 180°. Fixed with circular angular statistics: θ = atan2(Σ sin θ_i, Σ cos θ_i).',
      'Systematic resampling is only executed when Effective Sample Size N_eff = 1 / Σ(w_i²) drops below N/2, preserving particle diversity and preventing particle depletion.',
    ],
    githubNote: 'The complete Python package, unit test suite, simulation harness, and interactive run visualizer are prepared for open-source publication.',
  },

  'wind-pdm': {
    problem:
      'Industrial wind turbines operate in harsh, unattended offshore and remote locations where catastrophic gearbox or bearing failures cost orders of magnitude more than preventative maintenance. The challenge was building an early failure warning system on the CARE-to-Compare benchmark (Wind Farm C SCADA dataset) that predicts degradation weeks in advance without triggering costly false alarms on healthy turbines.',
    approach: [
      'Isolated clean aerodynamic behavior: applied DBSCAN clustering on wind speed vs. active electrical power to identify normal operation, fitted a piecewise cubic power curve, and filtered anomalies using a ±3σ boundary.',
      'Engineered multi-timescale temporal features across 48 SCADA sensor streams (bearing temperatures, vibration spectra, generator RPM, gearbox oil pressure), calculating rolling statistics over 1-hr, 6-hr, and 24-hr sliding windows.',
      'Implemented a two-tier predictive architecture: Level 1 uses an XGBoost gradient-boosted classifier with leave-one-event-out cross-validation to categorize operational risk; Level 2 uses an Isolation Forest on model residuals to pinpoint the exact degradation timestamp.',
      'Scored against the official CARE evaluation framework, penalizing false alarms and rewarding early detection lead time prior to catastrophic component trip.',
    ],
    architecture: [
      {
        tier: 'SCADA Telemetry Ingestion',
        role: 'High-dimensional time-series ingest',
        description: 'Ingests 48 continuous sensor channels at 10-minute resolution covering mechanical, electrical, and ambient conditions.',
        parts: ['Wind Farm C SCADA', '48 Sensor Channels', '10-Minute Averaged Streams', 'Failure Annotation Records'],
        dataOut: 'Raw multi-channel time-series',
      },
      {
        tier: 'Data Cleaning & Normalization',
        role: 'Aerodynamic regime separation',
        description: 'Filters curtailment and sensor anomalies using DBSCAN density clustering and a fitted cubic power curve envelope.',
        parts: ['DBSCAN Density Filter', 'Piecewise Power Curve Fit', '±3σ Tolerance Envelope', 'Sensor Imputation'],
        dataOut: 'Cleaned operational data arrays',
      },
      {
        tier: 'Feature Engineering & ML',
        role: 'Two-stage predictive modeling',
        description: 'Extracts multi-window temporal rolling features, applying XGBoost for event triage and Isolation Forest for alarm timing.',
        parts: ['Rolling Window Features (1h/6h/24h)', 'XGBoost (Leave-One-Out CV)', 'Autoencoder / Residual Scoring', 'Isolation Forest Ensembler'],
        dataOut: 'Anomaly probability & residual scores',
      },
      {
        tier: 'Alarm Synthesis & Scoring',
        role: 'Operational alert generation',
        description: 'Synthesizes timestamp alerts with minimum duration filtering, scored under the CARE benchmark lead-time metric.',
        parts: ['Temporal Alert Clustering', 'CARE Benchmark Metric', 'Lead-Time Evaluator', 'Zero-False-Alarm Healthy Control'],
        dataOut: 'Actionable maintenance alerts with lead-time',
      },
    ],
    results: [
      { label: 'Benchmark score', value: 'CARE Evaluated', color: '#16a34a' },
      { label: 'Sensor channels', value: '48 SCADA metrics', color: 'var(--a)' },
      { label: 'False alarms on control', value: '0 false trips', color: 'var(--p)' },
      { label: 'Validation scheme', value: 'Leave-One-Out CV', color: 'var(--s)' },
    ],
    technicalNotes: [
      'Turbines operate under varying aerodynamic states (curtailment, feathering, pitch control); training models on raw SCADA without power-curve isolation caused severe false positive spikes during high-wind shutdowns.',
      'Leave-one-event-out cross-validation ensured zero temporal leakage: entire failure episodes and their preceding context windows were held out completely from training splits.',
      'Residual scoring computes the difference between predicted normal sensor values and actual readings; sudden divergence in generator bearing temperature relative to power output proved to be the most reliable early indicator.',
    ],
    githubNote: 'Exploratory data analysis, feature engineering scripts, model training notebooks, and the complete technical report are in the repository.',
  },

  'medqa-nlp': {
    problem:
      'Medical examination questions (such as USMLE board exams) demand rigorous evidence-grounded answers rather than generative language model guesswork. The objective was constructing a modular question-answering pipeline that identifies relevant clinical entities, retrieves supporting medical literature from external corpora, and verifies factual entailment before predicting candidate answers.',
    approach: [
      'Ingested MedQA multiple-choice vignettes (JSONL), parsing clinical questions with biomedical named-entity recognition (SciSpacy en_core_sci_lg) to extract pathological and anatomical concepts.',
      'Segmented relevant medical literature into 256-token passages with 64-token overlap, embedding both question-option hypotheses and passages into a shared vector space via Sentence-Transformers.',
      'Built a high-performance FAISS vector index (GPU/CPU) to retrieve the top-k most relevant evidence passages for each candidate option.',
      'Developed an evidence-to-option cross-scorer verified by a Natural Language Inference (NLI) entailment classifier (DeBERTa-v3), selecting options strictly backed by retrieved evidence (the direct foundation for the live /medqa demo).',
    ],
    architecture: [
      {
        tier: 'Clinical Ingestion & NER',
        role: 'Biomedical entity extraction',
        description: 'Parses complex clinical vignettes into structured concepts using specialized biomedical NLP tokenizers.',
        parts: ['MedQA Vignettes (JSONL)', 'SciSpacy Biomedical NER', 'Anatomical/Pathology Parser', 'Multi-Option Hypothesis Builder'],
        dataOut: 'Clinical entity queries & candidate options',
      },
      {
        tier: 'Corpus Segmentation',
        role: 'Passage chunking & indexing',
        description: 'Segments biomedical literature into coherent overlapping passages formatted for dense vector retrieval.',
        parts: ['Medical Reference Corpus', '256-Token Sliding Windows', '64-Token Stride Overlap', 'Metadata Storage'],
        dataOut: 'Tokenized medical passage chunks',
      },
      {
        tier: 'Dense Vector Retrieval',
        role: 'Semantic embedding & indexing',
        description: 'Embeds queries and passages using Sentence-Transformers, performing sub-millisecond similarity search via FAISS.',
        parts: ['Sentence-Transformers (MiniLM)', 'FAISS Vector Index (GPU/CPU)', 'Cosine Similarity Ranking', 'Top-K Candidate Filter'],
        dataOut: 'Ranked evidence passage passages',
      },
      {
        tier: 'Entailment & Selection',
        role: 'Evidence scoring & verification',
        description: 'Evaluates candidate options against retrieved evidence using an NLI cross-encoder, calculating calibrated answer confidence.',
        parts: ['Cross-Encoder Scorer', 'DeBERTa-v3 NLI Verifier', 'Entailment vs Contradiction Check', 'Option Selection Engine'],
        dataOut: 'Validated answer selection with source citations',
      },
    ],
    results: [
      { label: 'Retrieval latency', value: '< 15 ms (FAISS)', color: '#16a34a' },
      { label: 'Index capacity', value: 'Dense vector space', color: 'var(--a)' },
      { label: 'Architecture', value: 'Modular unit-tested', color: 'var(--p)' },
      { label: 'Verification model', value: 'NLI DeBERTa-v3', color: 'var(--s)' },
    ],
    technicalNotes: [
      'SciSpacy entity extraction reduces query noise by stripping extraneous vignette conversational phrasing, focusing vector retrieval specifically on clinical biomarkers and diagnostic tests.',
      'Sliding passage segmentation (256 tokens with 64-token overlap) ensures that multi-sentence medical rationales are not bisected across chunk boundaries.',
      'NLI verification enforces that P(Entailment) exceeds P(Contradiction) by a calibrated margin; if all options yield high contradiction, the system abstains rather than returning an ungrounded guess.',
    ],
    githubNote: 'The complete modular pipeline, unit test suite, and evaluation scripts are available in the natural-language-processing-project repository.',
  },

  'smart-home': {
    problem:
      'Internet of Things (IoT) ecosystems require unified backend services capable of ingesting high-frequency heterogeneous sensor telemetry (climate, electrical, gas), authenticating multi-role user requests, and dispatching low-latency commands back to edge actuators with robust security.',
    approach: [
      'Developed an asynchronous REST API in Python using FastAPI, structuring dedicated modules for sensor ingestion, identity management, and hardware actuation.',
      'Engineered stateless JSON Web Token (JWT) authentication with HMAC-SHA256 signature verification and Role-Based Access Control (RBAC) protecting administrative device-control endpoints.',
      'Constructed a relational schema in SQLite/PostgreSQL with indexed timestamps and device identifiers for time-series sensor query optimization.',
      'Containerized the application using multi-stage Docker builds and automated deployment on Railway with environment isolation.',
    ],
    architecture: [
      {
        tier: 'Edge Device Interface',
        role: 'Sensor ingestion & heartbeat',
        description: 'Accepts structured JSON telemetry payloads from microcontrollers and IoT sensors over secure HTTP/WebSocket protocols.',
        parts: ['IoT Edge Nodes', 'HTTP / WebSocket Ingest', 'Pydantic Validation Schemas', 'Device Heartbeat Monitor'],
        dataOut: 'Validated sensor data packets',
      },
      {
        tier: 'Security & Router Gateway',
        role: 'Identity & permissions verification',
        description: 'FastAPI asynchronous gateway validating JWT bearer tokens and enforcing Role-Based Access Control policies.',
        parts: ['FastAPI Async Router', 'JWT Bearer Authentication', 'RBAC Permission Middleware', 'Password Hashing (bcrypt)'],
        dataOut: 'Authorized request contexts',
      },
      {
        tier: 'Data Persistence',
        role: 'Time-series & entity storage',
        description: 'Relational database schema storing environmental telemetry streams, user profiles, and device command audit logs.',
        parts: ['Relational Schema', 'Indexed Timeseries Tables', 'Device State Repository', 'Migration Scripts'],
        dataOut: 'Stored readings & state confirmations',
      },
      {
        tier: 'Deployment & CI/CD',
        role: 'Infrastructure & containerization',
        description: 'Multi-stage Docker container deployed to cloud infrastructure with automated environment configuration.',
        parts: ['Docker Containerization', 'Docker Compose Local Stack', 'Railway Cloud Deployment', 'Health Check Endpoint'],
        dataOut: 'Live production API endpoints',
      },
    ],
    results: [
      { label: 'API framework', value: 'FastAPI Async', color: '#16a34a' },
      { label: 'Security protocol', value: 'JWT + RBAC', color: 'var(--a)' },
      { label: 'Deployment', value: 'Docker on Railway', color: 'var(--p)' },
      { label: 'Endpoints', value: 'Sensor · User · Control', color: 'var(--s)' },
    ],
    technicalNotes: [
      'Asynchronous endpoint definitions (`async def`) allow FastAPI to handle hundreds of concurrent sensor heartbeats without blocking database I/O.',
      'Pydantic v2 schemas perform strict data coercion and type enforcement at the gateway, rejecting malformed sensor telemetry before database insertion.',
      'JWT tokens carry embedded role scopes (`role: technician | resident | admin`), eliminating secondary database lookups on every device actuation command.',
    ],
    githubNote: 'API documentation, Swagger OpenAPI specifications, Docker Compose configuration, and backend source code are available in the repository.',
  },

  'co2-tracker': {
    problem:
      'Mitigating personal carbon emissions requires accurate, actionable carbon accounting. Consumers frequently lack transparency into the precise CO₂ output generated by specific transportation modes (vehicles, commercial flights) and residential energy consumption. The goal was building an enterprise full-stack tracking application delivering clear carbon calculations.',
    approach: [
      'Built a Spring Boot 3 microservice backend in Java 17 implementing RESTful API design with Spring Security 6 for stateless JWT authentication and sessionless token refresh.',
      'Implemented standardized greenhouse gas calculation algorithms based on official GHG Protocol standards, supporting multi-modal transport and residential utility metrics.',
      'Designed a responsive web front end featuring activity history management, categorized emission dashboards, and actionable reduction goal tracking.',
      'Executed across two agile sprints within an engineering team at OTH Amberg-Weiden, authoring complete UML class diagrams, database schemas, and unit test suites.',
    ],
    architecture: [
      {
        tier: 'Frontend Presentation',
        role: 'Interactive user dashboard',
        description: 'Single-page interface providing activity logging forms, categorized emission breakdowns, and progress visualization.',
        parts: ['Responsive Web Dashboard', 'Activity Logging Forms', 'Interactive Carbon Visualizers', 'Goal Tracking UI'],
        dataOut: 'User activity submissions & queries',
      },
      {
        tier: 'Security & API Gateway',
        role: 'Authentication & token management',
        description: 'Spring Security filter chain managing user registration, credential authentication, and JWT bearer token issuance.',
        parts: ['Spring Boot 3 REST API', 'Spring Security 6', 'JWT Authentication Filter', 'Token Refresh Controller'],
        dataOut: 'Authenticated user sessions',
      },
      {
        tier: 'Emission Domain Core',
        role: 'GHG calculation engine',
        description: 'Encapsulates GHG Protocol emission factors across vehicle fuel types, flight passenger-kilometers, and grid electricity mix.',
        parts: ['GHG Calculation Engine', 'Transport Emission Service', 'Aviation Flight Factor Model', 'Household Utility Service'],
        dataOut: 'Calculated carbon quantities (kg CO₂e)',
      },
      {
        tier: 'Persistence & Build',
        role: 'Relational data & automation',
        description: 'Spring Data JPA / Hibernate persistence layer backed by relational SQL schemas with automated Maven build pipelines.',
        parts: ['Spring Data JPA / Hibernate', 'Relational SQL Database', 'Maven Build Tooling', 'JUnit Test Suite'],
        dataOut: 'Persisted activity records & aggregate metrics',
      },
    ],
    results: [
      { label: 'Backend architecture', value: 'Spring Boot 3 (Java 17)', color: '#16a34a' },
      { label: 'Security', value: 'Spring Security + JWT', color: 'var(--a)' },
      { label: 'Calculation standard', value: 'GHG Protocol based', color: 'var(--p)' },
      { label: 'Delivery lifecycle', value: '2 Agile Sprints', color: 'var(--s)' },
    ],
    technicalNotes: [
      'Emission factor logic separates direct vehicle combustion (Scope 1) from electricity consumption (Scope 2), applying regional grid emission intensity factors.',
      'Flight emission calculations incorporate radiative forcing multipliers to account for high-altitude non-CO₂ greenhouse impacts.',
      'Spring Data JPA repository methods leverage database-level aggregation queries (`SUM`, `AVG`) to generate dashboard summaries with minimal server heap allocation.',
    ],
    githubNote: 'Source code, comprehensive sprint iteration reports, UML system architecture diagrams, and test suites are stored in the GitHub repository.',
  },
};
