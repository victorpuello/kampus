# **Especificaciones Técnicas, Jurídicas y Funcionales para la Estructuración y Gestión Digital del Observador del Estudiante en el Sistema Educativo Público de Colombia**

## **Resumen Ejecutivo**

La transformación digital del Estado colombiano ha permeado los estamentos educativos, exigiendo una reingeniería de los instrumentos de seguimiento pedagógico y disciplinario. El presente informe de investigación despliega un análisis exhaustivo sobre la naturaleza, contenido obligatorio y gestión tecnológica del "Observador del Estudiante" en instituciones educativas públicas. Este documento, lejos de constituir un registro anecdótico marginal, se erige como la pieza central del debido proceso escolar, la garantía de derechos fundamentales y la fuente primaria de información para la toma de decisiones pedagógicas y de política pública.

A través de un recorrido por la jurisprudencia de la Corte Constitucional, la Ley General de Educación (Ley 115 de 1994), el Sistema Nacional de Convivencia Escolar (Ley 1620 de 2013\) y los mandatos de Gobierno Digital, este reporte establece que el software de gestión académica no es una mera herramienta de digitación, sino un garante de derechos. Se detallan las especificaciones funcionales críticas, tales como la interoperabilidad con ecosistemas nacionales (SIMAT, SIUCE), la gestión de datos sensibles bajo la Ley 1581 de 2012, la arquitectura de seguridad para la preservación de la prueba digital y las capacidades operativas en entornos de conectividad limitada típicos de la geografía nacional.

## **1\. El Ecosistema Jurídico-Pedagógico del Seguimiento Escolar en Colombia**

La comprensión profunda del Observador del Estudiante requiere trascender su materialidad física o digital para entenderlo como un nodo donde convergen múltiples dimensiones del derecho educativo y administrativo. En el contexto colombiano, la vigilancia y control del proceso formativo no es discrecional, sino reglada, y su digitalización impone desafíos hermenéuticos sobre cómo traducir la norma escrita en código binario y flujos de trabajo automatizados.

### **1.1. Fundamentación Constitucional y el Debido Proceso**

La piedra angular sobre la que reposa la legitimidad de cualquier sistema de registro escolar es el Artículo 29 de la Constitución Política de Colombia, que consagra el derecho fundamental al debido proceso. Este mandato, aplicable a toda actuación judicial y administrativa, ha sido extensamente desarrollado por la Corte Constitucional en el ámbito educativo. Sentencias recientes, como la T-529 de 2024 y la T-330 de 2024 1, reiteran que los manuales de convivencia y los procedimientos disciplinarios no pueden operar al margen de las garantías procesales.

El Observador del Estudiante actúa, en la práctica jurídica, como el expediente procesal del alumno. Su contenido no puede limitarse a la acumulación de faltas, pues ello vulneraría la presunción de inocencia y el derecho a la defensa. Un sistema de gestión que permita la imposición de sanciones sin el registro previo de los descargos del estudiante, o que impida la controversia de la prueba, es un sistema inconstitucional. La jurisprudencia (Sentencia T-168 de 2022\) ha sido enfática en señalar que la ausencia de un procedimiento reglado y registrado constituye una vía de hecho.3

Por tanto, la transición hacia plataformas de software en el sector público debe garantizar que la arquitectura de la información impida la arbitrariedad. No se trata simplemente de digitalizar un formulario, sino de codificar reglas de negocio que obliguen al cumplimiento de etapas procesales: notificación, formulación de cargos, descargos, práctica de pruebas y fallo motivado. La omisión de cualquiera de estas etapas en el registro digital podría derivar en la nulidad de las actuaciones y en responsabilidad patrimonial para el Estado.

### **1.2. El Mandato de la Evaluación Integral (Ley 115 y Decreto 1860\)**

La Ley 115 de 1994 y su decreto reglamentario 1860 establecen que la evaluación en Colombia es continua, integral, cualitativa y se expresa en informes descriptivos. El Artículo 50 del Decreto 1860 define la evaluación como un análisis del desarrollo del estudiante en sus dimensiones personal, social y académica.4 Esto transforma el Observador del Estudiante en una herramienta pedagógica holística.

Históricamente, el observador se ha sesgado hacia lo punitivo. Sin embargo, la norma exige que este instrumento capture también los avances, los talentos excepcionales y las fortalezas del educando.6 Un software diseñado para el sector público debe, en consecuencia, incluir módulos obligatorios de valoración positiva y seguimiento al desarrollo humano, evitando convertirse en un simple registro criminalístico escolar. La funcionalidad tecnológica debe inducir al docente a registrar la integralidad del ser, equilibrando la balanza entre la sanción y el estímulo, tal como lo demandan los Proyectos Educativos Institucionales (PEI) modernos.

### **1.3. La Ley 1620 de 2013: Un Cambio de Paradigma en la Gestión de la Información**

