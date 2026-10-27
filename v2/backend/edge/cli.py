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

    sub.add_parser("calibrate", help="refit the market/form blend from recorded races", add_help=False)

    p = sub.add_parser("ts-probe", help="check the TwinSpires endpoints from this network and save raw captures")
    p.add_argument("--races", type=int, default=2, help="how many tracks to sample race/entry calls from")

    h = sub.add_parser("hk-fetch", help="pull an HKJC card and win odds into the meeting files (needs HKJC reachable)")
    h.add_argument("--date", help="meeting date YYYY-MM-DD (default: today in Hong Kong)")
    h.add_argument("--venue", default="ST", help="ST (Sha Tin) or HV (Happy Valley)")
    h.add_argument("--odds-only", action="store_true", help="keep the existing card file, refresh odds only")
    h.add_argument("--watch", type=int, default=0, metavar="SEC", help="repeat the odds refresh every SEC seconds")

    v = sub.add_parser("hk-show", help="print model chances for an HKJC meeting in the terminal")
    v.add_argument("--date", help="meeting date YYYY-MM-DD (default: today in Hong Kong)")
    v.add_argument("--venue", default="ST")
    v.add_argument("--race", type=int, help="one race only")

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
    if args.cmd == "calibrate":
        from .model.calibrate import main as cal_main
        return cal_main(rest)
    if args.cmd == "ts-probe":
        from .probe import probe
        report = probe(sample=args.races)
        print(json.dumps(report, indent=2))
        return 0 if report.get("ok") else 1
    if args.cmd == "hk-fetch":
        return _hk_fetch(args)
    if args.cmd == "hk-show":
        return _hk_show(args)
    return 2


def _hk_day(raw: str | None):
    from datetime import date, datetime

    from .sources.hkjc import HK_TZ
    return date.fromisoformat(raw) if raw else datetime.now(HK_TZ).date()


def _hk_fetch(args) -> int:
    import time

    from .config import Settings
    from .sources.base import SourceError
    from .sources.hkjc import fetch_meeting

    st = Settings.load()
    day, card = _hk_day(args.date), not args.odds_only
    while True:
        try:
            path = fetch_meeting(st.hk_dir, day, args.venue, card=card, capture=st.capture_dir / "hkjc")
            print(f"updated {path} (+ odds) at {time.strftime('%H:%M:%S')}")
        except (SourceError, OSError) as exc:
            print(f"hk-fetch failed: {exc}. Raw responses (if any) are in {st.capture_dir / 'hkjc'}", file=sys.stderr)
            if not args.watch:
                return 1
        if not args.watch:
            return 0
        card = False
        time.sleep(max(30, args.watch))


def _hk_show(args) -> int:
    from .config import Settings
    from .domain import make_track_id
    from .service import Service
    from .sources.hkjc import HKJCSource

    st = Settings.load()
    day = _hk_day(args.date)
    svc = Service(st, source=HKJCSource(st.hk_dir, day))
    track = svc.track(make_track_id(args.venue.upper(), day))
    for race in svc.card(track):
        if args.race and race.number != args.race:
            continue
        pred = svc.predict(race)
        post = race.post_time.strftime("%H:%M UTC") if race.post_time else "?"
        print(f"\n{track.name} R{race.number} {race.race_name or ''} | {race.race_class or ''} {race.distance or ''}"
              f" | post {post} | market: {pred.market}")
        if pred.market == "none":
            print("  no win odds in the odds file yet; add them (or run `edge hk-fetch --odds-only`) to see chances")
            continue
        print(f"  {'no':>3} {'horse':<22} {'draw':>4} {'odds':>6} {'mkt%':>6} {'model%':>7} {'fair':>6} {'form':>6}  value")
        for i in sorted(pred.interests, key=lambda x: x.rank):
            r = i.runners[0]
            mkt = f"{100 * i.p_market:5.1f}" if i.p_market is not None else "    -"
            odds = f"{i.price:6.1f}" if i.price else "     -"
            fair = f"{i.fair:6.1f}" if i.fair else "     -"
            print(f"  {i.key:>3} {r.name[:22]:<22} {r.post or '':>4} {odds} {mkt} {100 * i.p_model:7.1f} {fair} {i.evidence:>6}  "
                  f"{'VALUE' if i.value else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
