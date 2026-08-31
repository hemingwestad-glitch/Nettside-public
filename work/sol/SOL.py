#!/usr/bin/env python3
"""
SOL.py - Space weather hazard monitor for BioSat (LEO SSO, ~500-600 km).

Three ways to run it. All three share one hazard table and one playbook, so
the advice the team reads in Slack is the same advice you read in the terminal.

  Personal, terminal. Reads nothing, writes nothing, needs no webhook:

      ./SOL.py --status
      ./SOL.py --status --hours 48

  Team brief to Slack. A snapshot digest, formatted with Block Kit. Run it
  manually in the morning or from cron once a day:

      ./SOL.py --brief
      ./SOL.py --brief --mention '<!subteam^S01ABCDEFG>'

  No permission to install a Slack app? Use Workflow Builder instead. Build a
  workflow with a webhook trigger, define five Text variables named exactly
  level, code, headline, details and body, then add a "Send a message to
  channel" step that inserts them. The URL is /workflows/ not /services/:

      ./SOL.py --brief --flavor workflow
      ./SOL.py --poll  --flavor workflow

  Unattended poller to Slack. Cron every 5-10 min. Posts only what it has
  not seen before, each with the full playbook:

      ./SOL.py --poll
      ./SOL.py --poll --dry-run     # print, post nothing, write no state
      ./SOL.py --seed               # run once on install

The webhook URL is a secret. Put it in the environment, not on the command
line, or it lands in your shell history and in ps output:

      export SOL_WEBHOOK='https://hooks.slack.com/services/...'
      ./SOL.py --check-slack        # verifies the webhook actually works

Stdlib only. State lives in ~/.swx_watch_state.json; only --poll touches it.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

ALERTS_URL = "https://services.swpc.noaa.gov/products/alerts.json"
KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"

USER_AGENT = "SOL/3.0 (Orbit NTNU BioSat ops; contact: you@example.com)"

# ---------------------------------------------------------------------------
# Hazard classification for a ~500-600 km sun-synchronous orbit.
# Keys are SWPC message codes, NOT the product_id field in alerts.json -
# those are a different code set entirely (product_id K06A = code ALTK06).
# ---------------------------------------------------------------------------

PAGE = {
    "WARPX1": "Proton event forecast (>10 MeV above 10 pfu expected)",
    "ALTPX1": "Proton event S1 - >10 MeV flux exceeded 10 pfu",
    "ALTPX2": "Proton event S2 - >10 MeV flux exceeded 100 pfu",
    "ALTPX3": "Proton event S3 - >10 MeV flux exceeded 1000 pfu",
    "ALTPX4": "Proton event S4 - >10 MeV flux exceeded 10,000 pfu",
    "ALTPX5": "Proton event S5 - >10 MeV flux exceeded 100,000 pfu",
    "ALTPC0": "High-energy protons - >100 MeV flux exceeded 1 pfu (deep penetrating)",
    "WARPC0": "High-energy proton event expected",
    "WATA50": "Geomagnetic storm watch G3",
    "WATA99": "Geomagnetic storm watch G4-G5",
    "WARK06": "Geomagnetic warning - Kp 6 expected (G2)",
    "WARK07": "Geomagnetic warning - Kp 7 expected (G3)",
    "ALTK06": "Geomagnetic alert - Kp 6 reached (G2)",
    "ALTK07": "Geomagnetic alert - Kp 7 reached (G3)",
    "ALTK08": "Geomagnetic alert - Kp 8 reached (G4)",
    "ALTK09": "Geomagnetic alert - Kp 9 reached (G5)",
}

LOG = {
    "WATA20": "Geomagnetic storm watch G1",
    "WATA30": "Geomagnetic storm watch G2",
    "WARK04": "Geomagnetic warning - Kp 4 expected",
    "WARK05": "Geomagnetic warning - Kp 5 expected (G1)",
    "ALTK04": "Geomagnetic alert - Kp 4 reached",
    "ALTK05": "Geomagnetic alert - Kp 5 reached (G1)",
    "ALTEF3": "Outer-belt electrons - >2 MeV flux exceeded 1000 pfu",
    "ALTXMF": "Solar flare exceeded M5 (R2) - possible CME/SEP to follow",
    "SUMXM5": "Solar flare summary - exceeded M5 (R2)",
    "SUMX01": "Solar flare exceeded X1 (R3)",
    "SUMX10": "Solar flare exceeded X10 (R4)",
    "SUMPX1": "Proton event summary (S1)",
    "SUMPC0": "High-energy proton event summary",
}

WATCHED = {**LOG, **PAGE}

KP_DRAG_THRESHOLD = 6.0
KP_SUSTAINED_PERIODS = 2

# ---------------------------------------------------------------------------
# Playbook. Structured so the terminal and Slack renderers stay in sync.
#
# BioSat carries a live biological payload in a pressure vessel, so load
# shedding is not "turn everything off". Thermal control on that payload is
# not a convenience load - losing it is mission-ending, not recoverable.
# Edit these lists once the FlatSat radiation test results are in.
# ---------------------------------------------------------------------------

PLAYBOOK = {
    "proton": {
        "title": "Solar protons (SEP)",
        "expect": [
            "Elevated SEU and single-event latch-up rate, concentrated over the polar caps.",
            "An SSO crosses the caps roughly every orbit, so exposure is repeated, not one-off.",
            "Bit flips in unprotected RAM and flash; spurious watchdog resets and reboots.",
            "Star tracker noise or blinding and sun sensor glitches degrade the attitude solution.",
            "Solar array output steps down permanently over large or long-duration events.",
        ],
        "do": [
            "Checkpoint state to protected NVM and confirm the last good config is recoverable.",
            "Verify EPS latch-up current limiters are armed and auto-recovery is enabled.",
            "Raise the EDAC/memory scrub cadence if it is configurable in flight.",
            "Log SEU, latch-up and reset counters every pass - this is your post-event dataset.",
            "Keep battery state of charge high; each latch-up recovery cycle costs energy.",
        ],
        "power_down": [
            "Payload processor and payload high-density memory outside a science window.",
            "Any COTS part with an unknown or low SEL threshold that is not needed this orbit.",
            "Secondary or redundant radio not required for the next pass.",
            "Deployable actuator electronics and high-power experiments.",
        ],
        "keep_on": [
            "Watchdog and EPS protection circuits - shedding these removes your recovery path.",
            "Beacon. If you power it down you cannot tell a safe mode from a dead satellite.",
            "Thermal control on the biological payload. A cold soak is not a recoverable fault.",
            "Enough ADCS to hold sun pointing on the arrays.",
        ],
        "hold": [
            "Firmware and FSW uploads.",
            "Deployments and any one-shot mechanism.",
            "Commissioning steps that cannot be undone.",
        ],
    },
    "geomag": {
        "title": "Geomagnetic storm",
        "expect": [
            "Neutral density at 500-600 km can rise severalfold within hours.",
            "Along-track position error grows fast; TLEs go stale inside a day, not a week.",
            "Pass predictions drift by tens of seconds to minutes - narrow beams will miss AOS.",
            "Ionospheric scintillation on high-latitude passes: link fades, dropped packets.",
            "Auroral-zone surface charging during cap crossings.",
            "Magnetometer-based attitude determination degrades - the field model no longer matches.",
            "Measurably faster orbital decay; the lifetime estimate moves.",
        ],
        "do": [
            "Refresh TLEs every pass instead of on the daily cadence.",
            "Widen the ground station search window, or program-track with extra margin.",
            "Move critical downlinks to mid-latitude passes and budget extra passes per data volume.",
            "Deprioritise the magnetometer in attitude determination; lean on sun sensor and gyro.",
            "Re-run the decay estimate and check it against the lifetime you filed.",
        ],
        "power_down": [
            "High-voltage or high-impedance electronics during auroral-zone crossings.",
            "Large-area deployables that add drag and are not needed right now.",
        ],
        "keep_on": [
            "ADCS. During a drag event you need attitude control more, not less.",
            "Beacon, watchdog, and payload thermal control - same as for a proton event.",
        ],
        "hold": [
            "Manoeuvres planned against a TLE older than storm onset.",
            "Anything scheduled on a pass prediction generated before the storm.",
        ],
    },
    "electron": {
        "title": "Outer-belt electrons",
        "expect": [
            "Deep dielectric charging is mainly a GEO/MEO problem, not LEO.",
            "For an SSO it matters only on outer-belt horn crossings at high latitude.",
            "Charge builds over days, so a multi-day elevated flux is the thing to watch.",
        ],
        "do": [
            "Note it and carry on. Watch for unexplained resets that line up with high-latitude passes.",
        ],
        "power_down": [],
        "keep_on": [],
        "hold": [],
    },
    "flare": {
        "title": "Solar flare",
        "expect": [
            "D-region absorption hits HF. Your UHF/S-band link is largely unaffected.",
            "Possible GNSS degradation on the sunlit side.",
            "The real significance is as a precursor: an SEP or CME may follow within hours to days.",
        ],
        "do": [
            "Treat as a warning order. Check the proton feed more often for the next 24-48 h.",
            "Make sure someone is available to run the SEP playbook if it escalates.",
        ],
        "power_down": [],
        "keep_on": [],
        "hold": [
            "Consider deferring the start of a long non-reversible campaign until you know "
            "whether protons follow.",
        ],
    },
}

SECTION_LABELS = [
    ("expect", "Expect"),
    ("do", "Do now"),
    ("power_down", "Power down if not needed"),
    ("keep_on", "Keep powered - do NOT shed these"),
    ("hold", "Hold - non-reversible"),
]

ANSI = {"page": "\033[1;31m", "log": "\033[33m", "ok": "\033[32m",
        "head": "\033[1m", "dim": "\033[2m", "off": "\033[0m"}


def paint(text: str, style: str, enabled: bool) -> str:
    return f"{ANSI[style]}{text}{ANSI['off']}" if enabled else text


def wrap(text: str, width: int):
    words, line, lines = text.split(), "", []
    for word in words:
        if line and len(line) + 1 + len(word) > width:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        lines.append(line)
    return lines


# ---------------------------------------------------------------------------
# Fetching and parsing
# ---------------------------------------------------------------------------

def fetch(url: str, timeout: int = 30):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_field(message: str, label: str) -> str:
    """Pull a labelled line out of an SWPC message body."""
    for line in message.replace("\r\n", "\n").split("\n"):
        if line.strip().startswith(label):
            return line.split(":", 1)[1].strip()
    return ""


def parse_swpc_time(text: str):
    """SWPC mixes '2026 Aug 30 0600 UTC' and '2026-08-30 06:00:00.000'."""
    if not text:
        return None
    text = text.strip().replace(" UTC", "")
    for fmt in ("%Y %b %d %H%M", "%Y-%m-%d %H:%M:%S.%f",
                "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def code_of(entry: dict) -> str:
    """The message code (ALTK06) lives in the body. product_id (K06A) is a
    different code set and will never match our tables - parse body first."""
    code = parse_field(entry.get("message", ""), "Space Weather Message Code")
    return (code or entry.get("product_id", "")).strip().upper()


def alert_key(entry: dict) -> str:
    msg = entry.get("message", "")
    return f"{code_of(entry)}:{parse_field(msg, 'Serial Number')}:{entry.get('issue_datetime', '')}"


def is_cancellation(entry: dict) -> bool:
    """CANCEL WATCH / CANCEL ALERT retracts an event. Never page on those."""
    return any(line.strip().upper().startswith("CANCEL")
               for line in entry.get("message", "").replace("\r\n", "\n").split("\n"))


def is_continuation(entry: dict) -> bool:
    """EXTENDED WARNING / CONTINUED ALERT re-issue an ongoing event under a
    new serial number. We already paged at onset."""
    body = entry.get("message", "").upper()
    return "EXTENDED WARNING" in body or "CONTINUED ALERT" in body


def family(code: str) -> str:
    if code.startswith(("ALTPX", "WARPX", "ALTPC", "WARPC", "SUMPX", "SUMPC")):
        return "proton"
    if code.startswith(("WATA", "WARK", "ALTK")):
        return "geomag"
    if code.startswith("ALTEF"):
        return "electron"
    return "flare"


def classify(entry: dict, code: str):
    """-> (label, level). Cancellations and continuations never page."""
    label = WATCHED[code]
    level = "PAGE" if code in PAGE else "LOG"
    if is_cancellation(entry):
        return f"CANCELLED: {label}", "LOG"
    if is_continuation(entry) and level == "PAGE":
        return f"{label} (ongoing)", "LOG"
    return label, level


def event_facts(entry: dict) -> dict:
    msg = entry.get("message", "")
    return {
        "issued": entry.get("issue_datetime", "unknown"),
        "scale": parse_field(msg, "NOAA Scale") or parse_field(msg, "Noaa Scale"),
        "valid_from": parse_field(msg, "Valid From"),
        "valid_to": parse_field(msg, "Valid To") or parse_field(msg, "Now Valid Until"),
    }


# ---------------------------------------------------------------------------
# Kp
# ---------------------------------------------------------------------------

def kp_series(rows):
    """-> [(datetime|None, float), ...] oldest first.

    SWPC serves this as a list of dicts; older builds served [header, *rows]."""
    out = []
    if not rows:
        return out
    if isinstance(rows[0], dict):
        pairs = [(r.get("time_tag"), r.get("Kp", r.get("kp_index"))) for r in rows]
    else:
        header, *data = rows
        k_idx = header.index("Kp") if "Kp" in header else 1
        t_idx = header.index("time_tag") if "time_tag" in header else 0
        pairs = [(r[t_idx] if len(r) > t_idx else None,
                  r[k_idx] if len(r) > k_idx else None) for r in data]
    for stamp, value in pairs:
        try:
            out.append((parse_swpc_time(stamp or ""), float(value)))
        except (TypeError, ValueError):
            continue
    return out


def current_kp(rows) -> float:
    series = kp_series(rows)
    return series[-1][1] if series else 0.0


def kp_is_sustained(rows, threshold=KP_DRAG_THRESHOLD,
                    periods=KP_SUSTAINED_PERIODS) -> bool:
    series = kp_series(rows)
    if len(series) < periods:
        return False
    return all(value >= threshold for _, value in series[-periods:])


# ---------------------------------------------------------------------------
# Snapshot: shared by --status and --brief
# ---------------------------------------------------------------------------

def snapshot(alerts, kp_rows, hours: int) -> dict:
    """Collapse the feed into current state. One row per product code, because
    SWPC re-issues the same event under new serials and a morning read wants
    the state, not the paper trail."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)

    latest, escalated, counts, others = {}, set(), {}, 0
    for entry in alerts:
        issued = parse_swpc_time(entry.get("issue_datetime", ""))
        facts = event_facts(entry)
        valid_to = parse_swpc_time(facts["valid_to"])
        in_window = issued is not None and issued >= cutoff
        still_valid = valid_to is not None and valid_to >= now
        if not (in_window or still_valid):
            continue
        code = code_of(entry)
        if code not in WATCHED:
            others += 1
            continue
        label, level = classify(entry, code)
        counts[code] = counts.get(code, 0) + 1
        if level == "PAGE":
            escalated.add(code)
        current = latest.get(code)
        if current is None or (issued or now) > current["issued"]:
            latest[code] = {"issued": issued or now, "label": label, "level": level,
                            "scale": facts["scale"], "valid_to": valid_to,
                            "still_valid": still_valid,
                            "cancelled": is_cancellation(entry)}

    rows = []
    for code, r in latest.items():
        level = "PAGE" if (code in escalated and not r["cancelled"]) else r["level"]
        rows.append({**r, "code": code, "level": level, "count": counts[code]})
    rows.sort(key=lambda r: (r["level"] != "PAGE", -r["issued"].timestamp()))

    families = []
    for r in rows:
        fam = family(r["code"])
        if r["level"] == "PAGE" and fam not in families:
            families.append(fam)
    if kp_is_sustained(kp_rows) and "geomag" not in families:
        families.append("geomag")

    series = kp_series(kp_rows)
    recent = [v for t, v in series if t is None or t >= cutoff]
    if not recent and series:
        # Feed has data but all of it predates the window (stale feed, or a
        # very short --hours). Fall back to the last reading rather than
        # reporting no Kp at all.
        recent = [series[-1][1]]
    return {
        "now": now, "hours": hours, "rows": rows, "others": others,
        "families": families, "series": series, "recent": recent,
        "kp_now": series[-1][1] if series else None,
        "kp_stamp": series[-1][0] if series else None,
        "kp_max": max(recent) if recent else None,
        "sustained": kp_is_sustained(kp_rows),
    }