La promulgación de la Ley 1620 de 2013 y su Decreto Reglamentario 1965 de 2013 introdujo una taxonomía estricta para las situaciones que afectan la convivencia escolar, clasificándolas en Tipo I, Tipo II y Tipo III.4 Esta clasificación no es meramente semántica; tiene implicaciones profundas en los protocolos de atención y en el flujo de datos.

* **Situaciones Tipo I:** Conflictos manejados inadecuadamente y situaciones esporádicas.  
* **Situaciones Tipo II:** Acoso escolar (bullying), ciberacoso y agresiones repetidas o sistemáticas.  
* **Situaciones Tipo III:** Presuntos delitos contra la libertad, integridad y formación sexual, o agresiones que generan incapacidad médica.

El software que administre el observador debe incorporar esta lógica jurídica en su núcleo. No puede permitir que un docente califique una agresión física con incapacidad (Tipo III) como un simple "mal comportamiento" (Tipo I). El sistema debe contar con validaciones que, basadas en las variables ingresadas (daño físico, sistematicidad, presunto delito), sugieran o impongan la clasificación correcta y activen las rutas de atención obligatorias, como el reporte al ICBF o a la Policía de Infancia y Adolescencia.10

### **1.4. Protección de Datos y Habeas Data (Ley 1581 de 2012\)**

El tratamiento de información en el entorno escolar involucra, por definición, datos de niñas, niños y adolescentes (NNA), los cuales gozan de una protección constitucional reforzada. La Ley Estatutaria 1581 de 2012 establece que el tratamiento de datos de menores está proscrito salvo que sea de naturaleza pública o responda y respete el interés superior del niño.12

El Observador del Estudiante es un repositorio de datos sensibles: información de salud física y mental, orientación sexual (en casos de discriminación), pertenencia étnica, situación socioeconómica y antecedentes disciplinarios. La digitalización de estos expedientes eleva el riesgo de fuga de información y acceso no autorizado. Las plataformas tecnológicas deben implementar medidas de seguridad robustas, cifrado de bases de datos y controles de acceso granulares para cumplir con el principio de responsabilidad demostrada (accountability). Además, deben gestionar el ciclo de vida del dato, garantizando el derecho al olvido y la depuración de sanciones una vez cumplidos sus fines pedagógicos y términos de caducidad.14

## ---

**2\. Anatomía Documental: Contenidos Obligatorios del Observador del Estudiante**

El diseño de la estructura de datos del Observador del Estudiante no debe dejarse al azar ni a la costumbre. Debe responder a una arquitectura de información que satisfaga los requerimientos de identificación, caracterización, seguimiento y legalidad. A continuación, se presenta un desglose detallado de los campos y módulos que deben conformar este expediente digital en las instituciones públicas.

### **2.1. Módulo de Identificación y Caracterización Sociodemográfica**

Este módulo constituye la "verdad oficial" sobre la identidad del estudiante y debe estar sincronizado, preferiblemente, con el Sistema Integrado de Matrícula (SIMAT) para evitar inconsistencias en la certificación.

| Categoría de Datos | Campos Específicos Requeridos | Justificación Normativa y Funcional |
| :---- | :---- | :---- |
| **Identificación Plena** | • Nombres y Apellidos (Exactos según documento). • Tipo de Documento (RC, TI, CC, CE, NES, PEP, PPT). • Número de Identificación. • Fecha y Lugar de Nacimiento (País, Depto, Municipio). • Edad (Cálculo dinámico). | Fundamental para la unicidad del registro. La inclusión de documentos como el PPT (Permiso por Protección Temporal) es crítica para la cobertura de población migrante venezolana en el sector público.16 |
| **Ubicación y Contacto** | • Dirección de residencia (Normalizada). • Barrio / Vereda / Corregimiento. • Estrato socioeconómico. • Teléfonos de contacto (Móvil, Fijo). • Correo electrónico institucional y personal. | Necesario para la georreferenciación de rutas escolares y focalización de subsidios. Los datos de contacto son vitales para las notificaciones legales del debido proceso.3 |
| **Caracterización Diferencial** | • Sexo Biológico. • Identidad de Género (Opcional/Sensible). • Grupo Étnico (Indígena, Afro, Raizal, ROM). • Población Víctima del Conflicto. • Discapacidad o Talentos Excepcionales. | Requerido para los reportes al SIUCE y para la implementación de los PIAR (Planes Individuales de Ajustes Razonables) en el marco de la educación inclusiva.11 |
| **Seguridad Social** | • Entidad de Salud (EPS/ARS/SISBEN). • Grupo Sanguíneo y RH. • IPS de atención primaria. | Vital para la atención de emergencias y accidentes escolares. |

### **2.2. Módulo de Entorno Familiar y Acudientes**

La Ley 1098 de 2006 establece la corresponsabilidad de la familia. El software debe permitir mapear la estructura familiar, identificando claramente quién tiene la patria potestad y la custodia legal.

