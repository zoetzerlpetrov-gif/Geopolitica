"""Vigilancia persistente con arrendamientos, cache y reintentos; sin enviar mensajes."""
import argparse
import hashlib
import json
import time
from sqlalchemy import delete, select
from .config import Settings
from .connectors import BudgetError, PublicHTTP, SOURCES, fetch_source, fingerprint
from .db import Cache, Case, CaseAccess, Observation, Quota, Revision, Store, Watch, Area, CaseReview
from .security import audit


def reserve(store, host, cap):
    key, now = host, time.time()
    with store.tx() as s:
        if store.engine.dialect.name == 'postgresql':
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        s.execute(insert(Quota).values(source=key, window=now, count=0, bytes=0, blocked_until=0, hour=now, hour_count=0).on_conflict_do_nothing())
        row = s.execute(select(Quota).where(Quota.source == key).with_for_update()).scalar_one()
        if now - row.window >= 7 * 86400:
            row.window, row.count, row.bytes = now, 0, 0
        if now - row.hour >= 3600:
            row.hour, row.hour_count = now, 0
        budget = (100 if host == 'data.epo.org' else 512) * 1024 * 1024
        if row.bytes + cap > budget or row.hour_count >= 60:
            raise BudgetError('Cuota global conservadora alcanzada; consulta diferida.')
        wait = max(0, row.blocked_until - now)
        if wait > 20:
            raise BudgetError('Fuente ocupada; consulta diferida.')
        row.count += 1
        row.hour_count += 1
        row.bytes += cap
        row.blocked_until = now + wait + 2
    if wait:
        time.sleep(wait)
    def settle(actual):
        with store.tx() as s:
            row = s.execute(select(Quota).where(Quota.source == key).with_for_update()).scalar_one()
            row.bytes -= max(0, cap - actual)
    return settle


def collect(store, watch):
    params = store.open(watch.parameters, 'watch:' + watch.id)
    checkpoint = json.loads(watch.checkpoint)
    key = hashlib.sha256(json.dumps([watch.org, watch.source, params, checkpoint.get('continuacion'), checkpoint.get('periodo')], sort_keys=True).encode()).hexdigest()
    with store.tx() as s:
        cached = s.get(Cache, key)
        if cached and cached.expires > time.time():
            result = store.open(cached.data, 'cache:' + key)
            result['cache_hit'] = True
            return result
    h = PublicHTTP(budget=lambda host, cap: reserve(store, host, cap))
    result = fetch_source(watch.source, params, h, checkpoint)
    with store.tx() as s:
        cached = s.get(Cache, key)
        if cached is None:
            cached = Cache(key=key)
            s.add(cached)
        cached.data = store.seal(result, 'cache:' + key)
        cached.expires = time.time() + 3600
    return result


def process_one(store, collector=collect, now=None):
    now = now or time.time()
    with store.tx() as s:
        row = s.execute(select(Watch).join(Case, Watch.case == Case.id).where(Watch.enabled.is_(True), Watch.due <= now, Watch.lease_until <= now, Case.deleted_at.is_(None)).order_by(Watch.due).with_for_update(skip_locked=True).limit(1)).scalar_one_or_none()
        if not row:
            return False
        row.lease_until = now + 900
        row.status = 'running'
        watch_id = row.id
    # No se mantiene una transacción abierta durante la red.
    try:
        with store.tx() as s:
            watch = s.get(Watch, watch_id)
        result = collector(store, watch)
        digest = fingerprint(result)
        with store.tx() as s:
            row = s.execute(select(Watch).where(Watch.id == watch_id).with_for_update()).scalar_one()
            case = s.get(Case, row.case)
            if case.deleted_at or not row.enabled:
                row.lease_until = 0
                return True
            if row.fingerprint != digest:
                oid = __import__('uuid').uuid4().hex
                s.add(Observation(id=oid, watch=row.id, fingerprint=digest, data=store.seal(result, 'observation:' + oid)))
                audit(store, s, row.org, 'worker', 'source.changed', row.id)
            row.fingerprint = digest
            row.count = len(result['datos'].get('resultados', []))
            row.last_success, row.last_error, row.failures = now, None, 0
            row.status = 'stale' if result['datos'].get('stale') else 'partial' if result['parcial'] else 'ok'
            row.checkpoint = json.dumps({'contrato': 1, 'continuacion': result['datos'].get('continuacion'), 'corte': result['datos'].get('corte'), 'periodo': result['datos'].get('periodo'), 'last_success': now})
            row.due, row.lease_until = now + row.interval, 0
    except Exception as exc:
        # Sin registrar consultas, datos del caso, tokens o errores remotos completos.
        with store.tx() as s:
            row = s.get(Watch, watch_id)
            row.failures += 1
            row.status = 'quota' if isinstance(exc, BudgetError) else 'error'
            row.last_error = type(exc).__name__ + ': revisar disponibilidad, cuota o esquema de la fuente'
            row.due = now + min(86400, 300 * 2 ** min(row.failures, 8))
            row.lease_until = 0
            audit(store, s, row.org, 'worker', 'source.failed', row.id)
    return True


def purge(store, now=None):
    now = now or time.time()
    with store.tx() as s:
        for case in s.execute(select(Case).where(Case.deleted_at.is_not(None), Case.hold.is_(False)).with_for_update(skip_locked=True)).scalars():
            if case.deleted_at + case.retention_days * 86400 > now:
                continue
            for watch in s.execute(select(Watch).where(Watch.case == case.id)).scalars():
                s.execute(delete(Observation).where(Observation.watch == watch.id))
                s.delete(watch)
            s.execute(delete(CaseAccess).where(CaseAccess.case == case.id))
            s.execute(delete(CaseReview).where(CaseReview.case == case.id))
            s.execute(delete(Revision).where(Revision.case == case.id))
            s.execute(delete(Area).where(Area.case == case.id))
            audit(store, s, case.org, 'worker', 'case.purged', case.id)
            s.delete(case)
        s.execute(delete(Cache).where(Cache.expires < now))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--once', action='store_true')
    args = p.parse_args()
    store = Store(Settings().validate())
    while True:
        processed = process_one(store)
        purge(store)
        if args.once:
            break
        if not processed:
            time.sleep(5)


if __name__ == '__main__':
    main()