# ---------------------------------------------------------------------------
# Renderer 1: terminal (personal)
# ---------------------------------------------------------------------------

def render_terminal(snap: dict, color: bool) -> str:
    out = [paint(f"SWX STATUS   {snap['now']:%Y-%m-%d %H:%M} UTC", "head", color), ""]

    def row(label, value):
        return f"  {label:<15}{value}"

    if snap["kp_now"] is not None:
        shown = snap["recent"][-8:] or [snap["kp_now"]]
        style = "page" if snap["kp_now"] >= KP_DRAG_THRESHOLD else "ok"
        when = f"{snap['kp_stamp']:%Y-%m-%d %H:%M} UTC" if snap["kp_stamp"] else "latest"
        kp_text = paint(f"{snap['kp_now']:.2f}", style, color)
        out.append(row("Kp now", f"{kp_text}   at {when}"))
        out.append(row(f"Last {len(shown) * 3} h", "  ".join(f"{v:.2f}" for v in shown)))
        out.append(row("Max in window", f"{snap['kp_max']:.2f}   (over {snap['hours']} h)"))
        gate = (f"Kp >= {KP_DRAG_THRESHOLD:.1f} over {KP_SUSTAINED_PERIODS} "
                f"consecutive periods")
        out.append(row("Drag gate", paint("MET - " + gate, "page", color) if snap["sustained"]
                       else f"{paint('not met', 'ok', color)}  ({gate})"))
    else:
        out.append(row("Kp now", paint("unavailable", "log", color)))
    out.append("")

    out.append(paint(f"  Watched products issued or still valid in the last "
                     f"{snap['hours']} h:", "head", color))
    out.append("")
    if not snap["rows"]:
        out.append("    " + paint("none", "ok", color))
    for r in snap["rows"]:
        tag = paint("[PAGE]", "page", color) if r["level"] == "PAGE" \
            else paint("[LOG ]", "log", color)
        out.append(f"    {tag} {r['code']:7} {r['label']}")
        detail = [f"latest {r['issued']:%Y-%m-%d %H:%M} UTC"]
        if r["scale"]:
            detail.append(r["scale"])
        if r["valid_to"]:
            detail.append(("valid to " if r["still_valid"] else "expired ")
                          + f"{r['valid_to']:%Y-%m-%d %H:%M} UTC")
        if r["count"] > 1:
            detail.append(f"{r['count']} issuances in window")
        out.append(paint("            " + "  |  ".join(detail), "dim", color))
    if snap["others"]:
        out.append("")
        out.append(paint(f"    ({snap['others']} other SWPC products in window, "
                         f"not hazardous for this orbit)", "dim", color))
    out.append("")

    for fam in snap["families"]:
        book = PLAYBOOK[fam]
        out.append(paint(f"  ACTION - {book['title']}", "page", color))
        for key, heading in SECTION_LABELS:
            if not book[key]:
                continue
            out.append(f"    {heading}:")
            for item in book[key]:
                lines = wrap(item, 68)
                out.append(f"      - {lines[0]}")
                out.extend(f"        {line}" for line in lines[1:])
        out.append("")

    out.append(paint("  Verdict: PAGE-level activity. See actions above.", "page", color)
               if snap["families"] else
               paint("  Verdict: nominal. Nothing gating operations.", "ok", color))
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Renderer 2: Slack Block Kit (team)
# ---------------------------------------------------------------------------

