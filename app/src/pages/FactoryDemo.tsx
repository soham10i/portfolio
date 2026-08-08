import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Play, Pause, RotateCcw, Zap, Thermometer, 
  Activity, Box, Radio, AlertTriangle,
  Factory, X, Gauge, MoveHorizontal
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ================================================================
// TYPES
// ================================================================
type Phase = 'idle' | 'picking' | 'moving' | 'baking' | 'cooling' | 'detecting' | 'sorting' | 'storing';
type ComponentId = 'hbw' | 'robot1' | 'conveyor' | 'oven' | 'sensor' | 'sorting' | 'robot2';

interface FactoryState {
  phase: Phase;
  phaseProgress: number; // 0-1
  itemPosition: number; // 0-100 (percent along conveyor)
  ovenTemp: number;
  conveyorSpeed: number;
  colorDetected: string;
  colorConfidence: number;
  totalProduced: number;
  itemsPerHour: number;
  robot1Angle: number;
  robot2Angle: number;
  mqttMessages: MqttMessage[];
}

interface MqttMessage {
  id: string;
  topic: string;
  payload: string;
  timestamp: Date;
}

interface ComponentInfo {
  id: ComponentId;
  name: string;
  description: string;
  status: 'active' | 'idle' | 'warning';
  metrics: { label: string; value: string }[];
}

// ================================================================
// CONSTANTS
// ================================================================
const PHASES: Phase[] = ['idle', 'picking', 'moving', 'baking', 'cooling', 'detecting', 'sorting', 'storing'];
const PHASE_DURATIONS: Record<Phase, number> = {
  idle: 1.5, picking: 2, moving: 3, baking: 4, cooling: 1.5, detecting: 1, sorting: 2, storing: 1.5,
};

const COLORS = ['Red', 'Green', 'Blue'];
const COLOR_VALUES: Record<string, string> = { Red: '#ef4444', Green: '#22c55e', Blue: '#3b82f6' };

const COMPONENT_DATA: Record<ComponentId, ComponentInfo> = {
  hbw: {
    id: 'hbw', name: 'High-Bay Warehouse',
    description: 'Automated storage with 3×3 shelf grid. Stores raw cookie bases and sorted finished products.',
    status: 'active',
    metrics: [
      { label: 'Capacity', value: '9 slots' },
      { label: 'Current Load', value: '6/9' },
      { label: 'Access Time', value: '~3s' },
    ],
  },
  robot1: {
    id: 'robot1', name: 'Vacuum Gripper Robot',
    description: '4-DOF robotic arm with vacuum suction gripper. Picks raw materials from HBW and places on conveyor.',
    status: 'active',
    metrics: [
      { label: 'DOF', value: '4' },
      { label: 'Payload', value: '200g' },
      { label: 'Cycle Time', value: '4s' },
    ],
  },
  conveyor: {
    id: 'conveyor', name: 'Conveyor Belt',
    description: 'DC motor-driven belt with encoder feedback. Transports items between stations.',
    status: 'active',
    metrics: [
      { label: 'Length', value: '450mm' },
      { label: 'Max Speed', value: '0.3 m/s' },
      { label: 'Encoder', value: '360 PPR' },
    ],
  },
  oven: {
    id: 'oven', name: 'Processing Oven',
    description: 'Heating station for cookie baking. Temperature-controlled with safety interlocks.',
    status: 'active',
    metrics: [
      { label: 'Max Temp', value: '200°C' },
      { label: 'Setpoint', value: '180°C' },
      { label: 'Heating Time', value: '4s' },
    ],
  },
  sensor: {
    id: 'sensor', name: 'Color Sensor',
    description: 'RGB color detection module. Identifies cookie type for sorting decisions.',
    status: 'active',
    metrics: [
      { label: 'Type', value: 'RGB Reflective' },
      { label: 'Range', value: '5-20mm' },
      { label: 'Accuracy', value: '>95%' },
    ],
  },
  sorting: {
    id: 'sorting', name: 'Sorting Station',
    description: '3-way pneumatic diverter that routes cookies to color-matched storage bins.',
    status: 'active',
    metrics: [
      { label: 'Channels', value: '3' },
      { label: 'Actuator', value: 'Pneumatic' },
      { label: 'Sort Time', value: '1.5s' },
    ],
  },
  robot2: {
    id: 'robot2', name: 'Sort Gripper Robot',
    description: 'Secondary robot for handling sorted cookies and placing them into HBW storage.',
    status: 'idle',
    metrics: [
      { label: 'DOF', value: '3' },
      { label: 'Payload', value: '150g' },
      { label: 'Mode', value: 'Standby' },
    ],
  },
};

