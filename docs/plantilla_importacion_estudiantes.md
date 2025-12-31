# Plantilla de importación masiva de estudiantes (CSV / XLSX)

Esta plantilla aplica para **CSV** y para **XLSX/XLS** (en Excel: la **fila 1** debe contener exactamente los encabezados).

## Descarga rápida
- Plantilla CSV lista para usar: [docs/plantilla_importacion_estudiantes.csv](docs/plantilla_importacion_estudiantes.csv)

## Columnas requeridas (obligatorias)
Estas columnas deben venir con dato en cada fila:
- `nombres`
- `apellidos`
- `numero_documento`

> Nota: el backend valida `first_name/last_name/document_number`. En la importación aceptamos alias en español.

## Columnas recomendadas (opcionales)
- `tipo_documento` (ej: `CC`, `TI`, `CE`)
- `correo`
- `sexo` (acepta `M` / `F`, también `Masculino/Femenino`)
- `fecha_nacimiento` (formatos aceptados: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`)

## Columnas opcionales adicionales soportadas
Puedes incluirlas si las tienes:
- Contacto: `telefono`, `direccion`, `barrio`
- Salud: `eps`
- Socioeconómico: `estrato`, `sisben`, `etnia`
- Emergencia: `contacto_emergencia_nombre`, `contacto_emergencia_telefono`, `contacto_emergencia_parentesco`
- Flags (booleanos):
  - `victima_conflicto` (si/no, true/false, 1/0)
  - `tiene_discapacidad` (si/no, true/false, 1/0)
- `estado_financiero` (`SOLVENT` o `DEBT`)

## Reglas importantes
- La **fila 1** debe ser encabezados.
- Cada fila crea 1 estudiante. Si una fila falla, las demás continúan.
- El usuario se crea con:
  - `username` generado desde nombres/apellidos (ej. `juan.perez`)
  - contraseña por defecto = `username`
- `numero_documento` debe ser único. Si se repite, esa fila fallará.

## Ejemplo (CSV)
```csv
nombres,apellidos,numero_documento,tipo_documento,correo,sexo,fecha_nacimiento
Juan,Perez,1000123456,CC,juan.perez@correo.com,M,2012-05-20
```
