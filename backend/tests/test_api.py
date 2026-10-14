import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.auth import Principal, require_principal
from backend.app.main import app


class ApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_is_available_without_provider_credentials(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_chat_session_requires_authentication(self):
        response = self.client.get("/api/v1/chat/session")
        self.assertEqual(response.status_code, 401)

    def test_assistant_requires_authentication(self):
        response = self.client.post(
            "/api/v1/assistant/messages",
            json={"question": "What is an affidavit?"},
        )
        self.assertEqual(response.status_code, 401)

    def test_registration_rejects_short_password(self):
        response = self.client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "Test User",
                "email": "test@example.com",
                "password": "short",
                "role": "client",
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_registration_rejects_blank_name(self):
        response = self.client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "   ",
                "email": "test@example.com",
                "password": "long-enough-password",
                "role": "client",
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_lawyer_application_upload_requires_authentication(self):
        response = self.client.post("/api/v1/lawyer-applications")
        self.assertEqual(response.status_code, 401)

    def test_admin_application_queue_requires_authentication(self):
        response = self.client.get("/api/v1/admin/lawyer-applications")
        self.assertEqual(response.status_code, 401)

    def test_admin_application_queue_rejects_non_admin_users(self):
        app.dependency_overrides[require_principal] = lambda: Principal(
            id="11111111-1111-4111-8111-111111111111",
            email="user@example.com",
            name="User",
            role="client",
            verified=False,
            is_admin=False,
        )
        try:
            response = self.client.get("/api/v1/admin/lawyer-applications")
        finally:
            app.dependency_overrides.pop(require_principal, None)
        self.assertEqual(response.status_code, 403)

    def test_current_user_includes_admin_access_flag(self):
        app.dependency_overrides[require_principal] = lambda: Principal(
            id="11111111-1111-4111-8111-111111111111",
            email="admin@example.com",
            name="Admin",
            role="client",
            verified=False,
            is_admin=True,
        )
        try:
            response = self.client.get("/api/v1/auth/me")
        finally:
            app.dependency_overrides.pop(require_principal, None)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_admin"])

    def test_upload_route_uses_multipart_form_data(self):
        request_body = (
            self.client.get("/openapi.json")
            .json()["paths"]["/api/v1/lawyer-applications"]["post"]["requestBody"]
        )
        self.assertIn("multipart/form-data", request_body["content"])

    def test_lawyer_cannot_initiate_a_client_chat(self):
        lawyer_id = "22222222-2222-4222-8222-222222222222"
        client_id = "11111111-1111-4111-8111-111111111111"

        class Query:
            def __init__(self, table_name):
                self.table_name = table_name

            def select(self, *_args):
                return self

            def eq(self, *_args):
                return self

            def in_(self, *_args):
                return self

            def maybe_single(self):
                return self

            def execute(self):
                if self.table_name == "profiles":
                    return type("Result", (), {"data": [
                        {"id": lawyer_id, "full_name": "Lawyer", "role": "lawyer", "is_verified": True},
                        {"id": client_id, "full_name": "Client", "role": "client", "is_verified": False},
                    ]})()
                return type("Result", (), {"data": None})()

        class Database:
            def table(self, table_name):
                return Query(table_name)

        app.dependency_overrides[require_principal] = lambda: Principal(
            id=lawyer_id,
            email="lawyer@example.com",
            name="Lawyer",
            role="lawyer",
            verified=True,
            is_admin=False,
        )
        try:
            with patch("backend.app.main.service_client", return_value=Database()):
                response = self.client.post(f"/api/v1/chat/direct/{client_id}")
        finally:
            app.dependency_overrides.pop(require_principal, None)
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
