# Plan: Optimización de imágenes con miniaturas (WebP 256px)

## Objetivo
Reducir el tiempo de carga y consumo de datos al mostrar fotos (especialmente en listados como `/students`) generando miniaturas WebP de 256px, manteniendo los originales (JPG/PNG) sin modificar.

## Reglas / requisitos
- Miniaturas siempre en **WebP**.
- Tamaño: **máximo 256px** (manteniendo proporción).
- Conservar el archivo original subido.
- Al **actualizar** la foto original: borrar miniatura previa y regenerar.
- Al **eliminar** el registro: borrar la miniatura.
- Backfill: comando para generar miniaturas para fotos ya existentes.

## Sprint 1 (Backend base)
- [x] Agregar campos `photo_thumb`:
  - Estudiantes: `Student.photo_thumb`
  - Docentes: `Teacher.photo_thumb`
- [x] Migraciones
- [x] Generación automática de miniaturas en `save()`:
  - Si `photo` cambia o no existe `photo_thumb`, generar WebP 256px
  - Si `photo` se elimina, limpiar `photo_thumb`
- [x] Borrado de miniatura en `delete()`

## Sprint 2 (API + Frontend performance)
- [x] Exponer `photo_thumb` en serializers (DRF construye URL absoluta con `request` en `context`).
- [x] Frontend: en `StudentList` usar `photo_thumb` como preferido (`photo_thumb ?? photo`).
- [x] (Opcional) Repetir patrón en otras pantallas que rendericen avatares en lista (asistencia, etc.).

## Sprint 3 (Backfill + operaciones)
- [x] Comando `python manage.py backfill_photo_thumbs`:
  - `--target students|teachers|all`
  - `--force` para regenerar
  - `--limit` para procesar por lotes
- [ ] Documentar en README/runbook si se desea automatizar post-restore.

## Sprint 4 (Hardening)
- [x] Validar en contenedor que Pillow tiene soporte WebP.
- [ ] Revisar tamaño/calidad (`quality=80`) y ajustar si se requiere.
- [ ] Considerar estrategia para detectar cambios cuando el nombre del archivo no cambia (hash), si alguna vez se usa un storage que sobreescribe.

## Verificación rápida
- Crear/editar un estudiante o docente con foto y confirmar que el API devuelve `photo_thumb` (URL WebP).
- Entrar a `/students` y confirmar (Network tab) que descarga `.webp` de 256px y no el original.
- Ejecutar backfill en un entorno con datos reales:
  - `python manage.py backfill_photo_thumbs --target students`

### Comandos para producción (Docker)
- Backfill (recomendado una sola vez post-deploy/restore):
  - `docker compose -f docker-compose.prod.yml exec backend python manage.py backfill_photo_thumbs --target all`
- Forzar regeneración:
  - `docker compose -f docker-compose.prod.yml exec backend python manage.py backfill_photo_thumbs --target all --force`
- Validar soporte WebP:
  - `docker compose -f docker-compose.prod.yml exec backend python -c "from PIL import features; print('webp', features.check('webp'))"`
