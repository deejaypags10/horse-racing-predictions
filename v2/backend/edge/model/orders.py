"""Finishing-order probabilities derived from win probabilities.

Plain Harville (1973) over-rates favourites for 2nd/3rd. We use the
discounted form popularised by Benter (1994) / Lo & Bacon-Shone: the
probabilities used for the 2nd and 3rd "sub-races" are the win
probabilities raised to a power < 1 and renormalised over the remaining
runners. The defaults below are the published values; they are applied
consistently everywhere (place/show, exacta, trifecta) so that every
number shown in the UI comes from one coherent joint distribution.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

LAMBDA_SECOND = 0.81
LAMBDA_THIRD = 0.65


@dataclass(frozen=True)
class OrderProbs:
    win: np.ndarray        # P(i finishes 1st)
    top2: np.ndarray       # P(i finishes 1st or 2nd)  — "place" in US terms
    top3: np.ndarray       # P(i finishes 1st, 2nd or 3rd) — "show"
    exacta: np.ndarray     # [i, j] = P(i 1st, j 2nd)
    trifecta: np.ndarray | None  # [i, j, k]; None when field > MAX_TRIFECTA_FIELD


MAX_TRIFECTA_FIELD = 20


def _discounted(p: np.ndarray, lam: float) -> np.ndarray:
    q = np.power(np.clip(p, 1e-12, None), lam)
    return q / q.sum()


def order_probabilities(win: np.ndarray, lam2: float = LAMBDA_SECOND, lam3: float = LAMBDA_THIRD) -> OrderProbs:
    p = np.asarray(win, dtype=float)
    n = len(p)
    if n == 0:
        raise ValueError("empty field")
    if not np.isfinite(p).all() or (p < 0).any():
        raise ValueError("invalid win probabilities")
    p = p / p.sum()
    if n == 1:
        one = np.ones(1)
        return OrderProbs(one, one, one, np.zeros((1, 1)), np.zeros((1, 1, 1)))

    q2 = _discounted(p, lam2)
    q3 = _discounted(p, lam3)

    # exacta[i, j] = p_i * q2_j / (1 - q2_i)
    denom2 = 1.0 - q2
    exacta = p[:, None] * q2[None, :] / denom2[:, None]
    np.fill_diagonal(exacta, 0.0)

    second = exacta.sum(axis=0)
    top2 = p + second

    # third_k = sum_{i,j != k} exacta[i, j] * q3_k / (1 - q3_i - q3_j)
    rem = 1.0 - q3[:, None] - q3[None, :]
    with np.errstate(divide="ignore", invalid="ignore"):
        w = np.where((exacta > 0) & (rem > 1e-12), exacta / np.where(rem > 1e-12, rem, 1.0), 0.0)
    third = q3 * (w.sum() - w.sum(axis=0) - w.sum(axis=1))
    top3 = top2 + third if n >= 3 else np.ones(n)

    trifecta = None
    if 3 <= n <= MAX_TRIFECTA_FIELD:
        tri = w[:, :, None] * q3[None, None, :]
        idx = np.arange(n)
        tri[idx, :, idx] = 0.0
        tri[:, idx, idx] = 0.0
        trifecta = tri

    return OrderProbs(
        win=p,
        top2=np.clip(top2, 0.0, 1.0),
        top3=np.clip(top3, 0.0, 1.0),
        exacta=exacta,
        trifecta=trifecta,
    )


def top_combinations(op: OrderProbs, labels: list[str], kind: str, limit: int = 10) -> list[tuple[tuple[str, ...], float]]:
    """Most likely exacta / trifecta combinations as (labels, probability)."""
    if kind == "exacta":
        mat = op.exacta
    elif kind == "trifecta":
        if op.trifecta is None:
            return []
        mat = op.trifecta
    else:
        raise ValueError(kind)
    flat = mat.ravel()
    k = min(limit, int((flat > 0).sum()))
    if k == 0:
        return []
    idx = np.argpartition(-flat, k - 1)[:k]
    idx = idx[np.argsort(-flat[idx])]
    out = []
    for f in idx:
        combo = np.unravel_index(int(f), mat.shape)
        out.append((tuple(labels[c] for c in combo), float(flat[f])))
    return out
