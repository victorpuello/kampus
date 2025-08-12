## Diseño de la Aplicación "Kampus": Administración Escolar

## para Colombia

### Página 1: Índice General

1. **Introducción y Conceptos Clave**
    ○ 1.1. Objetivo de la Aplicación
    ○ 1.2. Contexto del Sistema Educativo Colombiano
    ○ 1.3. Roles de Usuario en Kampus
2. **Módulo 1: Gestión de Admisiones y Matrículas**
    ○ 2.1. Descripción y Problemas que Soluciona
    ○ 2.2. Funcionalidades Detalladas
    ○ 2.3. Flujo de Proceso
3. **Módulo 2: Gestión de Estudiantes (SIS)**
    ○ 3.1. Descripción y Problemas que Soluciona
    ○ 3.2. Funcionalidades Detalladas (Ficha Estudiantil)
4. **Módulo 3: Gestión Académica**
    ○ 4.1. Descripción y Problemas que Soluciona
    ○ 4.2. Funcionalidades Detalladas
5. **Módulo 4: Gestión de Docentes**
    ○ 5.1. Descripción y Problemas que Soluciona
    ○ 5.2. Funcionalidades Detalladas
6. **Módulo 5: Comunicación y Notificaciones**
    ○ 6.1. Descripción y Problemas que Soluciona
    ○ 6.2. Funcionalidades Detalladas
7. **Módulo 6: Gestión Disciplinaria y de Convivencia**
    ○ 7.1. Descripción y Problemas que Soluciona
    ○ 7.2. Funcionalidades Detalladas
8. **Módulo 7: Reportes y Estadísticas**
    ○ 8.1. Descripción y Problemas que Soluciona
    ○ 8.2. Funcionalidades Detalladas
9. **Módulo 8: Configuración y Seguridad del Sistema**
    ○ 9.1. Descripción
    ○ 9.2. Funcionalidades Detalladas


# 1. Introducción, Contexto y Roles de Usuario

Esta sección establece las bases conceptuales y estratégicas de **Kampus** , definiendo
su propósito, el entorno normativo en el que opera y los actores que interactuarán
con la plataforma.

#### 1.1. Visión, Misión y Objetivos de Kampus

```
Visión (El "Porqué")
```
Ser la plataforma de gestión escolar líder en Colombia, reconocida por transformar
las instituciones educativas en comunidades conectadas, eficientes y centradas en el
éxito del estudiante.

```
Misión (El "Cómo")
```
Proporcionar a los colegios colombianos una herramienta tecnológica **centralizada,
intuitiva y segura** que digitalice sus procesos administrativos y académicos. Kampus
busca eliminar las barreras de comunicación y optimizar el uso de los recursos para
que el personal pueda enfocarse en su verdadera vocación: educar.

```
Objetivos Clave (El "Qué")
```
1. **Optimizar la Eficiencia Administrativa:**
    ○ **Reducir en al menos un 50% el tiempo** dedicado a procesos manuales
       como matrículas, generación de certificados y consolidación de
       informes.
    ○ **Eliminar el 100% del uso de papel** para boletines de calificaciones y
       circulares informativas.
2. **Garantizar el Cumplimiento Normativo:**
    ○ Asegurar que la plataforma genere, con un solo clic, los **reportes y**
       **archivos planos** requeridos por el SIMAT, el DANE (Formulario C600) y
       las Secretarías de Educación, eliminando errores de digitación.
3. **Fortalecer el Vínculo Colegio-Hogar:**
    ○ Crear un canal de comunicación **directo y documentado** entre
       docentes y padres de familia, garantizando que el 100% de las
       comunicaciones importantes (calificaciones, ausencias, anotaciones)
       sean notificadas en tiempo real.
4. **Empoderar a los Docentes:**
    ○ Proveer una herramienta que **simplifique el registro de notas y**


```
asistencia , permitiendo una gestión de aula más ágil y enfocada en el
seguimiento personalizado del estudiante.
```
#### 1.2. Adaptación al Contexto del Sistema Educativo Colombiano

Kampus está diseñado desde su núcleo para ser totalmente compatible con las
particularidades y exigencias del marco regulatorio colombiano.

```
● PEI (Proyecto Educativo Institucional) y SIEE (Sistema Institucional de
Evaluación)
○ Problemática: Cada colegio define su propia forma de evaluar (escalas,
porcentajes, competencias). Un software rígido no sirve.
○ Solución en Kampus: La plataforma contará con un módulo de
configuración académica flexible. El administrador podrá:
■ Definir la escala de valoración: (Ej: Desempeño Superior, Alto,
Básico, Bajo).
■ Crear componentes de calificación ponderados: El
administrador o docente podrá estructurar cada asignatura con
sus propios "ítems" de calificación y asignarles un valor
porcentual (Ej: Saber-Hacer 40%, Saber-Saber 40%, Saber-Ser
20%). El sistema calculará la nota final automáticamente.
■ Gestionar logros e indicadores: Permitirá redactar y asociar los
logros e indicadores de desempeño a cada asignatura y periodo.
● SIMAT (Sistema Integrado de Matrícula)
○ Problemática: El reporte de estudiantes al Ministerio de Educación es
obligatorio, manual y propenso a errores.
○ Solución en Kampus: Se incluirá una funcionalidad de "Exportación a
SIMAT". Esta herramienta generará un archivo plano (.csv o .txt)
pre-validado, con las columnas y el formato exacto que exige la
plataforma del MEN, listo para ser cargado directamente.
● Manual de Convivencia
○ Problemática: El seguimiento disciplinario debe ser consistente,
documentado y alineado con las normas del colegio y la Ley 1620.
○ Solución en Kampus: El módulo de convivencia será totalmente
parametrizable. El Coordinador podrá:
■ Catalogar las faltas: Crear un listado de faltas clasificadas por
tipo (Tipo I, II, III).
■ Definir los protocolos: Asociar a cada tipo de falta las acciones y
correctivos correspondientes (Ej: Diálogo, anotación en el
```

```
observador, citación a padres, remisión al comité de convivencia).
● Reportes al DANE y Secretarías de Educación
○ Problemática: La recolección de datos para informes como el C600 del
DANE es una tarea ardua que consume mucho tiempo.
○ Solución en Kampus: La plataforma tendrá una sección de "Reportes
Oficiales" con plantillas pre-configuradas que se auto-llenan con los
datos ya existentes en el sistema (número de alumnos por grado, edad,
género, datos de docentes, etc.), generando el informe final en minutos.
```
#### 1.3. Roles de Usuario y Matriz de Permisos en Kampus

A continuación se detalla cada rol, su propósito dentro del ecosistema y sus
capacidades clave.

```
Rol Objetivo
Principal
```
```
Capacidades y
Permisos Clave
```
```
Restricciones
Principales
```
```
Superadministrad
or
```
```
Garantizar el
funcionamiento
técnico y la
configuración
inicial de
Kampus para
cada institución.
```
- Creación de la
instancia del colegio.-
Asignación del primer
usuario
Administrador/Rector.
- Acceso a la
configuración global
del sistema.- Gestión
de la base de datos a
nivel técnico.

```
No interviene en la
operación diaria
del colegio (notas,
matrículas, etc.).
```
```
Administrador/Rec
tor
```
```
Tener una visión
estratégica y de
control total
sobre la
operación
académica y
administrativa
del colegio.
```
- Acceso a **todos** los
módulos.-
Configuración del año
lectivo, periodos y
SIEE.- Creación y
gestión de todos los
usuarios (docentes,
secretaría, etc.).-
Visualización de
reportes estadísticos

```
No puede
modificar la
configuración
técnica base del
Superadministrad
or.
```

```
y gerenciales.-
Publicación de
comunicados
generales.
```
**Coordinador** Ejecutar y
supervisar la
operación
académica y/o
de convivencia,
sirviendo de
puente entre
directivos y
docentes.

- Gestión de la carga
académica de los
docentes.- Creación y
modificación de
horarios.-
Seguimiento y
validación de
registros en el
observador del
alumno.- Acceso a las
planillas de notas de
todos los docentes.-
Gestión de procesos
disciplinarios.

```
No puede
modificar la
configuración del
SIEE ni gestionar
usuarios fuera de
su ámbito.
```
**Secretaría** Administrar el
ciclo de vida del
estudiante
desde su
admisión hasta
su retiro, y
gestionar la
documentación
oficial.

- Gestión completa
del módulo de
admisiones y
matrículas.- Edición
de la ficha estudiantil
(datos personales,
acudientes).-
Generación de
certificados y
constancias.- Gestión
del estado del
estudiante (activo,
retirado, graduado).

```
No tiene acceso a
la carga de notas
ni al módulo de
convivencia.
```

**Docente** Gestionar
eficientemente
sus asignaturas
y mantener una
comunicación
fluida con los
estudiantes y
sus acudientes.

- Ingreso de
calificaciones en sus
planillas.- Registro de
asistencia para sus
clases.- Creación de
anotaciones en el
observador para sus
estudiantes.- Envío y
recepción de
mensajes de los
padres de sus
alumnos.-
Visualización del
horario propio.

```
No puede ver
notas de otras
asignaturas ni
datos de
estudiantes que
no tenga a su
cargo.
```
**Padre de
Familia/Acudiente**

```
Realizar un
seguimiento
cercano y en
tiempo real del
progreso
académico y de
convivencia de
su(s) hijo(s).
```
- Visualización de
notas, ausencias y
anotaciones
**únicamente** de su
hijo.- Acceso al
calendario de eventos
y comunicados
generales.- Envío y
recepción de
mensajes de los
docentes de su hijo.-
Descarga del boletín
de calificaciones.

```
No puede ver
información de
ningún otro
estudiante.
```
**Estudiante** Consultar su
propio
rendimiento
académico,
horario y
responsabilidad
es.

- Visualización de sus
propias notas y
horario de clases.-
Acceso al calendario
y a los comunicados.-
(Opcional) Envío y
recepción de tareas si
se habilita una

```
Acceso de solo
lectura a su
información. No
puede contactar
docentes
directamente (la
comunicación se
canaliza por el
```

```
funcionalidad básica. acudiente).
```
### 2. Módulo 1: Gestión de Admisiones y Matrícula (Versión para

### Entidad Pública)

Este documento desglosa la arquitectura funcional del módulo de admisiones y
matrículas de **Kampus** , adaptado específicamente para las necesidades de una
**institución educativa pública en Colombia**. El diseño se centra en la eficiencia, la
transparencia y el cumplimiento normativo, garantizando una experiencia clara tanto
para las familias como para el personal administrativo.

**2.1. Propósito y Valor Estratégico**

El propósito de este módulo es gestionar el proceso de asignación de cupos y
matrícula de forma gratuita, ordenada y conforme a las directrices del Ministerio de
Educación, al tiempo que se facilita la gestión de los servicios que sí generan
recaudo, como los certificados.

```
● Para la Institución (Entidad Pública):
○ Eficiencia y Cumplimiento (SIMAT): Automatiza el proceso de
matrícula para garantizar un reporte preciso y oportuno al SIMAT, lo cual
es fundamental para la asignación de recursos del Estado (Fondo de
Servicios Educativos - FSE).
○ Optimización de Recursos: Libera al personal de secretaría de tareas
manuales y repetitivas, permitiéndoles enfocarse en la atención a la
comunidad y la correcta gestión documental.
○ Control de Recaudos: Centraliza y transparenta la gestión del único
ingreso propio permitido: el cobro de certificados y constancias.
● Para los Padres de Familia:
○ Acceso Equitativo y Transparente: Ofrece un proceso de matrícula
totalmente gratuito , claro y accesible, eliminando barreras económicas
y burocráticas.
○ Claridad y Confianza: Permite a los padres conocer el estado de la
solicitud de cupo en todo momento, generando una percepción de
organización y equidad.
○ Autogestión de Trámites: Facilita la solicitud y pago en línea de
certificados de estudio cuando sean necesarios, evitando
```

