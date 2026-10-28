"""Conditional (multinomial) logit over the runners of each race.

P(runner i wins race r) = exp(x_i·β) / Σ_{j in r} exp(x_j·β)

This is the model family behind the best documented racing systems
(Bolton & Chapman 1986; Benter 1994). Properties we rely on:

* probabilities within a race always sum to exactly 1;
* scratches are handled exactly: drop the runner and renormalise;
* the score is relative, so it transfers to tracks absent from training.

Parameters are stored as plain JSON (no pickle), one block per breed.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

from ..features import FEATURES


def race_softmax(scores: np.ndarray, starts: np.ndarray) -> np.ndarray:
    """Softmax of ``scores`` within contiguous groups beginning at ``starts``."""
    gid = np.repeat(np.arange(len(starts)), np.diff(np.append(starts, len(scores))))
    mx = np.maximum.reduceat(scores, starts)
    e = np.exp(scores - mx[gid])
    return e / np.add.reduceat(e, starts)[gid]


@dataclass
class BreedModel:
    mean: np.ndarray
    std: np.ndarray
    coef: np.ndarray
    n_races: int = 0

    def score(self, X: np.ndarray) -> np.ndarray:
        return ((X - self.mean) / self.std) @ self.coef

    def to_json(self) -> dict:
        return {"mean": self.mean.tolist(), "std": self.std.tolist(), "coef": self.coef.tolist(), "n_races": self.n_races}

    @classmethod
    def from_json(cls, d: dict) -> "BreedModel":
        return cls(np.array(d["mean"]), np.array(d["std"]), np.array(d["coef"]), int(d.get("n_races", 0)))


def fit_breed(X: np.ndarray, starts: np.ndarray, winner_idx: np.ndarray, l2: float = 1.0) -> BreedModel:
    """Maximum-likelihood fit with an L2 penalty on standardised coefficients.

    ``starts`` are race offsets into ``X`` (rows grouped by race);
    ``winner_idx`` are absolute row indices of each race's winner.
    """
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std < 1e-9] = 1.0
    Z = (X - mean) / std
    n_races = len(starts)
    gid = np.repeat(np.arange(n_races), np.diff(np.append(starts, len(Z))))

    def nll(beta: np.ndarray) -> tuple[float, np.ndarray]:
        s = Z @ beta
        mx = np.maximum.reduceat(s, starts)
        e = np.exp(s - mx[gid])
        den = np.add.reduceat(e, starts)
        p = e / den[gid]
        ll = (s[winner_idx] - mx - np.log(den)).sum()
        # gradient: Σ_r (z_winner - Σ_i p_i z_i)
        grad = Z[winner_idx].sum(axis=0) - (p[:, None] * Z).sum(axis=0)
        return -ll / n_races + 0.5 * l2 * beta @ beta / n_races, -grad / n_races + l2 * beta / n_races

    res = minimize(nll, np.zeros(Z.shape[1]), jac=True, method="L-BFGS-B", options={"maxiter": 500})
    return BreedModel(mean=mean, std=std, coef=res.x, n_races=n_races)


@dataclass
class FormModel:
    breeds: dict[str, BreedModel]
    features: tuple[str, ...] = FEATURES
    version: str = "untrained"
    meta: dict = field(default_factory=dict)

    def for_breed(self, breed: str) -> BreedModel | None:
        if breed in self.breeds:
            return self.breeds[breed]
        return self.breeds.get("thoroughbred")

    def score(self, breed: str, X: np.ndarray) -> np.ndarray:
        m = self.for_breed(breed)
        if m is None or len(X) == 0:
            return np.zeros(len(X))
        return m.score(X)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": self.version,
            "features": list(self.features),
            "breeds": {k: v.to_json() for k, v in self.breeds.items()},
            "meta": self.meta,
        }
        path.write_text(json.dumps(payload, indent=1))

    @classmethod
    def load(cls, path: Path) -> "FormModel":
        d = json.loads(path.read_text())
        feats = tuple(d["features"])
        if feats != FEATURES:
            raise ValueError(
                f"model {path} was trained on a different feature set; retrain with `edge train`"
            )
        return cls({k: BreedModel.from_json(v) for k, v in d["breeds"].items()}, feats, d.get("version", "?"), d.get("meta", {}))

    @classmethod
    def null(cls) -> "FormModel":
        return cls({}, FEATURES, "none")