* **Datos de Padres y Cuidadores:** Nombres, identificación, ocupación, nivel educativo (importante para análisis de contexto sociocultural).  
* **Acudiente Legal:** Distinción clara entre padre biológico y acudiente responsable ante la institución.  
* **Restricciones Legales:** Campos para registrar medidas de protección, órdenes de alejamiento o restricciones de custodia emitidas por ICBF o juzgados de familia. Este es un dato de alta sensibilidad que alerta a portería y coordinación sobre a quién **no** se debe entregar el menor.

### **2.3. Módulo de Seguimiento Académico y Pedagógico**

Más allá de las calificaciones cuantitativas (que suelen reposar en otro módulo o software), el observador debe contener la narrativa cualitativa del proceso de aprendizaje.

* **Estilos y Ritmos de Aprendizaje:** Registro de observaciones sobre cómo aprende el estudiante (visual, kinestésico, auditivo), insumo clave para el diseño universal de aprendizaje (DUA).18  
* **Seguimiento a Compromisos Académicos:** Registro de las Comisiones de Evaluación y Promoción. No basta con la nota "Reprobó"; el observador debe contener el acta de compromiso de nivelación, las estrategias de apoyo ofrecidas y el cumplimiento de las mismas.7  
* **Talentos y Habilidades:** Espacio para documentar participación en grupos deportivos, artísticos, científicos o de liderazgo (Personeros, Contralores Estudiantiles).

### **2.4. Módulo de Convivencia y Disciplina (Bitácora Legal)**

Este es el núcleo transaccional más complejo y riesgoso. Debe estructurarse como un expediente judicial digital.

1. **Registro de Hechos (La Noticia Disciplinaria):**  
   * **Contexto:** Fecha, hora exacta y lugar específico (ej. "Baño del bloque B", "Clase virtual").  
   * **Narrativa de los Hechos:** Campo de texto para la descripción objetiva de lo sucedido. *El software debe incluir ayudas o "prompts" que sugieran una redacción descriptiva y no valorativa (evitar "el alumno fue grosero", preferir "el alumno utilizó las palabras X e Y")*.  
   * **Personas Involucradas:** Identificación de presuntos agresores, presuntas víctimas y testigos. El sistema debe permitir vincular estudiantes matriculados.11  
2. **Tipificación de la Falta:**  
   * Clasificación según Manual de Convivencia (Leve, Grave, Gravísima).  
   * Clasificación según Ley 1620 (Tipo I, II, III).8  
3. **Garantía del Debido Proceso (Campos Obligatorios):**  
   * **Versión Libre y Espontánea (Descargos):** Campo obligatorio e ineludible. El sistema no debe permitir avanzar o sancionar si este campo está vacío. Debe soportar la carga de archivos adjuntos (fotos de cartas manuscritas, audios) para garantizar el derecho a ser escuchado.2  
   * **Notificación a Acudientes:** Registro de la comunicación enviada a la familia (correo, citación) y la respuesta de estos.  
4. **Gestión de Pruebas:** Repositorio digital seguro para almacenar evidencias: capturas de pantalla de ciberacoso, fotografías de daños materiales, informes de docentes.  
5. **Decisión y Seguimiento:**  
   * **Medida Pedagógica o Sanción:** Selección de la medida correctiva aplicada, fundamentada en el artículo específico del manual de convivencia.  
   * **Compromisos:** Acuerdos de cambio conductual con fechas de revisión.  
   * **Remisiones:** Registro de la derivación a Orientación Escolar, Coordinación, Rectoría o entidades externas (ICBF, Policía).

## ---

**3\. Funciones Críticas del Software de Gestión para Instituciones Públicas**

El software que administre el Observador del Estudiante en el sector oficial debe responder a realidades operativas complejas: alto volumen de estudiantes, rotación docente, infraestructura tecnológica heterogénea y requisitos estrictos de reporte a entes de control. A continuación, se detallan las funcionalidades indispensables que debe ofrecer la solución tecnológica.

### **3.1. Interoperabilidad y Ecosistema de Datos Nacional**

El aislamiento de la información es ineficiente y riesgoso. El software debe actuar como un nodo integrado al ecosistema educativo nacional.

#### **A. Integración con SIMAT (Sistema Integrado de Matrícula)**

El SIMAT es la fuente oficial de la matrícula en Colombia. El software de gestión del observador debe tener la capacidad de **sincronizarse bidireccionalmente** o, como mínimo, permitir la importación masiva de estructuras de datos compatibles con los Anexos 6A y 6B del SIMAT.16

* **Funcionalidad Requerida:** Carga de archivos planos (.txt o.csv) generados por SIMAT para crear o actualizar automáticamente las hojas de vida de los estudiantes. Esto evita errores de digitación en nombres y documentos de identidad, asegurando la integridad de los certificados.  
* **Validación de Estados:** El sistema debe reconocer y gestionar los estados de matrícula (Matriculado, Retirado, Desertor, Trasladado). Si un estudiante figura como "Retirado" en SIMAT, el software debe bloquear la creación de nuevas anotaciones disciplinarias pero mantener el histórico disponible para consulta (archivo pasivo).20

#### **B. Reporte Automatizado al SIUCE**

