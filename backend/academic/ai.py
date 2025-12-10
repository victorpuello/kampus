import google.generativeai as genai
from django.conf import settings
import json

class AIService:
    def __init__(self):
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

    def generate_indicators(self, achievement_description):
        """
        Genera indicadores de desempeño (Bajo, Básico, Alto, Superior)
        basados en la descripción de un logro.
        """
        if not settings.GOOGLE_API_KEY:
             raise ValueError("GOOGLE_API_KEY is not configured.")

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
            # Limpiar la respuesta para asegurar que sea JSON válido
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]
            
            if text.endswith("```"):
                text = text[:-3]
            
            return json.loads(text)
        except Exception as e:
            print(f"Error generating indicators: {e}")
            # Retornar un error estructurado o None
            raise e

    def improve_text(self, text):
        """
        Mejora la redacción y ortografía de un texto académico.
        """
        if not settings.GOOGLE_API_KEY:
             raise ValueError("GOOGLE_API_KEY is not configured.")

        prompt = f"""
        Actúa como un experto corrector de estilo y pedagogo.
        Mejora la redacción y corrige la ortografía del siguiente texto, que es un logro académico o descripción educativa.
        Mantén el sentido original pero hazlo más formal, claro y pedagógico.
        Solo devuelve el texto mejorado, sin explicaciones adicionales ni comillas.

        Texto original:
        "{text}"
        """

        try:
            if not hasattr(self, 'model') or not self.model:
                 raise ValueError("Gemini model not initialized. Check API Key.")

            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"Error calling Gemini API: {str(e)}")
            raise Exception(f"Error calling Gemini API: {str(e)}")
