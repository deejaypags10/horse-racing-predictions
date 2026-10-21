import numpy as np

from edge.features import FEATURES
from edge.model.logit import BreedModel, FormModel, fit_breed, race_softmax


def test_race_softmax_sums_per_race():
    s = np.array([0.0, 1.0, 2.0, 5.0, 5.0])
    p = race_softmax(s, np.array([0, 3]))
    assert np.isclose(p[:3].sum(), 1) and np.isclose(p[3:].sum(), 1)
    assert np.isclose(p[3], 0.5)


def test_fit_recovers_signal():
    rng = np.random.default_rng(0)
    n_races, size = 1500, 8
    X = rng.normal(size=(n_races * size, 2))
    beta = np.array([1.2, 0.0])
    starts = np.arange(0, n_races * size, size)
    winners = []
    for s in starts:
        u = X[s:s + size] @ beta
        p = np.exp(u - u.max()); p /= p.sum()
        winners.append(s + rng.choice(size, p=p))
    m = fit_breed(X, starts, np.array(winners), l2=0.1)
    coef_raw = m.coef / m.std
    assert abs(coef_raw[0] - 1.2) < 0.15 and abs(coef_raw[1]) < 0.15


def test_model_roundtrip(tmp_path):
    k = len(FEATURES)
    bm = BreedModel(np.zeros(k), np.ones(k), np.linspace(-1, 1, k), 10)
    fm = FormModel({"thoroughbred": bm}, version="t1")
    path = tmp_path / "m.json"
    fm.save(path)
    back = FormModel.load(path)
    X = np.ones((3, k))
    assert np.allclose(back.score("thoroughbred", X), fm.score("thoroughbred", X))
    # unknown breeds fall back to the thoroughbred block; null model scores zero
    assert np.allclose(back.score("other", X), fm.score("thoroughbred", X))
    assert (FormModel.null().score("harness", X) == 0).all()
