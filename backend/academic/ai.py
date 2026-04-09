from django.conf import settings
import logging
import json
import re
import ast
from json import JSONDecodeError
from typing import Iterator


logger = logging.getLogger(__name__)


CLASS_PLANNER_INSTITUTIONAL_CONTEXT = {
    "institution_name": "Institución Educativa Playas del Viento",
    "pedagogical_model": "social-constructivista",
    "territorial_emphasis": "turismo con articulación al entorno rural, costero, ambiental, cultural y social de Playas del Viento",
    "formative_intention": [
        "liderazgo",
        "autonomía",
        "sentido crítico",
        "compromiso social",
        "valores institucionales",
        "capacidad para transformar el entorno",
    ],
    "preferred_methodologies": [
        "aprendizaje por proyectos",
        "talleres",
        "trabajo colaborativo",
        "exposiciones",
        "guías de autoaprendizaje",
        "debates o mesas redondas",
        "dramatizaciones",
        "juegos didácticos",
        "uso de TIC",
        "actividades contextualizadas",
    ],
    "institutional_values": [
        "respeto",
        "responsabilidad",
        "honestidad",
        "solidaridad",
        "tolerancia",
        "justicia",
        "amor",
        "cuidado del medio ambiente",
    ],
    "student_profile": [
        "crítico",
        "creativo",
        "participativo",
        "emprendedor",
        "autónomo",
        "comprometido con su comunidad",
        "consciente del medio ambiente",
    ],
    "transversal_projects": [
        "democracia y derechos humanos",
        "educación ambiental",
        "cátedra de paz",
        "estilos de vida saludable",
        "educación vial",
        "educación económica y financiera",
        "emprendimiento",
        "turismo",
        "convivencia",
        "lectoescritura",
    ],
    "siee_weights": {
        "saber": 40,
        "saber_hacer": 40,
        "saber_ser": 20,
    },
    "planning_formula": "Tema + contexto local + estrategia activa + valor institucional + evidencia de saber/hacer/ser + articulación transversal",
}

try:
    import google.generativeai as genai
except ImportError:  # optional dependency
    genai = None

