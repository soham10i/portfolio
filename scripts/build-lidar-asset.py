#!/usr/bin/env python3
"""Turn a teleop_mapping recording into the web asset the robotics card replays.

Inputs (written by autonomous_system/teleop_mapping/teleop_mapping.py):
    scene.ply   ASCII PLY, x y z r g b — the accumulated 3-D LIDAR point cloud
    map.npz     occupancy grid, pose_history (N×3: x, y, theta), pillar positions

Outputs (into app/public/media/work/):
    <name>-points.bin   little-endian; per point: int16 x, y, z in millimetres,
                        then (after all points) uint16 reveal index per point.
                        Points are sorted by reveal index, so the viewer can
                        uncover the map with a draw range instead of a shader.
    <name>-run.json     point count, bounds, trajectory, pillars, sensor range.

The reveal index of a point is the first pose from which it lay within the
sensor range — the moment the robot could first have seen it. Points never in
range are revealed with the last pose.

Usage:
    python3 -I scripts/build-lidar-asset.py <maps_dir> <out_dir> [name] [range_m]
"""
import json
import sys
from pathlib import Path

import numpy as np


def read_ply(path: Path) -> np.ndarray:
    lines = path.read_text().split("\n")
    header_end = lines.index("end_header") + 1
    rows = [l.split()[:3] for l in lines[header_end:] if l.strip()]
    return np.asarray(rows, dtype=np.float64)


def main() -> None:
    maps_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    name = sys.argv[3] if len(sys.argv) > 3 else "maze1"
    sensor_range = float(sys.argv[4]) if len(sys.argv) > 4 else 2.2

    pts = read_ply(maps_dir / "scene.ply")
    run = np.load(maps_dir / "map.npz", allow_pickle=False)
    poses = run["pose_history"].astype(np.float64)

    # First pose within range of each point (vectorised in chunks of poses).
    reveal = np.full(len(pts), len(poses) - 1, dtype=np.int64)
    pending = np.ones(len(pts), dtype=bool)
    xy = pts[:, :2]
    for i, (px, py, _) in enumerate(poses):
        if not pending.any():
            break
        idx = np.nonzero(pending)[0]
        d2 = (xy[idx, 0] - px) ** 2 + (xy[idx, 1] - py) ** 2
        hit = idx[d2 <= sensor_range ** 2]
        reveal[hit] = i
        pending[hit] = False

    order = np.argsort(reveal, kind="stable")
    pts, reveal = pts[order], reveal[order]

    mm = np.clip(np.round(pts * 1000), -32768, 32767).astype("<i2")
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / f"{name}-points.bin", "wb") as f:
        f.write(mm.tobytes())
        f.write(reveal.astype("<u2").tobytes())

    meta = {
        "count": int(len(pts)),
        "bounds": {
            "min": [round(float(v), 3) for v in pts.min(axis=0)],
            "max": [round(float(v), 3) for v in pts.max(axis=0)],
        },
        "sensorRange": sensor_range,
        "poses": [[round(float(x), 3), round(float(y), 3), round(float(t), 3)] for x, y, t in poses],
        "pillars": {
            "blue": [round(float(v), 3) for v in run["pillar_blue"]],
            "yellow": [round(float(v), 3) for v in run["pillar_yellow"]],
        },
        "grid": {"resolution": float(run["resolution"]), "cells": int(run["cells"])},
        "source": "teleop_mapping · Webots ROSbot · maze1",
    }
    (out_dir / f"{name}-run.json").write_text(json.dumps(meta, separators=(",", ":")))
    print(f"{name}: {len(pts)} points, {len(poses)} poses, "
          f"{(out_dir / f'{name}-points.bin').stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
