/* Version-specific content for the Smart Tabletop Factory detail page,
   transcribed from portfolio_source/pages/Portfolio Project Detail v2.dc.html. */

export interface TwinVersion {
  label: string;
  sub: string;
  demoLabel: string;
  note: string;
  telemetry: { label: string; value: string; color: string }[];
  highlights: string[];
  stack: string[];
  arch: { tier: string; parts: string[] }[];
}

export const TWIN_VERSIONS: Record<'v2' | 'v1', TwinVersion> = {
  v2: {
    label: 'v2.0', sub: 'Live 3D twin',
    demoLabel: 'Digital Twin 2.0 — live cell view',
    note: 'v2.0 renders the cell in Three.js with per-joint telemetry; the diagram above is the 2D mock used for layout review.',
    telemetry: [
      { label: 'Joint errors', value: '0 / 4', color: '#22c55e' },
      { label: 'Motor current', value: '1.84 A', color: 'var(--fg)' },
      { label: 'Order queue', value: '3 active', color: 'var(--fg)' },
      { label: 'Health score', value: '96%', color: 'var(--a)' },
    ],
    highlights: [
      'Real-time 3D visualisation with live joint telemetry and per-joint error tracking.',
      'Motor current and health monitoring surfaced next to the geometry it belongs to.',
      'Order orchestration — retrieve, store and full-cycle — driven from the twin.',
      'WebSocket-connected backend so state changes appear without polling.',
      'Hardware-agnostic adapter layer for MQTT and OPC-UA, so the twin is not tied to one controller.',
    ],
    stack: ['Three.js', 'WebSockets', 'Python', 'FastAPI', 'MQTT', 'OPC-UA', 'Docker'],
    arch: [
      { tier: 'Hardware', parts: ['Tabletop factory cell', 'VGR arm', 'High-bay storage', 'Sorting line'] },
      { tier: 'Transport', parts: ['MQTT broker', 'OPC-UA server', 'Adapter layer'] },
      { tier: 'Backend', parts: ['FastAPI', 'WebSocket gateway', 'Order orchestrator'] },
      { tier: 'Frontend', parts: ['Three.js scene', 'Telemetry panels', 'Order console'] },
      { tier: 'Ops', parts: ['Docker Compose', 'Health checks'] },
    ],
  },
  v1: {
    label: 'v1.0', sub: 'Maintenance dashboard',
    demoLabel: 'Digital Twin 1.0 — predictive maintenance',
    note: 'v1.0 shipped as a Streamlit dashboard over InfluxDB; the diagram shows the cell it monitored.',
    telemetry: [
      { label: 'Ingest rate', value: '10 Hz', color: 'var(--fg)' },
      { label: 'Subsystems', value: '4 tracked', color: 'var(--fg)' },
      { label: 'Prediction acc.', value: '85%', color: 'var(--a)' },
      { label: 'Open alerts', value: '2', color: '#f59e0b' },
    ],
    highlights: [
      'Real-time sensor ingestion via MQTT at 10 Hz across four warehouse subsystems.',
      'Predictive maintenance algorithms reaching 85% failure-prediction accuracy.',
      'Interactive Streamlit dashboards with time-series views for cross-functional teams.',
      'InfluxDB for time-series history, MySQL for equipment metadata.',
      'Docker Compose orchestration so the whole stack comes up reproducibly.',
    ],
    stack: ['Python', 'FastAPI', 'MQTT', 'InfluxDB', 'MySQL', 'Streamlit', 'Docker'],
    arch: [
      { tier: 'Hardware', parts: ['Tabletop factory cell', 'Sensor bus'] },
      { tier: 'Transport', parts: ['MQTT broker'] },
      { tier: 'Storage', parts: ['InfluxDB', 'MySQL'] },
      { tier: 'Analytics', parts: ['Anomaly detection', 'Health scoring', 'Maintenance scheduler'] },
      { tier: 'Frontend', parts: ['Streamlit dashboards'] },
    ],
  },
};

export const TWIN_TIMELINE = [
  {
    ver: 'v2.0', title: 'Live 3D twin with order orchestration',
    desc: 'Rebuilt the front end in Three.js and moved state transport to WebSockets. Added the MQTT/OPC-UA adapter layer so the same twin can sit on different controllers.',
  },
  {
    ver: 'v1.0', title: 'Predictive maintenance dashboard',
    desc: 'First working system: MQTT ingestion at 10 Hz, InfluxDB history, Streamlit dashboards and an 85%-accurate failure predictor, all containerised.',
  },
];

export const TWIN_PROBLEM =
  'A tabletop factory cell runs a full warehouse workflow — storage, retrieval, sorting, a vacuum gripper robot — but its controllers expose nothing a maintenance team can read. Faults show up as a stopped belt, not as a signal you could have acted on an hour earlier.';
