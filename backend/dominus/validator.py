"""Servicio de validación por socket Unix: contenedor sin red ni secretos."""
import hashlib
import json
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from .media import verify_bytes

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.post('/verify/{suffix}')
async def verify(suffix: str, request: Request):
    if suffix not in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'mp4', 'pdf'):
        raise HTTPException(422, 'Formato no admitido.')
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 4 * 1024 * 1024:
            raise HTTPException(413, 'Máximo 4 MB.')
    try:
        return await run_in_threadpool(verify_bytes, bytes(raw), '.' + suffix)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
