"""``edge`` command line: serve, train, probe TwinSpires."""
from __future__ import annotations

import argparse
import json
import logging
import sys


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="edge", description="Equine Edge v2")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("serve", help="run the API (and the built web app) locally")
    s.add_argument("--host", default="127.0.0.1", help="bind address (default: loopback only)")
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--reload", action="store_true")

    sub.add_parser("train", help="train + evaluate the form model (see edge.model.train --help)", add_help=False)

    p = sub.add_parser("ts-probe", help="check the TwinSpires endpoints from this network and save raw captures")
    p.add_argument("--races", type=int, default=2, help="how many tracks to sample race/entry calls from")

    args, rest = ap.parse_known_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.cmd == "serve":
        import uvicorn
        if args.host not in ("127.0.0.1", "localhost", "::1"):
            print("warning: Equine Edge has no authentication; binding beyond loopback exposes it to your network",
                  file=sys.stderr)
        uvicorn.run("edge.api:create_app", factory=True, host=args.host, port=args.port, reload=args.reload)
        return 0
    if args.cmd == "train":
        from .model.train import main as train_main
        return train_main(rest)
    if args.cmd == "ts-probe":
        from .probe import probe
        report = probe(sample=args.races)
        print(json.dumps(report, indent=2))
        return 0 if report.get("ok") else 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