def _section(text: str) -> dict:
    return {"type": "section", "text": {"type": "mrkdwn", "text": text[:2900]}}


def _bullets(heading: str, items) -> str:
    return f"*{heading}*\n" + "\n".join(f"• {item}" for item in items)


def _playbook_blocks(fam: str):
    book = PLAYBOOK[fam]
    blocks = [_section(f"*Playbook - {book['title']}*")]
    for key, heading in SECTION_LABELS:
        if book[key]:
            blocks.append(_section(_bullets(heading, book[key])))
    return blocks


def slack_alert_payload(entry: dict, code: str, label: str, level: str,
                        mention: str) -> dict:
    """One event, full playbook. Used by --poll."""
    facts = event_facts(entry)
    icon = "🔴" if level == "PAGE" else "🟡"
    fallback = f"{icon} {level}: {label} ({code})"

    meta = [f"*Issued* {facts['issued']} UTC"]
    if facts["scale"]:
        meta.append(f"*NOAA* {facts['scale']}")
    if facts["valid_from"]:
        meta.append(f"*Valid* {facts['valid_from']} → {facts['valid_to'] or 'ongoing'}")

    lead = f"{mention} " if (mention and level == "PAGE") else ""
    blocks = [
        {"type": "header",
         "text": {"type": "plain_text", "text": f"{icon} {level}: {label}"[:150],
                  "emoji": True}},
        _section(f"{lead}`{code}`  ·  " + "  ·  ".join(meta)),
    ]
    if level == "PAGE":
        blocks.append({"type": "divider"})
        blocks.extend(_playbook_blocks(family(code)))
    blocks.append({"type": "context", "elements": [
        {"type": "mrkdwn", "text": "NOAA SWPC · BioSat ops · `SOL.py --poll`"}]})
    return {"text": fallback, "blocks": blocks[:50]}


