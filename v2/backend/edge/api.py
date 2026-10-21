"""HTTP API (FastAPI). Thin: validation and error mapping only.

Run with ``edge serve`` (binds 127.0.0.1 by default — this is a personal
tool with no authentication, so it must not be exposed on a network).
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .service import BadRequest, NotFound, Service
from .sources.base import SourceError

log = logging.getLogger(__name__)

_PROGRAM = re.compile(r"^[0-9]{1,2}[A-Z]?$")


def _whatif(raw: str | None) -> frozenset[str]:
    if not raw:
        return frozenset()
    items = [x.strip().upper() for x in raw.split(",") if x.strip()]
    if len(items) > 24 or not all(_PROGRAM.match(x) for x in items):
        raise HTTPException(400, "whatif must be a comma-separated list of program numbers")
    return frozenset(items)


def create_app(service: Service | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.load()
    app = FastAPI(title="Equine Edge", version="2.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
    state: dict[str, Service] = {}

    # The API has no auth (personal, loopback-only). Two guards stop other
    # websites from using it through the user's browser: reject foreign Host
    # headers (DNS rebinding) and foreign Origins on writes (CSRF).
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
    local_origins = {f"http://{h}:{p}" for h in ("127.0.0.1", "localhost") for p in (8765, 5173, 4173)}

    def svc() -> Service:
        if "svc" not in state:
            state["svc"] = service or Service(settings)
        return state["svc"]

    @app.on_event("startup")
    def _start() -> None:
        if service is None and settings.poll:
            s = svc()
            if s.live:
                from .poller import Poller
                state["poller"] = Poller(s)  # type: ignore[assignment]
                state["poller"].start()  # type: ignore[attr-defined]

    @app.exception_handler(NotFound)
    async def _nf(_: Request, exc: NotFound):
        return JSONResponse({"error": "not_found", "detail": str(exc)}, status_code=404)

    @app.exception_handler(BadRequest)
    async def _br(_: Request, exc: BadRequest):
        return JSONResponse({"error": "bad_request", "detail": str(exc)}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = {400: "bad_request", 404: "not_found", 415: "unsupported_media_type"}.get(exc.status_code, "error")
        return JSONResponse({"error": code, "detail": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(SourceError)
    async def _se(_: Request, exc: SourceError):
        return JSONResponse({"error": "source_unavailable", "detail": str(exc)}, status_code=503)

    @app.middleware("http")
    async def _headers(request: Request, call_next):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and origin not in local_origins:
                return JSONResponse({"error": "forbidden_origin", "detail": "cross-site request refused"}, status_code=403)
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/"):
            resp.headers.setdefault("Cache-Control", "no-store")
        else:
            resp.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                "font-src 'self' data:; img-src 'self' data:; connect-src 'self'; "
                "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        return resp

    @app.get("/api/status")
    def status():
        return svc().status()

    @app.get("/api/board")
    def board():
        return svc().board()

    @app.get("/api/tracks/{track_id}")
    def track(track_id: str):
        return svc().track_view(track_id)

    @app.get("/api/races/{race_id}")
    def race(race_id: str, whatif: str | None = Query(default=None, max_length=120)):
        return svc().race_view(race_id, _whatif(whatif))

    @app.get("/api/tickets")
    def tickets():
        return svc().tickets_view()

    @app.post("/api/tickets", status_code=201)
    async def create_ticket(request: Request):
        if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
            raise HTTPException(415, "Content-Type must be application/json")
        try:
            body = await request.json()
        except ValueError:
            raise HTTPException(400, "body must be JSON") from None
        if not isinstance(body, dict):
            raise HTTPException(400, "body must be a JSON object")
        return await run_in_threadpool(svc().create_ticket, body)

    @app.delete("/api/tickets/{ticket_id}", status_code=204)
    def delete_ticket(ticket_id: str):
        if not re.fullmatch(r"[0-9a-f]{12}", ticket_id):
            raise HTTPException(404, "not found")
        svc().delete_ticket(ticket_id)

    @app.get("/api/model")
    def model():
        return svc().model_card()

    # ---- static SPA ---------------------------------------------------------
    dist: Path = settings.web_dist
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/") or "\x00" in path:
                raise HTTPException(404)
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and dist.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app
