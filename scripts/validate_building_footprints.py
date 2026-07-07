"""Check that modeled footprints fit inside lot polygons."""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    script = ROOT / "web-3d" / "scripts" / "validate-footprints.mjs"
    if not script.exists():
        print("Validation script missing", file=sys.stderr)
        return 1
    result = subprocess.run(
        ["node", str(script)],
        cwd=ROOT / "web-3d",
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