def slack_brief_payload(snap: dict, mention: str, heartbeat: bool = False) -> dict:
    """Snapshot digest. Used by --brief."""
    paging = bool(snap["families"])
    icon = "🔴" if paging else "🟢"
    headline = ("PAGE-level space weather" if paging
                else "Space weather nominal - weekly check-in" if heartbeat
                else "Space weather nominal")
    fallback = f"{icon} {headline} — {snap['now']:%Y-%m-%d %H:%M} UTC"

    if snap["kp_now"] is not None:
        gate = "*MET*" if snap["sustained"] else "not met"
        kp_line = (f"*Kp* {snap['kp_now']:.2f}  ·  *max {snap['hours']}h* "
                   f"{snap['kp_max']:.2f}  ·  *drag gate* {gate}")
    else:
        kp_line = "*Kp* unavailable"

    lead = f"{mention}\n" if (mention and paging) else ""
    blocks = [
        {"type": "header", "text": {"type": "plain_text",
                                    "text": f"{icon} {headline}"[:150], "emoji": True}},
        _section(f"{lead}{kp_line}"),
    ]

    if snap["rows"]:
        lines = []
        for r in snap["rows"]:
            tag = "🔴" if r["level"] == "PAGE" else "🟡"
            extra = []
            if r["scale"]:
                extra.append(r["scale"])
            if r["valid_to"] and r["still_valid"]:
                extra.append(f"valid to {r['valid_to']:%d %b %H:%M}Z")
            suffix = f"  _({', '.join(extra)})_" if extra else ""
            lines.append(f"{tag} `{r['code']}` {r['label']}{suffix}")
        blocks.append(_section(f"*Active in the last {snap['hours']} h*\n"
                               + "\n".join(lines)))
    else:
        blocks.append(_section(f"*Active in the last {snap['hours']} h*\nNothing watched."))

    for fam in snap["families"]:
        blocks.append({"type": "divider"})
        blocks.extend(_playbook_blocks(fam))

    if not paging:
        blocks.append(_section("_No action required. Normal ops._"))
    if heartbeat:
        blocks.append(_section(
            "_This weekly check-in posts even when nothing is happening, so "
            "that silence from this channel means something is wrong rather "
            "than nothing to report._"))
    blocks.append({"type": "context", "elements": [
        {"type": "mrkdwn",
         "text": f"NOAA SWPC · {snap['now']:%Y-%m-%d %H:%M} UTC · `SOL.py --brief`"}]})
    return {"text": fallback, "blocks": blocks[:50]}


# ---------------------------------------------------------------------------
# Renderer 3: Slack Workflow Builder (no app install, no admin approval)
#
# Workflow Builder webhooks are NOT the same thing as app incoming webhooks.
# The URL is /workflows/ rather than /services/, and the body must be a FLAT
# object of STRING values - no nesting, no Block Kit. Every variable you
# define in the workflow must be present in every request or the run fails,
# so we always send all five keys, never omitting one.
#
# Define exactly these five as Text variables in Workflow Builder:
# ---------------------------------------------------------------------------

