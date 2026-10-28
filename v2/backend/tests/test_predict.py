from datetime import date

import numpy as np
import pytest

from edge.domain import Breed, Race, Runner
from edge.features import FEATURES
from edge.history import History
from edge.model.logit import BreedModel, FormModel
from edge.model.predict import predict_race
from edge.odds import parse_odds


def _race(prices, live=True, coupled=None, scratched=()):
    runners = []
    for i, p in enumerate(prices, start=1):
        prog = str(i)
        runners.append(Runner(program=prog, post=i, name=f"Horse {i}",
                              morning_line=parse_odds(p), live_odds=parse_odds(p) if live else None,
                              scratched=prog in scratched))
    if coupled:
        runners.append(Runner(program=f"{coupled}A", post=len(prices) + 1, name="Stablemate",
                              morning_line=None, live_odds=None, coupled_with=coupled))
        runners[int(coupled) - 1].coupled_with = coupled
    return Race(id="CD-20260606-2", track_id="CD-20260606", track_code="CD", track_name="Churchill Downs",
                breed=Breed.THOROUGHBRED, number=2, card_date=date(2026, 6, 6), distance="6f", distance_furlongs=6.0,
                surface="Dirt", purse=50000.0, runners=runners, source="test")


def _model(weight_on_form_last=1.0):
    k = len(FEATURES)
    coef = np.zeros(k)
    coef[FEATURES.index("form_last")] = weight_on_form_last
    return FormModel({"thoroughbred": BreedModel(np.zeros(k), np.ones(k), coef)}, version="test")


def test_probabilities_sum_to_one_and_market_only_without_history():
    race = _race(["6-5", "9-5", "4-1", "10-1"])
    pred = predict_race(race, History.empty(), _model())
    assert pred.market == "live"
    p = np.array([i.p_model for i in pred.interests])
    assert np.isclose(p.sum(), 1.0)
    # no evidence -> blend weight 0 -> model equals de-vigged market (a = 1 for live)
    q = np.array([i.p_market for i in pred.interests])
    assert np.allclose(p, q)
    assert all(i.evidence == "none" and not i.value for i in pred.interests)
    assert pred.overround > 1


def test_form_moves_probability_with_evidence(tiny_history_frame):
    race = _race(["5-2", "9-5", "4-1", "10-1"])
    race.runners[1].name = "Midday Sun"      # 3 runs before 2026-06-06 (a 4th is after the race)
    pred = predict_race(race, History(tiny_history_frame), _model(5.0))
    by = {i.key: i for i in pred.interests}
    assert by["2"].starts == 3 and by["2"].evidence == "some"
    assert by["2"].p_model != pytest.approx(by["2"].p_market)
    assert np.isclose(sum(i.p_model for i in pred.interests), 1.0)


def test_coupled_entry_is_one_interest():
    race = _race(["5-2", "9-5", "4-1"], coupled="1")
    pred = predict_race(race, History.empty(), _model())
    keys = [i.key for i in pred.interests]
    assert keys == ["1", "2", "3"]
    assert pred.interests[0].programs == ["1", "1A"]


def test_scratches_and_whatif_renormalise():
    race = _race(["5-2", "9-5", "4-1", "10-1"], scratched=("4",))
    pred = predict_race(race, History.empty(), _model())
    assert [i.key for i in pred.interests] == ["1", "2", "3"]
    whatif = predict_race(race, History.empty(), _model(), frozenset({"2"}))
    assert [i.key for i in whatif.interests] == ["1", "3"]
    assert whatif.scratched_by_user == ["2"]
    assert np.isclose(sum(i.p_model for i in whatif.interests), 1.0)


def test_morning_line_never_flags_value():
    race = _race(["5-2", "9-5", "4-1", "10-1"], live=False)
    pred = predict_race(race, History.empty(), _model())
    assert pred.market == "morning_line"
    assert not any(i.value for i in pred.interests)


def test_no_prices_falls_back_to_form():
    race = _race([None, None, None])
    pred = predict_race(race, History.empty(), _model())
    assert pred.market == "none"
    assert np.allclose([i.p_model for i in pred.interests], 1 / 3)
    assert all(i.edge_pts is None for i in pred.interests)


def test_exotics_consistent_with_win():
    race = _race(["5-2", "9-5", "4-1", "10-1", "20-1"])
    pred = predict_race(race, History.empty(), _model())
    assert pred.exacta[0][0][0] == "2"      # favourite heads the top exacta
    assert all(len(c) == 3 for c, _ in pred.trifecta)


def test_empty_field():
    race = _race(["5-2"], scratched=("1",))
    pred = predict_race(race, History.empty(), _model())
    assert pred.interests == [] and pred.market == "none"
