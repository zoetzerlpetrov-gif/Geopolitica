import base64
import hashlib
import json
import os
import time
import uuid
from contextlib import contextmanager
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import (Boolean, Column, Float, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, create_engine, event, text)
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def uid():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = 'organizations'
    id = Column(String(36), primary_key=True, default=uid)
    name = Column(String(200), nullable=False)


class User(Base):
    __tablename__ = 'users'
    id = Column(String(36), primary_key=True, default=uid)
    username = Column(String(120), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    otp = Column(Text, nullable=False)
    otp_counter = Column(Integer, nullable=False, default=-1)
    active = Column(Boolean, nullable=False, default=True)
    oidc_subject = Column(String(300), unique=True)


class Membership(Base):
    __tablename__ = 'memberships'
    org = Column(String(36), ForeignKey('organizations.id'), primary_key=True)
    user = Column(String(36), ForeignKey('users.id'), primary_key=True)
    role = Column(String(20), nullable=False)  # owner, analyst, reviewer, viewer


class LoginAttempt(Base):
    __tablename__ = 'login_attempts'
    key = Column(String(64), primary_key=True)
    count = Column(Integer, nullable=False, default=0)
    window = Column(Float, nullable=False)


class Session(Base):
    __tablename__ = 'sessions'
    token_hash = Column(String(64), primary_key=True)
    user = Column(String(36), ForeignKey('users.id'), nullable=False)
    csrf = Column(String(80), nullable=False)
    expires = Column(Float, nullable=False)


class Case(Base):
    __tablename__ = 'cases'
    id = Column(String(36), primary_key=True, default=uid)
    org = Column(String(36), ForeignKey('organizations.id'), nullable=False, index=True)
    title = Column(String(250), nullable=False, index=True)
    owner = Column(String(36), ForeignKey('users.id'), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    data = Column(Text, nullable=False)
    hold = Column(Boolean, nullable=False, default=False)
    lifecycle = Column(Text, nullable=False, default='')
    retention_days = Column(Integer, nullable=False, default=365)
    deleted_at = Column(Float)
    created = Column(Float, nullable=False, default=time.time)
    updated = Column(Float, nullable=False, default=time.time)


class CaseAccess(Base):
    __tablename__ = 'case_access'
    case = Column(String(36), ForeignKey('cases.id'), primary_key=True)
    user = Column(String(36), ForeignKey('users.id'), primary_key=True)
    permission = Column(String(10), nullable=False)  # read, write, review
    expires = Column(Float, nullable=False)


class Revision(Base):
    __tablename__ = 'revisions'
    id = Column(String(36), primary_key=True, default=uid)
    case = Column(String(36), ForeignKey('cases.id'), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    data = Column(Text, nullable=False)
    actor = Column(String(36), nullable=False)
    reason = Column(String(1000), nullable=False)
    created = Column(Float, nullable=False, default=time.time)
    __table_args__ = (UniqueConstraint('case', 'version'),)


class CaseReview(Base):
    __tablename__ = 'case_reviews'
    id = Column(String(36), primary_key=True, default=uid)
    case = Column(String(36), ForeignKey('cases.id'), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    actor = Column(String(36), nullable=False)
    note = Column(Text, nullable=False)
    created = Column(Float, nullable=False, default=time.time)
    __table_args__ = (UniqueConstraint('case', 'version', 'actor'),)


class Audit(Base):
    __tablename__ = 'audit'
    id = Column(Integer, primary_key=True, autoincrement=True)
    org = Column(String(36), nullable=False, index=True)
    actor = Column(String(120), nullable=False)
    action = Column(String(100), nullable=False)
    target = Column(String(100), nullable=False)
    created = Column(Float, nullable=False)
    previous = Column(String(64), nullable=False)
    digest = Column(String(64), nullable=False)


class Secret(Base):
    __tablename__ = 'secrets'
    org = Column(String(36), ForeignKey('organizations.id'), primary_key=True)
    provider = Column(String(80), primary_key=True)
    value = Column(Text, nullable=False)
    updated = Column(Float, nullable=False, default=time.time)


class Watch(Base):
    __tablename__ = 'watches'
    id = Column(String(36), primary_key=True, default=uid)
    org = Column(String(36), ForeignKey('organizations.id'), nullable=False, index=True)
    case = Column(String(36), ForeignKey('cases.id'), nullable=False, index=True)
    source = Column(String(40), nullable=False)
    parameters = Column(Text, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True)
    interval = Column(Integer, nullable=False, default=86400)
    due = Column(Float, nullable=False, default=time.time)
    lease_until = Column(Float, nullable=False, default=0)
    failures = Column(Integer, nullable=False, default=0)
    status = Column(String(30), nullable=False, default='pending')
    last_success = Column(Float)
    last_error = Column(String(200))
    checkpoint = Column(Text, nullable=False, default='{}')
    fingerprint = Column(String(64), nullable=False, default='')
    count = Column(Integer, nullable=False, default=0)


class Observation(Base):
    __tablename__ = 'observations'
    id = Column(String(36), primary_key=True, default=uid)
    watch = Column(String(36), ForeignKey('watches.id'), nullable=False, index=True)
    fingerprint = Column(String(64), nullable=False)
    data = Column(Text, nullable=False)
    created = Column(Float, nullable=False, default=time.time)


class Quota(Base):
    __tablename__ = 'quotas'
    source = Column(String(40), primary_key=True)
    window = Column(Float, nullable=False)
    count = Column(Integer, nullable=False, default=0)
    bytes = Column(Integer, nullable=False, default=0)
    blocked_until = Column(Float, nullable=False, default=0)
    hour = Column(Float, nullable=False, default=time.time)
    hour_count = Column(Integer, nullable=False, default=0)


class Cache(Base):
    __tablename__ = 'connector_cache'
    key = Column(String(64), primary_key=True)
    data = Column(Text, nullable=False)
    expires = Column(Float, nullable=False)


class Area(Base):
    __tablename__ = 'areas'
    id = Column(String(36), primary_key=True, default=uid)
    case = Column(String(36), ForeignKey('cases.id'), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    geojson = Column(Text, nullable=False)


class Certificate(Base):
    __tablename__ = 'certificates'
    id = Column(String(36), primary_key=True, default=uid)
    org = Column(String(36), ForeignKey('organizations.id'), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    expires = Column(String(30), nullable=False)
    fingerprint = Column(String(100), nullable=False)
    owner = Column(String(200), nullable=False)
    reference = Column(String(500), nullable=False)


class Store:
    def __init__(self, settings):
        self.settings = settings
        self.aes = AESGCM(base64.urlsafe_b64decode(settings.master_key))
        self.backup_aes = AESGCM(base64.urlsafe_b64decode(settings.backup_key))
        kw = {'connect_args': {'check_same_thread': False}} if settings.database_url.startswith('sqlite:') else {'pool_pre_ping': True}
        self.engine = create_engine(settings.database_url, **kw)
        if self.engine.dialect.name == 'sqlite':
            @event.listens_for(self.engine, 'connect')
            def fk(dbapi_conn, _):
                dbapi_conn.execute('PRAGMA foreign_keys=ON')
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    def initialize(self):
        Base.metadata.create_all(self.engine)
        if self.engine.dialect.name == 'postgresql':
            with self.engine.begin() as c:
                c.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))
                c.execute(text('ALTER TABLE areas ADD COLUMN IF NOT EXISTS geom geometry(Geometry,4326)'))
                c.execute(text('CREATE INDEX IF NOT EXISTS areas_geom_idx ON areas USING GIST (geom)'))
                c.execute(text("CREATE INDEX IF NOT EXISTS cases_text_idx ON cases USING GIN (to_tsvector('spanish', title))"))

    @contextmanager
    def tx(self):
        with self.sessions.begin() as s:
            yield s

    def seal(self, value, context):
        nonce = os.urandom(12)
        raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
        return base64.urlsafe_b64encode(nonce + self.aes.encrypt(nonce, raw, context.encode())).decode()

    def open(self, value, context):
        raw = base64.urlsafe_b64decode(value)
        return json.loads(self.aes.decrypt(raw[:12], raw[12:], context.encode()))

    def hash(self, value):
        return hashlib.sha256(value.encode()).hexdigest()
