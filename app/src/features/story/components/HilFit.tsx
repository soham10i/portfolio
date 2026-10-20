import { useTheme } from '@/shared/lib/theme';

/* HIL Bench theme only: how the work on this site maps to hardware-in-the-
   loop and virtual validation — the area dSPACE (Paderborn) works in. Plain
   and honest: closest experience, not claimed tool experience. */
const ROWS = [
  {
    area: 'Test against a reference',
    mine: 'The factory twin is checked against its PLC programs: 56 automated checks, 1.2 mm RMS positioning error.',
  },
  {
    area: 'Closed-loop simulation',
    mine: 'A Webots robot runs mapping, planning and control in a loop against a simulated plant — software-in-the-loop in practice.',
  },
  {
    area: 'Sensors and embedded I/O',
    mine: 'Arduino Nano 33 BLE Sense logger at 50 Hz (IMU, magnetometer, BLE scan); filters validated with a ground-truth simulator.',
  },
  {
    area: 'Test automation',
    mine: 'pytest suites that gate deployment, Python tooling and CI from 2.5 years of production work.',
  },
];

export default function HilFit() {
  const theme = useTheme((s) => s.theme);
  if (theme !== 'hil') return null;
  return (
    <div data-reveal className="content-glass mt-[8vh]">
      <p className="mono !text-[10px] text-fg3">Relevant to HIL and virtual validation</p>
      <p className="t-body mt-3 max-w-[66ch] !text-fg">
        dSPACE, founded in Paderborn in 1988, builds hardware-in-the-loop and simulation systems for testing
        control software in vehicles, aircraft and automation. I have not used its tools yet. This is the closest
        work I have done:
      </p>
      <dl className="mt-5 grid gap-x-8 gap-y-4 border-t border-[color:var(--line)] pt-5 md:grid-cols-2">
        {ROWS.map((r) => (
          <div key={r.area}>
            <dt className="text-[14px] font-medium text-fg">{r.area}</dt>
            <dd className="t-body mt-1 !text-[14.5px]">{r.mine}</dd>
          </div>
        ))}
      </dl>
      <p className="mono mt-5 !text-[9.5px] text-fg3">Theme for applications · not affiliated with dSPACE GmbH</p>
    </div>
  );
}
