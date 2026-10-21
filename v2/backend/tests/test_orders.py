import numpy as np
import pytest

from edge.model.orders import order_probabilities, top_combinations


@pytest.mark.parametrize("n", [2, 3, 5, 8, 14, 22])
def test_joint_distribution_is_coherent(n):
    rng = np.random.default_rng(n)
    p = rng.dirichlet(np.ones(n))
    op = order_probabilities(p)
    assert np.isclose(op.win.sum(), 1.0)
    assert np.isclose(op.exacta.sum(), 1.0)
    assert np.allclose(op.exacta.sum(axis=1), op.win)          # marginal of the winner
    assert np.isclose(op.top2.sum(), 2.0)                      # two places to fill
    assert np.isclose(op.top3.sum(), min(3.0, n))
    assert (op.top3 >= op.top2 - 1e-12).all() and (op.top2 >= op.win - 1e-12).all()
    if op.trifecta is not None:
        assert np.isclose(op.trifecta.sum(), 1.0)
        assert np.allclose(op.trifecta.sum(axis=2), op.exacta)
        assert np.allclose(op.trifecta.sum(axis=(0, 1)) + op.exacta.sum(axis=0) + op.win, op.top3)


def test_discount_moves_mass_off_favourite_for_second():
    p = np.array([0.6, 0.25, 0.15])
    plain = order_probabilities(p, lam2=1.0, lam3=1.0)
    disc = order_probabilities(p)
    assert disc.exacta[1:, 0].sum() < plain.exacta[1:, 0].sum()


def test_single_runner_and_invalid():
    op = order_probabilities(np.array([1.0]))
    assert op.win[0] == 1.0 and op.top3[0] == 1.0
    with pytest.raises(ValueError):
        order_probabilities(np.array([]))
    with pytest.raises(ValueError):
        order_probabilities(np.array([0.5, np.nan]))


def test_top_combinations_sorted():
    op = order_probabilities(np.array([0.5, 0.3, 0.2]))
    combos = top_combinations(op, ["1", "2", "3"], "exacta", 3)
    probs = [p for _, p in combos]
    assert probs == sorted(probs, reverse=True)
    assert combos[0][0] == ("1", "2")
    assert len(top_combinations(op, ["1", "2", "3"], "trifecta", 10)) == 6