El Sistema de Información Unificado de Convivencia Escolar (SIUCE) exige el reporte detallado de situaciones Tipo II y III, violencia sexual, consumo de SPA y embarazo adolescente.

* **Funcionalidad Requerida:** El software debe contar con un módulo de "Exportación SIUCE" que mapee los campos internos del observador con las variables oficiales del Ministerio de Educación (ej. código de la agresión, rol del agresor, ámbito de ocurrencia) y genere los reportes planos o se conecte vía API (si está disponible) para la transmisión de datos.17  
* **Alertas de Obligatoriedad:** El sistema debe impedir el cierre de un caso tipificado como "Acoso Escolar" sin que se hayan diligenciado los campos mínimos requeridos por el SIUCE, garantizando así la calidad del dato y el cumplimiento de la obligación legal de reporte.11

### **3.2. Gestión del Flujo de Trabajo Disciplinario (Workflow del Debido Proceso)**

El software no puede ser un simple repositorio pasivo; debe ser un **asistente procesal** que guíe al docente y directivo en el cumplimiento de la ley.

#### **A. Asistente de Tipificación Inteligente**

Dada la complejidad de la Ley 1620, el software debe ofrecer ayudas para la correcta clasificación de las faltas.

* **Lógica de Negocio:** Al ingresar una falta, el sistema debe presentar un árbol de decisión. *Ejemplo:* Si el usuario selecciona "Agresión", el sistema pregunta: "¿Existe daño físico?" \-\> Sí. "¿Genera incapacidad médica?" \-\> Sí. \-\> El sistema clasifica automáticamente como **Tipo III** y muestra una alerta: "Atención: Este caso requiere denuncia penal y reporte inmediato a Policía de Infancia. No es conciliable".8

#### **B. Trazabilidad y Control de Términos**

* **Cronograma de Procesos:** El sistema debe calcular y alertar sobre los términos procesales establecidos en el Manual de Convivencia. Si el manual otorga 3 días hábiles para presentar descargos, el software debe enviar una alerta al estudiante y al acudiente, y bloquear el fallo hasta que se cumpla el plazo o se registren los descargos.  
* **Caducidad de la Acción:** El software debe implementar reglas de caducidad (ej. 5 años) para la acción disciplinaria, archivando o prescribiendo procesos que no se resolvieron a tiempo, conforme a los principios del derecho administrativo sancionatorio aplicable.14

### **3.3. Accesibilidad y Operatividad en Entornos Desafiantes**

La realidad de muchas instituciones públicas incluye sedes rurales con conectividad intermitente o nula.

#### **A. Funcionalidad Offline y Sincronización**

* **Aplicativo Móvil/Escritorio Híbrido:** Es imperativo que el software disponga de una aplicación (App) o cliente ligero que permita a los docentes consultar listados y registrar observaciones (asistencia, anotaciones rápidas) en modo **desconectado (offline)**.  
* **Sincronización Inteligente:** Una vez el dispositivo detecta conexión a internet, debe sincronizar los datos con el servidor central, resolviendo conflictos de edición mediante marcas de tiempo (timestamps) precisas.22

#### **B. Interfaz de Usuario (UX) Optimizada**

* **Diseño Responsivo:** La interfaz debe adaptarse fluidamente a dispositivos móviles (celulares de gama media), tabletas y computadores de escritorio, facilitando el trabajo de campo de coordinadores y orientadores.  
* **Dictado por Voz:** Incorporar funcionalidades de *speech-to-text* para permitir a los docentes dictar las observaciones narrativas, agilizando el registro y fomentando descripciones más detalladas.

### **3.4. Comunicación y Participación de la Comunidad**

El observador debe dejar de ser un documento secreto para convertirse en un canal de comunicación transparente, respetando la privacidad.

* **Portal de Padres y Estudiantes:** Acceso web y móvil para que los acudientes consulten en tiempo real las anotaciones (positivas y negativas), asistencia y compromisos.  
* **Firma Digital y Notificación Electrónica:** Capacidad de capturar la aceptación o "enterado" de las anotaciones mediante mecanismos de firma digital simple (token enviado al correo/SMS) o firma biométrica en pantalla táctil. Esto otorga validez jurídica a la notificación.25

## ---

**4\. Requerimientos No Funcionales: Seguridad, Privacidad y Arquitectura**

La robustez técnica y legal del sistema es tan importante como sus funciones visibles. El manejo de datos sensibles de menores exige estándares superiores de seguridad informática.

### **4.1. Seguridad de la Información y Cadena de Custodia**

Para que el observador digital tenga valor probatorio ante un juez, se debe garantizar la integridad e inmutabilidad de los datos.

* **Integridad de los Registros (Hashing/Blockchain):** Una vez una observación disciplinaria ha sido cerrada y firmada, el sistema debe "sellarla" criptográficamente. No debe ser posible modificar el texto original sin dejar rastro. Cualquier corrección debe realizarse mediante una **nota aclaratoria** posterior que haga referencia al registro original, nunca sobrescribiéndolo. Esto simula la inalterabilidad del folio físico y es crucial en auditorías forenses.26  
* **Auditoría Completa (Logs):** El sistema debe registrar cada evento: inicio de sesión, visualización de un registro sensible, intento de edición no autorizado, impresión de reportes. Este *log* debe ser accesible solo para el administrador de seguridad o auditoría.

