import pytest
from sentinel_engine.building import Building
from sentinel_engine.triage import extract_report, prioritize


@pytest.fixture(scope="module")
def building():
    return Building.load()


def test_demo_report_extraction(building):
    r = extract_report("I'm in Studio 210 on the second floor. "
                       "There's smoke outside and my friend can't walk.", building)
    assert r["location"]["node_id"] == "F2_STUDIO_210"
    assert r["smoke_reported"] is True
    assert r["mobility_limited"] is True
    assert r["people_count"] == 2
    assert "location" not in r["unknowns"]


def test_unknowns_stay_unknown(building):
    r = extract_report("help", building)
    assert r["location"] is None
    assert "location" in r["unknowns"]
    assert "people_count" in r["unknowns"]
    assert r["people_count"] == 1
    assert r["fire_reported"] is False


def test_count_words(building):
    r = extract_report("There are three of us and one person is unconscious", building)
    assert r["people_count"] == 3
    assert r["unconscious"] is True


def test_priority_urgent_for_demo_report(building):
    r = extract_report("I'm in Studio 210 on the second floor. "
                       "There's smoke outside and my friend can't walk.", building)
    p = prioritize(r)
    assert p["priority"] == "urgent_review"
    assert p["requires_responder_review"] is True
    assert "smoke_nearby" in p["reported_conditions"]
    assert "mobility_limited" in p["reported_conditions"]
    assert len(p["reason"]) > 10


def test_unknown_location_never_deprioritizes(building):
    vague = prioritize(extract_report("There's fire and I can't walk!", building))
    located = prioritize(extract_report(
        "There's fire and I can't walk! I'm in Studio 310 on the third floor", building))
    assert vague["score"] >= located["score"] - 2  # risk bonus is the only allowed diff
    assert "location unresolved — needs contact" in vague["flags"]
    assert vague["priority"] == "urgent_review"


def test_predicted_risk_raises_priority(building):
    r = extract_report("I'm in Studio 220 on the second floor, there is smoke", building)
    base = prioritize(r)
    risky = prioritize(r, risk={"F2_STUDIO_220": 0.8})
    assert risky["score"] == base["score"] + 2