```
desplazamientos.
```
**2.2. Actores y Sus Viajes (User Journeys)**

**A. El Padre de Familia / Aspirante**

```
● Objetivo: Asegurar un cupo para su hijo y formalizar la matrícula gratuita.
● Viaje:
```
1. Descubre el enlace de "Admisiones" en la página web del colegio.
2. Completa un formulario de preinscripción en línea.
3. Recibe un correo electrónico de bienvenida con credenciales para
    acceder al "Portal del Aspirante".
4. Ingresa al portal, completa la información detallada y sube los
    documentos requeridos.
5. Recibe notificaciones sobre el estado del proceso: "Documentos
    Aprobados", "Cupo Asignado".
6. Una vez asignado el cupo, accede a la sección de matrícula para revisar
    y aceptar el Manual de Convivencia y formalizar la matrícula.
7. Recibe la **confirmación y el comprobante de matrícula oficial sin**
    **ningún costo**.

**B. El Administrador de Admisiones / Secretaría**

```
● Objetivo: Gestionar el flujo de aspirantes y matrículas de manera centralizada
y eficiente.
● Viaje:
```
1. Accede al "Dashboard de Admisiones" en Kampus.
2. Revisa los aspirantes y sus documentos.
3. Valida la información y asigna los cupos según la disponibilidad y los
    criterios institucionales.
4. Cambia el estado del aspirante a "Admitido/Cupo Asignado", disparando
    la notificación.
5. Monitorea en el dashboard qué estudiantes admitidos ya han
    formalizado su matrícula.
6. Una vez formalizada, el perfil del estudiante se activa automáticamente
    en el Sistema de Información Estudiantil (SIS), listo para ser reportado en
    SIMAT.

**2.3. Desglose de Funcionalidades y Componentes (UI/UX)**


**2.3.1. Formulario de Preinscripción (Público)**

```
● Componente: Un formulario web incrustable.
● Campos Clave: Datos del Aspirante (Nombres, Documento, Grado al que
aspira), Datos del Acudiente (Nombres, Email, Teléfono).
● Acciones: Al enviar, crea un perfil de "Aspirante" y envía credenciales de
acceso al acudiente.
```
**2.3.2. Portal Privado del Aspirante**

```
● Componente: Un portal web seguro para el padre de familia.
● Secciones:
○ Inicio/Estado: Muestra una línea de tiempo visual del proceso (Ej: [✓]
Preinscrito -> [ ] Completar Datos -> [ ] Cargar Documentos -> [ ] Cupo
Asignado).
○ Ficha del Estudiante y Familiar: Formularios para completar la
información detallada.
○ Carga de Documentos: Interfaz para subir los documentos requeridos.
○ Formalización de Matrícula: Una vez admitido, se habilita esta sección
para aceptar los términos y finalizar el proceso.
```
**2.3.3. Back-Office de Admisiones (Dashboard del Administrador)**

```
● Componente: Un tablero Kanban con columnas que representan las etapas del
proceso.
● Columnas: Preinscritos | Documentos en Revisión | Documentos Aprobados |
Admitido | Matriculado | No Admitido.
● Tarjetas: Cada aspirante es una tarjeta que se puede arrastrar y soltar entre
columnas.
```
**2.4. Flujo de Proceso Detallado (Workflow)**

graph TD

A[Inicio: Padre visita web del colegio] --> B{Formulario de Preinscripción};

B --> C[Sistema crea 'Aspirante' y envía credenciales];

C --> D[Padre accede al Portal del Aspirante];

D --> E[Completa datos y sube documentos];

E --> F[Admin ve aspirante en Dashboard 'Preinscrito'];


F --> G{Revisa Documentos y Asigna Cupo};

G -- Cupo Asignado --> L[Mueve a 'Admitido'];

G -- Sin Cupo/Rechazado --> M[Mueve a 'No Admitido'];

L --> N[Sistema habilita opción de Matrícula en Portal del Padre];

N --> O{Padre acepta Manual de Convivencia y formaliza matrícula (sin costo)};

O --> P[Sistema cambia estado a 'Matriculado'];

P --> Q[Perfil se activa en el SIS];

P --> R[Datos listos para exportar a SIMAT];

**2.5. Módulo de Solicitud y Pago de Certificados**

Este es un componente clave para la autogestión financiera de la institución. Estará
accesible para padres de estudiantes activos y también para egresados.

**2.5.1. Portal para Estudiantes/Padres Activos**