### **4.2. Gestión de Privacidad y Roles (RBAC)**

El principio de "necesidad de saber" debe regir el acceso a la información.

* **Matriz de Roles Granular:**  
  * **Docente de Asignatura:** Acceso de lectura/escritura solo a los estudiantes de sus grupos actuales. Visualización limitada de antecedentes históricos sensibles (ej. no debería ver detalles de una remisión por abuso sexual de años anteriores, salvo alerta genérica de manejo).  
  * **Orientador Escolar:** Acceso a módulo de Orientación con privilegios de **sigilo profesional**. Las notas clínicas o psicosociales deben estar segregadas y cifradas, visibles solo para el equipo psicosocial y autoridades competentes, no para el cuerpo docente general.28  
  * **Coordinador/Rector:** Acceso supervisiorio integral.  
* **Anonimización de Datos:** Para la generación de reportes estadísticos y analítica de convivencia (mapas de calor de bullying), el software debe tener la capacidad de anonimizar los nombres de los estudiantes, cumpliendo con los lineamientos del DANE y la Ley 1581 sobre protección de datos en estadística.30

### **4.3. Retención Documental y Depuración (TRD)**

El software debe alinearse con la política de gestión documental del Estado.

* **Ciclo de Vital del Dato:** Configuración de tiempos de retención basados en las Tablas de Retención Documental (TRD) de la institución.  
  * *Archivo de Gestión:* Observador activo mientras el estudiante está matriculado.  
  * *Archivo Central:* Retención por el tiempo legal (ej. 5-10 años) tras el grado o retiro.  
  * *Eliminación Segura:* Procedimientos automatizados para la eliminación de datos que han cumplido su tiempo de retención y carecen de valor histórico, o su transferencia al archivo histórico permanente (microfilmación digital/PDF/A).32  
* **Derecho al Olvido Escolar:** Mecanismos para que sanciones menores caduquen y dejen de ser visibles en los reportes de antecedentes del estudiante después de un tiempo determinado, favoreciendo la función pedagógica y no estigmatizante de la educación.

## ---

**5\. Estrategias de Implementación y Gestión del Cambio**

La adopción de un software de esta naturaleza en el sector público no es solo un reto técnico, sino cultural.

### **5.1. Capacitación y Apropiación**

Es necesario un plan de capacitación robusto que no se centre solo en "dónde hacer clic", sino en la **cultura del registro**. Los docentes deben ser formados en redacción objetiva y técnica para evitar que sus anotaciones sean desestimadas por subjetivas o vulneradoras de derechos. El software puede apoyar esto mediante bancos de frases preaprobadas o sugerencias de redacción pedagógica.

### **5.2. Infraestructura y Soporte**

Las Secretarías de Educación deben garantizar que la implementación del software vaya acompañada de la dotación mínima (tabletas para coordinadores, conectividad en salas de profesores) y un canal de soporte técnico ágil. Un software potente sin hardware adecuado generará frustración y rechazo en la comunidad educativa.

### **5.3. Actualización Permanente del PEI y Manual de Convivencia**

La implementación del observador digital exige la actualización del Manual de Convivencia para darle piso jurídico a las notificaciones electrónicas, las firmas digitales y los procedimientos mediados por TIC. El Consejo Directivo debe aprobar estas modificaciones para que lo que ocurre en el software tenga plena validez reglamentaria.35

## **6\. Conclusión**

El Observador del Estudiante digitalizado representa la evolución necesaria de la administración escolar en Colombia. Su correcta implementación, a través de un software que integre los mandatos de la Ley 1620, el debido proceso constitucional y la protección de datos de la Ley 1581, tiene el potencial de transformar la convivencia escolar. Pasa de ser un mecanismo reactivo y sancionatorio a convertirse en un sistema de inteligencia pedagógica que permite identificar alertas tempranas, proteger derechos y garantizar trayectorias educativas completas.

Para las instituciones públicas, la exigencia no es solo adquirir tecnología, sino adoptar una herramienta que materialice los principios de transparencia, eficiencia y garantía de derechos que rigen la función pública educativa. El software ideal es aquel que se hace invisible en su operación pero contundente en su respaldo legal y pedagógico.

## ---

**Apéndice: Tabla Comparativa de Funcionalidades vs. Normativa**

