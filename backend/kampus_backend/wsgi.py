"""
WSGI config for kampus_backend project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os
from pathlib import Path

from django.core.wsgi import get_wsgi_application

# Load .env from backend/ or project root
try:
    from dotenv import load_dotenv
    # Path(__file__) is backend/kampus_backend/wsgi.py
    # parent is backend/kampus_backend
    # parent.parent is backend/
    backend_dir = Path(__file__).resolve().parent.parent
    
    if (backend_dir / '.env').exists():
        load_dotenv(backend_dir / '.env')
    else:
        # Try root .env (backend_dir.parent)
        load_dotenv(backend_dir.parent / '.env')
except ImportError:
    pass

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "kampus_backend.settings")

application = get_wsgi_application()
