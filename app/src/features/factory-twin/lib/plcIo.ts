/* PLC I/O map for the fischertechnik 536634 Fabrik-Simulation 24V.
   Transcribed verbatim from the Belegungspläne in the official manual
   (536634Fabrik_Simulation_24V.pdf, pp. 3-6). Inputs are P-reading,
   outputs P-switching, all 24 V DC.

   The twin drives these from its phase clock, so the rail shows the same
   tags an engineer would see on the real controller. */

export interface IoPoint {
  tag: string;                 // PLC address, e.g. 'Q11'
  terminal: number;            // Klemme Nr. on the 34-pin connector
  label: string;
  station: StationKey;
  kind: 'input' | 'output';
  /** Cycle phases during which this point is asserted. */
  activeIn?: string[];
}

export type StationKey = 'vsg' | 'hrl' | 'mpo' | 'sld';

export const STATION_LABEL: Record<StationKey, string> = {
  vsg: 'Vakuum-Sauggreifer',
  hrl: 'Automatisiertes Hochregallager',
  mpo: 'Bearbeitungsstation mit Brennofen',
  sld: 'Sortierstrecke mit Farberkennung',
};

/* Bearbeitungsstation mit Brennofen — the station this scene models.
   9 inputs, 14 outputs. */
export const MPO_IO: IoPoint[] = [
  { tag: 'I1', terminal: 5, label: 'Referenzschalter Drehkranz (Sauger)', station: 'mpo', kind: 'input', activeIn: ['idle', 'picking'] },
  { tag: 'I2', terminal: 6, label: 'Referenzschalter Drehkranz (Förderband)', station: 'mpo', kind: 'input', activeIn: ['moving'] },
  { tag: 'I3', terminal: 7, label: 'Lichtschranke Ende Förderband', station: 'mpo', kind: 'input', activeIn: ['detecting'] },
  { tag: 'I4', terminal: 8, label: 'Referenzschalter Drehkranz (Säge)', station: 'mpo', kind: 'input', activeIn: ['sorting'] },
  { tag: 'I5', terminal: 9, label: 'Referenzschalter Sauger (Drehkranz)', station: 'mpo', kind: 'input', activeIn: ['storing'] },
  { tag: 'I6', terminal: 10, label: 'Referenzschalter Ofenschieber innen', station: 'mpo', kind: 'input', activeIn: ['baking', 'cooling'] },
  { tag: 'I7', terminal: 11, label: 'Referenzschalter Ofenschieber außen', station: 'mpo', kind: 'input', activeIn: ['idle', 'picking', 'moving'] },
  { tag: 'I8', terminal: 12, label: 'Referenzschalter Sauger (Brennofen)', station: 'mpo', kind: 'input', activeIn: ['baking'] },
  { tag: 'I9', terminal: 13, label: 'Lichtschranke Brennofen', station: 'mpo', kind: 'input', activeIn: ['baking', 'cooling'] },

  { tag: 'Q1', terminal: 17, label: 'Motor Drehkranz im Uhrzeigersinn (M1)', station: 'mpo', kind: 'output', activeIn: ['picking'] },
  { tag: 'Q2', terminal: 18, label: 'Motor Drehkranz gegen Uhrzeigersinn (M1)', station: 'mpo', kind: 'output', activeIn: ['storing'] },
  { tag: 'Q3', terminal: 19, label: 'Motor Förderband vorwärts (M2)', station: 'mpo', kind: 'output', activeIn: ['moving', 'detecting', 'sorting'] },
  { tag: 'Q4', terminal: 20, label: 'Motor Säge (M3)', station: 'mpo', kind: 'output', activeIn: ['sorting'] },
  { tag: 'Q5', terminal: 21, label: 'Motor Ofenschieber einfahren (M4)', station: 'mpo', kind: 'output', activeIn: ['baking'] },
  { tag: 'Q6', terminal: 22, label: 'Motor Ofenschieber ausfahren (M4)', station: 'mpo', kind: 'output', activeIn: ['cooling'] },
  { tag: 'Q7', terminal: 23, label: 'Motor Sauger zum Ofen (M5)', station: 'mpo', kind: 'output', activeIn: ['picking'] },
  { tag: 'Q8', terminal: 24, label: 'Motor Sauger zum Drehkranz (M5)', station: 'mpo', kind: 'output', activeIn: ['cooling'] },
  { tag: 'Q9', terminal: 25, label: 'Leuchte Ofen', station: 'mpo', kind: 'output', activeIn: ['baking'] },
  { tag: 'Q10', terminal: 26, label: 'Kompressor', station: 'mpo', kind: 'output', activeIn: ['picking', 'storing'] },
  { tag: 'Q11', terminal: 27, label: 'Ventil Vakuum', station: 'mpo', kind: 'output', activeIn: ['picking', 'moving', 'storing'] },
  { tag: 'Q12', terminal: 28, label: 'Ventil Senken', station: 'mpo', kind: 'output', activeIn: ['picking', 'storing'] },
  { tag: 'Q13', terminal: 29, label: 'Ventil Ofentür', station: 'mpo', kind: 'output', activeIn: ['baking', 'cooling'] },
  { tag: 'Q14', terminal: 30, label: 'Ventil Schieber', station: 'mpo', kind: 'output', activeIn: ['baking'] },
];

/** Which I/O points are asserted during a given cycle phase. */
export function ioState(phase: string) {
  return MPO_IO.map((p) => ({ ...p, on: !!p.activeIn?.includes(phase) }));
}

/* Actuator ratings from the Bauteilbeschreibung (pp. 8-10) — used for the
   engineering read-outs rather than invented numbers. */
export const ACTUATOR_SPECS = {
  encoderMotor: {
    name: 'Encodermotor',
    volts: 24, watts: 2.03, rpm: 214, currentMa: 320,
    gearRatio: '25:1', pulsesPerMotorRev: 3, pulsesPerOutputRev: 75,
    note: 'Quadratur — zwei phasenversetzte Impulse, Push-Pull max. 1 kHz',
  },
  sMotor: {
    name: 'S-Motor 24V',
    volts: 24, currentMa: 300, torqueMnm: 5, noLoadRpm: 10700,
    gearRatio: '64,8:1 (U-Getriebe)',
  },
  compressor: {
    name: 'Kompressor (Membranpumpe)',
    volts: 24, currentMa: 70, barGauge: 0.7,
  },
  colourSensor: {
    name: 'Farbsensor',
    output: '0–9 V analog', note: 'Rotlicht, Reflexionsmessung über Fototransistor',
  },
} as const;
