"""Configuración fail-closed; no contiene credenciales predeterminadas."""
import base64
import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit


@dataclass
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv('DATABASE_URL', 'sqlite:///./private/dominus.db'))
    origin: str = field(default_factory=lambda: os.getenv('PUBLIC_ORIGIN', 'http://127.0.0.1:8000'))
    master_key: str = field(default_factory=lambda: os.getenv('MASTER_KEY', ''))
    backup_key: str = field(default_factory=lambda: os.getenv('BACKUP_KEY', ''))
    allow_local_http: bool = field(default_factory=lambda: os.getenv('ALLOW_LOCAL_HTTP') == '1')
    require_mfa: bool = True
    max_body: int = 5 * 1024 * 1024
    oidc_issuer: str = field(default_factory=lambda: os.getenv('OIDC_ISSUER', ''))
    oidc_client: str = field(default_factory=lambda: os.getenv('OIDC_CLIENT_ID', ''))
    oidc_secret: str = field(default_factory=lambda: os.getenv('OIDC_CLIENT_SECRET', ''))

    def validate(self):
        u = urlsplit(self.origin)
        if not u.hostname or u.path not in ('', '/') or u.query or u.fragment or u.username or u.password:
            raise ValueError('PUBLIC_ORIGIN debe ser un origen sin ruta ni credenciales.')
        if u.scheme != 'https' and not (self.allow_local_http and u.scheme == 'http' and u.hostname in ('127.0.0.1', 'localhost')):
            raise ValueError('HTTPS obligatorio, excepto prueba local explícita en loopback.')
        for name, value in [('MASTER_KEY', self.master_key), ('BACKUP_KEY', self.backup_key)]:
            try:
                if len(base64.urlsafe_b64decode(value)) != 32:
                    raise ValueError()
            except Exception as exc:
                raise ValueError(name + ' requiere 32 bytes aleatorios en base64 URL-safe.') from exc
        if self.master_key == self.backup_key:
            raise ValueError('MASTER_KEY y BACKUP_KEY deben ser diferentes.')
        if self.oidc_issuer and not self.oidc_issuer.startswith('https://'):
            raise ValueError('OIDC_ISSUER requiere HTTPS.')
        return self

    @property
    def secure_cookie(self):
        return self.origin.startswith('https://')
