"""Small tests for the web request path without calling Gemini."""

import base64
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import app
from config import load_env


class WebGenerationTests(unittest.TestCase):
    def test_company_only_reaches_existing_generator(self):
        fake_generator = types.ModuleType("generate")
        calls = []

        def write_email(**kwargs):
            calls.append(kwargs)
            return "SUBJECTS:\n1. Hello Acme\n2. AI engineering\n3. Quick note\n\nEMAIL:\nHi there,\n\nHello."

        fake_generator.generate_email = write_email
        with patch.dict(sys.modules, {"generate": fake_generator}):
            result = app.generate({"company": "Acme", "api_key": "test", "profile": "Python engineer", "profile_distilled": True})
        self.assertEqual(len(calls), 3)  # one draft per recipient
        self.assertEqual(calls[0]["company"], "Acme")
        self.assertEqual(calls[0]["jd"], "")
        self.assertEqual(calls[0]["api_key"], "test")
        self.assertEqual(result["order"], ["founder", "hr", "engineer"])
        self.assertEqual(result["variants"]["founder"]["subjects"], ["Hello Acme", "AI engineering", "Quick note"])
        self.assertTrue(result["variants"]["hr"]["email"].startswith("Hi there,"))

    def test_text_file_is_included_in_job_description(self):
        fake_generator = types.ModuleType("generate")
        calls = []

        def write_email(**kwargs):
            calls.append(kwargs)
            return "EMAIL:\nHi there,\n\nHello."

        fake_generator.generate_email = write_email
        content = base64.b64encode(b"Build AI systems").decode()
        with patch.dict(sys.modules, {"generate": fake_generator}):
            app.generate({"file": {"name": "role.txt", "content": content}, "api_key": "test", "profile": "Python engineer", "profile_distilled": True})
        self.assertEqual(calls[0]["jd"], "Build AI systems")

    def test_job_description_only_reaches_generator(self):
        fake_generator = types.ModuleType("generate")
        calls = []

        def write_email(**kwargs):
            calls.append(kwargs)
            return "EMAIL:\nHi there,\n\nHello."

        fake_generator.generate_email = write_email
        with patch.dict(sys.modules, {"generate": fake_generator}):
            app.generate({"company": "", "job_description": "Periskope is hiring an AI Engineer.", "role": "AI Engineer", "research": False, "api_key": "test", "profile": "Python engineer", "profile_distilled": True})
        self.assertEqual(calls[0]["jd"], "Periskope is hiring an AI Engineer.")
        self.assertEqual(calls[0]["company"], "")

    def test_empty_input_is_rejected(self):
        with self.assertRaisesRegex(app.InputError, "company name or a job description"):
            app.generate({})

    def test_missing_resume_is_rejected(self):
        with self.assertRaisesRegex(app.InputError, "Save your resume first"):
            app.generate({"company": "Acme", "api_key": "test"})

    def test_gemini_api_errors_have_actionable_messages(self):
        self.assertIn("API key", app.gemini_error_message(400, "API_KEY_INVALID"))
        self.assertIn("quota", app.gemini_error_message(429))

    def test_generator_uses_selected_key_and_system_instruction(self):
        from generate import SYSTEM, generate_email

        with patch.dict(os.environ, {"GEMINI_API_KEY": "selected-key"}), patch("generate.genai.Client") as client:
            client.return_value.models.generate_content.return_value.text = "EMAIL:\nHi there,"
            generate_email(profile="profile", notes="", role="AI Engineer", jd="job")
        client.assert_called_once_with(api_key="selected-key")
        call = client.return_value.models.generate_content.call_args
        self.assertEqual(call.kwargs["config"]["system_instruction"], SYSTEM)
        client.return_value.close.assert_called_once()

    def test_invalid_file_type_is_rejected(self):
        with self.assertRaisesRegex(app.InputError, "TXT, MD, PDF, or DOCX"):
            app.extract_file({"name": "jd.exe", "content": base64.b64encode(b"test").decode()})

    def test_post_route_returns_generated_result(self):
        request = {"company": "Acme"}
        with patch.object(app, "generate", return_value={"email": "Hi there", "subjects": [], "raw": "Hi there"}) as generate:
            response = TestClient(app.app).post("/api/generate", json=request)
        generate.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], "Hi there")

    def test_bad_request_keeps_frontend_error_shape(self):
        response = TestClient(app.app).post("/api/generate", content=b"not json", headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_resume_route_extracts_text(self):
        file = {"name": "resume.txt", "content": base64.b64encode(b"Python engineer").decode()}
        response = TestClient(app.app).post("/api/save-resume", json={"file": file})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "Python engineer")

    def test_backend_does_not_serve_frontend(self):
        response = TestClient(app.app).get("/")
        self.assertEqual(response.status_code, 404)

    def test_local_frontend_preflight_is_allowed(self):
        response = TestClient(app.app).options(
            "/api/generate",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173")

    def test_health_route(self):
        response = TestClient(app.app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "ok")

    def test_env_file_takes_precedence_over_shell_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text('GEMINI_API_KEY="file-key"\nGEMINI_MODEL=example-model # note\n')
            with patch.dict(os.environ, {"GEMINI_API_KEY": "shell-key"}, clear=True):
                load_env(path)
                self.assertEqual(os.environ["GEMINI_API_KEY"], "file-key")
                self.assertEqual(os.environ["GEMINI_MODEL"], "example-model")


if __name__ == "__main__":
    unittest.main()
