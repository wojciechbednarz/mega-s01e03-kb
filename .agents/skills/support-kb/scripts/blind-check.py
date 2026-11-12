#!/usr/bin/env python3
"""Blind check: does an independent model, given only each ticket's problem definition, place the reports
where our tickets do? The one check that tests the split itself rather than its consistency with causes.ts.

  python3 -I .agents/skills/support-kb/scripts/blind-check.py <out-dir> --dry-run   # cost estimate, no calls
  python3 -I .agents/skills/support-kb/scripts/blind-check.py <out-dir>             # run

<out-dir> must be OUTSIDE this repo (the repo holds the deliverable only).

What the model sees: the **Problem:** line of each ticket in src/lib/data/split-4471.json, the tenants
(locale, booking form) and the raw reports (once by id). Never: intake tags, desk-notes.json, causes.ts,
labels, or which ticket a report is in.

Paid calls (rules for every agent using this skill):
  - Models only through `omp`. Never call a provider API directly, never read keys out of omp.
  - Any single call estimated over $0.05 stops and asks the person; rerun with --approved after a yes.
  - --budget (USD, default 0.30) caps the whole run.
Not a gate: it costs money and a model's answer is not proof. Run it by hand before a claim, read the
disagreements yourself, and record what you decided in the challenge log.
"""
import argparse, json, pathlib, random, re, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[4]
REPO = "wojciechbednarz/mega-s01e03-kb"
SYS = "You classify support reports. Use only the definitions and data given. Answer with JSON only, no prose."
# USD per million tokens (input, output), from `omp models --json`. A model missing here is refused.
PRICES = {"openai/gpt-6-luna": (0.10, 0.50), "openai/gpt-5.6-luna": (0.20, 1.20),
          "openai/gpt-6-sol": (2.0, 10.0), "openai/gpt-6.1-sol": (2.0, 10.0),
          "openai/gpt-5.6-terra": (2.0, 12.0), "openai/gpt-6.1-terra": (2.0, 12.0)}
MAX_CALL = 0.05


def build_input():
    data = ROOT / "src/lib/data"
    split = json.loads((data / "split-4471.json").read_text())
    defs, key = {}, {}
    for letter, (cause, t) in zip("ABCDEFGH", split["tickets"].items()):
        n = re.search(r"/issues/(\d+)$", t["url"])
        if not n:
            continue  # a cause the big ticket keeps has no ticket to test
        body = json.loads(subprocess.run(["gh", "issue", "view", n.group(1), "-R", REPO, "--json", "body"],
                                         capture_output=True, text=True, check=True).stdout)["body"]
        m = re.search(r"\*\*Problem:\*\*\s*(.+)", body)
        defs[letter] = {"issue": int(n.group(1)), "cause": cause, "definition": m.group(1).strip() if m else cause}
        for rid in set(re.findall(r"R-\d+", body)):
            key[rid] = letter
    tenants = [json.loads(p.read_text()) for p in sorted((data / "tenants").glob("*.json"))]
    seen, reports = set(), []
    for r in json.loads((data / "reports-4471.json").read_text()):
        if r["id"] in seen or r.get("mergedInto") != split["ticket"]:
            continue
        seen.add(r["id"])
        reports.append({k: r[k] for k in ("id", "receivedAt", "tenant", "channel", "subject", "body")}
                       | {"browserLocale": r.get("meta", {}).get("browserLocale")})
    return {"definitions": defs, "tenants": tenants, "reports": reports, "answer_key": key}


def prompt_for(inp, reports, extra=""):
    letters = list(inp["definitions"]) + ["none"]
    defs = "\n".join(f"{k}: {d['definition']}" for k, d in inp["definitions"].items())
    return (f"Problems found in a merged support ticket about dates:\n{defs}\nnone: fits none of the above.\n\n"
            f"Tenants (locale, booking form):\n{json.dumps(inp['tenants'])}\n\n{extra}"
            f"Reports:\n{json.dumps(reports, ensure_ascii=False)}\n\n"
            f"For every report return one object: {{\"id\": ..., \"problem\": one of {letters}, "
            f"\"sure\": true|false, \"why\": \"<= 12 words\"}}. Return a JSON array with exactly {len(reports)} objects.")


def estimate(model, prompt, n):
    if model not in PRICES:
        sys.exit(f"no price known for {model}: add it to PRICES (from `omp models --json`) first")
    pin, pout = PRICES[model]
    return len(prompt) / 3.5 / 1e6 * pin + (n * 40 + 3000) / 1e6 * pout  # answers + a reasoning allowance