WORKFLOW_KEYS = ["level", "code", "headline", "details", "body"]

# A Slack message starts getting truncated around 4000 characters. Only the
# proton and geomag families can reach PAGE, and their two full playbooks come
# to about 3150 characters, so 3800 fits the worst real case with the active
# list on top.
WF_LIMITS = {"level": 48, "code": 32, "headline": 200, "details": 400, "body": 3800}

# The Workflow Builder message template is static - it cannot branch on
# severity. So the severity marker has to travel inside the variable itself.
# Slack renders :shortcode: emoji inside workflow variables.
# Literal Unicode, not :shortcodes: and not *mrkdwn*. Workflow Builder inserts
# variable content verbatim, so anything that needs Slack to parse it first
# shows up as junk characters in the channel.
WF_LEVEL_MARK = {
    "PAGE": "\U0001F6A8 PAGE",
    "LOG": "\U0001F7E1 LOG",
    "OK": "\U0001F7E2 nominal",
}


def _wf_level(level: str) -> str:
    return WF_LEVEL_MARK.get(level.upper(), level)


def _clip(text: str, limit: int) -> str:
    text = (text or "").strip() or "-"
    if len(text) <= limit:
        return text
    print(f"warning: truncated {len(text)} chars to {limit} for Workflow Builder",
          file=sys.stderr)
    return text[:limit - 3].rstrip() + "..."


def _playbook_text(fam: str) -> str:
    """Plain text only. Workflow Builder inserts variable content literally,
    so *asterisks* and `backticks` render as visible junk. Structure has to
    come from capitals, blank lines and bullet characters instead."""
    book = PLAYBOOK[fam]
    chunks = [f"PLAYBOOK: {book['title'].upper()}"]
    for key, heading in SECTION_LABELS:
        if book[key]:
            chunks.append(f"{heading.upper()}\n"
                          + "\n".join(f"• {i}" for i in book[key]))
    return "\n\n".join(chunks)


def workflow_payload(level: str, code: str, headline: str,
                     details: str, body: str) -> dict:
    """Flat, all-string, all keys always present."""
    values = {"level": _wf_level(level), "code": code, "headline": headline,
              "details": details, "body": body}
    return {k: _clip(str(values[k]), WF_LIMITS[k]) for k in WORKFLOW_KEYS}


def workflow_alert_payload(entry: dict, code: str, label: str, level: str) -> dict:
    facts = event_facts(entry)
    details = [f"Issued {facts['issued']} UTC"]
    if facts["scale"]:
        details.append(f"NOAA {facts['scale']}")
    if facts["valid_from"]:
        details.append(f"Valid {facts['valid_from']} to {facts['valid_to'] or 'ongoing'}")
    body = _playbook_text(family(code)) if level == "PAGE" else "No action required."
    return workflow_payload(level, code, label, "  |  ".join(details), body)


def workflow_brief_payload(snap: dict, heartbeat: bool = False) -> dict:
    paging = bool(snap["families"])
    if snap["kp_now"] is not None:
        gate = "MET" if snap["sustained"] else "not met"
        details = (f"Kp {snap['kp_now']:.2f}  |  max {snap['hours']}h "
                   f"{snap['kp_max']:.2f}  |  drag gate {gate}")
    else:
        details = "Kp unavailable"

    lines = []
    if snap["rows"]:
        lines.append(f"ACTIVE IN THE LAST {snap['hours']} H")
        for r in snap["rows"]:
            mark = "[PAGE]" if r["level"] == "PAGE" else "[LOG] "
            lines.append(f"• {mark} {r['code']}: {r['label']}")
    else:
        lines.append(f"ACTIVE IN THE LAST {snap['hours']} H\n• Nothing watched.")
    for fam in snap["families"]:
        lines.append("")
        lines.append(_playbook_text(fam))
    if not paging:
        lines.append("")
        lines.append("No action required. Normal ops.")

    if heartbeat:
        lines.append("")
        lines.append("This weekly check-in posts even when nothing is "
                     "happening, so that silence from this channel means "
                     "something is wrong rather than nothing to report.")
    return workflow_payload(
        "PAGE" if paging else "OK", "BRIEF",
        "PAGE-level space weather" if paging
        else "Space weather nominal - weekly check-in" if heartbeat
        else "Space weather nominal",
        details, "\n".join(lines))


def url_kind(webhook: str) -> str:
    """Slack has three URL shapes and they are not interchangeable.
      /triggers/  - Workflow Builder webhook trigger   -> --flavor workflow
      /workflows/ - older Workflow Builder URL         -> --flavor workflow
      /services/  - app incoming webhook (Block Kit)   -> --flavor slack
    """
    if not webhook:
        return "missing"
    if "/triggers/" in webhook or "/workflows/" in webhook:
        return "workflow"
    if "/services/" in webhook:
        return "slack"
    if "discord" in webhook:
        return "discord"
    return "unknown"


def resolve_flavor(webhook: str, requested: str):
    """-> (flavor, error). The URL shape says unambiguously which payload
    format the endpoint accepts, so work it out rather than making the user
    remember. A wrong flavor still returns HTTP 200 and posts nothing usable,
    which is the worst kind of failure for an alerting tool - so an explicit
    mismatch is an error, not a warning."""
    kind = url_kind(webhook)
    if requested == "auto":
        if kind in ("workflow", "slack", "discord"):
            return kind, None
        return "slack", None
    if kind in ("workflow", "slack", "discord") and kind != requested:
        return requested, (
            f"that URL is a {kind} webhook, but --flavor {requested} sends a "
            f"{requested} payload. They are not interchangeable: the endpoint "
            f"answers HTTP 200 and posts nothing usable. Use --flavor {kind}, "
            f"or drop --flavor and let it detect.")
    return requested, None



# ---------------------------------------------------------------------------
# Drill mode. Synthetic events pushed through the real classification and
# rendering path, so an exercise tests the code that will actually run - not
# a parallel mock of it. Only the input data is fake.
#
# Every drill message is banner-marked top and bottom. A practice alert that
# could be mistaken for a real one is worse than no practice at all: someone
# skimming at 07:30 might start shedding subsystems.
# ---------------------------------------------------------------------------

DRILL_BANNER = "THIS IS A DRILL. No real space weather event is in progress."
DRILL_FOOTER = ("END OF DRILL. Nothing above is real. Report anything that "
                "looked wrong or unclear so the playbook can be fixed.")


