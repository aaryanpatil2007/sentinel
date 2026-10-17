"""Deterministic distress-report extraction and dispatch-review prioritization.
Produces review priorities for a human incident commander — not medical triage."""
from __future__ import annotations

import re

from .building import Building

COUNT_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
               "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
MOBILITY_PATTERNS = ["can't walk", "cannot walk", "can not walk", "wheelchair",
                     "broken leg", "can't move", "cannot move", "injured leg"]
UNCONSCIOUS_PATTERNS = ["unconscious", "passed out", "not responding", "not breathing"]
BLOCKED_PATTERNS = ["can't get out", "cannot get out", "door is blocked", "blocked",
                    "trapped", "can't find the stairs"]


def extract_report(text: str, building: Building) -> dict:
    t = text.lower()
    unknowns: list[str] = []

    location = building.resolve_location(text)
    if location is None:
        unknowns.append("location")

    people_count = 1
    m = re.search(r"\b(\d+|" + "|".join(COUNT_WORDS) + r")\s+of us\b", t) or \
        re.search(r"\b(\d+|" + "|".join(COUNT_WORDS) + r")\s+(?:people|persons)\b", t)
    if m:
        token = m.group(1)
        people_count = COUNT_WORDS.get(token) or int(token)
    elif "friend" in t:
        people_count = 2
    else:
        unknowns.append("people_count")

    return {"raw_text": text, "location": location, "people_count": people_count,
            "mobility_limited": any(p in t for p in MOBILITY_PATTERNS),
            "unconscious": any(p in t for p in UNCONSCIOUS_PATTERNS),
            "smoke_reported": "smoke" in t,
            "fire_reported": bool(re.search(r"\bfire\b|flames", t)),
            "exits_blocked": any(p in t for p in BLOCKED_PATTERNS),
            "unknowns": unknowns}


def prioritize(report: dict, risk: dict | None = None) -> dict:
    risk = risk or {}
    score = 0
    conditions: list[str] = []
    flags: list[str] = []
    reasons: list[str] = []

    if report["fire_reported"]:
        score += 3
        conditions.append("fire_nearby")
        reasons.append("occupant reports fire nearby")
    if report["smoke_reported"]:
        score += 2
        conditions.append("smoke_nearby")
        reasons.append("occupant reports smoke nearby")
    if report["mobility_limited"] or report["unconscious"]:
        score += 3
        conditions.append("mobility_limited" if report["mobility_limited"] else "unconscious_person")
        reasons.append("occupant or companion cannot self-evacuate")
    if report["exits_blocked"]:
        score += 2
        conditions.append("exit_blocked")
        reasons.append("occupant reports blocked egress")
    if report["people_count"] > 1:
        score += 1
        reasons.append(f"{report['people_count']} people reported together")
    if report["location"] and risk.get(report["location"]["node_id"], 0.0) >= 0.5:
        score += 2
        conditions.append("predicted_fire_spread_nearby")
        reasons.append("simulated model predicts fire spread toward reported location")

    if report["location"] is None:
        flags.append("location unresolved — needs contact")
    elif report["location"].get("conflict"):
        flags.append(report["location"]["conflict"])

    priority = ("urgent_review" if score >= 6
                else "priority_review" if score >= 3 else "standard_review")
    return {"priority": priority, "score": score, "reported_conditions": conditions,
            "reason": "; ".join(reasons) or "no specific risk factors reported",
            "requires_responder_review": True, "flags": flags}
