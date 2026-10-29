"""Copias automáticas locales cifradas; copiar después a un destino independiente."""
import argparse
from pathlib import Path
import time
from .backup import export_all
from .cli import write_private
from .config import Settings
from .db import Store


def once(store, directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    filename = directory / ('dominus-' + time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '.dominus')
    write_private(filename, export_all(store))
    files = sorted(directory.glob('dominus-*.dominus'))
    for old in files[:-7]:
        old.unlink()
    return filename


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--once', action='store_true')
    p.add_argument('--directory', default='/app/backend/private/backups')
    args = p.parse_args()
    store = Store(Settings().validate())
    while True:
        try:
            once(store, args.directory)
            delay = 86400
            print('Copia local cifrada completada.', flush=True)
        except Exception:
            delay = 30
            print('Copia no completada; revisar inicialización, espacio y permisos.', flush=True)
            if args.once:
                raise
        if args.once:
            return
        time.sleep(delay)


if __name__ == '__main__':
    main()