def _drill_entry(code: str, serial: int, headline: str, scale: str,
                 hours_ago: float, valid_hours: float) -> dict:
    now = datetime.now(timezone.utc)
    issued = now - timedelta(hours=hours_ago)
    body = (f"Space Weather Message Code: {code}\r\n"
            f"Serial Number: {serial}\r\n\r\n"
            f"{headline}\n"
            f"Valid From: {issued:%Y %b %d %H%M} UTC\n"
            f"Valid To: {now + timedelta(hours=valid_hours):%Y %b %d %H%M} UTC\n"
            f"Noaa Scale: {scale}\n")
    return {"product_id": "DRILL", "message": body,
            "issue_datetime": issued.strftime("%Y-%m-%d %H:%M:%S.000")}


DRILL_SCENARIOS = ("proton", "geomag", "both")

DRILL_NAMES = {
    "proton": "solar proton event (S2)",
    "geomag": "geomagnetic storm (G3)",
    "both": "proton event and geomagnetic storm",
}


def drill_data(scenario: str):
    """-> (alerts, kp_rows) for a simulated event."""
    proton = [
        _drill_entry("WARPX1", 901,
                     "WARNING: Proton 10MeV Integral Flux above 10pfu expected",
                     "S1 - Minor", 2.0, 20),
        _drill_entry("ALTPX2", 902,
                     "ALERT: Proton Event 10MeV Integral Flux exceeded 100pfu",
                     "S2 - Moderate", 1.0, 16),
    ]
    geomag = [
        _drill_entry("ALTK07", 903, "ALERT: Geomagnetic K-index of 7",
                     "G3 - Strong", 1.5, 12),
        _drill_entry("WATA50", 904,
                     "WATCH: Geomagnetic Storm Category G3 Predicted",
                     "G3 - Strong", 4.0, 24),
    ]
    alerts = {"proton": proton, "geomag": geomag,
              "both": proton + geomag}[scenario]

    now = datetime.now(timezone.utc)
    quiet = [3.0, 3.33, 4.0, 4.33, 5.0]
    storm = [6.33, 7.0] if scenario in ("geomag", "both") else [4.0, 3.67]
    values = quiet + storm
    kp_rows = [{"time_tag": (now - timedelta(hours=3 * (len(values) - i - 1))
                             ).strftime("%Y-%m-%dT%H:00:00"),
                "Kp": v, "a_running": 20, "station_count": 8}
               for i, v in enumerate(values)]
    return alerts, kp_rows


def mark_drill(payload: dict, flavor: str, scenario: str) -> dict:
    """Wrap a rendered payload in unmistakable drill banners."""
    title = f"DRILL: simulated {DRILL_NAMES.get(scenario, scenario)}"
    if flavor == "workflow":
        payload["level"] = "\U0001F7E0 DRILL - not a real alert"
        payload["code"] = "DRILL"
        payload["headline"] = title
        payload["body"] = _clip(
            f"{DRILL_BANNER}\n\n{payload['body']}\n\n{DRILL_FOOTER}",
            WF_LIMITS["body"])
        return payload
    if flavor == "discord":
        payload["content"] = (f"{DRILL_BANNER}\n\n{payload['content']}"
                              )[:1850] + f"\n\n{DRILL_FOOTER}"
        return payload
    blocks = payload.get("blocks", [])
    payload["text"] = f"\U0001F7E0 {title} - not a real alert"
    payload["blocks"] = ([
        {"type": "header", "text": {"type": "plain_text",
                                    "text": f"\U0001F7E0 {title}"[:150],
                                    "emoji": True}},
        _section(f"*{DRILL_BANNER}*"),
        {"type": "divider"},
    ] + blocks + [
        {"type": "divider"},
        _section(f"_{DRILL_FOOTER}_"),
    ])[:50]
    return payload


def summarise_plain(entry: dict, code: str, label: str, level: str) -> str:
    """Plain-text form, for --dry-run and Discord."""
    facts = event_facts(entry)
    lines = [f"[{level}] {label}  ({code})", f"Issued: {facts['issued']} UTC"]
    if facts["scale"]:
        lines.append(f"NOAA scale: {facts['scale']}")
    if facts["valid_from"]:
        lines.append(f"Valid: {facts['valid_from']} -> {facts['valid_to'] or 'ongoing'}")
    if level == "PAGE":
        book = PLAYBOOK[family(code)]
        lines.append("")
        for key, heading in SECTION_LABELS:
            if book[key]:
                lines.append(f"{heading}:")
                lines.extend(f"  - {item}" for item in book[key])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Posting
# ---------------------------------------------------------------------------

