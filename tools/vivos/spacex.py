#!/usr/bin/env python3
"""SpaceX OCM/ITRF2000 → OMM/SGP4 ajustado y validado, exclusivamente para visualización.

Descarga parcial de una efeméride oficial por objeto; no fabrica TLE ni órbitas para nombres sin datos.
La instantánea conserva solo modelos dentro de su ventana validada. Se renueva en una rama independiente.
"""
import argparse
import gzip
import json
import math
import os
import re
import subprocess
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = 'https://starlink.com/public-files/ephemerides/'
MANIFEST = BASE + 'MANIFEST.txt'
SUPGP = 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=JSON'
UA = 'DOMINUS-OSINT/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)'


def iso(t):
    return t.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def fecha(t):
    return datetime.fromisoformat(t.replace('Z', '+00:00'))


def manifiesto(texto):
    out = {}
    for linea in texto.splitlines():
        m = re.fullmatch(r'MEME_(\d+)_(STARLINK-\d+)_[A-Za-z0-9_.-]+\.txt', linea.strip())
        if m:
            out[m[1]] = m[2]
    return out


def leer_ocm(texto):
    meta, filas, trayectoria = {}, [], False
    for linea in texto.splitlines():
        if linea == 'TRAJ_START':
            trayectoria = True
        elif linea == 'TRAJ_STOP':
            trayectoria = False
        elif ' = ' in linea:
            k, v = linea.split(' = ', 1)
            meta[k] = v.strip()
        elif trayectoria:
            p = linea.split()
            if len(p) == 7 and re.match(r'^\d{4}-\d\d-\d\dT', p[0]):
                try:
                    t, v = fecha(p[0]), [float(x) for x in p[1:]]
                    if t.tzinfo and all(math.isfinite(x) for x in v):
                        filas.append((t, v))
                except ValueError:
                    pass  # el Range puede cortar la última línea
    if meta.get('TRAJ_REF_FRAME') != 'ITRF2000' or meta.get('TIME_SYSTEM') != 'UTC' or meta.get('TRAJ_UNITS', '').replace(' ', '') != '[km,km,km,km/s,km/s,km/s]':
        raise ValueError('sistema de referencia no compatible')
    if 'CCSDS_OCM_VERS' not in meta or not meta.get('OBJECT_NAME', '').startswith('STARLINK-'):
        raise ValueError('no es una efeméride OCM de Starlink')
    return meta, sorted(filas, key=lambda x: x[0])


