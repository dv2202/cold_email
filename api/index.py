"""Vercel serverless entry point.

Vercel's Python runtime serves the ASGI ``app`` exported here. The actual
application lives in the project-root ``app.py``; we add the root to the import
path and re-export it so the backend code stays in one place for local runs,
Render, and Vercel alike.
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app import app  # noqa: E402

__all__ = ["app"]
