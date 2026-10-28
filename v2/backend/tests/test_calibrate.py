import numpy as np

from edge.model.calibrate import collect, fit_blend
from edge.store import Store


def test_fit_blend_recovers_weights():
    rng = np.random.default_rng(3)
    rows, starts, winners = [], [], []
    for _ in range(3000):
        q = rng.dirichlet(np.ones(7) * 2)
        f = rng.normal(size=7) * 0.5
        u = 1.0 * np.log(q) + 0.6 * f
        p = np.exp(u - u.max()); p /= p.sum()
        starts.append(len(rows)); winners.append(len(rows) + rng.choice(7, p=p))
        rows.extend(zip(np.log(q), f))
    a, b, ll, ll_m = fit_blend(np.array(rows), np.array(starts), np.array(winners))
    assert abs(a - 1.0) < 0.1 and abs(b - 0.6) < 0.1 and ll < ll_m


def test_collect_uses_pre_post_live_snapshots(tmp_path):
    st = Store(tmp_path / "c.sqlite3")
    st.add_snapshot("CD-20260606-2", "2999-01-01T00:00:00+00:00", "m", "live",
                    [{"bi": "1", "p_market": 0.6, "form_term": 0.1, "p_model": 0.6, "odds": 1.5},
                     {"bi": "2", "p_market": 0.4, "form_term": -0.1, "p_model": 0.4, "odds": 2.4}])
    st.put_result("CD-20260606-2", {"finish": [{"program": "2", "position": 1}],
                                    "runners": [{"program": "1", "interest": "1"}, {"program": "2", "interest": "2"}]})
    X, starts, winners = collect(st)
    assert X.shape == (2, 2) and list(winners) == [1]
