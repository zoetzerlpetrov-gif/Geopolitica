"""Genera secretos locales en backend/.env sin mostrarlos ni sobrescribir archivos."""
import base64
import os
from pathlib import Path
import secrets

folder = Path(__file__).resolve().parent
values = {
    'POSTGRES_PASSWORD': secrets.token_urlsafe(32),
    'MASTER_KEY': base64.urlsafe_b64encode(os.urandom(32)).decode(),
    'BACKUP_KEY': base64.urlsafe_b64encode(os.urandom(32)).decode(),
    'PUBLIC_ORIGIN': 'http://127.0.0.1:8000',
    'ALLOW_LOCAL_HTTP': '1',
}
fd = os.open(folder / '.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write('\n'.join(k + '=' + v for k, v in values.items()) + '\n')
print('Configuración local creada. No publicarla; custodia una copia separada de las claves.')
