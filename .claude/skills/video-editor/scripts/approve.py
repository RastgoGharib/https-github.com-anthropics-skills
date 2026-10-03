#!/usr/bin/env python3
"""Record the user's decisions on cutlist.json.

Usage:
  approve.py WORKDIR --all                 approve every pending cut
  approve.py WORKDIR --suggested           approve cuts marked suggest=cut, reject suggest=review
  approve.py WORKDIR --ids 1,4 --reject 2  approve some, reject others
  approve.py WORKDIR --type silence        approve all cuts of one type
  approve.py WORKDIR --fix 'wrong=right'   caption correction (repeatable)
  approve.py WORKDIR                       print current state
Only record what the user actually decided.
"""
import argparse
import json
from pathlib import Path


def ids(s):
    return {int(x) for x in s.split(",") if x.strip()} if s else set()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("work")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--suggested", action="store_true")
    ap.add_argument("--ids", default="")
    ap.add_argument("--reject", default="")
    ap.add_argument("--type", action="append", default=[])
    ap.add_argument("--fix", action="append", default=[])
    a = ap.parse_args()

    path = Path(a.work) / "cutlist.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    yes, no = ids(a.ids), ids(a.reject)
    for c in data["cuts"]:
        if c["id"] in no:
            c["approved"] = False
        elif c["id"] in yes or c["type"] in a.type:
            c["approved"] = True
        elif a.all and c["approved"] is None:
            c["approved"] = True
        elif a.suggested and c["approved"] is None:
            c["approved"] = c["suggest"] == "cut"
    for f in a.fix:
        wrong, _, right = f.partition("=")
        data.setdefault("fixes", {})[wrong.strip()] = right.strip()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    mark = {True: "✔", False: "✘", None: "?"}
    for c in data["cuts"]:
        print(f"{mark[c['approved']]} #{c['id']:<3} {c['type']:<8} {c['start']:7.2f}-{c['end']:7.2f}  {c['reason']}")
    for k, v in data.get("fixes", {}).items():
        print(f"fix: {k} -> {v}")
    pending = sum(c["approved"] is None for c in data["cuts"])
    print(f"{pending} pending" if pending else "all cuts decided")


if __name__ == "__main__":
    main()
