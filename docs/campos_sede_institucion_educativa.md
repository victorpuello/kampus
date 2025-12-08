
# Campos para el registro de sedes de una institución educativa

A continuación se listan los campos sugeridos para registrar una sede en un software administrador de instituciones educativas, junto con el tipo de input recomendado para el formulario.

---

## 1. Identificación de la sede

| Campo                         | Tipo de input             | Requerido | Nota                                              |
|------------------------------|---------------------------|-----------|---------------------------------------------------|
| ID interno de sede           | `hidden` (lo genera el sistema) | Sí        | Llave primaria interna.                           |
| Código DANE actual           | `input type="text"`       | Sí        | Solo números, se puede usar `pattern="\d+"`.     |
| Código DANE anterior         | `input type="text"`       | No        | Útil para trazabilidad.                           |
| Sede # (código de sede)      | `<select>`                | Sí        | Lista de sedes: 01, 02, 03…                       |
| NIT                          | `input type="text"`       | Sí        | Con o sin dígito de verificación.                 |
| Nombre de la sede            | `input type="text"`       | Sí        | Texto libre.                                      |
| Tipo de sede                 | `<select>`                | Sí        | Principal, Anexa, Rural dispersa, etc.            |
| Estado de la sede            | `<select>`                | Sí        | Activa, Cerrada, En reapertura.                   |

---

## 2. Normatividad y características académicas

| Campo                              | Tipo de input       | Requerido | Nota                                   |
|-----------------------------------|---------------------|-----------|----------------------------------------|
| Número de resolución de aprobación| `input type="text"` | Sí        | Ej.: 756.                              |
| Fecha de resolución               | `input type="date"` | Sí        | Fecha oficial del acto.                |
| Carácter                          | `<select>`          | Sí        | Académica, Técnica, etc.               |
| Especialidad                      | `<select>`          | Sí        | Académico, Técnico, Artístico, etc.    |
| Metodología                       | `<select>`          | Sí        | Escuela Nueva, Tradicional, etc.       |

---

## 3. Ubicación

| Campo            | Tipo de input                 | Requerido | Nota                             |
|------------------|------------------------------|-----------|----------------------------------|
| Departamento     | `<select>`                   | Sí        | Lista de departamentos.          |
| Municipio        | `<select>`                   | Sí        | Filtrado por departamento.       |
| Zona             | `<select>`                   | Sí        | Urbana / Rural.                  |
| Vereda o barrio  | `input type="text"`          | Sí        | Ej.: VEREDA LA YE.               |
| Dirección        | `input type="text"`          | Sí        | Texto libre.                     |
| Coordenada latitud  | `input type="number" step="any"` | No   | Para mapas / GPS.                |
| Coordenada longitud | `input type="number" step="any"` | No   | Para mapas / GPS.                |

---

## 4. Oferta educativa

| Campo              | Tipo de input      | Thequerido | Nota                                                                 |
|--------------------|--------------------|-----------|----------------------------------------------------------------------|
| Niveles que ofrece | Grupo de `checkbox` | Sí        | Preescolar, Básica Primaria, Básica Secundaria, Media.              |
| Jornada(s)         | Grupo de `checkbox` | Sí        | Mañana, Tarde, Noche, Única.                                        |
| Calendario         | `<select>`          | Sí        | A / B.                                                               |

---

## 5. Contacto

| Campo                        | Tipo de input       | Requerido | Nota                           |
|-----------------------------|---------------------|-----------|--------------------------------|
| Teléfono fijo               | `input type="tel"`  | Sí        | Teléfono de la sede.           |
| Celular de contacto         | `input type="tel"`  | No        | Celular de director/coordinador. |
| Correo institucional de sede| `input type="email"`| Sí        | Para notificaciones.           |
| Otro medio de contacto      | `input type="text"` | No        | WhatsApp, radio, etc.          |

---

## 6. Responsables

| Campo                    | Tipo de input                        | Requerido | Nota                                                        |
|--------------------------|--------------------------------------|-----------|-------------------------------------------------------------|
| Rector(a) o Director(a)  | `<select>` o `input type="text"`    | Sí        | Ideal como `<select>` desde tabla de funcionarios.          |
| Secretario(a)            | `<select>` o `input type="text"`    | No        | Según tenga la sede.                                       |
| Coordinador(a)           | `<select>` o `input type="text"`    | No        | Si aplica para la sede.                                    |

---