| Requisito Normativo / Jurídico | Funcionalidad de Software Requerida | Referencia Legal Clave |
| :---- | :---- | :---- |
| **Debido Proceso y Defensa** | Campo obligatorio de "Descargos" y carga de evidencias. Bloqueo de sanción sin defensa. | Constitución Art. 29, Sentencia T-330/24 |
| **Clasificación de Faltas** | Asistente de tipificación (Tipo I, II, III) con lógica de validación automática. | Ley 1620 de 2013, Decreto 1965 |
| **Reporte a Entes de Control** | Módulo de exportación SIUCE (Variables y Archivos Planos). | Ley 1620, Directivas MEN |
| **Unicidad de la Información** | Integración/Sincronización con SIMAT (Carga de Anexos 6A/6B). | Res. 166 de 2017 (SIMAT) |
| **Protección de Datos Sensibles** | Roles y permisos granulares (Sigilo Orientación), Cifrado de DB. | Ley 1581 de 2012 (Habeas Data) |
| **Gestión Documental** | Retención automática, Archivo Histórico Digital, Eliminación Segura. | Ley 594 de 2000, Acuerdos AGN |
| **Corresponsabilidad Parental** | Portal de Padres, Notificaciones Email/SMS, Firma Digital. | Ley 1098 de 2006 (Infancia) |
| **Inmutabilidad de la Prueba** | Logs de auditoría inalterables, Hashing de registros cerrados. | Código General del Proceso (Prueba Digital) |

#### **Fuentes citadas**

