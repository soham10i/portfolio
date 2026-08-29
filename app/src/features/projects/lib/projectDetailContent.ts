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

  medqa: {
    problem:
      'Medical question-answering requires high accuracy and traceability — a wrong answer has consequences. Off-the-shelf LLMs hallucinate on clinical content. The goal was to benchmark how much retrieval context improves factual correctness across different NLI models and retrieval strategies, with everything reproducible and containerised.',
    approach: [
      'Built a modular RAG pipeline with swappable retrievers (dense, sparse, hybrid) and swappable NLI models (5+ from HuggingFace).',
      'Evaluated on MedQA-USMLE, a public medical QA benchmark, measuring exact-match accuracy and semantic similarity.',
      'Compared three retrieval strategies: BM25 sparse, MPNet dense, and a hybrid fusion ensemble.',
      'Everything is gated by Pytest, type-checked, and packaged in Docker so the benchmark is reproducible.',
    ],
    architecture: [
      { tier: 'Data', parts: ['MedQA-USMLE', 'PubMed abstracts', 'Vector store (FAISS)'] },
      { tier: 'Retrieval', parts: ['BM25 (Whoosh)', 'MPNet dense', 'RRF hybrid fusion'] },
      { tier: 'NLI', parts: ['RoBERTa-MNLI', 'DeBERTa-MedNLI', 'BioLinkBERT', 'MedAlpaca', 'Flan-T5'] },
      { tier: 'API', parts: ['FastAPI', 'LangChain', 'HuggingFace Transformers'] },
    ],
    results: [
      { label: 'Test accuracy', value: '60%', color: 'var(--a)' },
      { label: 'NLI models', value: '5+', color: 'var(--p)' },
      { label: 'Strategies', value: '3', color: 'var(--s)' },
      { label: 'Coverage', value: 'MedQA-USMLE', color: '#22c55e' },
    ],
    technicalNotes: [
      'The 60% figure is on unseen MedQA test data — the dataset is hard, and the baseline without retrieval is ~35%.',
      'Hybrid retrieval (BM25 + dense with RRF) consistently outperformed either alone by 8–12 points.',
      'All model weights are cached inside the Docker image so the container starts cold with no downloads.',
    ],
  },

  wind: {
    problem:
      'Wind turbines operate in remote locations for 20+ years. Scheduled maintenance is expensive and reactive — the goal is to flag degradation from SCADA sensor data before a failure forces an unplanned shutdown.',
    approach: [
      'Ingested multi-channel SCADA time-series: vibration RMS, gearbox temperature, generator speed, power output, wind speed.',
      'Engineered a fused health index that combines anomaly scores from all channels — the index crosses an alarm band before any individual sensor looks alarming.',
      'Benchmarked 8 regression algorithms (from linear to gradient boosting) using the CARE framework for multi-output regression.',
      'The best model predicts both fault state and expected power output from the same feature set, giving two actionable signals from one pipeline.',
    ],
    architecture: [
      { tier: 'Ingest', parts: ['SCADA CSV exports', '10-minute aggregates', 'Pandas / NumPy'] },
      { tier: 'Features', parts: ['Rolling statistics', 'Spectral bands', 'CARE framework'] },
      { tier: 'Models', parts: ['Random Forest', 'XGBoost', 'SVR', 'ElasticNet', 'KNN', 'MLP', 'CART', 'AdaBoost'] },
      { tier: 'Output', parts: ['Health index', 'Fault probability', 'Power forecast'] },
    ],
    results: [
      { label: 'Algorithms', value: '8', color: 'var(--a)' },
      { label: 'Channels', value: '5+', color: 'var(--p)' },
      { label: 'Lead time', value: 'Condition-based', color: 'var(--s)' },
      { label: 'Framework', value: 'CARE', color: '#22c55e' },
    ],
    technicalNotes: [
      'The CARE framework handles multi-output regression natively — fault state and power output are trained jointly.',
      'Feature engineering was the biggest lever: lagged correlations between temperature and vibration exposed bearing wear signatures.',
      'All preprocessing is deterministic and versioned; the notebook-to-pipeline path is fully reproducible.',
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

  'smart-home': {
    problem:
      'Smart home and city IoT networks generate large volumes of sensor data but rarely use it for optimisation. The goal was an end-to-end pipeline from sensor ingestion to automated decision-making, with ML-driven energy scheduling.',
    approach: [
      'Deployed MQTT brokers as the backbone for home and city sensor networks, with topic hierarchies for room/zone granularity.',
      'Stored all time-series data in InfluxDB with retention policies and continuous queries for downsampling.',
      'Built a scheduling model that predicts occupancy patterns from historical data and pre-heats/cools spaces only when needed.',
      'Containerised the whole stack (MQTT, InfluxDB, Grafana, Python scheduler) with Docker Compose for reproducible deployment.',
    ],
    architecture: [
      { tier: 'Edge', parts: ['Arduino sensors', 'BLE beacons', 'MQTT pub'] },
      { tier: 'Broker', parts: ['Mosquitto MQTT', 'Topic hierarchies', 'QoS 1'] },
      { tier: 'Storage', parts: ['InfluxDB', 'Grafana dashboards', 'Retention policies'] },
      { tier: 'Optimisation', parts: ['Python scheduler', 'Scikit-learn', '20% energy reduction'] },
    ],
    results: [
      { label: 'Energy saved', value: '20%', color: 'var(--a)' },
      { label: 'Protocol', value: 'MQTT', color: 'var(--p)' },
      { label: 'Database', value: 'InfluxDB', color: 'var(--s)' },
      { label: 'Deploy', value: 'Docker', color: '#22c55e' },
    ],
    technicalNotes: [
      'The 20% figure comes from comparing pre- and post-deployment bills over a 3-month winter period.',
      'Occupancy prediction used a simple Random Forest on time-of-day, day-of-week, and recent motion history.',
      'All sensor nodes publish on a 10-second cadence; the scheduler re-evaluates every 5 minutes.',
    ],
  },
};