def post(webhook: str, payload: dict):
    """-> (ok, detail). Slack returns 200 'ok' or an HTTP error with a reason."""
    req = urllib.request.Request(
        webhook, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", "replace").strip()
            return True, f"HTTP {resp.status}: {body or '(empty body)'}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:300]}"
    except urllib.error.URLError as exc:
        return False, f"unreachable: {exc.reason}"


SLACK_HINTS = {
    "invalid_token": "The webhook was deleted or the app was uninstalled. Make a new one.",
    "no_service": "That URL is not a live webhook. Check for a typo or a truncated paste.",
    "no_team": "The workspace no longer has this app installed.",
    "channel_not_found": "The target channel was archived or deleted. Re-add the webhook.",
    "invalid_payload": "Slack rejected the JSON. Usually a Block Kit schema problem.",
}


def check_slack(webhook: str, flavor: str = "slack") -> int:
    """Diagnostic, not just a smoke test. Prints everything needed to tell a
    network problem from a wrong-URL problem from a workflow-not-published
    problem, because those three look identical from the outside."""
    kind = url_kind(webhook)
    print("Webhook check")
    print(f"  URL shape    {kind}"
          + ("" if kind != "unknown" else "  (not a URL shape I recognise)"))
    print(f"  format       {flavor}"
          + ("  (detected from the URL)" if kind == flavor else ""))

    if flavor == "workflow":
        payload = workflow_payload(
            "OK", "TEST", "SOL.py connectivity test",
            "Sent by --check-slack",
            "If you can read this, the workflow webhook works and this channel "
            "will receive space weather alerts.")
        print(f"  variables    {', '.join(WORKFLOW_KEYS)}")
    elif flavor == "discord":
        payload = {"content": "SOL.py connectivity test - space weather monitor."}
    else:
        payload = {
            "text": "SOL.py connectivity test - space weather monitor for BioSat.",
            "blocks": [_section(":satellite: *SOL.py test message*\n"
                                "If you can read this, the webhook works and this "
                                "channel will receive space weather alerts.")]}

    print("\nPosting...")
    ok, detail = post(webhook, payload)
    print(f"  Slack said   {detail}")

    if not ok:
        print("\nFAILED.", file=sys.stderr)
        hints = dict(SLACK_HINTS)
        if flavor == "workflow":
            hints["invalid_payload"] = (
                "The workflow did not accept these variables. In Workflow "
                "Builder, the five Text variables must be named exactly: "
                + ", ".join(WORKFLOW_KEYS))
            hints["trigger_not_found"] = (
                "No published workflow behind that URL. Publish it, then copy "
                "the web request URL again - it changes on publish.")
        for token, hint in hints.items():
            if token in detail:
                print(f"  -> {hint}", file=sys.stderr)
                break
        else:
            if "unreachable" in detail:
                print("  -> Network or DNS problem, not a Slack problem.",
                      file=sys.stderr)
        return 1

    print("\nSlack accepted the request.")
    if flavor == "workflow":
        print("\n  IMPORTANT: for a Workflow Builder webhook, accepting the")
        print("  request only means the trigger fired. The workflow itself runs")
        print("  afterwards and can still fail silently. If no message appears")
        print("  in the channel, check in this order:")
        print("    1. Is the workflow PUBLISHED? A draft's URL accepts posts")
        print("       and does nothing.")
        print("    2. Does it have a 'Send a message to a channel' step, saved?")
        print("    3. Are all five variables defined as Text, spelled exactly:")
        print(f"       {', '.join(WORKFLOW_KEYS)}")
        print("    4. Open the workflow in Slack and look at its activity log.")
    else:
        print("  Check the channel - the message should be there now.")
    return 0


# ---------------------------------------------------------------------------
# State (poller only)
# ---------------------------------------------------------------------------

def days_since(iso_date: str) -> float:
    """Days since an ISO date string, or a large number if never/unparseable."""
    if not iso_date:
        return float("inf")
    try:
        then = datetime.strptime(iso_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return float("inf")
    return (datetime.now(timezone.utc) - then).total_seconds() / 86400


def load_state(path: str) -> dict:
    try:
        with open(path) as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"seen": [], "last_kp_advisory": None}


def save_state(path: str, state: dict) -> None:
    state["seen"] = state["seen"][-500:]   # insertion-ordered, so this drops oldest
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(state, fh)
    os.replace(tmp, path)


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_argument_group("mode (pick one)")
    mode.add_argument("--status", action="store_true",
                      help="personal: print current state to the terminal")
    mode.add_argument("--brief", action="store_true",
                      help="team: post a snapshot digest to Slack")
    mode.add_argument("--poll", action="store_true",
                      help="team: post anything new since last run (for cron)")
    mode.add_argument("--seed", action="store_true",
                      help="mark everything current as seen and exit (run once)")
    mode.add_argument("--check-slack", action="store_true",
                      help="post a test message and report whether it worked")

    ap.add_argument("--hours", type=int, default=24,
                    help="look-back window for --status and --brief (default 24)")
    ap.add_argument("--drill", choices=DRILL_SCENARIOS,
                    help="run --status or --brief against a simulated event "
                         "instead of live data; output is banner-marked as a "
                         "drill and no state is written")
    ap.add_argument("--only-if-page", action="store_true",
                    help="--brief stays silent unless something is at PAGE "
                         "level, so the channel is quiet on ordinary days")
    ap.add_argument("--heartbeat-days", type=int, default=7,
                    help="with --only-if-page, post anyway if this many days "
                         "have passed with no brief, so silence stays "
                         "meaningful (0 disables; default 7)")
    ap.add_argument("--webhook", default=os.environ.get("SOL_WEBHOOK"),
                    help="Slack/Discord webhook URL (default: $SOL_WEBHOOK)")
    ap.add_argument("--flavor", choices=["auto", "slack", "workflow", "discord"],
                    default="auto",
                    help="payload format. auto (default) works it out from the "
                         "webhook URL: /triggers/ or /workflows/ means workflow, "
                         "/services/ means slack")
    ap.add_argument("--mention", default="",
                    help="prepended to PAGE messages, e.g. '<!channel>' or "
                         "'<!subteam^S01ABCDEFG>'")
    ap.add_argument("--state", default=os.path.expanduser("~/.swx_watch_state.json"))
    ap.add_argument("--dry-run", action="store_true",
                    help="print instead of posting; state is left untouched")
    ap.add_argument("--include-log", action="store_true",
                    help="--poll also sends LOG-level products")
    ap.add_argument("--no-color", action="store_true", help="plain terminal output")
    args = ap.parse_args()

    chosen = [args.status, args.brief, args.poll, args.seed, args.check_slack]
    if sum(bool(c) for c in chosen) != 1:
        ap.error("pick exactly one of --status, --brief, --poll, --seed, --check-slack")

    if args.drill and (args.poll or args.seed or args.check_slack):
        ap.error("--drill works with --status or --brief, not "
                 "--poll/--seed/--check-slack")

    needs_webhook = (args.brief or args.poll or args.check_slack) and not args.dry_run
    if needs_webhook and not args.webhook:
        ap.error("no webhook. Set SOL_WEBHOOK in the environment or pass --webhook")

    flavor, flavor_error = resolve_flavor(args.webhook or "", args.flavor)
    if flavor_error and (args.brief or args.poll or args.check_slack):
        ap.error(flavor_error)
    args.flavor = flavor

    if args.check_slack:
        return check_slack(args.webhook, args.flavor)

    if args.drill:
        alerts, drill_kp = drill_data(args.drill)
    else:
        drill_kp = None
        try:
            alerts = fetch(ALERTS_URL)
        except Exception as exc:
            print(f"could not fetch alerts: {exc}", file=sys.stderr)
            return 1

    # --- personal terminal --------------------------------------------------
    if args.status:
        if drill_kp is not None:
            kp_rows = drill_kp
        else:
            try:
                kp_rows = fetch(KP_URL)
            except Exception as exc:
                print(f"kp feed unavailable: {exc}", file=sys.stderr)
                kp_rows = []
        color = sys.stdout.isatty() and not args.no_color
        out = render_terminal(snapshot(alerts, kp_rows, args.hours), color)
        if args.drill:
            rule = "=" * 66
            banner = paint(f"{rule}\n  {DRILL_BANNER}\n{rule}", "page", color)
            out = f"{banner}\n\n{out}\n\n{banner}"
        print(out)
        return 0

    # --- team brief ---------------------------------------------------------
    if args.brief:
        if drill_kp is not None:
            kp_rows = drill_kp
        else:
            try:
                kp_rows = fetch(KP_URL)
            except Exception as exc:
                print(f"kp feed unavailable: {exc}", file=sys.stderr)
                kp_rows = []
        snap = snapshot(alerts, kp_rows, args.hours)
        paging = bool(snap["families"])
        heartbeat = False

        if args.only_if_page and not paging and not args.drill:
            # Quiet on a calm day - but a channel that is silent when healthy
            # and silent when broken tells you nothing. The periodic check-in
            # is what keeps the silence meaningful.
            state = load_state(args.state)
            elapsed = days_since(state.get("last_brief", ""))
            ago = ("never posted before" if elapsed == float("inf")
                   else f"last brief {elapsed:.0f} days ago")
            if args.heartbeat_days and elapsed >= args.heartbeat_days:
                heartbeat = True
                print(f"nominal, but {ago} - posting a check-in")
            else:
                print(f"nominal, nothing posted ({ago})")
                return 0

        if args.flavor == "workflow":
            payload = workflow_brief_payload(snap, heartbeat)
        elif args.flavor == "discord":
            payload = {"content": render_terminal(snap, False)[:1900]}
        else:
            payload = slack_brief_payload(snap, args.mention, heartbeat)

        if args.drill:
            payload = mark_drill(payload, args.flavor, args.drill)

        if args.dry_run or not args.webhook:
            print(json.dumps(payload, indent=2))
            return 0

        ok, detail = post(args.webhook, payload)
        print(("drill posted" if args.drill else "brief posted") if ok
              else f"brief failed: {detail}",
              file=sys.stdout if ok else sys.stderr)
        if ok and not args.drill:
            state = load_state(args.state)
            state["last_brief"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            state.setdefault("seen", [])
            save_state(args.state, state)
        return 0 if ok else 1

    # --- unattended poller --------------------------------------------------
    state = load_state(args.state)
    seen = list(dict.fromkeys(state.get("seen", [])))
    seen_set = set(seen)

    if args.seed:
        state["seen"] = [alert_key(e) for e in alerts]
        state["last_kp_advisory"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        save_state(args.state, state)
        print(f"seeded {len(state['seen'])} existing alerts; nothing sent")
        return 0

    outgoing = []
    for entry in alerts:
        key = alert_key(entry)
        if key in seen_set:
            continue
        seen_set.add(key)
        seen.append(key)
        code = code_of(entry)
        if code not in WATCHED:
            continue
        label, level = classify(entry, code)
        if level == "LOG" and not args.include_log:
            continue
        outgoing.append((entry, code, label, level))

    kp_note = None
    try:
        kp_rows = fetch(KP_URL)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if kp_is_sustained(kp_rows) and state.get("last_kp_advisory") != today:
            kp_note = current_kp(kp_rows)
            state["last_kp_advisory"] = today
    except Exception as exc:
        print(f"kp check skipped: {exc}", file=sys.stderr)

    sent = 0
    for entry, code, label, level in outgoing:
        if args.dry_run or not args.webhook:
            print(summarise_plain(entry, code, label, level))
            print("-" * 60)
        elif args.flavor == "workflow":
            ok, detail = post(args.webhook,
                              workflow_alert_payload(entry, code, label, level))
            if not ok:
                print(f"post failed: {detail}", file=sys.stderr)
            time.sleep(1)
        elif args.flavor == "discord":
            post(args.webhook, {"content": summarise_plain(entry, code, label, level)[:1900]})
            time.sleep(1)
        else:
            ok, detail = post(args.webhook,
                              slack_alert_payload(entry, code, label, level, args.mention))
            if not ok:
                print(f"post failed: {detail}", file=sys.stderr)
            time.sleep(1)   # Slack allows about one webhook message per second
        sent += 1

    if kp_note is not None:
        book = PLAYBOOK["geomag"]
        text = (f"[PAGE] Sustained geomagnetic activity - Kp {kp_note:.2f}\n\n"
                + "\n".join(f"{h}:\n" + "\n".join(f"  - {i}" for i in book[k])
                            for k, h in SECTION_LABELS if book[k]))
        if args.dry_run or not args.webhook:
            print(text)
            print("-" * 60)
        elif args.flavor == "workflow":
            post(args.webhook, workflow_payload(
                "PAGE", "KP", f"Sustained geomagnetic activity - Kp {kp_note:.2f}",
                f"Kp held at or above {KP_DRAG_THRESHOLD:.1f} for "
                f"{KP_SUSTAINED_PERIODS} consecutive periods",
                _playbook_text("geomag")))
        elif args.flavor == "discord":
            post(args.webhook, {"content": text[:1900]})
        else:
            lead = f"{args.mention} " if args.mention else ""
            post(args.webhook, {
                "text": f"🔴 PAGE: sustained geomagnetic activity, Kp {kp_note:.2f}",
                "blocks": [
                    {"type": "header",
                     "text": {"type": "plain_text",
                              "text": f"🔴 PAGE: sustained Kp {kp_note:.2f}",
                              "emoji": True}},
                    _section(f"{lead}Kp has held at or above {KP_DRAG_THRESHOLD:.1f} "
                             f"for {KP_SUSTAINED_PERIODS} consecutive periods. "
                             f"Drag, not radiation, is the driver here."),
                    {"type": "divider"},
                    *_playbook_blocks("geomag"),
                ]})
        sent += 1

    if args.dry_run:
        print(f"{sent} item(s) would be sent; state not written")
        return 0

    state["seen"] = seen
    save_state(args.state, state)
    if not sent:
        print("nothing new")
    return 0


if __name__ == "__main__":
    sys.exit(main())