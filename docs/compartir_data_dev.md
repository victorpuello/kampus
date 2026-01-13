# Compartir data entre desarrolladores (Kampus)

> Nota importante: **la BD puede contener PII** (datos personales de estudiantes, acudientes y usuarios). Comparte estos dumps/fixtures **solo** por canales seguros y con autorización.

## Opción A (recomendada para devs): fixture JSON comprimido + media

Esta opción es portable (funciona con SQLite o Postgres) mientras todos estén en la **misma versión del código/migraciones**.

### Exportar (en tu máquina)

#### Exportar en un solo archivo (bundle)

Genera un solo `.zip` listo para compartir, con checksum (`.sha256`).

```bash
python backend/manage.py package_dev_data --yes --include-media
```

Salida por defecto en `backend/fixtures/`:
- `kampus-dev-bundle-YYYYMMDD-HHMMSS.zip`
- `kampus-dev-bundle-YYYYMMDD-HHMMSS.zip.sha256`

- Solo BD:

```bash
python backend/manage.py export_dev_data --yes
```

- BD + archivos (MEDIA_ROOT):

```bash
python backend/manage.py export_dev_data --yes --include-media
```

Salida por defecto:
- Fixture: `backend/fixtures/dev-data.json.gz`
- Media: `backend/fixtures/dev-media.zip`

### Importar (en la máquina del otro dev)

1) Levanta/crea la BD y corre migraciones (si aplica):

```bash
python backend/manage.py migrate
```

2) Importa el fixture (opcionalmente borrando data previa):

```bash
python backend/manage.py import_dev_data
# o si quieres borrar lo existente:
python backend/manage.py import_dev_data --flush --yes
```

3) (Opcional) restaura media:

```bash
python backend/manage.py import_dev_data --media-zip backend/fixtures/dev-media.zip
```

## Opción B (Docker + Postgres): dump directo de Postgres

Útil si quieres clonar el estado exacto de la BD (menos portable, pero suele ser más rápido en datasets grandes).

1) Exporta dentro del contenedor `db`:

```bash
docker compose exec db sh -lc "pg_dump -U kampus -d kampus --clean --if-exists --format=c -f /tmp/kampus.dump"
```

2) Copia el dump a tu máquina:

```bash
docker compose cp db:/tmp/kampus.dump ./kampus.dump
```

3) En la máquina del otro dev, restaura (ajusta el contenedor/credenciales):

```bash
docker compose cp ./kampus.dump db:/tmp/kampus.dump
docker compose exec db sh -lc "pg_restore -U kampus -d kampus --clean --if-exists /tmp/kampus.dump"
```

## Consejos

- Si el fixture falla al cargar, normalmente es por diferencias de migraciones/versiones. Aseguren estar en el mismo commit/tag.
- Para exportar menos ruido, puedes excluir tablas:

```bash
python backend/manage.py export_dev_data --yes --exclude sessions --exclude admin.logentry
```