def ajustar(texto, ahora=None, horizonte=48, max_error_km=3):
    import numpy as np
    from scipy.optimize import least_squares
    from sgp4.api import Satrec, WGS72, jday
    from sgp4.propagation import gstime
    ahora = ahora or datetime.now(timezone.utc)
    meta, todas = leer_ocm(texto)
    creado = fecha(meta['CREATION_DATE'])
    if not timedelta(hours=-1) <= ahora - creado <= timedelta(hours=18):
        raise ValueError('efeméride antigua o futura')
    filas = [(t, np.asarray(pv)) for t, pv in todas if t >= ahora - timedelta(minutes=2)]
    if len(filas) < 150:
        raise ValueError('menos de dos horas de trayectoria disponible')
    epoch = filas[0][0]
    if epoch > ahora + timedelta(minutes=5):
        raise ValueError('trayectoria futura sin posición actual disponible')
    def jd(t):
        return jday(t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond / 1e6)
    jd0, fr0 = jd(epoch)
    def inercial(t, pv):
        j, f = jd(t)
        a = gstime(j + f)
        c, s = np.cos(a), np.sin(a)
        rot = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        r, v = pv[:3], pv[3:]
        return rot @ r, rot @ (v + np.cross([0, 0, 7.29211514670698e-5], r)), j, f
    r, v, _, _ = inercial(*filas[0])
    mu, rn = 398600.8, np.linalg.norm(r)
    h = np.cross(r, v)
    hn = np.linalg.norm(h)
    n = np.cross([0, 0, 1], h)
    nn = np.linalg.norm(n)
    ev = ((v @ v - mu / rn) * r - (r @ v) * v) / mu
    ecc = np.linalg.norm(ev)
    if not 1e-8 < ecc < .1 or nn < 1e-6:
        raise ValueError('estado orbital fuera del modelo admitido')
    inc, raan = np.arccos(h[2] / hn), np.arctan2(n[1], n[0])
    arg = np.arctan2(np.dot(np.cross(n, ev), h) / (nn * ecc * hn), n @ ev / (nn * ecc))
    nu = np.arctan2(np.dot(np.cross(ev, r), h) / (ecc * rn * hn), ev @ r / (ecc * rn))
    E = 2 * np.arctan2(np.sqrt(1 - ecc) * np.sin(nu / 2), np.sqrt(1 + ecc) * np.cos(nu / 2))
    mean = E - ecc * np.sin(E)
    semieje = 1 / (2 / rn - v @ v / mu)
    mm = np.sqrt(mu / semieje ** 3) * 86400 / (2 * np.pi)
    x0 = [inc, raan, ecc, arg, mean, mm, 0]
    norad = int(meta['OBJECT_DESIGNATOR'])
    def sat(x):
        s = Satrec()
        s.sgp4init(WGS72, 'i', 1, jd0 + fr0 - 2433281.5, x[6] * 1e-4, 0, 0, x[2], x[3], x[0], x[4], x[5] * 2 * np.pi / 1440, x[1])
        return s
    for horas in dict.fromkeys([horizonte, 24, 12, 6, 3]):
        if horas > horizonte:
            continue
        ventana = [(t, pv) for t, pv in filas if t <= epoch + timedelta(hours=horas)]
        if len(ventana) < 150:
            continue
        entrenar = [inercial(t, pv) for t, pv in ventana[::20]]
        validar = [inercial(t, pv) for t, pv in ventana[::5]]
        def residuos(x, datos=entrenar):
            modelo, res = sat(x), []
            for rr, _, j, f in datos:
                err, posicion, _ = modelo.sgp4(j, f)
                if err:
                    return np.full(len(datos) * 3, 1e6)
                res.extend(np.asarray(posicion) - rr)
            return np.asarray(res)
        fit = least_squares(residuos, x0, bounds=([0, -np.inf, 1e-8, -np.inf, -np.inf, 10, -100],
                                                 [np.pi, np.inf, .1, np.inf, np.inf, 18, 100]),
                            x_scale='jac', max_nfev=150, ftol=1e-9, xtol=1e-9, gtol=1e-9)
        errores = np.linalg.norm(residuos(fit.x, validar).reshape(-1, 3), axis=1)
        if not fit.success or max(errores) > max_error_km:
            continue
        x = fit.x
        omm = {'OBJECT_NAME': meta['OBJECT_NAME'], 'OBJECT_ID': '', 'NORAD_CAT_ID': norad, 'EPOCH': epoch.strftime('%Y-%m-%dT%H:%M:%S.%f'),
               'MEAN_MOTION': float(x[5]), 'ECCENTRICITY': float(x[2]), 'INCLINATION': float(np.degrees(x[0])),
               'RA_OF_ASC_NODE': float(np.degrees(x[1]) % 360), 'ARG_OF_PERICENTER': float(np.degrees(x[3]) % 360),
               'MEAN_ANOMALY': float(np.degrees(x[4]) % 360), 'BSTAR': float(x[6] * 1e-4), 'MEAN_MOTION_DOT': 0, 'MEAN_MOTION_DDOT': 0,
               'CLASSIFICATION_TYPE': 'U', 'EPHEMERIS_TYPE': 0, 'ELEMENT_SET_NO': 1, 'REV_AT_EPOCH': 0}
        return {'omm': omm, 'desde': iso(epoch), 'hasta': iso(ventana[(len(ventana) - 1) // 5 * 5][0]),
                'creado': meta['CREATION_DATE'], 'fuente': BASE + meta['OBJECT_NAME'] + '.txt',
                'tipo_id': 'NORAD' if norad < 1_000_000 else 'SpaceX provisional', 'error_max_km': round(float(max(errores)), 3), 'error_rms_km': round(float(np.sqrt(np.mean(errores ** 2))), 3)}
    raise ValueError('no pasa la validación de precisión')


def descargar(url, limite=None):
    args = ['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '45', '--max-filesize', str(limite or 40_000_000), '--user-agent', UA]
    if limite:
        args += ['--range', f'0-{limite - 1}']
    r = subprocess.run(args + [url], capture_output=True, timeout=50)
    if r.returncode:
        raise OSError(r.stderr.decode('utf-8', 'replace')[:240])
    return r.stdout.decode('utf-8', 'replace')


def metadatos_lanzamientos(texto):
    import csv
    from io import StringIO
    out = {}
    lineas = [l for l in texto.splitlines() if not l.startswith("# Updated")]
    if not lineas:
        return out
    lineas[0] = lineas[0].lstrip("#")
    for fila in csv.DictReader(StringIO("\n".join(lineas)), delimiter="\t"):
        n = (fila.get("Satcat") or "").strip().lstrip("0")
        if n and "STARLINK" in (fila.get("Name") or "").upper():
            try:
                d = datetime.strptime(" ".join(fila["LDate"].split()[:3]), "%Y %b %d").replace(tzinfo=timezone.utc)
                out[n] = {"lanzamiento": iso(d)[:10], "lote": fila["Launch_Tag"].strip(), "designador": fila["Piece"].strip()}
            except (ValueError, KeyError):
                pass
    return out


def modelos_supgp(filas, ahora=None, lanzamientos=None):
    """SupGP del proveedor (SpaceX-E); el RMS publicado no es un error máximo de DOMINUS."""
    ahora = ahora or datetime.now(timezone.utc)
    lanzamientos = lanzamientos or {}
    por_id = {}
    for raw in filas:
        try:
            if raw.get('DATA_SOURCE') != 'SpaceX-E' or not raw.get('OBJECT_NAME', '').startswith('STARLINK-'):
                continue
            epoch = fecha(raw['EPOCH']).replace(tzinfo=timezone.utc)
            rms = float(raw['RMS'])
            n = str(int(raw['NORAD_CAT_ID']))
            if not 0 <= rms <= 3 or not epoch <= ahora <= epoch + timedelta(hours=24):
                continue
            omm = {k: v for k, v in raw.items() if k not in ('RMS', 'DATA_SOURCE')}
            omm['EPOCH'] = epoch.strftime('%Y-%m-%dT%H:%M:%S.%f')
            if not 0 < float(omm['MEAN_MOTION']) < 20 or not 0 <= float(omm['ECCENTRICITY']) < 1:
                continue
            x = {'omm': omm, 'desde': iso(epoch), 'hasta': iso(epoch + timedelta(hours=24)), 'creado': iso(epoch),
                 'fuente': 'https://celestrak.org/NORAD/elements/supplemental/', 'tipo_modelo': 'supgp',
                 'proveedor': 'CelesTrak SupGP (SpaceX-E)', 'tipo_id': 'NORAD' if int(n) < 1_000_000 else 'SpaceX provisional',
                 'error_rms_km': rms}
            x.update(lanzamientos.get(n, {}))
            if omm.get('OBJECT_ID'):
                x['lote'] = omm['OBJECT_ID'][:8]
                x['designador'] = omm['OBJECT_ID']
            x['reciente'] = bool(x.get('lanzamiento') and 0 <= (ahora.date() - datetime.fromisoformat(x['lanzamiento']).date()).days <= 21)
            if n not in por_id or x['desde'] > por_id[n]['desde']:
                por_id[n] = x
        except (KeyError, ValueError, TypeError):
            continue
    return list(por_id.values())


def detectar_formaciones(objetos, ahora=None, distancia_km=150):
    """Candidatos geométricos, no confirmación de lanzamiento o de visibilidad."""
    import numpy as np
    from sgp4 import omm
    from sgp4.api import Satrec, jday
    ahora = ahora or datetime.now(timezone.utc)
    jd, fr = jday(ahora.year, ahora.month, ahora.day, ahora.hour, ahora.minute, ahora.second)
    posiciones = {}
    for i, x in enumerate(objetos):
        x.pop('formacion', None)
        try:
            campos = {**x['omm'], 'NORAD_CAT_ID': 1}
            campos['EPOCH'] = fecha(campos['EPOCH']).strftime('%Y-%m-%dT%H:%M:%S.%f')
            r = Satrec(); omm.initialize(r, campos)
            error, p, _ = r.sgp4(jd, fr)
            if not error:
                posiciones[i] = np.array(p)
        except (ValueError, KeyError):
            pass
    if objetos and not posiciones:
        raise ValueError('ningún modelo pudo interpretarse para buscar formaciones')
    # Índice espacial: no comparar cada satélite con los otros once mil.
    celdas = {}
    for i, p in posiciones.items():
        clave = tuple(int(v // distancia_km) for v in p)
        celdas.setdefault(clave, []).append(i)
    pendientes = set(posiciones)
    while pendientes:
        primero = pendientes.pop()
        grupo, cola = [primero], [primero]
        while cola:
            a = cola.pop()
            clave = tuple(int(v // distancia_km) for v in posiciones[a])
            vecinos = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        vecinos.extend(celdas.get((clave[0]+dx, clave[1]+dy, clave[2]+dz), []))
            for b in vecinos:
                if b not in pendientes:
                    continue
                oa, ob = objetos[a]['omm'], objetos[b]['omm']
                diferencia = abs((oa['RA_OF_ASC_NODE'] - ob['RA_OF_ASC_NODE'] + 180) % 360 - 180)
                if abs(oa['INCLINATION'] - ob['INCLINATION']) <= .3 and diferencia <= .3 and np.linalg.norm(posiciones[a] - posiciones[b]) <= distancia_km:
                    pendientes.remove(b); grupo.append(b); cola.append(b)
        if len(grupo) >= 3:
            nombre = 'orbital-' + str(min(int(objetos[i]['omm']['NORAD_CAT_ID']) for i in grupo))
            for i in grupo:
                objetos[i]['formacion'] = nombre
    return objetos


def construir(carpeta, limite=128, pausa=10, horizonte=48):
    ahora = datetime.now(timezone.utc)
    carpeta = Path(carpeta)
    previo = json.loads((carpeta / 'omm.json').read_text()) if (carpeta / 'omm.json').exists() else {}
    catalogo = manifiesto(descargar(MANIFEST))
    if not catalogo:
        raise ValueError('manifiesto sin objetos')
    modelos = {str(x['omm']['NORAD_CAT_ID']): x for x in previo.get('objetos', [])
               if x.get('hasta', '') > iso(ahora) and str(x['omm']['NORAD_CAT_ID']) in catalogo}
    try:
        cache = carpeta / 'lanzamientos.json'
        guardado = json.loads(cache.read_text()) if cache.exists() else {}
        if guardado.get('generado_utc') and ahora - fecha(guardado['generado_utc']) < timedelta(hours=24):
            lanzamientos = guardado['objetos']
        else:
            lanzamientos = metadatos_lanzamientos(descargar('https://planet4589.org/space/gcat/tsv/cat/satcat.tsv'))
            carpeta.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps({'generado_utc':iso(ahora),'objetos':lanzamientos}, separators=(',', ':')))
    except Exception:
        lanzamientos = {}
    # La política M2M publicada por CelesTrak autoriza la consulta documentada SupGP.
    # Una única consulta compartida cada 3 h; nunca reintentos contra errores HTTP.
    errores_supgp = []
    supgp_intentado = previo.get('supgp_intentado_utc')
    if not supgp_intentado or ahora - fecha(supgp_intentado) >= timedelta(hours=2):
        supgp_intentado = iso(ahora)
        try:
            masivos = modelos_supgp(json.loads(descargar(SUPGP)), ahora, lanzamientos)
            for x in masivos:
                modelos[str(x['omm']['NORAD_CAT_ID'])] = x
            print('SupGP SpaceX-E:', len(masivos), 'modelos dentro de la ventana de uso', flush=True)
        except Exception as exc:
            errores_supgp.append(f'SupGP: {exc}')
    else:
        print('SupGP: se conserva caché; no consultar la misma fuente antes de 2 horas', flush=True)
    ids = sorted(catalogo, key=lambda n: (int(n) < 1_000_000, int(n)), reverse=True)
    # Prioriza los objetos más nuevos sin mantener el resto de la constelación fuera para siempre.
    recientes_operador = sorted([n for n in catalogo if int(n) >= 1_000_000], key=int, reverse=True)[:12]
    prioritarios = [n for n in recientes_operador + ids[:12] if n not in modelos or fecha(modelos[n]['hasta']) < ahora + timedelta(hours=12)]
    cursor = int(previo.get('cursor', 0)) % len(ids)
    rotados = ids[cursor:] + ids[:cursor]
    pendientes = prioritarios + [n for n in rotados if n not in prioritarios and (n not in modelos)]
    errores, intentados = errores_supgp, 0
    ultimo = time.monotonic()
    for n in pendientes[:limite]:
        time.sleep(max(0, pausa - (time.monotonic() - ultimo)))
        ultimo = time.monotonic()
        print('descargando', n, catalogo[n], flush=True)
        try:
            texto = descargar(BASE + catalogo[n] + '.txt', limite=500_000)
        except Exception as exc:
            errores.append(f'{n}: {exc}')
            break  # no insistir contra un proveedor que devuelve errores HTTP
        try:
            modelo = ajustar(texto, datetime.now(timezone.utc), horizonte)
            if str(modelo['omm']['NORAD_CAT_ID']) != n:
                raise ValueError('identificador no coincide con el manifiesto')
            modelo.update(lanzamientos.get(n, {}))
            modelo['reciente'] = bool(modelo.get('lanzamiento') and 0 <= (ahora.date() - datetime.fromisoformat(modelo['lanzamiento']).date()).days <= 21)
            modelos[n] = modelo
            print(n, modelo['omm']['OBJECT_NAME'], modelo['error_max_km'], modelo['hasta'], flush=True)
        except Exception as exc:
            errores.append(f'{n}: {exc}')
            print('omitido', n, str(exc), flush=True)
        intentados += 1
    final = datetime.now(timezone.utc)
    objetos = [x for x in modelos.values() if x['hasta'] > iso(final)]
    detectar_formaciones(objetos, final)
    salida = {'fuente_lanzamientos': 'GCAT (J. McDowell, planet4589.org/space/gcat), CC BY 4.0', 'generado_utc': iso(final), 'supgp_intentado_utc':supgp_intentado, 'inventario': len(catalogo), 'validos': len(objetos), 'recientes': sum(bool(x.get('reciente') or x.get('formacion')) for x in objetos), 'cursor': (cursor + max(1, intentados)) % len(ids),
              'fuente': 'SpaceX mediante CelesTrak SupGP SpaceX-E; respaldo OCM directo ajustado por DOMINUS',
              'metodo': 'SupGP: RMS publicado por el proveedor y ventana de uso de 24 h desde su época. Respaldo directo: ajuste OCM ITRF2000 a SGP4/TEME, validación cada 5 minutos.',
              'errores': errores[-128:], 'objetos': objetos}
    carpeta.mkdir(parents=True, exist_ok=True)
    contenido = json.dumps(salida, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    (carpeta / 'omm.json').write_bytes(contenido)
    (carpeta / 'omm.json.gz').write_bytes(gzip.compress(contenido, compresslevel=9, mtime=0))
    indice = {k: v for k, v in salida.items() if k != 'objetos'}
    indice['ids'] = [str(x['omm']['NORAD_CAT_ID']) for x in objetos]
    (carpeta / 'index.json').write_text(json.dumps(indice, ensure_ascii=False, separators=(',', ':')))
    return salida


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--salida', default='starlink')
    p.add_argument('--limite', type=int, default=128)
    p.add_argument('--pausa', type=float, default=10)
    p.add_argument('--horizonte', type=int, default=48)
    a = p.parse_args()
    construir(a.salida, a.limite, a.pausa, a.horizonte)
