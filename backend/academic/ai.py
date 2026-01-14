from django.conf import settings
import logging
import json
from json import JSONDecodeError


logger = logging.getLogger(__name__)

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


class AIServiceError(Exception):
    pass


class AIConfigError(AIServiceError):
    pass


class AIParseError(AIServiceError):
    pass


class AIProviderError(AIServiceError):
    pass