1. Sentencia T-529 de 2024 Corte Constitucional de Colombia, acceso: diciembre 26, 2025, [https://sisjur.bogotajuridica.gov.co/sisjur/normas/Norma1.jsp?i=176297](https://sisjur.bogotajuridica.gov.co/sisjur/normas/Norma1.jsp?i=176297)  
2. Sentencia T-330 de 2024 \- Corte Constitucional, acceso: diciembre 26, 2025, [https://www.corteconstitucional.gov.co/relatoria/2024/t-330-24.htm](https://www.corteconstitucional.gov.co/relatoria/2024/t-330-24.htm)  
3. Sentencia T-168 de 2022 Corte Constitucional de Colombia \- Secretaría General de la Alcaldía Mayor de Bogotá, acceso: diciembre 26, 2025, [https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=127583](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=127583)  
4. MANUAL DE CONVIVENCIA ESCOLAR El Consejo Directivo del Colegio Class IED, en uso de sus atribuciones legales y las que le confie \- Red Académica, acceso: diciembre 26, 2025, [https://www.redacademica.edu.co/sites/default/files/2021-12/Manual%20de%20Convivencia%20a%C3%B1o%202018.pdf](https://www.redacademica.edu.co/sites/default/files/2021-12/Manual%20de%20Convivencia%20a%C3%B1o%202018.pdf)  
5. Manual de Convivienca | INSTITUCION EDUCATIVA LA BALSA, Vereda la Balsa, vía Caobos, Chía, acceso: diciembre 26, 2025, [https://institucioneducativalabalsa.edupage.org/a/manual-de-convivienca](https://institucioneducativalabalsa.edupage.org/a/manual-de-convivienca)  
6. PEI 2022.pdf \- Tecnico Piloto, acceso: diciembre 26, 2025, [https://www.tecnicopiloto.edu.co/sites/default/files/DOCUMENTOS\_PUBLICOS/2022-06/PEI%202022.pdf](https://www.tecnicopiloto.edu.co/sites/default/files/DOCUMENTOS_PUBLICOS/2022-06/PEI%202022.pdf)  
7. SISTEMA INSTITUCIONAL DE EVALUACIÓN (SIEE) 2021-2022 \- Colegio La Salle Envigado, acceso: diciembre 26, 2025, [https://salleenvigado.edu.co/images/2023/PEI/SIEE\_COMPLETO.pdf](https://salleenvigado.edu.co/images/2023/PEI/SIEE_COMPLETO.pdf)  
8. Situaciones Tipo I, II, III | PDF | Acoso cibernético | Internet \- Scribd, acceso: diciembre 26, 2025, [https://es.scribd.com/document/398359785/Situaciones-Tipo-I-II-III](https://es.scribd.com/document/398359785/Situaciones-Tipo-I-II-III)  
9. Convivencia escolar \- Institución Educativa EL ROSARIO DE BELLO, acceso: diciembre 26, 2025, [https://elrosariodebello.edu.co/Post.aspx?Id=105](https://elrosariodebello.edu.co/Post.aspx?Id=105)  
10. ICBF \- Convivencia escolar, acceso: diciembre 26, 2025, [https://www.icbf.gov.co/sites/default/files/abc\_-\_convivencia\_escolar.pdf](https://www.icbf.gov.co/sites/default/files/abc_-_convivencia_escolar.pdf)  
11. Manual usuario SIUCE \- sedboyaca.gov., acceso: diciembre 26, 2025, [http://sedboyaca.gov.co/wp-content/uploads/2023/07/manual-SIUCE-rol-establ-educ.pdf](http://sedboyaca.gov.co/wp-content/uploads/2023/07/manual-SIUCE-rol-establ-educ.pdf)  
12. LEY ESTATUTARIA 1581 DE 2012 (Octubre 17\) Reglamentada parcialmente por el Decreto Nacional 1377 de 2013\. Por la cual se dictan \- ESDEG, acceso: diciembre 26, 2025, [https://esdegue.edu.co/sites/default/files/Normatividad/LEY%20TRATAMIENTO%20DE%20DATOS%20-%20LEY%201581%20DE%202012.pdf](https://esdegue.edu.co/sites/default/files/Normatividad/LEY%20TRATAMIENTO%20DE%20DATOS%20-%20LEY%201581%20DE%202012.pdf)  
13. LEY 1581 DE 2012 \- SUIN-Juriscol, acceso: diciembre 26, 2025, [https://www.suin-juriscol.gov.co/viewDocument.asp?ruta=Leyes/1684507](https://www.suin-juriscol.gov.co/viewDocument.asp?ruta=Leyes/1684507)  
14. Reglamento Disciplinario Estudiantil de la Universidad Industrial de Santander, acceso: diciembre 26, 2025, [https://uis.edu.co/wp-content/uploads/2021/10/reglamentoDisciplinarioEstudiantil.pdf](https://uis.edu.co/wp-content/uploads/2021/10/reglamentoDisciplinarioEstudiantil.pdf)  
15. Caducidad, expedientes disciplinarios y buena administración \- ACAL, acceso: diciembre 26, 2025, [https://www.acalsl.com/blog/2023/10/caducidad\_expediente\_disciplinario](https://www.acalsl.com/blog/2023/10/caducidad_expediente_disciplinario)  
16. Guía para el reporte a sistemas de información DUE – SIMAT – EVI \- Ministerio de Educación Nacional, acceso: diciembre 26, 2025, [https://www.mineducacion.gov.co/1759/articles-369048\_recurso\_1.pdf](https://www.mineducacion.gov.co/1759/articles-369048_recurso_1.pdf)  
17. Manual de usuario SIUCE, acceso: diciembre 26, 2025, [https://www.camara.gov.co/wp-content/uploads/2025/10/control\_politico/Respuestas/7245/anexo\_rta\_mineducacion\_proposicion\_005\_2020-ce1a8a5a.pdf](https://www.camara.gov.co/wp-content/uploads/2025/10/control_politico/Respuestas/7245/anexo_rta_mineducacion_proposicion_005_2020-ce1a8a5a.pdf)  
18. 1\. Reconociendo a mis estudiantes Contenido \- Colombia Aprende, acceso: diciembre 26, 2025, [https://www.colombiaaprende.edu.co/sites/default/files/files\_public/2022-08/Reconociendo\_a\_mis\_estudiantes.pdf](https://www.colombiaaprende.edu.co/sites/default/files/files_public/2022-08/Reconociendo_a_mis_estudiantes.pdf)  
19. MINISTERIO DE EDUCACION NACIONAL REPÚBLICA DE COLOMBIA DOCUMENTO METODOLÓGICO DEL PROCESO ESTADÍSTICO “MATRICULA DE EDUCAC, acceso: diciembre 26, 2025, [https://www.datos.gov.co/api/views/nudc-7mev/files/25568c44-97eb-4ebd-a223-b56942a4a316?download=true\&filename=Metodolog%C3%ADa%20OE%20Matricula%20EPBM%20V3%202020.pdf](https://www.datos.gov.co/api/views/nudc-7mev/files/25568c44-97eb-4ebd-a223-b56942a4a316?download=true&filename=Metodolog%C3%ADa+OE+Matricula+EPBM+V3+2020.pdf)  
20. 202341430500004741, acceso: diciembre 26, 2025, [https://www.cali.gov.co/loader.php?lServicio=Tools2\&lTipo=descargas\&lFuncion=descargar\&idFile=74400](https://www.cali.gov.co/loader.php?lServicio=Tools2&lTipo=descargas&lFuncion=descargar&idFile=74400)  
21. SIUCE: la herramienta para registrar y hacer seguimiento a los casos que afectan la convivencia escolar | Ministerio de Educación Nacional, acceso: diciembre 26, 2025, [https://www.mineducacion.gov.co/portal/salaprensa/Comunicados/424796:SIUCE-la-herramienta-para-registrar-y-hacer-seguimiento-a-los-casos-que-afectan-la-convivencia-escolar](https://www.mineducacion.gov.co/portal/salaprensa/Comunicados/424796:SIUCE-la-herramienta-para-registrar-y-hacer-seguimiento-a-los-casos-que-afectan-la-convivencia-escolar)  
22. Lineamiento técnico Conectividad Escolar 2024 \- Ministerio de Educación Nacional, acceso: diciembre 26, 2025, [https://www.mineducacion.gov.co/1780/articles-321649\_recurso\_7.pdf](https://www.mineducacion.gov.co/1780/articles-321649_recurso_7.pdf)  
23. ¡Llega la versión completamente offline de Código Verde\! \- MinTIC, acceso: diciembre 26, 2025, [https://mintic.gov.co/colombiaprograma/847/w3-article-400073.html](https://mintic.gov.co/colombiaprograma/847/w3-article-400073.html)  
24. App móvil SINAI, acceso: diciembre 26, 2025, [https://portal.sinai.com.co/app-movil-sinai/](https://portal.sinai.com.co/app-movil-sinai/)  
25. la implementación de la firma digital en la legislación civil colombiana yeidry córdoba urbano \- Universidad Santiago de Cali, acceso: diciembre 26, 2025, [https://repositorio.usc.edu.co/bitstreams/a5f501eb-1e53-4afa-8f15-907435aa42b2/download](https://repositorio.usc.edu.co/bitstreams/a5f501eb-1e53-4afa-8f15-907435aa42b2/download)  
26. Transformación Digital | Viafirma Colombia, acceso: diciembre 26, 2025, [https://www.viafirma.com.co/transformacion-digital/](https://www.viafirma.com.co/transformacion-digital/)  
27. CASO No. 21-21-IN SEÑORA JUEZA DE LA CORTE CONSTITUCIONAL DEL ECUADOR., acceso: diciembre 26, 2025, [https://esacc.corteconstitucional.gob.ec/storage/api/v1/10\_DWL\_FL/e2NhcnBldGE6J2VzY3JpdG8nLCB1dWlkOic5NzJiZmEzOC0wOWJkLTRmZjEtODFmMy0xZGY2OWU3ZWRmYzkucGRmJ30=](https://esacc.corteconstitucional.gob.ec/storage/api/v1/10_DWL_FL/e2NhcnBldGE6J2VzY3JpdG8nLCB1dWlkOic5NzJiZmEzOC0wOWJkLTRmZjEtODFmMy0xZGY2OWU3ZWRmYzkucGRmJ30=)  
28. Roles, permisos y uso compartido de datos en Family Safety \- Soporte técnico de Microsoft, acceso: diciembre 26, 2025, [https://support.microsoft.com/es-es/account-billing/roles-permisos-y-uso-compartido-de-datos-en-family-safety-2d0764e1-5ec5-f6a1-6898-0bc18f71e318](https://support.microsoft.com/es-es/account-billing/roles-permisos-y-uso-compartido-de-datos-en-family-safety-2d0764e1-5ec5-f6a1-6898-0bc18f71e318)  
29. Acerca de los roles y permisos \- Brightspace Community \- D2L, acceso: diciembre 26, 2025, [https://community.d2l.com/brightspace-es-MX/kb/articles/9079-acerca-de-los-roles-y-permisos](https://community.d2l.com/brightspace-es-MX/kb/articles/9079-acerca-de-los-roles-y-permisos)  
30. REGULACIÓN / NORMAS Y ESTÁNDARES \- Guía para la anonimización de bases de datos en el Sistema Estadístico Nacional Agosto 2018 \- DANE, acceso: diciembre 26, 2025, [https://www.dane.gov.co/files/sen/registros-administrativos/guia-metadatos.pdf](https://www.dane.gov.co/files/sen/registros-administrativos/guia-metadatos.pdf)  
31. Guía de anonimización de datos. \- DANE, acceso: diciembre 26, 2025, [https://www.dane.gov.co/files/sen/registros-administrativos/guia-anonimizacion-datos2024.pdf](https://www.dane.gov.co/files/sen/registros-administrativos/guia-anonimizacion-datos2024.pdf)  
32. INSTITUCION EDUCATIVA EXALUMNAS DE LA PRESENTACiÓN TABLA DE RETENCION DOCUMENTAL, acceso: diciembre 26, 2025, [https://exalumnaspresentacion.edu.co/wp/wp-content/uploads/2019/05/1.-Tablas-de-Retencion-Documental-TRD.pdf](https://exalumnaspresentacion.edu.co/wp/wp-content/uploads/2019/05/1.-Tablas-de-Retencion-Documental-TRD.pdf)  
33. tabla de retención documental \- Ministerio de Educación Nacional, acceso: diciembre 26, 2025, [https://www.mineducacion.gov.co/1759/articles-351266\_tbFeb\_00.pdf](https://www.mineducacion.gov.co/1759/articles-351266_tbFeb_00.pdf)  
34. ¿Por cuánto tiempo es necesario conservar y custodiar el archivo de tu empresa? \- Servisoft, acceso: diciembre 26, 2025, [https://servisoft.co/blog/por-cuanto-tiempo-es-necesario-conservar-y-custodiar-el-archivo-de-tu-empresa/](https://servisoft.co/blog/por-cuanto-tiempo-es-necesario-conservar-y-custodiar-el-archivo-de-tu-empresa/)  
35. MANUAL DE CONVIVENCIA \- La Salle Bello, acceso: diciembre 26, 2025, [http://sallebello.edu.co/images/MANUAL\_DE\_CONVIVENCIA.pdf](http://sallebello.edu.co/images/MANUAL_DE_CONVIVENCIA.pdf)  
36. El debido proceso en los manuales de convivencia de las instituciones educativas de Pasto Due process in the behavior manuals \- Dialnet, acceso: diciembre 26, 2025, [https://dialnet.unirioja.es/descarga/articulo/8736258.pdf](https://dialnet.unirioja.es/descarga/articulo/8736258.pdf)