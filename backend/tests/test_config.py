import unittest

from backend.app.config import Settings


class SettingsTests(unittest.TestCase):
    def test_render_service_hostname_becomes_https_origin(self):
        settings = Settings(cors_origins="lexapp-frontend.onrender.com")
        self.assertEqual(settings.allowed_origins, ["https://lexapp-frontend.onrender.com"])

    def test_existing_cors_origins_keep_their_scheme(self):
        settings = Settings(cors_origins="http://localhost:8000, https://example.com/")
        self.assertEqual(
            settings.allowed_origins,
            ["http://localhost:8000", "https://example.com"],
        )

    def test_render_service_hostname_gets_chat_endpoint(self):
        settings = Settings(legal_ai_api_url="lexapp-legal-assistant.onrender.com")
        self.assertEqual(
            settings.legal_ai_chat_url,
            "https://lexapp-legal-assistant.onrender.com/chat",
        )

    def test_configured_chat_endpoint_is_preserved(self):
        settings = Settings(legal_ai_api_url="http://127.0.0.1:8100/chat")
        self.assertEqual(settings.legal_ai_chat_url, "http://127.0.0.1:8100/chat")