class AIService:
    def __init__(self):
        self.model = None

        if genai is None:
            # Allow the app to boot/tests to run without the optional Gemini SDK.
            return

        if not settings.GOOGLE_API_KEY:
            # En desarrollo permitimos instanciar sin key, pero fallará al llamar
            print("WARNING: GOOGLE_API_KEY not found in settings.")
            pass
        else:
            try:
                genai.configure(api_key=settings.GOOGLE_API_KEY)
                self.model = genai.GenerativeModel('gemini-2.5-flash')
            except Exception as e:
                print(f"Error configuring Gemini: {e}")
                self.model = None

    def _ensure_available(self):
        if genai is None:
            raise AIConfigError(
                "Gemini AI support is not installed. Add 'google-generativeai' to requirements to use this feature."
            )
        if not settings.GOOGLE_API_KEY:
            raise AIConfigError("GOOGLE_API_KEY is not configured.")
        if not self.model:
            raise AIConfigError("Gemini model not initialized. Check API Key.")

    def _extract_json_object(self, text: str) -> dict:
        cleaned = (text or "").strip()
        if not cleaned:
            raise AIParseError("Empty response from AI provider.")

        # Strip common fenced-code wrappers.
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        # Try direct JSON first.
        try:
            return json.loads(cleaned)
        except JSONDecodeError:
            pass

        # Fallback: extract the first JSON object from a mixed response.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise AIParseError("AI response did not contain a JSON object.")

        candidate = cleaned[start : end + 1]
        try:
            return json.loads(candidate)
        except JSONDecodeError as e:
            raise AIParseError(f"AI response JSON was invalid: {e}") from e

    def _build_class_planner_context(self, context: dict) -> dict:
        enriched_context = dict(context or {})
        enriched_context["institutional_guidance"] = CLASS_PLANNER_INSTITUTIONAL_CONTEXT
        return enriched_context

    def _replace_leaked_english_terms(self, text: str) -> str:
        cleaned = str(text or "").strip()
        if not cleaned:
            return ""

        replacements = [
            (r"\bmethodologies\b", "metodologías"),
            (r"\bmethodology\b", "metodología"),
            (r"\bactivities\b", "actividades"),
            (r"\bactivity\b", "actividad"),
            (r"\bevidence\b", "evidencia"),
            (r"\bresources\b", "recursos"),
            (r"\bskills\b", "habilidades"),
            (r"\bskill\b", "habilidad"),
        ]

        def _match_case(source: str, target: str) -> str:
            if source.isupper():
                return target.upper()
            if source[:1].isupper():
                return target[:1].upper() + target[1:]
            return target

        for pattern, replacement in replacements:
            cleaned = re.sub(
                pattern,
                lambda match: _match_case(match.group(0), replacement),
                cleaned,
                flags=re.IGNORECASE,
            )

        return cleaned

    def _strip_markdown_noise(self, text: str) -> str:
        cleaned = str(text or "").strip()
        if not cleaned:
            return ""

        cleaned = re.sub(r"^```(?:json|markdown|md|text)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
        cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned)
        cleaned = re.sub(r"`([^`]*)`", r"\1", cleaned)
        cleaned = re.sub(r"\r\n?", "\n", cleaned)
        return cleaned.strip()

    def _try_parse_structured_text(self, text: str):
        candidate = str(text or "").strip()
        if not candidate or candidate[0] not in "[{":
            return None

        try:
            return json.loads(candidate)
        except Exception:
            pass

        try:
            return ast.literal_eval(candidate)
        except Exception:
            return None

    def _stringify_class_planner_value(self, value) -> str:
        if value is None:
            return ""

        if isinstance(value, str):
            parsed = self._try_parse_structured_text(value)
            if parsed is not None:
                return self._stringify_class_planner_value(parsed)
            return self._strip_markdown_noise(value)

        if isinstance(value, (int, float, bool)):
            return str(value)

        if isinstance(value, dict):
            normalized_keys = {str(key).strip().lower(): item for key, item in value.items()}
            name = self._stringify_class_planner_value(
                normalized_keys.get("activity_name")
                or normalized_keys.get("name")
                or normalized_keys.get("title")
                or ""
            )
            description = self._stringify_class_planner_value(
                normalized_keys.get("activity_description")
                or normalized_keys.get("description")
                or normalized_keys.get("detail")
                or normalized_keys.get("content")
                or ""
            )
            if name and description:
                return f"{name}: {description}"
            if name:
                return name
            if description:
                return description

            fragments = [self._stringify_class_planner_value(item) for item in value.values()]
            fragments = [fragment for fragment in fragments if fragment]
            return " - ".join(fragments)

        if isinstance(value, (list, tuple, set)):
            items = [self._stringify_class_planner_value(item) for item in value]
            items = [item for item in items if item]
            if not items:
                return ""
            if len(items) == 1:
                return items[0]
            return "\n".join(f"- {item}" for item in items)

        return self._strip_markdown_noise(str(value))

    def _normalize_class_planner_payload(self, payload: dict, *, numeric_keys: set[str]) -> dict:
        normalized = dict(payload)
        for key, value in list(normalized.items()):
            if key in numeric_keys:
                continue
            normalized[key] = self._replace_leaked_english_terms(self._stringify_class_planner_value(value))
        return normalized

    def _validate_class_plan_draft_payload(self, payload: dict) -> dict:
        required = {
            "title",
            "duration_minutes",
            "learning_result",
            "dba_reference",
            "standard_reference",
            "competency_know",
            "competency_do",
            "competency_be",
            "class_purpose",
            "start_time_minutes",
            "start_activities",
            "development_time_minutes",
            "development_activities",
            "closing_time_minutes",
            "closing_activities",
            "evidence_product",
            "evaluation_instrument",
            "evaluation_criterion",
            "resources",
            "dua_adjustments",
        }
        if not isinstance(payload, dict) or not required.issubset(set(payload.keys())):
            raise AIParseError("AI response JSON missing required keys for class plan draft.")

        numeric_keys = {
            "duration_minutes",
            "start_time_minutes",
            "development_time_minutes",
            "closing_time_minutes",
        }
        for numeric_key in numeric_keys:
            try:
                payload[numeric_key] = int(payload.get(numeric_key) or 0)
            except Exception as exc:
                raise AIParseError(f"AI response key '{numeric_key}' must be numeric.") from exc

        for text_key in required - numeric_keys:
            payload[text_key] = str(payload.get(text_key) or "").strip()

        payload = self._normalize_class_planner_payload(payload, numeric_keys=numeric_keys)

        if payload["duration_minutes"] != (
            payload["start_time_minutes"]
            + payload["development_time_minutes"]
            + payload["closing_time_minutes"]
        ):
            raise AIParseError("AI response produced inconsistent timing totals for class plan draft.")

        return payload

    def _distribute_sequence_minutes(self, duration_minutes: int) -> tuple[int, int, int]:
        safe_duration = max(int(duration_minutes or 55), 15)
        start = max(10, round(safe_duration * 0.2 / 5) * 5)
        closing = max(10, round(safe_duration * 0.15 / 5) * 5)
        development = safe_duration - start - closing

        if development < 10:
            development = max(10, safe_duration - 20)
            start = 10
            closing = safe_duration - development - start

        if closing < 5:
            closing = 5
            development = safe_duration - start - closing

        return start, development, closing

    def _fallback_class_plan_draft(self, context: dict) -> dict:
        duration_minutes = int(context.get("duration_minutes") or 55)
        start_time_minutes, development_time_minutes, closing_time_minutes = self._distribute_sequence_minutes(duration_minutes)
        topic_title = str(context.get("topic_title") or context.get("title_hint") or "Clase guiada").strip() or "Clase guiada"
        subject_name = str(context.get("subject_name") or "la asignatura").strip() or "la asignatura"
        grade_name = str(context.get("grade_name") or "el grado").strip() or "el grado"
        group_name = str(context.get("group_name") or "").strip()
        period_name = str(context.get("period_name") or "el periodo actual").strip() or "el periodo actual"
        topic_description = str(context.get("topic_description") or "").strip()
        group_label = f" grupo {group_name}" if group_name else ""
        description_suffix = f" considerando {topic_description}" if topic_description else ""

        return {
            "title": topic_title,
            "duration_minutes": duration_minutes,
            "learning_result": f"Reconoce y aplica los conceptos clave de {topic_title} en {subject_name} para {grade_name}, relacionándolos con el contexto local y el trabajo colaborativo.",
            "dba_reference": f"DBA sugerido para {subject_name} en {grade_name}.",
            "standard_reference": f"Estándar básico asociado a {subject_name} para {grade_name}.",
            "competency_know": f"Identifica ideas centrales de {topic_title} y su relación con el entorno de Playas del Viento.",
            "competency_do": f"Desarrolla una actividad contextualizada sobre {topic_title} con evidencias prácticas y uso pertinente de estrategias activas.",
            "competency_be": "Participa con respeto, responsabilidad y disposición al trabajo colaborativo, cuidando el entorno y la convivencia.",
            "class_purpose": f"Orientar una sesión de {subject_name} sobre {topic_title} durante {period_name}, articulando contexto local, participación activa y formación integral.{description_suffix}",
            "start_time_minutes": start_time_minutes,
            "start_activities": f"Activación de saberes previos con preguntas orientadoras sobre {topic_title}{group_label}, vinculando experiencias del contexto local y valores institucionales.",
            "development_time_minutes": development_time_minutes,
            "development_activities": f"Desarrollo de taller colaborativo con uso de TIC o recurso contextualizado para analizar {topic_title} y aplicarlo a situaciones del entorno escolar o territorial.",
            "closing_time_minutes": closing_time_minutes,
            "closing_activities": "Cierre con socialización breve, reflexión sobre el impacto en la comunidad, verificación de aprendizajes y acuerdos de mejora.",
            "evidence_product": f"Evidencia conceptual, práctica y actitudinal sobre {topic_title}, alineada con saber, saber hacer y saber ser.",
            "evaluation_instrument": "Rúbrica analítica con criterios de saber, saber hacer y saber ser",
            "evaluation_criterion": "Básico - Comprende el tema, desarrolla la actividad propuesta y participa con responsabilidad - Rango 3.0-3.9 (durante la clase)",
            "resources": "Guía de trabajo, tablero, material visual, TIC y recursos del contexto institucional o territorial disponibles.",
            "dua_adjustments": "Instrucciones claras, apoyo visual, flexibilización en productos, múltiples formas de participación y acompañamiento según necesidades del grupo.",
        }

    def _fallback_class_plan_section(self, section: str, context: dict) -> dict:
        draft = self._fallback_class_plan_draft(context)
        section_keys = {
            "learning": ["learning_result", "dba_reference", "standard_reference", "class_purpose"],
            "competencies": ["competency_know", "competency_do", "competency_be"],
            "sequence": [
                "duration_minutes",
                "start_time_minutes",
                "start_activities",
                "development_time_minutes",
                "development_activities",
                "closing_time_minutes",
                "closing_activities",
            ],
            "evaluation": ["evidence_product", "evaluation_instrument", "evaluation_criterion"],
            "support": ["resources", "dua_adjustments"],
        }
        keys = section_keys.get(section)
        if not keys:
            raise AIParseError("Invalid class plan section requested.")
        return {key: draft[key] for key in keys}

    def generate_indicators(self, achievement_description):
        """
        Genera indicadores de desempeño (Bajo, Básico, Alto, Superior)
        basados en la descripción de un logro.
        """
        self._ensure_available()

        prompt = f"""
        Actúa como un experto pedagogo. Dado el siguiente logro académico:
        "{achievement_description}"

        Genera 4 indicadores de desempeño correspondientes a los niveles: Bajo, Básico, Alto y Superior.
        El formato de salida debe ser estrictamente un objeto JSON con las claves: "LOW", "BASIC", "HIGH", "SUPERIOR".
        Cada valor debe ser una frase descriptiva del desempeño del estudiante en ese nivel.
        
        Ejemplo de salida:
        {{
            "LOW": "Se le dificulta...",
            "BASIC": "Identifica...",
            "HIGH": "Analiza y comprende...",
            "SUPERIOR": "Propone y argumenta..."
        }}
        """

        try:
            response = self.model.generate_content(prompt)
            payload = self._extract_json_object(getattr(response, "text", "") or "")

            # Minimal sanity check: required keys.
            required = {"LOW", "BASIC", "HIGH", "SUPERIOR"}
            if not isinstance(payload, dict) or not required.issubset(set(payload.keys())):
                raise AIParseError("AI response JSON missing required keys: LOW, BASIC, HIGH, SUPERIOR.")
            return payload
        except Exception as e:
            logger.exception("Error generating indicators")
            if isinstance(e, AIServiceError):
                raise
            raise AIProviderError(str(e)) from e

    def improve_text(self, text):
        """
        Mejora la redacción y ortografía de un texto académico.
        """
        self._ensure_available()

        prompt = f"""
        Actúa como un experto corrector de estilo y pedagogo.
        Mejora la redacción y corrige la ortografía del siguiente texto, que es un logro académico o descripción educativa.
        Mantén el sentido original pero hazlo más formal, claro y pedagógico.
        Solo devuelve el texto mejorado, sin explicaciones adicionales ni comillas.

        Texto original:
        "{text}"
        """

        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            logger.exception("Error calling Gemini API")
            raise AIProviderError(f"Error calling Gemini API: {str(e)}") from e

    def generate_teacher_motivational_phrase(self, teacher_name: str | None = None) -> str:
        """Genera una frase motivadora breve para mostrar en el dashboard docente."""
        self._ensure_available()

        display_name = (teacher_name or "docente").strip() or "docente"
        prompt = f"""
Actúa como un coach pedagógico positivo.
Escribe UNA sola frase motivadora en español para un docente llamado {display_name}.
Requisitos:
- Máximo 18 palabras.
- Tono cercano, profesional e inspirador.
- Sin comillas, sin emojis, sin viñetas, sin prefijos.
"""

        try:
            response = self.model.generate_content(prompt)
            text = (getattr(response, "text", "") or "").strip()
            if not text:
                raise AIParseError("Empty response from AI provider.")

            line = text.splitlines()[0].strip().strip('"').strip("'")
            if not line:
                raise AIParseError("AI response did not include a valid phrase.")

            return line[:180]
        except Exception as e:
            logger.exception("Error generating teacher motivational phrase")
            if isinstance(e, AIServiceError):
                raise
            raise AIProviderError(str(e)) from e

    def analyze_group_state(self, context: dict) -> str:
        """Genera un análisis interpretativo del estado de un grupo para el docente.

        Importante: este método debe usarse con contexto agregado (sin nombres de estudiantes).
        """
        self._ensure_available()

        prompt = f"""
    Actúa como un coordinador académico y orientador pedagógico.

    Objetivo: redactar un INFORME EJECUTIVO sobre el estado del grupo usando SOLO los datos suministrados.

    Reglas estrictas:
    - No uses nombres propios ni datos personales.
    - No inventes cifras ni supongas cosas que no estén en los datos.
    - No incluyas saludos ni frases de introducción tipo carta (por ejemplo: "Estimado docente", "A continuación...").
    - Evita párrafos largos de advertencia. Si necesitas mencionar limitaciones por cobertura, hazlo en 1-2 viñetas dentro de la sección "Alcance y supuestos".
    - Escribe en español, tono profesional, claro, accionable y orientado a decisiones.

    Formato de salida (usa exactamente estos títulos y viñetas con "-"):

    RESUMEN EJECUTIVO
    - (2-4 viñetas con lo más importante)

    HALLAZGOS CLAVE
    - (3-6 viñetas)

    RIESGOS
    - (2-5 viñetas)

    RECOMENDACIONES
    - (3-6 viñetas concretas)

    PLAN DE ACCIÓN (PRÓXIMAS 2 SEMANAS)
    - (3-8 viñetas, acciones operativas)

    INDICADORES A MONITOREAR
    - (3-6 viñetas con métricas observables)

    ALCANCE Y SUPUESTOS
    - (1-2 viñetas, opcional)

    Datos (JSON):
    {json.dumps(context, ensure_ascii=False)}
    """

        try:
            response = self.model.generate_content(prompt)
            return (response.text or "").strip()
        except Exception as e:
            logger.exception("Error generating group state analysis")
            raise AIProviderError(f"Error calling Gemini API: {str(e)}") from e

    def generate_commitments_blocks(self, context: dict) -> dict:
        """Genera compromisos diferenciados para estudiante, acudiente e institución.

        Retorna JSON con listas en español:
        {
          "student_commitments": [..],
          "guardian_commitments": [..],
          "institution_commitments": [..]
        }
        """
        self._ensure_available()

        prompt = f"""
Actúa como orientador escolar y coordinador académico en Colombia.

Con base en el siguiente contexto, genera compromisos claros, medibles y accionables.

REGLAS ESTRICTAS:
- Responde SOLO con un objeto JSON válido.
- Usa exactamente estas claves: "student_commitments", "guardian_commitments", "institution_commitments".
- Cada clave debe contener un arreglo de 4 frases cortas en español.
- No repitas frases entre secciones.
- No incluyas texto adicional fuera del JSON.

Contexto (JSON):
{json.dumps(context, ensure_ascii=False)}
"""

        try:
            response = self.model.generate_content(prompt)
            payload = self._extract_json_object(getattr(response, "text", "") or "")

            required = {"student_commitments", "guardian_commitments", "institution_commitments"}
            if not isinstance(payload, dict) or not required.issubset(set(payload.keys())):
                raise AIParseError(
                    "AI response JSON missing required keys: student_commitments, guardian_commitments, institution_commitments."
                )

            for key in required:
                values = payload.get(key)
                if not isinstance(values, list) or len(values) == 0:
                    raise AIParseError(f"AI response key '{key}' must be a non-empty list.")
                payload[key] = [str(item).strip() for item in values if str(item).strip()]
                if not payload[key]:
                    raise AIParseError(f"AI response key '{key}' did not include valid items.")

            return payload
        except Exception as e:
            logger.exception("Error generating commitments blocks")
            if isinstance(e, AIServiceError):
                raise
            raise AIProviderError(str(e)) from e

    def generate_commission_observer_annotation(self, context: dict) -> dict:
        """Genera el texto de una anotación del observador originada en cierre de comisión.

        Retorna JSON:
        {
          "text": "..."
        }
        """
        self._ensure_available()

        prompt = f"""
Actúa como coordinador académico y orientador escolar en Colombia.

Tu tarea es redactar el texto de una anotación del observador del estudiante derivada del cierre de una comisión de evaluación.

REGLAS ESTRICTAS:
- Responde SOLO con un objeto JSON válido.
- Usa exactamente esta clave: "text".
- "text" debe ser un párrafo breve en español, de 2 a 4 oraciones.
- El tono debe ser institucional, respetuoso, claro, pedagógico y personalizado.
- Si el tipo es "PRAISE", felicita el desempeño y reconoce fortalezas concretas.
- Si el tipo es "ALERT", realiza un llamado de atención pedagógico por bajo rendimiento sin lenguaje humillante ni sancionatorio extremo.
- Si el tipo es "COMMITMENT", deja explícito que existe un compromiso de mejoramiento y seguimiento.
- No incluyas listas, viñetas, comillas, markdown ni texto adicional fuera del JSON.

Contexto (JSON):
{json.dumps(context, ensure_ascii=False)}
"""

        try:
            response = self.model.generate_content(prompt)
            payload = self._extract_json_object(getattr(response, "text", "") or "")
            if not isinstance(payload, dict):
                raise AIParseError("AI response must be a JSON object.")

            text = str(payload.get("text") or "").strip()
            if not text:
                raise AIParseError("AI response key 'text' must be a non-empty string.")

            return {"text": text}
        except Exception as e:
            logger.exception("Error generating commission observer annotation")
            if isinstance(e, AIServiceError):
                raise
            raise AIProviderError(str(e)) from e

    def generate_class_plan_draft(self, context: dict) -> dict:
        """Genera un borrador estructurado de plan de clase.

        Retorna JSON con las claves esperadas por el formulario del planeador.
        """
        enriched_context = self._build_class_planner_context(context)

        prompt = f"""
Actúa como un diseñador instruccional y pedagogo escolar en Colombia.

Tu tarea es proponer un borrador de plan de clase para bachillerato, coherente con el formato institucional de planeación.

    Debes alinear la propuesta con el PEI de la Institución Educativa Playas del Viento.

REGLAS ESTRICTAS:
- Responde SOLO con un objeto JSON válido.
- No incluyas texto adicional fuera del JSON.
- Mantén un tono pedagógico, claro y accionable.
- Todo el contenido textual debe estar completamente en español. No uses términos en inglés en los valores, por ejemplo: methodology, activity, evidence o resources.
- No inventes normas específicas no suministradas; si falta detalle, propón formulaciones generales y útiles.
- La suma de `start_time_minutes` + `development_time_minutes` + `closing_time_minutes` debe ser igual a `duration_minutes`.
- El campo `evaluation_criterion` debe usar esta estructura: "[Nivel] - [criterio evaluado] - Rango [x-y] ([momento])".
    - Aplica el modelo pedagógico social-constructivista: estudiante al centro y docente como mediador.
    - Prioriza metodologías activas y participativas, evitando clases centradas solo en exposición magistral.
    - Relaciona la clase con el contexto local, rural, costero, ambiental, cultural o social de Playas del Viento cuando sea pertinente.
    - Incorpora al menos un valor institucional y un rasgo del perfil de estudiante en las actividades o en la intención formativa.
    - Cuando sea pertinente, articula transversalmente turismo, emprendimiento, educación ambiental, convivencia, ciudadanía o lectoescritura.
    - La evaluación debe reflejar integralidad formativa y contemplar evidencias de saber (40%), saber hacer (40%) y saber ser (20%).
    - Incluye ajustes razonables y estrategias de participación real desde el enfoque de inclusión y atención a la diversidad.
- Usa exactamente estas claves:
  "title",
  "duration_minutes",
  "learning_result",
  "dba_reference",
  "standard_reference",
  "competency_know",
  "competency_do",
  "competency_be",
  "class_purpose",
  "start_time_minutes",
  "start_activities",
  "development_time_minutes",
  "development_activities",
  "closing_time_minutes",
  "closing_activities",
  "evidence_product",
  "evaluation_instrument",
  "evaluation_criterion",
  "resources",
  "dua_adjustments".

Contexto (JSON):
{json.dumps(enriched_context, ensure_ascii=False)}
"""

        try:
            self._ensure_available()
            response = self.model.generate_content(prompt)
            payload = self._extract_json_object(getattr(response, "text", "") or "")
            return self._validate_class_plan_draft_payload(payload)
        except Exception as e:
            logger.exception("Error generating class plan draft")
            return self._fallback_class_plan_draft(enriched_context)

    def generate_class_plan_draft_stream_events(self, context: dict) -> Iterator[dict]:
        """Genera eventos incrementales por sección para poblar el formulario en tiempo real.

        Nota: el streaming token-a-token del proveedor no siempre produce JSON parseable de forma temprana;
        por eso emitimos parches por sección para asegurar actualizaciones visibles durante la generación.
        """
        section_plan = [
            ("learning", 20),
            ("competencies", 40),
            ("sequence", 65),
            ("evaluation", 85),
            ("support", 95),
        ]

        merged_payload: dict = {}
        evolving_context = dict(context or {})

        try:
            self._ensure_available()

            for section, progress in section_plan:
                section_payload = self.generate_class_plan_section(section, evolving_context)
                if not isinstance(section_payload, dict):
                    continue

                merged_payload.update(section_payload)
                evolving_context.update(section_payload)

                yield {
                    "event": "patch",
                    "section": section,
                    "progress": progress,
                    "data": section_payload,
                }

            required = {
                "title",
                "duration_minutes",
                "learning_result",
                "dba_reference",
                "standard_reference",
                "competency_know",
                "competency_do",
                "competency_be",
                "class_purpose",
                "start_time_minutes",
                "start_activities",
                "development_time_minutes",
                "development_activities",
                "closing_time_minutes",
                "closing_activities",
                "evidence_product",
                "evaluation_instrument",
                "evaluation_criterion",
                "resources",
                "dua_adjustments",
            }

            if not required.issubset(set(merged_payload.keys())):
                fallback_payload = self.generate_class_plan_draft(context)
                for key in required:
                    merged_payload.setdefault(key, fallback_payload.get(key))

            validated_payload = self._validate_class_plan_draft_payload(merged_payload)
            yield {"event": "done", "progress": 100, "data": validated_payload}
        except AIServiceError:
            raise
        except Exception as exc:
            logger.exception("Error generating class plan draft stream")
            raise AIProviderError(str(exc)) from exc

    def generate_class_plan_section(self, section: str, context: dict) -> dict:
        """Genera una sección específica del plan de clase."""
        enriched_context = self._build_class_planner_context(context)
        section_definitions = {
            "learning": {
                "keys": ["learning_result", "dba_reference", "standard_reference", "class_purpose"],
                "instruction": "Propón el resultado de aprendizaje, referencias DBA y estándar, y el propósito de la clase.",
            },
            "competencies": {
                "keys": ["competency_know", "competency_do", "competency_be"],
                "instruction": "Propón las competencias Saber, Hacer y Ser alineadas a la temática y el resultado de aprendizaje.",
            },
            "sequence": {
                "keys": [
                    "duration_minutes",
                    "start_time_minutes",
                    "start_activities",
                    "development_time_minutes",
                    "development_activities",
                    "closing_time_minutes",
                    "closing_activities",
                ],
                "instruction": "Propón la secuencia didáctica de Inicio, Desarrollo y Cierre. La suma de los tiempos debe coincidir con duration_minutes.",
            },
            "evaluation": {
                "keys": ["evidence_product", "evaluation_instrument", "evaluation_criterion"],
                "instruction": "Propón evidencia o producto, instrumento de evaluación y criterio SIEE con formato institucional.",
            },
            "support": {
                "keys": ["resources", "dua_adjustments"],
                "instruction": "Propón recursos y ajustes DUA breves y aplicables a la clase.",
            },
        }

        section_config = section_definitions.get(section)
        if not section_config:
            raise AIParseError("Invalid class plan section requested.")

        prompt = f"""
Actúa como un diseñador instruccional y pedagogo escolar en Colombia.

Debes generar SOLO la sección solicitada de un plan de clase para bachillerato.

    Debes alinear la propuesta con el PEI de la Institución Educativa Playas del Viento.

REGLAS ESTRICTAS:
- Responde SOLO con un objeto JSON válido.
- No incluyas texto adicional fuera del JSON.
- Usa exactamente estas claves: {', '.join(section_config['keys'])}.
- Todo el contenido textual debe estar completamente en español. No uses términos en inglés en los valores, por ejemplo: methodology, activity, evidence o resources.
- Mantén coherencia con el contexto suministrado.
- Si la sección es "sequence", los tiempos deben sumar exactamente `duration_minutes`.
- Si la sección incluye `evaluation_criterion`, usa esta estructura: "[Nivel] - [criterio evaluado] - Rango [x-y] ([momento])".
    - Aplica el modelo pedagógico social-constructivista y prioriza metodologías activas, contextualizadas y participativas.
    - Refleja contexto local, valores institucionales, formación integral, inclusión y articulación transversal cuando corresponda.
    - Si la sección es de evaluación, asegúrate de incluir componentes observables de saber, saber hacer y saber ser con ponderación institucional 40/40/20.

Sección solicitada: {section}
Instrucción: {section_config['instruction']}

Contexto (JSON):
    {json.dumps(enriched_context, ensure_ascii=False)}
"""

        try:
            self._ensure_available()
            response = self.model.generate_content(prompt)
            payload = self._extract_json_object(getattr(response, "text", "") or "")
            required = set(section_config["keys"])
            if not isinstance(payload, dict) or not required.issubset(set(payload.keys())):
                raise AIParseError(f"AI response JSON missing required keys for section '{section}'.")

            numeric_keys = {"duration_minutes", "start_time_minutes", "development_time_minutes", "closing_time_minutes"}
            for key in required:
                if key in numeric_keys:
                    try:
                        payload[key] = int(payload.get(key) or 0)
                    except Exception as exc:
                        raise AIParseError(f"AI response key '{key}' must be numeric.") from exc
                else:
                    payload[key] = str(payload.get(key) or "").strip()

            payload = self._normalize_class_planner_payload(payload, numeric_keys=numeric_keys)

            if section == "sequence":
                if payload["duration_minutes"] != (
                    payload["start_time_minutes"]
                    + payload["development_time_minutes"]
                    + payload["closing_time_minutes"]
                ):
                    raise AIParseError("AI response produced inconsistent timing totals for class plan sequence.")

            return payload
        except Exception as e:
            logger.exception("Error generating class plan section")
            return self._fallback_class_plan_section(section, enriched_context)

    def generate_commission_group_acta_blocks(self, context: dict) -> dict:
        """Genera bloques de contenido para acta grupal de comisión.

        Retorna JSON:
        {
          "executive_summary": "...",
          "general_observations": ["...", "..."],
          "agreed_commitments": ["...", "..."],
          "institutional_commitments": ["...", "..."]
        }
        """
        self._ensure_available()

        prompt = f"""
Actúa como coordinador académico en Colombia y redacta contenido para un acta grupal de comisión.

REGLAS ESTRICTAS:
- Responde SOLO con un objeto JSON válido.
- Usa exactamente estas claves: "executive_summary", "general_observations" y "agreed_commitments".
- "executive_summary": 1 párrafo corto (máximo 4 oraciones), claro y ejecutivo.
- "general_observations": arreglo de 3 a 5 observaciones generales accionables.
- "agreed_commitments": arreglo de 3 a 5 compromisos acordados accionables, medibles y concretos.
- No uses nombres de estudiantes ni datos sensibles.
- No incluyas texto fuera del JSON.

Contexto (JSON):
{json.dumps(context, ensure_ascii=False)}
"""

        try:
            response = self.model.generate_content(prompt)
            payload = self._extract_json_object(getattr(response, "text", "") or "")

            if not isinstance(payload, dict):
                raise AIParseError("AI response must be a JSON object.")

            executive_summary = str(payload.get("executive_summary", "")).strip()
            observations = payload.get("general_observations")
            commitments = payload.get("agreed_commitments")

            if not executive_summary:
                raise AIParseError("AI response key 'executive_summary' must be a non-empty string.")
            if not isinstance(observations, list) or len(observations) == 0:
                raise AIParseError("AI response key 'general_observations' must be a non-empty list.")
            if not isinstance(commitments, list) or len(commitments) == 0:
                raise AIParseError("AI response key 'agreed_commitments' must be a non-empty list.")

            clean_observations = [str(item).strip() for item in observations if str(item).strip()]
            if not clean_observations:
                raise AIParseError("AI response key 'general_observations' did not include valid items.")

            clean_commitments = [str(item).strip() for item in commitments if str(item).strip()]
            if not clean_commitments:
                raise AIParseError("AI response key 'agreed_commitments' did not include valid items.")

            return {
                "executive_summary": executive_summary,
                "general_observations": clean_observations,
                "agreed_commitments": clean_commitments,
                # Backward compatibility for existing call sites that still consume this key.
                "institutional_commitments": clean_commitments,
            }
        except Exception as e:
            logger.exception("Error generating group commission acta AI blocks")
            if isinstance(e, AIServiceError):
                raise
            raise AIProviderError(str(e)) from e


class AIServiceError(Exception):
    pass


class AIConfigError(AIServiceError):
    pass


class AIParseError(AIServiceError):
    pass


class AIProviderError(AIServiceError):
    pass