// ================================================================
// INITIAL STATE
// ================================================================
const createInitialState = (): FactoryState => ({
  phase: 'idle',
  phaseProgress: 0,
  itemPosition: 0,
  ovenTemp: 25,
  conveyorSpeed: 0,
  colorDetected: '-',
  colorConfidence: 0,
  totalProduced: 0,
  itemsPerHour: 0,
  robot1Angle: 0,
  robot2Angle: 0,
  mqttMessages: [],
});

// ================================================================
// MAIN COMPONENT
// ================================================================
// Deterministic HBW shelf fill pattern (Math.random() in render made shelves flicker every frame)
const SHELF_FILLED = [true, true, false, true, true, true, false, true, true];

export default function FactoryDemo() {
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [state, setState] = useState<FactoryState>(createInitialState());
  const [selectedComponent, setSelectedComponent] = useState<ComponentId | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(true);

  // Clocks start at 0 and are stamped on the first tick — calling
  // Date.now() during render is impure and trips react-hooks/purity.
  const phaseStartTime = useRef(0);
  const runStartTime = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const animFrame = useRef<number>(0);

  // Simulation loop
  const tick = useCallback(() => {
    setState(prev => {
      const now = Date.now();
      if (phaseStartTime.current === 0) {
        phaseStartTime.current = now;
        runStartTime.current = now;
        return prev;
      }
      const elapsed = (now - phaseStartTime.current) / 1000;
      const phaseDuration = PHASE_DURATIONS[prev.phase] / speed;
      const progress = Math.min(elapsed / phaseDuration, 1);

      // Calculate next state
      let nextPhase = prev.phase;
      let nextProgress = progress;
      let itemPos = prev.itemPosition;
      let temp = prev.ovenTemp;
      let convSpeed = prev.conveyorSpeed;
      let color = prev.colorDetected;
      let conf = prev.colorConfidence;
      let produced = prev.totalProduced;
      let r1Angle = prev.robot1Angle;
      let r2Angle = prev.robot2Angle;
      const messages = [...prev.mqttMessages];

      // Phase transitions
      if (progress >= 1) {
        const idx = PHASES.indexOf(prev.phase);
        nextPhase = PHASES[(idx + 1) % PHASES.length];
        nextProgress = 0;
        phaseStartTime.current = now;

        // MQTT message on phase change
        const topic = `factory/phase`;
        const payload = JSON.stringify({ phase: nextPhase, timestamp: now });
        messages.unshift({ id: Date.now().toString(), topic, payload, timestamp: new Date() });
        if (messages.length > 20) messages.pop();
      }

      // Update values based on phase
      switch (nextPhase) {
        case 'idle':
          convSpeed = 0;
          temp = Math.max(25, temp - 2);
          r1Angle = 0;
          r2Angle = 0;
          itemPos = 0;
          color = '-';
          conf = 0;
          break;
        case 'picking':
          convSpeed = 0;
          temp = Math.max(25, temp - 1);
          itemPos = 0;
          r1Angle = nextProgress * 45;
          if (nextProgress > 0.5 && prev.phaseProgress <= 0.5 && prev.phase === 'picking') {
            messages.unshift({
              id: Date.now().toString(),
              topic: 'factory/hbw/access',
              payload: JSON.stringify({ slot: Math.floor(Math.random() * 9), action: 'pick' }),
              timestamp: new Date(),
            });
          }
          break;
        case 'moving':
          convSpeed = 0.3 * speed;
          temp = Math.max(25, temp - 1);
          itemPos = nextProgress * 100;
          r1Angle = 45;
          color = '-';
          conf = 0;
          break;
        case 'baking':
          convSpeed = 0;
          temp = 25 + (155 * nextProgress);
          itemPos = 45;
          if (nextProgress > 0.8 && temp > 170 && prev.ovenTemp <= 170) {
            messages.unshift({
              id: Date.now().toString(),
              topic: 'factory/oven/temp',
              payload: JSON.stringify({ temp: Math.round(temp), status: 'baking' }),
              timestamp: new Date(),
            });
          }
          break;
        case 'cooling':
          convSpeed = 0;
          temp = 180 - (20 * nextProgress);
          itemPos = 55;
          break;
        case 'detecting':
          convSpeed = 0;
          temp = Math.max(25, temp - 5);
          itemPos = 70;
          if (nextProgress > 0.3 && color === '-') {
            color = COLORS[Math.floor(Math.random() * COLORS.length)];
            conf = 92 + Math.floor(Math.random() * 8);
            messages.unshift({
              id: Date.now().toString(),
              topic: 'factory/sensor/color',
              payload: JSON.stringify({ color, confidence: conf }),
              timestamp: new Date(),
            });
          }
          break;
        case 'sorting':
          convSpeed = 0.15 * speed;
          temp = Math.max(25, temp - 3);
          itemPos = 70 + (nextProgress * 30);
          r2Angle = nextProgress * 30;
          break;
        case 'storing':
          convSpeed = 0;
          temp = Math.max(25, temp - 2);
          itemPos = 100;
          r2Angle = 30;
          if (nextProgress > 0.5 && prev.phaseProgress <= 0.5 && prev.phase === 'storing') {
            produced += 1;
            messages.unshift({
              id: Date.now().toString(),
              topic: 'factory/sorting/complete',
              payload: JSON.stringify({ color, bin: color.toLowerCase(), count: produced }),
              timestamp: new Date(),
            });
          }
          break;
      }

      return {
        phase: nextPhase,
        phaseProgress: nextProgress,
        itemPosition: itemPos,
        ovenTemp: temp,
        conveyorSpeed: convSpeed,
        colorDetected: color,
        colorConfidence: conf,
        totalProduced: produced,
        itemsPerHour: produced > 0 ? Math.round((produced / ((now - runStartTime.current + 1) / 1000)) * 3600) : 0,
        robot1Angle: r1Angle,
        robot2Angle: r2Angle,
        mqttMessages: messages.slice(0, 20),
      };
    });
  }, [speed]);

  // Animation frame loop
  useEffect(() => {
    if (!running) {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      return;
    }
    const loop = () => {
      tick();
      animFrame.current = requestAnimationFrame(loop);
    };
    animFrame.current = requestAnimationFrame(loop);
    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [running, tick]);

  const reset = () => {
    const now = Date.now();
    setState(createInitialState());
    phaseStartTime.current = now;
    runStartTime.current = now;
    pausedAt.current = null;
  };

  // Shift the phase clock by the pause duration so resuming doesn't
  // instantly complete the paused phase.
  const toggleRunning = () => {
    if (running) {
      pausedAt.current = Date.now();
    } else if (pausedAt.current !== null) {
      const pausedFor = Date.now() - pausedAt.current;
      phaseStartTime.current += pausedFor;
      runStartTime.current += pausedFor;
      pausedAt.current = null;
    }
    setRunning(!running);
  };

  // ================================================================
  // RENDER HELPERS
  // ================================================================
  const phaseLabel = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
  const isBaking = state.phase === 'baking';
  const isMoving = state.phase === 'moving' || state.phase === 'sorting';

  return (
    // data-theme="dark" pins this page to the dark palette — it's an
    // industrial dashboard designed dark; without it, light mode renders
    // near-black text on the hardcoded near-black background.
    <div data-theme="dark" className="min-h-screen bg-[#080c14] text-foreground overflow-hidden flex flex-col">
      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.02]" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)'
      }} />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/30 bg-[#080c14]/80 backdrop-blur-md z-40">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 rounded-lg hover:bg-muted/30 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Factory className="w-5 h-5 text-blue-400" />
              Smart Tabletop Factory — Digital Twin
            </h1>
            <p className="text-xs text-muted-foreground">Industry 4.0 Simulation · Fischertechnik 536634</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs text-green-400 font-medium">Simulation Live</span>
          </div>
        </div>
      </header>

      {/* Disclaimer */}
      <AnimatePresence>
        {showDisclaimer && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500/5 border-b border-amber-500/10 overflow-hidden"
          >
            <div className="px-6 py-2 flex items-center justify-between">
              <p className="text-xs text-amber-400/80 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Layout is conceptual based on typical Fischertechnik 536634 arrangement. Component positions are approximate.
              </p>
              <button onClick={() => setShowDisclaimer(false)} className="text-xs text-amber-400/60 hover:text-amber-400">Dismiss</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Factory Floor */}
        <div className="flex-1 relative p-4 sm:p-6 min-h-[320px]">
          <div className="w-full h-full rounded-2xl border border-border/20 bg-[#0a0f1a] relative overflow-hidden">
            {/* Grid background */}
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: 'linear-gradient(#1a2332 1px, transparent 1px), linear-gradient(90deg, #1a2332 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }} />

            {/* SVG Factory Floor */}
            <svg viewBox="0 0 860 420" className="w-full h-full relative z-10" preserveAspectRatio="xMidYMid meet">
              {/* Floor outline */}
              <rect x="30" y="30" width="800" height="360" rx="12" fill="none" stroke="#1a2a3f" strokeWidth="2" />
              
              {/* Title */}
              <text x="50" y="58" fill="#64748b" fontSize="11" fontFamily="monospace" letterSpacing="2">PRODUCTION LINE 01</text>

              {/* ===== HIGH-BAY WAREHOUSE ===== */}
              <g className="cursor-pointer" onClick={() => setSelectedComponent('hbw')}>
                <rect x="60" y="80" width="85" height="180" rx="4" fill="#0f1929" stroke="#2d3a4f" strokeWidth="1.5" />
                <text x="102" y="72" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">HBW</text>
                {/* Shelves */}
                {[0,1,2].map(row => [0,1,2].map(col => (
                  <rect key={`${row}-${col}`} x={68 + col * 25} y={90 + row * 55} width={20} height={45} rx={2}
                    fill={SHELF_FILLED[row * 3 + col] ? '#1e3a5f' : '#0f1929'} stroke="#2d3a4f" strokeWidth="0.5" />
                )))}
                {/* Lift */}
                <rect x="80" y={90 + (state.phase === 'picking' ? 55 : 0)} width="10" height="45" rx="1" fill="#3b82f6" opacity="0.6">
                  <animate attributeName="y" values={`${90};${145};${90}`} dur="3s" repeatCount="indefinite" />
                </rect>
                {/* Status */}
                <circle cx="130" cy="85" r="3" fill={state.phase === 'picking' ? '#22c55e' : '#64748b'}
                  className={state.phase === 'picking' ? 'animate-pulse' : ''} />
              </g>

              {/* ===== ROBOT 1 ===== */}
              <g className="cursor-pointer" onClick={() => setSelectedComponent('robot1')}>
                <circle cx="185" cy="170" r="22" fill="#0f1929" stroke="#3b82f6" strokeWidth="1.5" />
                <text x="185" y="138" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">VGR-1</text>
                {/* Arm */}
                <line x1="185" y1="170" x2={185 + Math.cos((state.robot1Angle - 90) * Math.PI / 180) * 30} 
                  y2={170 + Math.sin((state.robot1Angle - 90) * Math.PI / 180) * 30} 
                  stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
                {/* Gripper */}
                <circle cx={185 + Math.cos((state.robot1Angle - 90) * Math.PI / 180) * 30} 
                  cy={170 + Math.sin((state.robot1Angle - 90) * Math.PI / 180) * 30} r="5" fill="#93c5fd" />
                <circle cx="200" cy="148" r="3" fill={state.phase === 'picking' ? '#22c55e' : '#64748b'} 
                  className={state.phase === 'picking' ? 'animate-pulse' : ''} />
              </g>

              {/* ===== CONVEYOR ===== */}
              <g className="cursor-pointer" onClick={() => setSelectedComponent('conveyor')}>
                <rect x="170" y="260" width="420" height="28" rx="4" fill="#0f1929" stroke="#1e3a5f" strokeWidth="1.5" />
                <text x="170" y="252" fill="#94a3b8" fontSize="9" fontFamily="monospace">CONVEYOR</text>
                {/* Animated belt dashes */}
                <line x1="180" y1="274" x2="580" y2="274" stroke="#3b82f6" strokeWidth="2" 
                  strokeDasharray="8 6" opacity="0.5">
                  {isMoving && <animate attributeName="stroke-dashoffset" values="0;-28" dur={`${0.5 / speed}s`} repeatCount="indefinite" />}
                </line>
                {/* Item on conveyor */}
                {state.itemPosition > 0 && state.itemPosition < 100 && (
                  <circle cx={180 + (state.itemPosition / 100) * 400} cy="274" r="8" fill="#d97706" stroke="#f59e0b" strokeWidth="1.5">
                    {isMoving && <animate attributeName="opacity" values="1;0.8;1" dur="0.5s" repeatCount="indefinite" />}
                  </circle>
                )}
                <circle cx="575" cy="256" r="3" fill={isMoving ? '#22c55e' : '#64748b'} 
                  className={isMoving ? 'animate-pulse' : ''} />
              </g>

              {/* ===== OVEN ===== */}
              <g className="cursor-pointer" onClick={() => setSelectedComponent('oven')}>
                <rect x="350" y="150" width="75" height="65" rx="6" fill="#0f1929" stroke="#7c2d12" strokeWidth="1.5" />
                <text x="387" y="142" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">OVEN</text>
                {/* Heat glow */}
                <rect x="355" y="155" width="65" height="55" rx="4" fill={isBaking ? '#f97316' : '#1e293b'} opacity={isBaking ? 0.3 + state.phaseProgress * 0.4 : 0.2}>
                  {isBaking && <animate attributeName="opacity" values="0.3;0.6;0.3" dur="1s" repeatCount="indefinite" />}
                </rect>
                {/* Temp display */}
                <text x="387" y="190" fill={isBaking ? '#f97316' : '#64748b'} fontSize="12" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                  {Math.round(state.ovenTemp)}°C
                </text>
                <circle cx="415" cy="158" r="3" fill={isBaking ? '#f97316' : '#64748b'} className={isBaking ? 'animate-pulse' : ''} />
              </g>

              {/* ===== COLOR SENSOR ===== */}
              <g className="cursor-pointer" onClick={() => setSelectedComponent('sensor')}>
                <rect x="480" y="254" width="18" height="18" rx="3" fill="#0f1929" stroke="#06b6d4" strokeWidth="1.5" />
                <text x="489" y="248" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="monospace">RGB</text>
                {/* Light beam */}
                <line x1="489" y1="272" x2="489" y2="285" stroke="#06b6d4" strokeWidth="1" opacity={state.phase === 'detecting' ? 0.8 : 0.2} 
                  className={state.phase === 'detecting' ? 'animate-pulse' : ''} />
                <circle cx="494" cy="258" r="2.5" fill={state.phase === 'detecting' ? '#06b6d4' : '#64748b'} 
                  className={state.phase === 'detecting' ? 'animate-pulse' : ''} />
              </g>

              {/* ===== SORTING STATION ===== */}
              <g className="cursor-pointer" onClick={() => setSelectedComponent('sorting')}>
                <rect x="610" y="80" width="95" height="180" rx="4" fill="#0f1929" stroke="#4a5568" strokeWidth="1.5" />
                <text x="657" y="72" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">SORTER</text>
                {/* Bins */}
                <rect x="620" y="95" width="75" height="42" rx="3" fill="#1e293b" stroke={state.colorDetected === 'Red' ? '#ef4444' : '#334155'} strokeWidth={state.colorDetected === 'Red' ? 2 : 1} />
                <rect x="620" y="145" width="75" height="42" rx="3" fill="#1e293b" stroke={state.colorDetected === 'Green' ? '#22c55e' : '#334155'} strokeWidth={state.colorDetected === 'Green' ? 2 : 1} />
                <rect x="620" y="195" width="75" height="42" rx="3" fill="#1e293b" stroke={state.colorDetected === 'Blue' ? '#3b82f6' : '#334155'} strokeWidth={state.colorDetected === 'Blue' ? 2 : 1} />
                {/* Labels */}
                <text x="657" y="121" fill="#ef4444" fontSize="10" textAnchor="middle" fontFamily="monospace">RED</text>
                <text x="657" y="171" fill="#22c55e" fontSize="10" textAnchor="middle" fontFamily="monospace">GREEN</text>
                <text x="657" y="221" fill="#3b82f6" fontSize="10" textAnchor="middle" fontFamily="monospace">BLUE</text>
                <circle cx="695" cy="90" r="3" fill={state.phase === 'sorting' ? '#22c55e' : '#64748b'} className={state.phase === 'sorting' ? 'animate-pulse' : ''} />
              </g>

              {/* ===== ROBOT 2 ===== */}
              <g className="cursor-pointer" onClick={() => setSelectedComponent('robot2')}>
                <circle cx="570" cy="170" r="18" fill="#0f1929" stroke="#3b82f6" strokeWidth="1.5" opacity="0.7" />
                <text x="570" y="142" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="monospace">VGR-2</text>
                <line x1="570" y1="170" x2={570 + Math.cos((state.robot2Angle - 90) * Math.PI / 180) * 22} 
                  y2={170 + Math.sin((state.robot2Angle - 90) * Math.PI / 180) * 22} 
                  stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <circle cx="582" cy="150" r="2.5" fill={state.phase === 'storing' ? '#22c55e' : '#64748b'} 
                  className={state.phase === 'storing' ? 'animate-pulse' : ''} />
              </g>

              {/* ===== FLOW ARROWS ===== */}
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 L2,4 Z" fill="#3b82f6" opacity="0.4" />
                </marker>
              </defs>
              <line x1="145" y1="170" x2="160" y2="170" stroke="#3b82f6" strokeWidth="1" opacity="0.3" markerEnd="url(#arrow)" />
              <line x1="210" y1="274" x2="340" y2="274" stroke="#3b82f6" strokeWidth="1" opacity="0.3" markerEnd="url(#arrow)" />
              <line x1="430" y1="274" x2="470" y2="274" stroke="#3b82f6" strokeWidth="1" opacity="0.3" markerEnd="url(#arrow)" />
              <line x1="500" y1="274" x2="600" y2="274" stroke="#3b82f6" strokeWidth="1" opacity="0.3" markerEnd="url(#arrow)" />

              {/* ===== PHASE INDICATOR ===== */}
              <rect x="350" y="340" width="160" height="32" rx="16" fill="#0f1929" stroke="#1e3a5f" strokeWidth="1" />
              <text x="430" y="360" fill="#e2e8f0" fontSize="11" textAnchor="middle" fontFamily="monospace" fontWeight="600">
                PHASE: {phaseLabel.toUpperCase()}
              </text>
            </svg>

            {/* Component Info Overlay */}
            <AnimatePresence>
              {selectedComponent && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="absolute top-4 right-4 w-64 glass rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">{COMPONENT_DATA[selectedComponent].name}</h3>
                    <button onClick={() => setSelectedComponent(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    {COMPONENT_DATA[selectedComponent].description}
                  </p>
                  <div className="space-y-2">
                    {COMPONENT_DATA[selectedComponent].metrics.map(m => (
                      <div key={m.label} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="font-mono">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Data Panel */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border/20 bg-[#0a0f1a] flex flex-col max-h-[45vh] lg:max-h-none">
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-border/20">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Live Data
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* System Status */}
            <div className="glass rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">System Status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${running ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  {running ? 'Running' : 'Paused'}
                </span>
              </div>
              <div className="text-2xl font-bold font-mono">{phaseLabel}</div>
              <div className="mt-2 h-1 bg-muted/30 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-blue-500 rounded-full"
                  animate={{ width: `${state.phaseProgress * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </div>

            {/* Production Metrics */}
            <div className="glass rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <Box className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-medium">Production</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xl font-bold font-mono">{state.totalProduced}</div>
                  <div className="text-[10px] text-muted-foreground">Total Cookies</div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono">{state.itemsPerHour}</div>
                  <div className="text-[10px] text-muted-foreground">Per Hour</div>
                </div>
              </div>
            </div>

            {/* Sensor Readings */}
            <div className="glass rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-medium">Sensors</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Conveyor Speed</span>
                    <span className="font-mono">{(state.conveyorSpeed * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-muted/30 rounded-full">
                    <motion.div className="h-full bg-cyan-500 rounded-full" animate={{ width: `${state.conveyorSpeed / 0.3 * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Oven Temperature</span>
                    <span className="font-mono">{Math.round(state.ovenTemp)}°C</span>
                  </div>
                  <div className="h-1 bg-muted/30 rounded-full">
                    <motion.div 
                      className="h-full rounded-full" 
                      style={{ backgroundColor: state.ovenTemp > 150 ? '#f97316' : '#3b82f6' }}
                      animate={{ width: `${Math.min(state.ovenTemp / 200 * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Color Detected</span>
                  <div className="flex items-center gap-2">
                    {state.colorDetected !== '-' && (
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_VALUES[state.colorDetected] }} />
                    )}
                    <span className="text-xs font-mono">{state.colorDetected}</span>
                    {state.colorConfidence > 0 && (
                      <span className="text-[10px] text-muted-foreground">({state.colorConfidence}%)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* MQTT Log */}
            <div className="glass rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <Radio className="w-4 h-4 text-green-400" />
                <span className="text-xs font-medium">MQTT Stream</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {state.mqttMessages.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Waiting for messages...</p>
                )}
                {state.mqttMessages.map((msg) => (
                  <div key={msg.id} className="text-[10px] font-mono p-1.5 rounded bg-muted/20">
                    <span className="text-blue-400">{msg.topic}</span>
                    <span className="text-muted-foreground ml-1">{msg.payload.slice(0, 40)}...</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="px-6 py-3 border-t border-border/20 bg-[#080c14]/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleRunning}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              running 
                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' 
                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
            }`}
          >
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {running ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Speed</span>
          <div className="flex items-center gap-1">
            {[0.5, 1, 2].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  speed === s 
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            24V System
          </span>
          <span className="flex items-center gap-1.5">
            <MoveHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            0.3 m/s
          </span>
          <span className="flex items-center gap-1.5">
            <Thermometer className="w-3.5 h-3.5 text-orange-400" />
            180°C Max
          </span>
        </div>
      </div>
    </div>
  );
}