```
● Funcionalidad: Dentro de su portal habitual en Kampus, encontrarán una
sección llamada "Trámites y Certificados".
● Proceso:
```
1. Seleccionan el tipo de certificado que necesitan (Ej: "Certificado de
    Estudios Año Actual", "Constancia de Matrícula").
2. El sistema muestra el costo del certificado.
3. Proceden al pago a través de la pasarela integrada (PSE, Efecty, etc.).
4. Una vez confirmado el pago, el sistema **genera automáticamente el**
    **certificado en PDF** con los datos del estudiante, listo para descargar e
    imprimir.

**2.5.2. Portal Público para Egresados**

```
● Funcionalidad: Un enlace público en la web del colegio llamado "Portal de
Egresados".
● Proceso:
```
1. El egresado se identifica con su tipo y número de documento.
2. El sistema busca en la base de datos histórica y muestra su nombre para
    confirmación.


3. Selecciona el tipo de certificado (Ej: "Certificado de Notas de Grado 11° -
    Año 2018").
4. Realiza el pago en línea.
5. Tras la confirmación, el sistema genera el certificado histórico en PDF
    para su descarga.

**2.5.3. Gestión Interna (Secretaría)**

```
● Dashboard Financiero: Un panel donde el personal administrativo puede ver
en tiempo real los recaudos por concepto de certificados, filtrar por fechas y
generar informes para el FSE.
● Configuración de Tarifas: Permite al administrador definir y actualizar los
precios de cada tipo de certificado según lo aprobado por el Consejo Directivo.
```
### 3. Módulo 2: Gestión de Estudiantes (SIS)

Este documento define la arquitectura funcional del **Sistema de Información
Estudiantil (SIS)** de Kampus. El SIS es el núcleo de la plataforma, diseñado para ser
la **fuente única y segura de la verdad** para toda la información relacionada con los
estudiantes. Su propósito es garantizar la integridad de los datos, facilitar el
cumplimiento normativo y servir como base para todos los demás módulos.

**3.1. Propósito y Valor Estratégico**

Este módulo resuelve uno de los problemas más críticos de la gestión escolar: la
fragmentación de la información. Elimina los "silos de datos" (hojas de cálculo,
archivos físicos, listas aisladas) y los centraliza en un perfil digital único, dinámico y
seguro para cada estudiante.

```
● Para la Institución:
○ Integridad de Datos: Garantiza que todos los departamentos
(Secretaría, Coordinación, Rectoría) trabajen con la misma información
actualizada, eliminando inconsistencias.
○ Cumplimiento Normativo Simplificado: Se convierte en la fuente
principal para generar con precisión los reportes obligatorios para el
SIMAT y el DANE.
○ Base para la Analítica: Un historial completo y estructurado es el
prerrequisito indispensable para cualquier iniciativa de analítica
predictiva, como la prevención de la deserción.
○ Seguridad y Confidencialidad: Facilita el cumplimiento de la Ley 1581
de 2012 (Habeas Data) al centralizar la gestión de datos personales y
```

```
controlar su acceso.
● Para el Personal (Docentes y Coordinadores):
○ Visión 360° del Estudiante: Permite comprender el contexto completo
de un estudiante (académico, de comportamiento, familiar) en un solo
lugar, facilitando una intervención más efectiva y empática.
○ Ahorro de Tiempo: Elimina la necesidad de buscar información en
múltiples fuentes.
```
**3.2. Arquitectura Funcional: La Ficha Única Estudiantil**

El corazón del SIS es la "Ficha Única Estudiantil", una interfaz de usuario organizada
en pestañas que presenta una vista completa del estudiante. Cada pestaña está
diseñada para un propósito específico y con permisos de acceso definidos por rol.

**Pestaña 1: Información Personal y Demográfica**

Contiene los datos de identificación básicos del estudiante. El rol de _Secretaría_ tiene
permisos de edición.

```
● Campos de Identificación:
○ Nombres Completos
○ Apellidos Completos
○ Tipo de Documento (Registro Civil, Tarjeta de Identidad, Cédula, etc.)
○ Número de Documento
○ Lugar y Fecha de Nacimiento
○ Edad (calculada automáticamente)
○ Género
● Campos de Contacto y Residencia:
○ Dirección de Residencia
○ Barrio / Vereda
○ Municipio / Ciudad
● Campos Socio-Demográficos:
○ Identificación Étnica: Un campo de selección con las opciones oficiales
del DANE (Indígena, Rom, Raizal, Palenquero,
Negro/Mulato/Afrodescendiente/Afrocolombiano, Ninguno de los
anteriores).
○ Estrato Socioeconómico
○ Necesidades Educativas Especiales (NEE): Un campo específico para
indicar si el estudiante tiene alguna NEE, con un enlace al módulo de
Bienestar para un seguimiento más detallado.
● Campos de Salud:
```

```
○ EPS (Entidad Promotora de Salud)
○ Grupo Sanguíneo y RH
○ Alergias Conocidas (campo de texto)
○ Condiciones Médicas Relevantes (campo de texto)
○ Contacto de Emergencia (Nombre y Teléfono)
```
**Pestaña 2: Núcleo Familiar y Acudientes**

Gestiona la información de los responsables del estudiante. Es la fuente de datos para
el módulo de comunicación.

```
● Estructura: Permite agregar múltiples contactos (Padre, Madre, Acudiente
Principal, Otro).
● Campos por Contacto:
○ Nombres y Apellidos
○ Relación/Parentesco
○ Tipo y Número de Documento
○ Teléfono Celular
○ Correo Electrónico
○ Profesión u Ocupación
● Lógica de Negocio:
○ Se debe designar a un contacto como "Acudiente Principal". Esta
persona será la receptora por defecto de todas las comunicaciones
oficiales y tendrá las credenciales de acceso al portal de padres.
○ Cumplimiento Legal: Cada perfil de acudiente debe tener un registro
de la autorización para el tratamiento de datos personales (Ley
1581) , con la fecha y el medio por el cual se otorgó.
```
**Pestaña 3: Historial Académico y de Matrícula**

Ofrece una vista longitudinal del recorrido del estudiante en la institución.

```
● Estructura: Una tabla cronológica que lista cada año lectivo cursado.
● Columnas por Año:
○ Año Lectivo (Ej: "2024")
○ Grado Cursado (Ej: "Octavo")
○ Grupo (Ej: "8-A")
○ Estado Final (Ej: "Promovido", "Reprobado", "Retirado")
○ Acción: Un botón para "Ver/Descargar Boletín Final" de ese año.
```

**Pestaña 4: Observador del Alumno (Seguimiento Integral)**

Digitaliza el tradicional observador, convirtiéndolo en una herramienta de seguimiento
dinámica y colaborativa.

```
● Estructura: Un feed o línea de tiempo cronológica de todas las anotaciones,
con opciones de filtro (por fecha, por autor, por tipo).
● Componentes de una Anotación:
○ Fecha y Hora: Registradas automáticamente.
○ Autor: Registrado automáticamente (Docente, Coordinador, etc.).
○ Tipo de Anotación: Un menú desplegable (Ej: "Felicitación Académica",
"Anotación Positiva de Convivencia", "Llamado de Atención Académico",
"Falta de Convivencia Tipo I, II, o III").
○ Descripción del Hecho: Campo de texto detallado.
○ Acciones Pedagógicas/Correctivos: Campo para describir las
acciones tomadas.
○ Compromisos (Opcional): Campo para registrar los acuerdos con el
estudiante o la familia.
● Lógica de Notificaciones: El registro de una falta grave (ej. Tipo II o III) debe
generar una notificación automática al Coordinador de Convivencia y al
Director de Grupo.
```
**Pestaña 5: Asistencia Detallada**

Proporciona un resumen visual y detallado del historial de asistencia.

```
● Visualización:
○ Vista de Calendario: Muestra el mes actual, marcando los días con
ausencias (justificadas o no) y retardos.
○ Vista de Resumen: Tarjetas que muestran el total de ausencias,
ausencias justificadas y retardos para el período actual y el acumulado
del año.
● Lógica de Justificación: Cuando un padre envía una justificación desde su
portal, la ausencia correspondiente aparece en el perfil del estudiante con un
estado de "Justificación Pendiente de Aprobación" para que el personal de
secretaría la valide.
```
**Pestaña 6: Expediente Digital (Documentos)**

Centraliza todos los documentos relacionados con el estudiante.

```
● Estructura: Un sistema de carpetas para organizar los archivos.
○ Carpetas por Defecto: "Documentos de Matrícula", "Certificados
```

```
Generados", "Soportes de Justificación", "Informes de Bienestar".
● Funcionalidad:
○ Los documentos cargados durante el proceso de admisión aparecen
automáticamente aquí.
○ Cada vez que el sistema genera un certificado o un boletín, una copia en
PDF se archiva automáticamente en la carpeta correspondiente.
○ Permite al personal autorizado (con permisos) cargar nuevos
documentos (ej. un informe de una terapia externa).
```
**3.3. Procesos Clave del Módulo**

**Gestión de Estado del Estudiante (Retiros y Traslados)**

Este es un flujo de trabajo crítico para mantener la integridad de los datos de
matrícula.

1. **Inicio del Proceso:** El personal de Secretaría selecciona la opción "Gestionar
    Estado del Estudiante".
2. **Selección de Nuevo Estado:** Elige entre "Retirado" o "Trasladado".
3. **Registro de Causa:** El sistema solicita seleccionar una causa del retiro (Ej:
    "Traslado a otra ciudad", "Cambio de institución", "Dificultades económicas",
    etc.). _Esta información es vital para los reportes del DANE y el análisis de_
    _deserción_.
4. **Confirmación:** Al confirmar, el sistema:
    ○ Cambia el estado del estudiante.
    ○ Su perfil se vuelve de **solo lectura**.
    ○ El estudiante ya no aparece en las listas de clase activas, pero **su**
       **historial completo se conserva indefinidamente** para futuras
       consultas o solicitudes de certificados de egresados.

**3.4. Interconexión con Otros Módulos de Kampus**

El SIS no es un módulo aislado; es el eje central que conecta todo.

```
● Admisiones y Matrículas: Al formalizar una matrícula, este módulo crea el
registro inicial en el SIS.
● Gestión Académica: Lee las listas de estudiantes del SIS para conformar los
cursos y escribe las notas y la asistencia en el historial del estudiante.
● Gestión de Convivencia: Lee los datos del estudiante para registrar una
observación y escribe dicha observación en la pestaña "Observador del
Alumno".
```

```
● Comunicaciones: Lee la información de contacto de la pestaña "Núcleo
Familiar" para dirigir los mensajes.
● Reportes y Estadísticas: Lee todos los datos del SIS para generar los archivos
planos para SIMAT , DANE y otros informes institucionales.
● Certificados: Lee los datos del estudiante y su historial para generar
automáticamente los certificados solicitados.
```
### 4. Módulo 3: Gestión Académica (Versión Detallada)

Este documento define la arquitectura funcional del **Módulo de Gestión Académica**
de Kampus. Este módulo es el motor que impulsa la operación pedagógica de la
institución, proveyendo las herramientas para estructurar el plan de estudios,
gestionar la evaluación conforme al **Decreto 1290** , y automatizar la generación de
todos los reportes académicos.

**4.1. Propósito y Valor Estratégico**

Este módulo ataca directamente la complejidad y la carga manual asociadas a la
gestión académica. Su objetivo es transformar procesos tediosos y propensos a
errores en flujos de trabajo eficientes, transparentes y alineados con el **Proyecto
Educativo Institucional (PEI)**.

```
● Para la Institución:
○ Garantía de Cumplimiento Normativo: Facilita la implementación y el
seguimiento del Sistema Institucional de Evaluación de Estudiantes
(SIEE) , dando total autonomía al colegio para definir sus criterios, tal
como lo estipula el Decreto 1290. Esto no solo es un requisito legal, sino
que asegura que la evaluación sea un reflejo fiel de la filosofía
institucional, evitando interpretaciones dispares entre docentes o sedes.
○ Consistencia Pedagógica: Asegura que todos los docentes apliquen
los mismos criterios de evaluación, componentes y descriptores de
desempeño definidos por la institución. Esto garantiza coherencia en
todo el proceso formativo y equidad para los estudiantes,
independientemente del docente que imparta la asignatura.
○ Optimización del Tiempo Directivo: Reduce drásticamente el tiempo
que los coordinadores y rectores dedican a tareas operativas como la
creación de horarios, la asignación de cargas y, fundamentalmente, la
revisión manual de planillas y el cálculo de promedios para los boletines.
Este tiempo liberado se puede reinvertir en observación de clases,
acompañamiento pedagógico y análisis estratégico.
○ Generación de Datos para la Mejora Continua: Al centralizar toda la
```

```
información académica, el módulo se convierte en una fuente de datos
invaluable para identificar patrones, como las asignaturas con mayor
índice de reprobación o los docentes con mejores resultados,
alimentando así el ciclo de mejora continua del PEI.
● Para los Docentes:
○ Empoderamiento y Eficiencia: Les proporciona una herramienta "todo
en uno" que simplifica la planificación, calificación y comunicación. En
lugar de manejar múltiples archivos de Excel, listas en papel y canales de
comunicación informales, el docente tiene un único punto de acceso a
todas sus responsabilidades, permitiéndole dedicar más tiempo a la
enseñanza y menos a las tareas administrativas.
○ Claridad y Soporte: Elimina la ambigüedad en el cálculo de notas
ponderadas y promedios, un punto frecuente de error y reclamos.
Además, les da acceso a un banco de logros e indicadores
institucionales, facilitando la redacción de boletines de alta calidad y
reduciendo la carga de tener que redactar observaciones desde cero
para cada estudiante.
○ Flexibilidad y Adaptabilidad: Reconoce que no todos los docentes
trabajan de la misma manera, ofreciendo modalidades de trabajo tanto
en línea como fuera de línea, adaptándose a diferentes niveles de
conectividad y preferencias personales.
```
**4.2. Arquitectura Funcional: De la Configuración a la Ejecución**

El módulo se estructura en dos grandes fases: la **Configuración (Back-Office del
Administrador)** , donde se sientan las bases del año escolar, y la **Ejecución (Portal
del Docente)** , que corresponde al uso diario.

**Fase 1: Configuración del Esqueleto Académico (Rol:
Administrador/Coordinador)**

Esta fase se realiza generalmente al inicio del año lectivo y define toda la estructura
sobre la cual operará la institución.

```
● 1. Gestión de Años Lectivos y Periodos:
○ Creación del Año Lectivo: Permite crear un nuevo ciclo (Ej: "Año
Escolar 2025").
○ Definición de Periodos: Configuración de los periodos académicos
(Bimestres, Trimestres, Semestres) con sus fechas exactas de inicio y
cierre. El sistema usará estas fechas para bloquear y desbloquear
automáticamente las planillas de los docentes, garantizando el
```

cumplimiento del cronograma.
○ **Proceso de Promoción de Fin de Año:** Una herramienta guiada para
cerrar el año lectivo actual. El sistema realiza una simulación de
promoción basada en los criterios del SIEE, presentando un informe
previo al coordinador. Una vez aprobado, el proceso calcula
automáticamente el estado final de cada estudiante ("Promovido",
"Reprobado", "Promovido con Nivelaciones Pendientes") y los traslada
masivamente al grado siguiente para el nuevo año, creando el nuevo
registro de matrícula. **Para Preescolar, el sistema aplicará la
promoción automática a 1º grado por defecto.**
● **2. Diseño del Plan de Estudios:**
○ **Gestión de Áreas:** Creación de las áreas obligatorias y fundamentales
(Ciencias Naturales, Matemáticas, Humanidades, etc.).
○ **Gestión de Asignaturas y Ponderación:** Creación de las asignaturas
específicas y su vinculación al área correspondiente. Al vincular una
asignatura a un área, se debe definir su **peso porcentual** dentro de la
misma. El sistema validará que la suma de los porcentajes de todas las
asignaturas de un área sea igual al 100%.
■ **Ejemplo:** Para el área "Ciencias Naturales", la configuración
podría ser:
■ Biología: 40%
■ Química: 30%
■ Física: 30%
■ El sistema usará esta ponderación para calcular automáticamente
la nota definitiva del área basándose en las notas finales de cada
asignatura, un cálculo que de otra forma sería manual y propenso
a errores.
● **3. Configuración del SIEE (Motor de Evaluación Flexible):**
○ Esta es la sección más crítica y flexible. Permite al colegio construir sus
modelos de evaluación a medida para cada nivel educativo, en total
concordancia con su SIEE.
○ **3.1. Modelo de Evaluación Diferenciado para Preescolar:**
■ **Fundamento:** En cumplimiento con el Decreto 2247 de 1997, el
sistema permite configurar un modelo de evaluación
**exclusivamente cualitativo** para el nivel Preescolar.
■ **Configuración de Dimensiones del Desarrollo:** En lugar de
áreas académicas, el administrador podrá crear y gestionar las
dimensiones propias de la educación inicial (Ej: Corporal,
Comunicativa, Cognitiva, Socio-emocional, Estética).


```
■ Escala de Valoración Cualitativa: Se podrá configurar la escala
descriptiva definida en el SIEE (Ej: "Avanza con seguridad", "En
proceso", "Requiere acompañamiento intensivo"), sin ninguna
asociación a valores numéricos.
■ Instrumentos Descriptivos: La planilla del docente de
preescolar estará diseñada para seleccionar estos descriptores
cualitativos para cada dimensión, y añadir observaciones
narrativas detalladas. No existirán cálculos de ponderación ni
promedios, enfocando la evaluación en el seguimiento del
desarrollo.
○ 3.2. Modelo de Evaluación para Básica y Media:
■ Definición de la Escala de Valoración Nacional: Configuración
de la escala cualitativa y su rango numérico correspondiente (Ej:
Desempeño Superior: 4.6 - 5.0, Alto: 4.0 - 4.5, etc.).
■ Creación de Componentes de Calificación: Permite crear los
"pilares" sobre los cuales se evaluará, asignándoles un peso
porcentual (Ej: Componente 1: "SABER" - 40%, Componente 2:
"HACER" - 40%, Componente 3: "SER" - 20%).
■ Creación de Actividades de Calificación: Dentro de cada
componente, se pueden crear las "columnas" que los docentes
verán en sus planillas (Ej: Dentro de "HACER", se pueden crear
"Talleres", "Exposiciones", "Laboratorios").
● 4. Asignación de Carga Académica y Horarios:
○ Interfaz Visual de Asignación: Una matriz o sistema de arrastrar y
soltar (drag-and-drop) que permite al coordinador asignar cada
asignatura de cada curso a un docente específico.
○ Gestión de Horarios: Herramienta para construir el horario de clases de
cada curso, con detección de conflictos en tiempo real (Ej: un docente
asignado a dos lugares al mismo tiempo, o un curso con dos clases
simultáneas).
```
**Fase 2: Ejecución y Seguimiento (Rol: Docente)**

Estas son las herramientas del día a día para el personal docente, diseñadas para
máxima flexibilidad.

```
● Planilla de Calificaciones Flexible:
○ Modalidad Dual: Edición en Línea y Carga Masiva: El docente puede
elegir el método que mejor se adapte a su flujo de trabajo.
■ Edición en Tiempo Real (Online): Una interfaz intuitiva, similar a
```

```
una hoja de cálculo, para ingresar notas directamente en la
plataforma. Ideal para actualizaciones rápidas, ya que el sistema
realiza todos los cálculos de ponderación y promedios al instante.
■ Carga por Archivo (Offline): Para la entrada de grandes
volúmenes de datos, el docente puede descargar una plantilla
(CSV o XLSX) con la lista de sus estudiantes, llenarla sin conexión
y luego subir el archivo a Kampus. El sistema validará los datos y
actualizará las calificaciones de forma masiva.
● Banco Colaborativo de Logros e Indicadores: Para estandarizar la calidad
de los boletines y a la vez fomentar la innovación pedagógica, el sistema
cuenta con un banco de descriptores de desempeño (logros, competencias,
indicadores) de carácter colaborativo.
○ Acceso Institucional: El coordinador académico puede cargar y
gestionar el banco de descriptores base para toda la institución.
○ Aportes del Docente: El docente no solo puede seleccionar los
indicadores existentes, sino también administrar el banco , añadiendo
nuevos descriptores directamente desde su planilla. Estos nuevos
indicadores quedan disponibles inmediatamente para su uso personal y
pueden ser marcados para ser compartidos con otros docentes del
mismo área, previa validación del coordinador, fomentando así un
repositorio institucional enriquecido por la práctica docente.
○ Uso Personalizado: El docente siempre podrá redactar indicadores
únicos y específicos para un estudiante directamente en el boletín, sin
necesidad de añadirlos al banco.
● Registro de Asistencia Flexible:
○ Método Rápido (Online): Para el día a día, el docente selecciona el
curso y la hora desde su portal, y el sistema le presenta la lista de
estudiantes para marcar con un solo clic las ausencias o retardos. Esta
acción se integra instantáneamente con el SIS y puede disparar
notificaciones a los padres.
○ Método Masivo (Offline): Para consolidar registros o en situaciones de
conectividad limitada, el docente puede descargar una plantilla de
asistencia para un periodo determinado, completarla y subirla
posteriormente para una actualización en bloque.
```
**Fase 3: Resultados y Reportes (Roles: Todos)**

Esta es la fase de salida, donde los datos se convierten en informes consolidados.

```
● Fábrica de Boletines de Calificaciones y Reportes Académicos: Esta es la
```

culminación del proceso académico, donde los datos se transforman en
comunicación formal y valiosa para la comunidad. La herramienta está
diseñada para ser robusta, flexible y completamente automatizada.
○ **Generación Masiva e Individualizada:** El sistema ofrece un motor de
generación de reportes que se adapta a cualquier necesidad.
■ **Proceso por Lotes:** El administrador o coordinador puede iniciar
un proceso de generación masiva para un curso completo, un
grado o toda la institución con un solo clic. Este proceso se
ejecuta en segundo plano (background job) para no afectar el
rendimiento de la plataforma, notificando al administrador cuando
los archivos PDF están listos.
■ **Generación a Demanda:** El personal de secretaría puede
generar un boletín actualizado para un estudiante específico en
cualquier momento, ideal para atender solicitudes de padres de
familia o procesos de traslado.
○ **Editor de Plantillas Visual y Dinámico:** Kampus incluye un potente
editor de plantillas que permite a cada institución reflejar su identidad y
filosofía evaluativa en sus reportes.
■ **Diseño Drag-and-Drop:** El administrador puede construir el
diseño del boletín arrastrando y soltando componentes
("widgets") en un lienzo. No se requiere conocimiento técnico.
■ **Componentes Disponibles:** Se puede incluir una amplia gama de
elementos dinámicos como tablas de calificaciones detalladas,
gráficos de progreso del estudiante vs. el promedio del curso,
espacios para los logros e indicadores seleccionados por cada
docente, observaciones del director de grupo, resumen de
asistencia con contadores, y el puesto del estudiante en el curso
(con opción de ocultarlo).
■ **Múltiples Plantillas:** Permite guardar diferentes diseños para
distintos propósitos (Ej: "Boletín Descriptivo Preescolar", "Boletín
Numérico Bachillerato"). El sistema aplicará automáticamente la
plantilla correcta según el nivel educativo del estudiante.
○ **Publicación y Distribución Automatizada:** Una vez generados, los
boletines entran en un flujo de trabajo seguro y eficiente.
■ **Paso de Revisión (Opcional):** El administrador puede habilitar un
paso de revisión, donde puede visualizar una muestra de los
boletines generados antes de autorizar su publicación final.
■ **Notificación Inteligente:** Al publicar, el sistema envía
automáticamente una notificación push y/o un correo electrónico


```
a los acudientes, informándoles que el nuevo reporte de
calificaciones ya está disponible en su portal.
■ Archivado Permanente y Seguro: Cada boletín generado en
formato PDF se archiva automáticamente en el Expediente
Digital del estudiante dentro del SIS. Esto crea un registro
académico inmutable, crucial para la auditoría y para la futura
generación de certificados de años anteriores.
● Consolidados y Reportes Avanzados (Para Directivos):
○ Sábana de Notas: Una vista maestra en formato de hoja de cálculo con
todas las calificaciones de un curso.
○ Reportes de Rendimiento: Gráficos y tablas que muestran el
rendimiento por áreas, asignaturas, docentes o grados, permitiendo
identificar fortalezas y debilidades a nivel institucional.
○ Ranking de Estudiantes: Generación de cuadros de honor por periodo
o por año.
```
**4.3. Flujo de Proceso Académico**

```
○ graph TD
○ subgraph Fase 1: Configuración (Admin/Coordinador)
○ A[Crear Año Lectivo y Periodos] --> B[Diseñar Plan de Estudios
(Áreas/Asignaturas)];
○ B --> C[Configurar SIEE (Modelo de Evaluación)];
○ C --> D[Asignar Carga Académica y Horarios a Docentes];
○ end
○
○ subgraph Fase 2: Ejecución (Docente)
○ D --> E[Docente accede a su Portal];
○ E --> F[Ingresa Calificaciones en Planilla Inteligente];
○ E --> G[Registra Asistencia Diaria];
○ end
○
○ subgraph Fase 3: Resultados (Sistema/Todos)
○ F --> H[Sistema calcula promedios y definitivas];
○ G --> I[Sistema actualiza historial de asistencia en SIS];
○ H --> J[Admin genera Boletines Masivamente];
○ J --> K[Padres/Estudiantes consultan Boletín en su Portal];
○ H --> L[Directivos analizan Reportes de Rendimiento];
○ end
```

### 5. Módulo 4: Gestión de Docentes

Este documento define la arquitectura funcional del **Módulo de Gestión de
Docentes** de Kampus. Este componente va más allá de ser un simple repositorio de
información; está concebido como el **Hub Profesional del Docente** , un espacio
digital centralizado que organiza su información, simplifica sus herramientas de
trabajo y apoya su desarrollo profesional dentro de la institución.

**5.1. Propósito y Valor Estratégico**

Este módulo busca dignificar y optimizar la labor docente, reconociendo que un
profesor empoderado y con herramientas eficientes es un pilar fundamental para la
calidad educativa. Resuelve problemas históricos de desorganización, pérdida de
información y comunicación fragmentada.

```
● Para la Institución (Gestión Directiva y Administrativa):
○ Centralización de la Información de Talento Humano: Crea un
expediente digital único, seguro y perpetuo para cada docente. Esto
elimina el riesgo de pérdida o deterioro de las carpetas físicas (hojas de
vida) y facilita la gestión de contratos, el seguimiento preciso al
escalafón y la administración de la carrera profesional del docente
dentro de la institución. Implica una reducción directa de costos en
archivo físico y una mejora en la seguridad de datos sensibles,
cumpliendo con la Ley de Habeas Data.
○ Optimización de la Asignación de Recursos: Proporciona un
dashboard visual con la carga académica y los horarios de cada
docente, permitiendo a los coordinadores identificar sobrecargas o
disponibilidad para una distribución más equitativa y estratégica del
talento humano. Esto previene el agotamiento docente (burnout) y
asegura que las áreas críticas siempre tengan cobertura.
○ Formalización y Auditoría de Procesos de RRHH: Digitaliza procesos
clave como la evaluación de desempeño, la solicitud de permisos y la
gestión de licencias. Cada acción queda registrada con fecha y usuario,
creando un rastro auditable que garantiza la transparencia y el
cumplimiento de los procedimientos internos y legales. Esto es
invaluable ante auditorías externas o procesos disciplinarios.
○ Apoyo a la Toma de Decisiones Estratégicas: Al tener datos
estructurados sobre las especialidades, certificaciones y evaluaciones
de los docentes, la dirección puede identificar necesidades de
capacitación, planificar la sucesión de cargos y construir planes de
desarrollo profesional alineados con el PEI. Permite responder preguntas
```

```
como: "¿Qué porcentaje de nuestros docentes está certificado en
metodologías activas?" o "¿Quién es el candidato interno ideal para
asumir la coordinación de ciencias?".
● Para los Docentes:
○ Unificación de Herramientas en un Único Ecosistema: Elimina la
frustración de navegar por múltiples sistemas, archivos de Excel o
grupos de comunicación no oficiales. Todo lo que el docente necesita
para su labor diaria —planillas, horarios, comunicados, recursos— está
integrado y accesible desde un solo lugar. Esto reduce la carga cognitiva
y permite que la tecnología sea un aliado, no un obstáculo.
○ Claridad y Organización para Reducir el Estrés: Proporciona una
visión clara e instantánea de sus responsabilidades, horarios y
comunicaciones. Esto reduce significativamente el estrés administrativo
(ej. buscar el contacto de un acudiente, recordar qué clases siguen) y
libera tiempo y energía mental para enfocarse en la planificación
pedagógica y la interacción con los estudiantes. Un docente menos
estresado es un docente más efectivo y presente en el aula.
○ Autonomía y Desarrollo Profesional: Ofrece un espacio personal para
gestionar y visibilizar su perfil profesional, participar de manera más
estructurada en los procesos de evaluación y tener un registro claro de
su propia trayectoria y logros dentro de la institución. Fomenta un
sentido de pertenencia y valoración profesional.
```
**5.2. Arquitectura Funcional: El Hub Profesional del Docente**

El módulo se estructura en dos componentes principales interconectados: el
**Expediente Profesional** , que es la base de datos maestra gestionada por la
administración, y el **Portal del Docente** , que es la interfaz de trabajo diaria y
personalizada.

**Componente 1: Expediente Profesional del Docente (Rol:
Administrador/Secretaría)**

Esta es la ficha maestra de cada docente, el equivalente al SIS del estudiante, pero
para el personal. Es la fuente única de verdad para todos los datos administrativos del
docente.

```
● Pestaña 1: Información Personal y Contractual
○ Datos Personales: Nombres, apellidos, tipo y número de documento,
fecha de nacimiento, dirección, contacto de emergencia.
○ Información Contractual: Tipo de contrato, fecha de ingreso, cargo
```

```
actual, asignación salarial, historial de cargos y salarios dentro de la
institución.
○ Escalafón Docente y Régimen: Campo específico y estructurado para
registrar el grado y nivel en el escalafón (según Decreto 2277 o 1278).
Este dato es crucial para la administración pública, ya que impacta
directamente en los cálculos de nómina y en los reportes para las
Secretarías de Educación.
○ Roles Especiales: Un apartado clave para asignar roles específicos que
conllevan permisos adicionales en la plataforma.
■ Director de Grupo: Funcionalidad para asignar a un docente
como el director de un grupo específico (ej. "7-A"). Esta
asignación le otorga los permisos especiales para gestionar el
Observador del Alumno de su grupo.
● Pestaña 2: Carga Académica y Horarios
○ Una vista de resumen que muestra todas las asignaturas y cursos que el
docente tiene a su cargo para el año lectivo actual, con el número de
horas semanales por cada una.
○ El sistema es flexible para manejar asignaciones complejas, como la
docencia en salones multigrado , donde un mismo docente puede tener
a cargo estudiantes de diferentes grados (ej. 2° y 3°) dentro de un mismo
grupo de trabajo o clase.
○ Acceso directo a la visualización de su horario de clases semanal, con la
posibilidad de imprimirlo o exportarlo.
● Pestaña 3: Hoja de Vida Digital (Expediente)
○ Un repositorio de documentos organizado en carpetas para mantener un
registro completo y ordenado de la trayectoria del docente.
■ Carpetas: "Títulos y Diplomas", "Certificaciones y Cursos", "Actos
Administrativos (Nombramientos, etc.)", "Evaluaciones de
Desempeño Anteriores", "Soportes de Licencias y Permisos".
○ Flujo de Validación: Permite tanto al administrador como al propio
docente (desde su portal) subir nuevos documentos. Los documentos
subidos por el docente entran en un estado "Pendiente de Validación"
hasta que un administrador los revisa y aprueba, garantizando así la
integridad y oficialidad del expediente digital.
```
**Componente 2: Portal del Docente (Interfaz de Trabajo Diario)**

Esta es la pantalla de inicio y centro de operaciones para cada docente al ingresar a
Kampus. Está diseñada para ser proactiva y orientada a la acción.


● **Dashboard Interactivo:** Una vista principal con "widgets" o tarjetas dinámicas
que presentan la información más relevante:
○ **"Mi Próxima Clase":** Muestra la siguiente clase programada, indicando
la asignatura, el curso, la hora y el salón. Incluye botones de acceso
rápido para "Tomar Asistencia" o "Abrir Planilla de Notas".
○ **"Comunicados Recientes":** Un _feed_ con los últimos mensajes no leídos
de directivos y padres de familia, permitiendo una respuesta rápida y
eficiente.
○ **"Mis Tareas Pendientes":** Una lista inteligente de acciones que
requieren su atención, como "Calificar Taller de 7-B", "Revisar
Justificación de Ausencia de
○ ", "Completar Autoevaluación de Desempeño" o incluso recordatorios
positivos como "Felicitar a
○ Estudiante
○ por su excelente participación".
○ **"Cumpleaños del Día":** Un pequeño widget que muestra si algún
estudiante de sus cursos cumple años ese día, fomentando la
construcción de comunidad y las relaciones interpersonales.
● **Sección "Mis Cursos":**
○ Un listado de todas las asignaturas y grupos a su cargo. Al hacer clic en
un curso (ej. "Matemáticas 8-A"), se accede a un **espacio de trabajo
dedicado** para ese grupo, un micro-portal con pestañas internas para:
■ **Planilla de Notas:** Acceso directo a la planilla de calificaciones
del curso.
■ **Registro de Asistencia:** Historial y acceso al registro de
asistencia del grupo.
■ **Listado de Estudiantes:** Permite ver la lista de estudiantes con
sus fotos y acceder a una vista resumida de su ficha (con los
permisos correspondientes).
■ **Observador del Alumno: Acceso con permisos específicos.** La
capacidad de **escribir** nuevas anotaciones en el observador está
restringida. Solo los **Coordinadores** y el docente que ha sido
formalmente asignado como **Director de Grupo** para ese curso
específico tendrán habilitada la interfaz para agregar entradas.
Los demás docentes de asignatura, por defecto, no podrán
escribir en el observador, garantizando que el seguimiento formal
quede en manos de los responsables designados.
■ **Recursos de Clase:** Un espacio para subir y compartir archivos
(guías, presentaciones, enlaces) específicamente con ese grupo


```
de estudiantes.
● Sección "Mi Horario":
○ Una vista de calendario semanal o mensual que muestra su horario de
clases de forma clara. Cada bloque de clase es interactivo y al hacer clic
muestra detalles y accesos directos a las herramientas
correspondientes.
● Sección "Mi Perfil Profesional":
○ Permite al docente visualizar y solicitar la actualización de su
información personal y de contacto.
○ Le da acceso para subir nuevos documentos a su Hoja de Vida Digital
(Ej: un nuevo certificado de un curso que haya completado), iniciando el
flujo de validación.
```
**5.3. Funcionalidades de Alto Impacto para la Gestión de Talento Humano**

```
● Módulo de Evaluación de Desempeño:
○ Formaliza y digitaliza el proceso de evaluación anual, haciéndolo más
objetivo y constructivo.
○ Flujo de Trabajo:
```
1. El Rector/Coordinador diseña o selecciona las plantillas de
    evaluación (con tipos de pregunta como escala Likert, respuesta
    abierta, etc.).
2. Asigna los formularios a los docentes al inicio del periodo de
    evaluación.
3. El docente recibe una notificación y completa su autoevaluación
    desde su portal.
4. El evaluador (Rector/Coordinador) completa la evaluación del
    docente, la cual puede visualizar en paralelo con la
    autoevaluación para un diálogo más enriquecedor.
5. El sistema consolida los resultados y genera un informe final en
    PDF que puede incluir gráficos de competencias y un espacio
    para un **Plan de Mejoramiento Profesional** acordado entre
    ambas partes.
6. El informe se archiva automáticamente en la Hoja de Vida Digital
    del docente.
● **Módulo de Solicitudes y Permisos:**
○ Un sistema simple y transparente para que los docentes puedan solicitar
permisos (licencias, citas médicas, calamidades) de forma online.
○ **Flujo de Aprobación:** La solicitud genera una notificación al superior


```
correspondiente (Coordinador/Rector) para su aprobación o rechazo. La
decisión se notifica de vuelta al docente y a RRHH. Si se aprueba, el
sistema puede bloquear automáticamente el horario del docente para
esas fechas, alertando al coordinador sobre la necesidad de gestionar
un reemplazo.
○ Crea un registro digital de todas las solicitudes y su estado, eliminando
el papeleo y agilizando los procesos de RRHH.
```
**5.4. Interconexión con Otros Módulos de Kampus**

```
● Gestión Académica: Es la conexión más fuerte. Este módulo lee la asignación
de carga académica y horarios definida en el módulo académico y provee la
interfaz para que el docente ejecute sus tareas de calificación y asistencia.
● Gestión de Estudiantes (SIS): Lee la información de los estudiantes para
poblar las listas de clase y escribe en el SIS a través de las anotaciones en el
observador, actualizando el perfil del estudiante en tiempo real.
● Comunicaciones: Utiliza el motor de comunicaciones para el intercambio de
mensajes entre docentes, padres y directivos, asegurando que toda la
comunicación quede registrada.
● Reportes y Estadísticas: Proporciona los datos de los docentes (escalafón,
tipo de nombramiento, etc.) necesarios para la generación de reportes oficiales
para el DANE y las Secretarías de Educación.
```
### 6. Módulo 5: Comunicación y Notificaciones (Versión Detallada)

Este documento define la arquitectura funcional del **Módulo de Comunicación y
Notificaciones** de Kampus. Este módulo es el sistema circulatorio de la plataforma,
diseñado para erradicar la fragmentación, la informalidad y la inseguridad de los
canales de comunicación tradicionales, y reemplazarlos por un ecosistema unificado,
seguro y en tiempo real.

**6.1. Propósito y Valor Estratégico**

La comunicación efectiva es la base de la confianza y la colaboración en cualquier
comunidad. Este módulo ataca directamente los problemas derivados de una
comunicación deficiente, como la desinformación, la baja participación de los padres
y la sobrecarga de canales informales.

```
● Para la Institución:
○ Control y Formalidad: Centraliza toda la comunicación oficial en un
único canal auditable. Reemplaza los grupos de WhatsApp no oficiales,
```

```
que presentan riesgos de privacidad (exposición de números de
teléfono) y laborales, por un entorno profesional y seguro.
○ Eficiencia Operativa: Automatiza el envío de comunicados y
notificaciones, ahorrando tiempo y recursos que antes se dedicaban a
imprimir circulares o a realizar llamadas telefónicas.
○ Aumento de la Participación: Al facilitar una comunicación directa y
sencilla, fomenta una mayor implicación de los padres en la vida escolar
y en los procesos de apoyo académico, un factor clave para el éxito
estudiantil.
○ Gestión de la Reputación: Proyecta una imagen de organización,
modernidad y transparencia, fortaleciendo la confianza de la comunidad
en la gestión institucional.
● Para los Padres y Estudiantes:
○ Fuente Única de Verdad: Elimina la confusión y la ansiedad de tener
que revisar múltiples fuentes (agenda, correo, WhatsApp). Toda la
información relevante y oficial está en un solo lugar, accesible desde su
teléfono.
○ Comunicación Directa y Respetuosa: Ofrece un canal directo para
contactar a los docentes de sus hijos sin necesidad de intermediarios,
dentro de un marco de respeto por los horarios y roles de cada uno.
○ Empoderamiento e Inclusión: Les permite estar informados en tiempo
real sobre el progreso académico, la asistencia y los eventos
importantes, permitiéndoles actuar de manera proactiva en el
acompañamiento de sus hijos.
```
**6.2. Arquitectura Funcional: Un Ecosistema de Comunicación Centralizado**

El módulo se compone de varias herramientas integradas que trabajan en conjunto
para cubrir todas las necesidades de comunicación de la institución.

**1. Mensajería Interna Segura (El Canal Directo)**

Esta funcionalidad reemplaza el intercambio de mensajes por canales externos,
creando un entorno de chat profesional y seguro.

```
● Tipos de Conversación:
○ Bidireccional (Docente <-> Acudiente): Permite una comunicación
privada y directa. Para proteger el tiempo del docente, el sistema puede
configurarse para que los padres solo puedan iniciar conversaciones,
pero los docentes respondan en horarios definidos (ej. "horario de
atención a padres").
```

```
○ Unidireccional (Directivo -> Grupo): Los rectores y coordinadores
pueden enviar mensajes a grupos segmentados (ej. "Todos los
docentes", "Padres de 11º grado") sin habilitar una respuesta, ideal para
anuncios rápidos.
● Funcionalidades Avanzadas:
○ Confirmación de Lectura: El sistema muestra un doble check (✓✓)
cuando el destinatario ha leído el mensaje, proporcionando trazabilidad.
○ Plantillas de Mensajes: Los directivos y docentes pueden guardar
respuestas o comunicados frecuentes como plantillas para agilizar la
comunicación (Ej: "Recordatorio de reunión", "Solicitud de justificación
de ausencia").
○ Programación de Envíos: Permite redactar un mensaje y programar su
envío para una fecha y hora específicas.
○ Historial Inmutable: Todas las conversaciones quedan registradas
permanentemente en la plataforma, sirviendo como soporte ante
cualquier discrepancia o proceso de seguimiento.
```
**2. Muro de Comunicados (Circulares Digitales)**

Es el cartel principal de la institución, pero digital, inteligente y segmentado.

```
● Creación de Comunicados: Una interfaz sencilla para que los administradores
redacten comunicados, con opciones de formato (negrita, listas, etc.) y la
capacidad de adjuntar múltiples archivos (PDF, imágenes, documentos de
Word).
● Segmentación de Audiencia: La funcionalidad más potente. Antes de
publicar, el administrador puede seleccionar con precisión quién recibirá el
comunicado.
○ Ejemplos: "Toda la comunidad", "Solo estudiantes de Bachillerato",
"Solo padres de familia de la Sede La Ye", "Solo miembros del equipo de
fútbol".
● Confirmación de Enterado: Se puede añadir un botón de "He leído y
entiendo" al final de los comunicados importantes. El sistema registra qué
usuarios han confirmado, permitiendo a la administración hacer un seguimiento
proactivo con quienes no lo han hecho.
```
**3. Notificaciones Push Inteligentes (Alertas en Tiempo Real)**

Son el sistema de alerta temprana de la plataforma, enviando información crítica
directamente a la pantalla de bloqueo del celular de los usuarios.


```
● Notificaciones Académicas (Automáticas):
○ Para Padres/Estudiantes: "Nueva calificación publicada en
Matemáticas", "Tienes una nueva tarea de Ciencias Sociales", "Alerta:
Desempeño bajo en el área de Inglés".
● Notificaciones Administrativas (Automáticas):
○ Para Padres: "Recordatorio: La pensión del mes de agosto vence en 3
días", "El certificado de estudios solicitado ya está disponible para
descargar".
● Notificaciones de Convivencia (Automáticas y Manuales):
○ Para Padres: "Se ha registrado una nueva anotación en el observador
de su hijo/a", "Recordatorio de citación con Coordinación de
Convivencia".
● Notificaciones Generales (Manuales):
○ "La reunión de padres de familia de 3º grado ha sido reprogramada",
"Suspensión de clases por jornada de desinfección mañana viernes".
```
**4. Calendario Institucional Interactivo**

Centraliza todos los eventos y fechas clave, sincronizando a toda la comunidad.

```
● Categorías de Eventos: Los eventos se pueden codificar por colores según su
categoría (Ej: Académico, Deportivo, Cultural, Administrativo, Festivo).
● RSVP y Asistencia: Para eventos como reuniones o talleres, se puede habilitar
una opción de RSVP para que los padres confirmen su asistencia, ayudando a
la logística.
● Integración y Sincronización: Los usuarios pueden ver el calendario dentro
de la app o sincronizarlo con sus calendarios personales (Google Calendar,
Outlook, etc.) con un solo clic, integrando la vida escolar con su organización
personal.
```
**5. Encuestas y Sondeos Rápidos**

Una herramienta para fomentar la participación y tomar el pulso de la comunidad de
manera ágil.

```
● Creación Fácil: Permite a los directivos crear encuestas cortas con diferentes
tipos de preguntas (opción múltiple, calificación de 1 a 5, respuesta abierta).
● Casos de Uso:
○ Sondeo a los padres para decidir la temática del día de la familia.
○ Encuesta de satisfacción después de un evento.
○ Votación para elegir al representante de los estudiantes.
```

```
● Resultados en Tiempo Real: El sistema tabula las respuestas
automáticamente y presenta los resultados en gráficos sencillos, facilitando el
análisis y la toma de decisiones.
```
**6.3. Interconexión con Otros Módulos de Kampus**

La verdadera potencia de este módulo reside en su integración nativa con el resto de
la plataforma.

```
● Con Gestión Académica: Cada vez que un docente guarda una nueva
calificación o crea una tarea, el sistema de notificaciones se activa
automáticamente.
● Con Gestión de Estudiantes (SIS): El registro de una ausencia en el SIS
dispara la notificación de inasistencia. La mensajería lee los datos de los
acudientes para dirigir los mensajes correctamente.
● Con Gestión de Docentes: Un comunicado del rector a "todo el personal
docente" utiliza los perfiles de este módulo para segmentar la audiencia.
● Con el Módulo Financiero: Genera recordatorios de pago automáticos
basados en el estado de la cartera.
```
### 7. Módulo 6: Gestión Disciplinaria y de Convivencia (Versión

### Detallada)

Este documento define la arquitectura funcional del **Módulo de Gestión
Disciplinaria y de Convivencia** de Kampus. Este módulo no es una simple
herramienta de sanción, sino un sistema integral diseñado para digitalizar y dar vida al
**Manual de Convivencia** de la institución, garantizando el cumplimiento de la **Ley
1620 de 2013** y su **Ruta de Atención Integral**. Su propósito es transformar el manejo
de la convivencia de un proceso reactivo, basado en el castigo, a uno proactivo,
formativo y transparente, centrado en el desarrollo de competencias ciudadanas.

**7.1. Propósito y Valor Estratégico**

Este módulo aborda la necesidad crítica de gestionar la convivencia escolar de una
manera justa, consistente y documentada, protegiendo los derechos de todos los
estudiantes y fortaleciendo la relación entre el colegio y las familias.

```
● Para la Institución:
○ Garantía del Debido Proceso: Sistematiza y estandariza los pasos a
seguir ante cualquier situación, asegurando que se cumplan los
protocolos definidos en el Manual de Convivencia y la normativa
nacional. Esto minimiza el riesgo de reclamos legales por parte de las
```

familias y fortalece la legitimidad de las decisiones institucionales ante
entidades de control como las Secretarías de Educación o el ICBF. Cada
paso, desde el registro inicial hasta la acción formativa, queda
documentado con fecha, hora y responsable.
○ **Centralización y Trazabilidad:** Crea un expediente de convivencia
único y acumulativo para cada estudiante, el "Observador Digital". Este
historial es inmutable y seguro, y permite a los directivos tener una visión
completa de la trayectoria de un estudiante, identificando patrones de
comportamiento a lo largo del tiempo, en lugar de evaluar incidentes de
forma aislada.
○ **Inteligencia para la Prevención:** Transforma los datos de convivencia
en información estratégica. Permite a los directivos y al Comité de
Convivencia identificar patrones (ej. "los martes en el patio de
secundaria es donde más se presentan conflictos"), estudiantes en
riesgo (aquellos con un aumento súbito de reportes) y focos de
conflicto, para diseñar intervenciones preventivas (talleres, campañas,
ajuste de supervisión en recesos) en lugar de solo reaccionar a las crisis.
○ **Consistencia Institucional:** Asegura que todos los docentes y
directivos apliquen los mismos criterios y procedimientos, eliminando la
subjetividad y garantizando un trato equitativo para todos los
estudiantes. Evita que la gravedad de una falta o la acción a tomar
dependa del criterio personal del docente de turno, unificando la
respuesta institucional.
● **Para los Docentes y Coordinadores:**
○ **Claridad y Soporte:** Les proporciona una guía clara y paso a paso
sobre cómo proceder ante una situación disciplinaria, qué registrar y a
quién notificar. Esto reduce la incertidumbre y el estrés, especialmente
para docentes nuevos, y les permite actuar con confianza sabiendo que
están siguiendo el protocolo institucional.
○ **Optimización del Tiempo:** Agiliza drásticamente el proceso de registro
y comunicación. En lugar de llenar formatos en papel, buscar al
coordinador y luego intentar contactar a los padres, el docente puede
registrar el incidente en minutos, y el sistema se encarga de las
notificaciones automáticas, permitiéndole dedicar más tiempo al diálogo
formativo con los estudiantes.
● **Para los Padres de Familia:**
○ **Transparencia y Confianza:** Les ofrece una ventana clara y en tiempo
real al seguimiento convivencial de sus hijos. Esto elimina la
desinformación y el "teléfono roto", fomentando una comunicación


```
basada en hechos y no en percepciones. Saben que serán notificados
de inmediato ante cualquier situación relevante, lo que les permite
intervenir tempranamente y ser aliados en el proceso formativo.
○ Participación Informada: Al tener acceso al historial y a los
compromisos adquiridos, los padres pueden participar de manera más
efectiva en las reuniones y en el seguimiento en casa, entendiendo el
contexto completo de las situaciones y las acciones que el colegio está
tomando.
```
**7.2. Arquitectura Funcional: Del Registro a la Analítica**

El módulo se estructura en componentes interconectados que guían al usuario a
través de todo el ciclo de gestión de la convivencia.

**1. Parametrización del Manual de Convivencia (El Cerebro del Módulo)**

Esta es la sección de configuración inicial (Rol: Administrador/Coordinador de
Convivencia) donde se traduce el documento físico del Manual de Convivencia a la
lógica del sistema.

```
● Catálogo de Situaciones y Faltas: Permite crear y clasificar las faltas según la
normativa colombiana:
○ Situaciones Tipo I: Conflictos manejados inadecuadamente, agresiones
verbales esporádicas.
○ Situaciones Tipo II: Acoso escolar (bullying) físico o verbal de forma
reiterada, ciberacoso, etc.
○ Situaciones Tipo III: Delitos que atentan contra la libertad, integridad y
formación sexual, porte de armas, etc.
● Matriz de Protocolos y Acciones Formativas: La funcionalidad más potente.
Para cada tipo de falta, el administrador puede asociar:
○ Un protocolo de acción: Los pasos a seguir (Ej: Para una falta Tipo I, el
protocolo puede ser: 1. Diálogo inmediato, 2. Registro en observador.
Para una Tipo II: 1. Detener la acción, 2. Registro en observador, 3.
Notificación inmediata a Coordinación, 4. Citación obligatoria a padres,
```
5. Remisión al Comité de Convivencia).
○ **Un catálogo de acciones pedagógicas:** Una lista de posibles medidas
formativas, clasificadas por su objetivo (reparadoras, pedagógicas,
sancionatorias). Ejemplos: "Realizar una exposición sobre las
consecuencias del ciberacoso", "Participar en tres jornadas de
mediación escolar", "Realizar un servicio social interno limpiando las
mesas del comedor", "Escribir una carta de disculpas reflexionando


```
sobre el daño causado". Esto estandariza las respuestas y les da un
enfoque pedagógico.
```
**2. Registro de Incidentes (El Observador Digital)**

Es el formulario que utilizan los usuarios autorizados para documentar una situación.

```
● Permisos de Escritura: Siguiendo una estructura formal, la capacidad de
crear una nueva anotación en el observador está restringida al Director de
Grupo del estudiante y a los Coordinadores (Académico y de Convivencia).
Los demás docentes de asignatura pueden reportar la situación a estos roles,
pero no registran directamente, para mantener la formalidad del canal.
● Formulario de Registro Detallado:
○ Campos Clave: Fecha, hora, estudiante(s) implicado(s), docente que
reporta, lugar del incidente (con un mapa desplegable del colegio).
○ Clasificación del Incidente: Menú desplegable para seleccionar la falta
cometida, según el catálogo previamente configurado.
○ Descripción de los Hechos: Campo de texto enriquecido para una
descripción detallada y objetiva de lo sucedido.
○ Acciones Inmediatas Tomadas: Campo para registrar las primeras
acciones realizadas (Ej: "Se realizó un diálogo con los estudiantes
implicados").
○ Adjuntar Evidencia: Permite subir archivos (imágenes, documentos,
capturas de pantalla de chats) que soporten el registro, con el debido
manejo de la privacidad.
```
**3. Flujo de Trabajo del Debido Proceso**

Una vez se guarda un registro, el sistema activa un flujo de trabajo automatizado.

```
● graph TD
● A[Registro de Incidente por Director de Grupo/Coordinador] --> B{Sistema notifica
automáticamente};
● B --> C[Alerta a Coordinador de Convivencia];
● B --> D[Alerta a Director de Grupo (si no fue quien registró)];
● B --> E[Alerta a Orientador/Psicólogo];
● C --> F{Coordinador analiza el caso};
● F -- Requiere citación --> G[Agenda Cita con Acudiente desde Kampus];
● G --> H[Padre recibe notificación de citación];
● F -- No requiere citación inmediata --> I[Seguimiento interno];
● G --> J[Se realiza la reunión y se registran los descargos y compromisos en el sistema];
```

```
● J --> K{Definición de Acción Formativa};
● K --> L[Coordinador selecciona una o más acciones del catálogo configurado];
● L --> M[Se asigna seguimiento de la acción al rol correspondiente (ej. Docente,
Orientador)];
● M --> N[El sistema monitorea el cumplimiento de la acción];
● N --> O[Cierre del caso con registro de cumplimiento];
```
**4. Notificación y Comunicación con la Familia**

La comunicación proactiva y transparente con los padres es un pilar del módulo.

```
● Notificación Inmediata: Cuando se guarda una anotación relevante, el
acudiente principal recibe una notificación push en su celular.
● Acceso Seguro a la Información: La notificación no contiene los detalles del
incidente. En su lugar, indica: "Se ha registrado una nueva anotación en el
observador de [Nombre del Hijo/a]. Por favor, ingrese al portal para ver los
detalles". Esto garantiza la confidencialidad.
● Registro de Comunicación: Todas las citaciones, mensajes y compromisos
firmados digitalmente quedan almacenados en el historial del caso.
```
**5. Reportes y Analítica de Convivencia**

Este componente transforma los datos de incidentes en inteligencia para la
prevención.

```
● Dashboard de Convivencia (Para Directivos):
○ Gráficos en tiempo real: Muestra el número de incidentes por tipo (I, II,
III), por curso, por género y por periodo.
○ Mapa de Calor: Si se registra el lugar del incidente, se puede generar
un mapa del colegio que muestre las "zonas calientes" donde ocurren
más conflictos.
● Informes de Seguimiento:
○ Ficha de Convivencia por Estudiante: Un informe completo con todo
el historial de un alumno, ideal para las reuniones con padres o el Comité
de Convivencia.
○ Identificación de Reincidencia: El sistema puede generar alertas
automáticas cuando un estudiante acumula un número determinado de
incidentes en un periodo, señalando la necesidad de una intervención
más profunda.
● Reportes para el Comité de Convivencia: Genera automáticamente la
agenda para las reuniones del comité, listando los casos de Tipo II y III que
```

```
requieren su atención, con toda la documentación adjunta.
```
### 8. Módulo 7: Reportes y Estadísticas (Versión Detallada)

Este documento define la arquitectura funcional del **Módulo de Reportes y
Estadísticas** de Kampus. Este componente es el cerebro analítico de la plataforma,
diseñado para transformar el vasto océano de datos crudos generados diariamente
por la institución en información clara, accionable y estratégica. Su propósito es
erradicar la labor manual de consolidación de informes, eliminar los silos de
información y empoderar a los directivos y coordinadores con inteligencia de negocio
para la toma de decisiones.

**8.1. Propósito y Valor Estratégico**

Este módulo resuelve el problema fundamental de la "ceguera de datos", donde las
instituciones acumulan información masiva pero carecen de las herramientas para
interpretarla y usarla estratégicamente. Pasa de un enfoque reactivo (generar un
reporte cuando se solicita) a uno proactivo (monitorear indicadores clave en tiempo
real para anticipar problemas).

```
● Para la Institución (Gestión Directiva):
○ Visión 360° en Tiempo Real: Ofrece un panorama completo y
actualizado del estado de la institución, cruzando datos académicos,
financieros, de convivencia y administrativos. Permite a un rector
responder preguntas complejas como "¿Cómo se correlaciona la tasa de
asistencia con el rendimiento en matemáticas en el tercer periodo?" en
segundos, no en semanas.
○ Fundamento para la Planificación Estratégica: Proporciona los datos
duros necesarios para la formulación del Proyecto Educativo
Institucional (PEI) y los planes de mejoramiento. Las decisiones dejan de
basarse en la intuición para sustentarse en evidencia.
○ Automatización del Cumplimiento Normativo: Ahorra cientos de
horas de trabajo administrativo al año al automatizar la generación de
los complejos reportes exigidos por el Ministerio de Educación (MEN), el
DANE y las Secretarías de Educación.
● Para los Coordinadores:
○ Herramienta de Gestión Táctica: Permite monitorear el rendimiento de
los cursos y docentes a su cargo, identificar áreas académicas que
necesitan refuerzo y evaluar la efectividad de las estrategias
pedagógicas implementadas.
○ Soporte para el Acompañamiento Docente: Facilita la identificación
```

```
de docentes que puedan necesitar apoyo, basándose en el rendimiento
promedio de sus estudiantes o en otros indicadores, permitiendo un
acompañamiento más objetivo y constructivo.
```
**8.2. Arquitectura Funcional: Un Centro de Inteligencia Institucional**

El módulo se estructura en componentes diseñados para diferentes niveles de análisis
y necesidades de usuario, desde la visión macroestratégica hasta la generación de
documentos operativos.

**1. Dashboard Estratégico (El Puesto de Mando del Rector)**

Es una interfaz visual e interactiva que presenta los Indicadores Clave de Desempeño
(KPIs) más importantes de la institución. No es un reporte estático, sino un panel
dinámico.

```
● Componentes Visuales (Widgets):
○ Medidores de Capacidad: Gráficos de tipo "velocímetro" o barras que
muestran el total de estudiantes matriculados vs. la capacidad total por
sede, nivel y jornada.
○ Analítica de Matrículas: Tendencias de nuevas matrículas y retiros a lo
largo del tiempo, permitiendo analizar la tasa de retención y deserción.
○ Resumen de Salud Financiera: Indicadores clave del módulo
financiero, como porcentaje de cartera vencida y ejecución presupuestal
del Fondo de Servicios Educativos (FSE).
○ Pulso de Convivencia: Un resumen del módulo de convivencia que
muestra el número de incidentes por tipo (I, II, III) y las tendencias a lo
largo del tiempo.
● Capacidades de Filtrado Avanzado: El verdadero poder del dashboard reside
en su interactividad. El directivo puede filtrar todos los gráficos por:
○ Rango de fechas: (últimos 30 días, último trimestre, año actual).
○ Sede: (Principal, Sede La Ye).
○ Nivel Educativo: (Preescolar, Básica Primaria, Bachillerato).
○ Grado o Curso específico.
```
**2. Fábrica de Documentos Oficiales (Automatización Administrativa)**

Centraliza y automatiza la generación de toda la documentación oficial que emite la
secretaría.

```
● Generador de Certificados y Constancias:
```

```
○ Generación Masiva e Individual: Permite generar un certificado para
un estudiante específico o para todos los estudiantes de un curso con
un solo clic.
○ Plantillas Inteligentes y Configurables: Un editor de plantillas donde
el administrador puede diseñar los documentos usando "etiquetas" o
"placeholders" que el sistema reemplaza automáticamente (Ej:
$$NOMBRE_COMPLETO_ESTUDIANTE$$, $$NUMERO_DOCUMENTO$$,
$$GRADO_ACTUAL$$, $$FECHA_EXPEDICION$$).
○ Tipos de Documentos: Certificados de estudio (con o sin notas),
constancias de matrícula, certificados de conducta, paz y salvos
financieros, y cualquier otro documento que la institución necesite
estandarizar.
● Seguridad y Verificación:
○ Firma Digitalizada: El sistema puede incrustar la imagen de la firma del
rector o secretario/a.
○ Código QR de Verificación: Cada documento generado incluye un
código QR único. Al ser escaneado, dirige a una página pública de
Kampus que confirma la autenticidad del documento, su fecha de
expedición y el destinatario, combatiendo eficazmente la falsificación.
```
**3. Módulo de Cumplimiento Normativo (Reportes Oficiales)**

Esta sección está dedicada exclusivamente a la generación de los reportes exigidos
por las autoridades gubernamentales.

```
● Exportación para DANE (Formulario C600): Genera el archivo plano .txt o .csv
con la información estadística de estudiantes, docentes y sedes, siguiendo la
estructura y validaciones exactas requeridas por la plataforma del DANE.
● Exportación para SIMAT: Facilita la carga y actualización de información en el
Sistema Integrado de Matrícula.
● Reportes para Secretarías de Educación: Plantillas pre-configuradas para
los reportes de ocupación, cobertura y necesidades educativas especiales que
suelen solicitar las entidades territoriales.
● Pre-validación de Datos: Antes de generar cualquier archivo, el sistema corre
una validación interna para detectar errores comunes (ej. estudiantes sin
número de documento, fechas de nacimiento inconsistentes, etc.),
presentando un informe de "errores a corregir" para garantizar que el archivo
generado sea de alta calidad y evitar rechazos.
```
**4. Centro de Analítica Académica y de Convivencia**


Es la herramienta para que los coordinadores y el Comité de Convivencia profundicen
en los datos operativos.

```
● Reportes Académicos Avanzados:
○ Sábanas de Notas: Vista tabular completa de las calificaciones de un
curso, con promedios por estudiante y por asignatura. Se puede
exportar a Excel para un análisis más detallado.
○ Análisis Comparativo de Rendimiento: Herramienta para comparar el
rendimiento promedio entre diferentes cursos (ej. 7-A vs. 7-B), entre
diferentes asignaturas, o la evolución de un mismo curso a lo largo de
varios periodos.
○ Reporte de Rendimiento Docente: Un informe (de acceso restringido
para directivos) que muestra el rendimiento promedio de los estudiantes
agrupados por cada docente, permitiendo identificar prácticas
destacadas y necesidades de apoyo.
○ Ranking de Estudiantes: Generación de cuadros de honor por curso y
grado, con criterios personalizables (promedio simple, promedio
ponderado, etc.).
● Reportes de Convivencia y Seguimiento:
○ Perfil de Convivencia del Estudiante: Un informe consolidado que
muestra todas las anotaciones (positivas y negativas), compromisos y
seguimientos de un estudiante.
○ Análisis de Incidentes: Reportes que muestran las faltas más
recurrentes, los lugares y horas con mayor incidencia, y la correlación
entre incidentes de convivencia y el bajo rendimiento académico,
proporcionando insights clave para el Comité de Convivencia.
```
### 9. Módulo 8: Configuración y Seguridad del Sistema (Versión

### Detallada)

Este documento define la arquitectura funcional del **Módulo de Configuración y
Seguridad** , el centro de control neurálgico de la plataforma Kampus. Este módulo
transversal no es simplemente una sección de "ajustes", sino la fundación sobre la
cual se construyen la integridad, la seguridad, la personalización y la confianza de
todo el ecosistema digital de la institución. Su correcto manejo es vital para garantizar
que la plataforma opere de manera segura y se adapte perfectamente a las reglas y
necesidades específicas de cada colegio.

**9.1. Propósito y Valor Estratégico**


Mientras otros módulos gestionan el "qué" de la operación escolar (notas, asistencia,
comunicaciones), este módulo define el "quién", el "cómo" y el "porqué". Su valor es
fundamental para la sostenibilidad y la gobernanza de la plataforma.

```
● Para la Institución:
○ Soberanía y Adaptabilidad: Permite que cada institución moldee
Kampus a su imagen y semejanza. Esto va más allá de lo cosmético;
significa configurar desde la identidad visual hasta sus reglas
académicas y de negocio más complejas, como los modelos de
evaluación diferenciados para preescolar y bachillerato o las políticas
específicas de promoción. La plataforma se adapta a los procesos
probados y al PEI del colegio, no obliga al colegio a adaptarse a un
software rígido.
○ Garantía de Seguridad y Confidencialidad: Proporciona las
herramientas para proteger el activo más valioso de la institución: los
datos de su comunidad. Facilita el cumplimiento estricto de la Ley de
Protección de Datos (Ley 1581) y previene el acceso no autorizado a
información sensible como registros de salud, expedientes de
convivencia o datos familiares. Una brecha de seguridad no solo es un
riesgo legal, sino un daño profundo a la reputación y la confianza
depositada por las familias.
○ Control y Transparencia: A través de los roles y los registros de
auditoría, establece una cadena de responsabilidad clara e
inquebrantable. Cada acción crítica queda registrada, promoviendo un
uso responsable de la plataforma y facilitando la resolución de cualquier
discrepancia. Ante una duda como "¿Quién modificó esta calificación y
cuándo?", el sistema no ofrece opiniones, sino una evidencia digital
irrefutable, fomentando una cultura de rendición de cuentas.
○ Continuidad Operativa: Asegura una transición ordenada y sin traumas
entre años lectivos, un proceso que tradicionalmente es una fuente de
estrés y errores. Garantiza la preservación histórica de la información, un
requisito legal y administrativo indispensable para la generación de
certificados de exalumnos y para la consulta de trayectorias académicas
a largo plazo.
```
**9.2. Arquitectura Funcional: El Panel de Control Institucional**

Este módulo es de acceso exclusivo para los roles de más alto nivel
(Superadministrador, Administrador/Rector) y se organiza en componentes lógicos


para una gestión intuitiva.

**1. Gestión de Usuarios y Control de Acceso Basado en Roles (RBAC)**

Esta es la puerta de entrada al sistema. Define quién puede entrar y qué puede hacer
cada persona dentro de la plataforma, aplicando el principio de mínimo privilegio.

```
● Ciclo de Vida del Usuario:
○ Creación y Provisión: Los administradores pueden crear usuarios
individualmente o mediante una carga masiva desde un archivo
(CSV/XLSX). Este archivo contendría columnas como Nombre, Apellido,
Tipo_Documento, Num_Documento, Email, Rol_Asignado. Al crearse, el sistema
envía un correo de bienvenida al usuario con un enlace de activación de
un solo uso para que establezca su propia contraseña, un método
mucho más seguro que enviar contraseñas por defecto.
○ Gestión de Roles y Permisos: El núcleo del sistema RBAC. Kampus
viene con roles predefinidos (Rector, Coordinador, Secretaría, Docente,
Padre, Estudiante), cada uno con un conjunto de permisos lógicos. El
sistema permite una granularidad profunda.
■ Ejemplo de Permisos: Un Docente puede escribir notas en sus
propias planillas, pero solo puede leer la información de contacto
de los acudientes de sus alumnos. Un Coordinador puede leer las
planillas de todos los docentes de su nivel y escribir en el
observador de cualquier estudiante de ese nivel, pero no puede
modificar la configuración financiera. Una Secretaría puede crear y
editar perfiles de estudiantes, pero no tiene acceso al módulo de
evaluación de desempeño docente. Se puede crear un rol de
Psicólogo/Orientador con permiso exclusivo para leer y escribir
en una sección confidencial del perfil del estudiante, invisible para
otros roles.
○ Desactivación y Archivador de Usuarios: Cuando un usuario deja la
institución, su cuenta no se elimina, sino que se desactiva. Esto
preserva la integridad histórica de los datos (ej. qué docente registró
una nota específica hace tres años) pero bloquea completamente su
acceso al sistema. Esto es crucial para la auditoría, ya que los reportes
de años anteriores deben reflejar con precisión quién realizó cada
acción en ese momento.
```
**2. Configuración y Personalización Institucional**

Aquí es donde la institución imprime su identidad única en la plataforma, haciendo


que la experiencia sea propia y reconocible.

```
● Perfil Institucional:
○ Datos Oficiales: Una sección para registrar toda la información legal y
de contacto del colegio (Nombre completo, DANE, NIT, Resoluciones de
aprobación, dirección, teléfonos, etc.). Estos datos se usan como
"etiquetas" dinámicas ($$NOMBRE_INSTITUCION$$, $$RECTOR_NOMBRE$$,
$$RESOLUCION_APROBACION$$) que se insertan automáticamente en
todos los documentos oficiales generados por el sistema (certificados,
boletines, constancias), garantizando consistencia y profesionalismo.
● Branding y Apariencia:
○ Identidad Visual: Permite subir el logo oficial de la institución, el escudo
y un favicon. Estos elementos aparecerán en el portal, en los
documentos PDF y en las comunicaciones por correo electrónico.
○ Personalización de Colores: Opción para seleccionar un color primario
y secundario que se aplicará a los encabezados, botones y enlaces del
portal, alineando la apariencia de Kampus con los colores institucionales
y mejorando la adopción por parte de los usuarios al sentirse en un
entorno familiar.
● Configuración de Notificaciones: Permite al administrador personalizar los
textos de las notificaciones automáticas (emails y push) que envía el sistema.
En lugar de un genérico "Nueva calificación publicada", la institución puede
configurarlo como: "Estimada familia, el profesor(a) $$DOCENTE_NOMBRE$$ ha
publicado una nueva calificación en la asignatura de $$ASIGNATURA_NOMBRE$$
para su hijo(a) $$ESTUDIANTE_NOMBRE$$. Puede consultarla en el portal
Kampus."
```
**3. Gestión de Años Lectivos (El Ciclo de Vida Académico)**

Este es un proceso crítico y de alta responsabilidad que asegura la transición
ordenada de un año escolar al siguiente.

```
● Asistente Guiado para el Cierre de Año: Para minimizar errores, el proceso
se realiza a través de un asistente paso a paso:
```
1. **Diagnóstico y Pre-cierre:** El sistema realiza una auditoría automática
    para detectar inconsistencias que impidan el cierre (ej. planillas sin notas
    definitivas, estudiantes sin estado final, asignaturas sin docente
    asignado). Presenta un informe de "pendientes" con enlaces directos
    para solucionar cada problema.
2. **Simulación de Promoción:** Basado en los criterios definidos en el SIEE,
    el sistema ejecuta una simulación del proceso de promoción en un


```
"modo borrador". Presenta un reporte detallado para que el Consejo
Académico lo revise y apruebe. Este paso no altera ningún dato real y
permite hacer correcciones antes del proceso final.
```
3. **Ejecución y Archivado:** Una vez confirmado por el administrador (con
    una doble verificación de seguridad, como ingresar la contraseña de
    nuevo o un código de un solo uso), el sistema ejecuta la promoción final,
    cambia el estado de los estudiantes y **archiva toda la información del**
    **año lectivo en un modo de solo lectura**. Esto garantiza que los
    registros históricos no puedan ser alterados, cumpliendo con los
    requisitos de conservación documental.
4. **Creación del Nuevo Año Lectivo:** Se crea el nuevo año (ej. "2026"), se
    migran los perfiles de los estudiantes promovidos a sus nuevos grados y
    se habilita la plataforma para las nuevas configuraciones académicas
    (periodos, SIEE, horarios, etc.), dejando todo listo para el nuevo ciclo de
    matrículas.
**4. Auditoría y Seguridad del Sistema**

Este componente es el guardián silencioso de la plataforma, registrando cada acción
y protegiendo el sistema contra amenazas.

```
● Registro de Auditoría (Logs) Detallado:
○ Qué se Registra: El sistema captura un registro detallado de eventos
críticos, incluyendo: inicios de sesión (exitosos y fallidos, con dirección
IP), cambios de contraseña, creación/modificación/desactivación de
usuarios, cualquier cambio en una calificación (con el valor anterior y el
nuevo), acceso a reportes sensibles, exportación de datos, y cualquier
modificación en la configuración del sistema.
○ Interfaz de Consulta: Un potente motor de búsqueda y filtrado que
permite a los administradores investigar incidentes. Por ejemplo, pueden
buscar "todas las acciones realizadas por el usuario
'coordinador_academico' en el perfil del estudiante 'Juan Pérez' durante
la última semana", y el sistema devolverá una línea de tiempo detallada
de cada acción.
● Políticas de Seguridad Configurables:
○ Complejidad de Contraseñas: El administrador puede definir los
requisitos mínimos para las contraseñas de los usuarios (longitud, uso
de mayúsculas, números, símbolos).
○ Autenticación de Dos Factores (2FA): Se puede hacer obligatoria la
2FA (vía app de autenticación o email) para los roles administrativos,
```

añadiendo una capa de seguridad crítica contra el robo de credenciales.
○ **Gestión de Sesiones Activas:** Permite a un administrador ver todas las
sesiones activas en la plataforma (usuario, IP, navegador, hora de inicio)
y cerrar remotamente la sesión de un usuario si se sospecha de un
acceso no autorizado o si un dispositivo ha sido extraviado.
○ **Restricción por IP:** Para una seguridad máxima, se puede configurar
que los roles administrativos solo puedan iniciar sesión desde un rango
de direcciones IP predefinidas (ej. las de la red del colegio).
● **Gestión de Copias de Seguridad (Backups):**
○ **Backups Automáticos:** El sistema realiza copias de seguridad
incrementales diarias y una copia completa semanal de toda la base de
datos, almacenadas en una ubicación geográfica diferente para la
recuperación ante desastres.
○ **Backups Manuales:** El administrador puede ver el estado de las últimas
copias de seguridad automáticas y, si es necesario, iniciar una copia de
seguridad manual antes de realizar cambios críticos en el sistema, como
la ejecución del cierre de año, creando un punto de restauración seguro.


