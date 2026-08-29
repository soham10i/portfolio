/* 2D layout view of the Smart Tabletop Factory cell — the schematic from the
   design's project-detail page. Purely decorative: the real geometry renders in
   3D on /factory-twin. All colours come from the palette tokens. */
export default function CellDiagram() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 960 480" preserveAspectRatio="xMidYMid meet" className="absolute inset-0">
      <defs>
        <linearGradient id="beltg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--p)" stopOpacity=".2" />
          <stop offset="100%" stopColor="var(--a)" stopOpacity=".45" />
        </linearGradient>
      </defs>

      {/* Floor rails */}
      <g stroke="var(--line)" strokeWidth="1" fill="none" opacity=".7">
        <path d="M0 340 H960" />
        <path d="M0 300 H960" />
      </g>

      {/* Conveyor belts */}
      <g fill="none" stroke="url(#beltg)" strokeWidth="14" strokeLinecap="round">
        <path d="M120 320 H420" />
        <path d="M540 320 H840" />
      </g>
      <g fill="none" stroke="var(--a)" strokeWidth="2" strokeDasharray="8 12" opacity=".8" style={{ animation: 'flow 1.4s linear infinite' }}>
        <path d="M120 320 H420" />
        <path d="M540 320 H840" />
      </g>

      {/* Stations and the VGR arm */}
      <g fill="none" stroke="var(--p)" strokeWidth="2.4" opacity=".85">
        <rect x="80" y="150" width="140" height="140" rx="8" fill="color-mix(in oklab,var(--p) 10%,transparent)" />
        <rect x="700" y="120" width="180" height="170" rx="8" fill="color-mix(in oklab,var(--s) 10%,transparent)" />
        <path d="M480 320 V220 l-60 -50" />
        <path d="M480 220 l70 -46" />
        <circle cx="480" cy="320" r="16" fill="color-mix(in oklab,var(--a) 22%,transparent)" />
        <circle cx="480" cy="220" r="10" fill="color-mix(in oklab,var(--a) 30%,transparent)" />
      </g>

      {/* Shelf slots */}
      <g stroke="var(--line)" strokeWidth="1" fill="none">
        <path d="M100 190 H200 M100 215 H200 M100 240 H200" opacity=".7" />
        <path d="M720 150 H860 M720 180 H860 M720 210 H860 M720 240 H860" opacity=".7" />
      </g>

      {/* Sensor nodes */}
      <g fill="var(--a)">
        <circle cx="420" cy="320" r="4" style={{ animation: 'pulseNode 2.2s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }} />
        <circle cx="540" cy="320" r="4" style={{ animation: 'pulseNode 2.2s ease-in-out .7s infinite', transformBox: 'fill-box', transformOrigin: 'center' }} />
        <circle cx="700" cy="205" r="4" style={{ animation: 'pulseNode 2.2s ease-in-out 1.4s infinite', transformBox: 'fill-box', transformOrigin: 'center' }} />
      </g>

      <g fill="var(--fg3)" fontFamily="JetBrains Mono, monospace" fontSize="12" letterSpacing="1.6">
        <text x="80" y="140">HIGH-BAY STORAGE</text>
        <text x="700" y="110">SORTING STATION</text>
        <text x="432" y="370">VGR ARM · J1–J4</text>
      </g>
    </svg>
  );
}
