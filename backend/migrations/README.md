# Esquema 1

`python -m dominus.cli init` crea el esquema inicial y PostGIS/índices de F094 en PostgreSQL. No ejecuta DROP ni cambios destructivos. SQLite se admite exclusivamente para desarrollo y pruebas; las consultas espaciales de producción se ejecutan en PostGIS. Futuras revisiones del esquema necesitan migraciones versionadas, respaldo y prueba de restauración antes de despliegue.