def ask(model, prompt, n, approved, cwd):
    est = estimate(model, prompt, n)
    if est > MAX_CALL and not approved:
        sys.exit(f"STOP: next call to {model} is estimated at ${est:.3f} (> ${MAX_CALL}). "
                 f"Ask the person; rerun with --approved after a yes.")
    r = subprocess.run(["omp", "-p", "--no-session", "--mode", "json", "--provider", "openrouter", "--model", model,
                        "--thinking", "low", "--tools", "", "--no-extensions", "--system-prompt", SYS, prompt],
                       capture_output=True, text=True, cwd=cwd, timeout=600)
    text, cost, err = "", 0.0, ""
    for line in r.stdout.splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("type") == "message_end" and e["message"].get("role") == "assistant":
            m = e["message"]
            text += "".join(c.get("text", "") for c in m.get("content", []) if c.get("type") == "text")
            cost += (m.get("usage") or {}).get("cost", {}).get("total", 0.0)
            err = m.get("errorMessage") or err
    if not text:
        # e.g. 402: omp reserves 65536 output tokens per call, more than a small key limit allows for Sol.
        # Report it; do not route around omp.
        sys.exit(f"no answer from {model}: {err or r.stderr[-500:]}")
    m = re.search(r"\[.*\]", text, re.S)
    return ({d["id"]: d for d in json.loads(m.group(0))} if m else {}), cost


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out")
    ap.add_argument("--first", default="openai/gpt-6-luna", help="classifies every report")
    ap.add_argument("--second", default="openai/gpt-6.1-sol", help="re-reads only disagreements and unsure ones")
    ap.add_argument("--batch", type=int, default=105)
    ap.add_argument("--budget", type=float, default=0.30)
    ap.add_argument("--sample", type=int, default=0, help="only N random reports (0 = all)")
    ap.add_argument("--approved", action="store_true", help="the person approved calls estimated over $0.05")
    ap.add_argument("--dry-run", action="store_true", help="print the first pass's estimated cost, call nothing")
    a = ap.parse_args()
    out = pathlib.Path(a.out).resolve()
    if ROOT in out.parents or out == ROOT:
        sys.exit("<out-dir> must be outside the repo")
    out.mkdir(parents=True, exist_ok=True)

    inp = build_input()
    key, reports = inp["answer_key"], inp["reports"]
    if a.sample:
        reports = random.Random(4471).sample(reports, a.sample)
    batches = [reports[i:i + a.batch] for i in range(0, len(reports), a.batch)]
    first_est = sum(estimate(a.first, prompt_for(inp, b), len(b)) for b in batches)
    print(f"{len(reports)} reports · {len(inp['definitions'])} tickets · first pass ~${first_est:.3f} "
          f"({len(batches)} calls, largest ~${max(estimate(a.first, prompt_for(inp, b), len(b)) for b in batches):.3f})")
    if a.dry_run:
        return
    (out / "blind-input.json").write_text(json.dumps(inp, indent=1, ensure_ascii=False))

    spent, first = 0.0, {}
    cwd = tempfile.mkdtemp(dir=out)  # an empty dir: the model's agent has nothing to read
    for b in batches:
        if spent > a.budget * 0.8:
            sys.exit(f"stopping: ${spent:.4f} spent of the ${a.budget} budget")
        got, c = ask(a.first, prompt_for(inp, b), len(b), a.approved, cwd)
        spent += c
        missing = [r for r in b if r["id"] not in got]
        if missing:
            more, c = ask(a.first, prompt_for(inp, missing), len(missing), a.approved, cwd)
            spent += c
            got.update(more)
        first.update(got)
        print(f"{a.first}: {len(first)}/{len(reports)} · ${spent:.4f}", flush=True)

    dis = [r for r in reports if first.get(r["id"], {}).get("problem") != key.get(r["id"])
           or not first.get(r["id"], {}).get("sure", False)]
    second = {}
    note = "These reports are borderline. Read each one carefully before deciding.\n\n"
    for i in range(0, len(dis), 30):
        if spent > a.budget * 0.8:
            print(f"skipping the rest of the second pass: ${spent:.4f} spent"); break
        got, c = ask(a.second, prompt_for(inp, dis[i:i + 30], note), len(dis[i:i + 30]), a.approved, cwd)
        spent += c
        second.update(got)
        print(f"{a.second}: {min(i + 30, len(dis))}/{len(dis)} · ${spent:.4f}", flush=True)

    rows = []
    for r in reports:
        f, s = first.get(r["id"], {}), second.get(r["id"], {})
        final = s.get("problem", f.get("problem"))
        rows.append({"id": r["id"], "ticket": key.get(r["id"]), "first": f.get("problem"), "second": s.get("problem"),
                     "final": final, "agree": final == key.get(r["id"]), "why": s.get("why") or f.get("why"),
                     "subject": r["subject"], "tenant": r["tenant"]})
    (out / "blind-result.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    defs = inp["definitions"]
    lines = ["# Blind check", "", f"{a.first} on all {len(reports)}, {a.second} on {len(dis)} disagreements/unsure · "
             f"${spent:.4f}", "", "; ".join(f"{k} = #{d['issue']} {d['cause']}" for k, d in defs.items()), "",
             "| problem | tickets | blind |", "|---|---|---|"]
    for k in list(defs) + ["none"]:
        lines.append(f"| {k} | {sum(x['ticket'] == k for x in rows)} | {sum(x['final'] == k for x in rows)} |")
    still = [x for x in rows if not x["agree"]]
    lines += ["", f"Still disagreeing: {len(still)} (read each one yourself)", ""]
    lines += [f"- {x['id']} ({x['tenant']}, “{x['subject']}”): ticket {x['ticket']} · blind {x['final']} — {x['why']}"
              for x in still]
    (out / "blind-report.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
