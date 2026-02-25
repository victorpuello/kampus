from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from urllib.parse import parse_qs, urlparse
from rest_framework.test import APITestCase

from .models import PasswordResetToken


class CookieAuthFlowTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="cookie_auth_user",
            password="pass1234",
            role=user_model.ROLE_ADMIN,
        )

    def test_cookie_login_sets_auth_cookies_and_allows_me(self):
        csrf_response = self.client.get("/api/auth/csrf/")
        self.assertEqual(csrf_response.status_code, 200)

        login_response = self.client.post(
            "/api/auth/login/",
            {"username": "cookie_auth_user", "password": "pass1234"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_response.cookies.get("csrftoken").value if csrf_response.cookies.get("csrftoken") else "",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertIn("kampus_access", login_response.cookies)
        self.assertIn("kampus_refresh", login_response.cookies)

        me_response = self.client.get("/api/users/me/")
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data["username"], "cookie_auth_user")

    def test_cookie_refresh_uses_refresh_cookie(self):
        csrf_response = self.client.get("/api/auth/csrf/")
        login_response = self.client.post(
            "/api/auth/login/",
            {"username": "cookie_auth_user", "password": "pass1234"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_response.cookies.get("csrftoken").value if csrf_response.cookies.get("csrftoken") else "",
        )
        self.assertEqual(login_response.status_code, 200)

        refresh_response = self.client.post(
            "/api/auth/refresh/",
            {},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, 200)
        self.assertIn("kampus_access", refresh_response.cookies)

    @override_settings(
        AUTH_LOGIN_IP_THROTTLE_RATE="2/min",
        AUTH_LOGIN_USER_THROTTLE_RATE="2/min",
    )
    def test_cookie_login_is_throttled_after_limit(self):
        csrf_response = self.client.get("/api/auth/csrf/")
        csrf_token = csrf_response.cookies.get("csrftoken").value if csrf_response.cookies.get("csrftoken") else ""

        for _ in range(2):
            login_response = self.client.post(
                "/api/auth/login/",
                {"username": "cookie_auth_user", "password": "pass1234"},
                format="json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )
            self.assertEqual(login_response.status_code, 200)

        throttled_response = self.client.post(
            "/api/auth/login/",
            {"username": "cookie_auth_user", "password": "pass1234"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(throttled_response.status_code, 429)

    @override_settings(AUTH_REFRESH_IP_THROTTLE_RATE="1/min")
    def test_cookie_refresh_is_throttled_after_limit(self):
        csrf_response = self.client.get("/api/auth/csrf/")
        login_response = self.client.post(
            "/api/auth/login/",
            {"username": "cookie_auth_user", "password": "pass1234"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_response.cookies.get("csrftoken").value if csrf_response.cookies.get("csrftoken") else "",
        )
        self.assertEqual(login_response.status_code, 200)

        first_refresh_response = self.client.post(
            "/api/auth/refresh/",
            {},
            format="json",
        )
        self.assertEqual(first_refresh_response.status_code, 200)

        throttled_response = self.client.post(
            "/api/auth/refresh/",
            {},
            format="json",
        )
        self.assertEqual(throttled_response.status_code, 429)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    KAMPUS_FRONTEND_BASE_URL="http://localhost:5173",
)
class PasswordResetFlowTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="password_reset_user",
            email="password.reset@example.com",
            password="pass1234",
            role=user_model.ROLE_ADMIN,
            must_change_password=True,
        )

    def test_password_reset_request_returns_generic_message(self):
        response = self.client.post(
            "/api/auth/password-reset/request/",
            {"email": "password.reset@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("Si el correo existe", response.data.get("detail", ""))
        self.assertEqual(PasswordResetToken.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_password_reset_request_unknown_email_does_not_create_token(self):
        response = self.client.post(
            "/api/auth/password-reset/request/",
            {"email": "unknown@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("Si el correo existe", response.data.get("detail", ""))
        self.assertEqual(PasswordResetToken.objects.count(), 0)

    def test_password_reset_confirm_updates_password_and_marks_token_used(self):
        request_response = self.client.post(
            "/api/auth/password-reset/request/",
            {"email": "password.reset@example.com"},
            format="json",
        )
        self.assertEqual(request_response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

        email_body = mail.outbox[0].body
        reset_link_line = [line for line in email_body.splitlines() if "http" in line][-1]
        reset_link = reset_link_line.split(": ", 1)[-1].strip()
        query = parse_qs(urlparse(reset_link).query)
        token = query.get("token", [""])[0]
        self.assertTrue(token)

        confirm_response = self.client.post(
            "/api/auth/password-reset/confirm/",
            {"token": token, "new_password": "NewStrongPass123!"},
            format="json",
        )
        self.assertEqual(confirm_response.status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewStrongPass123!"))
        self.assertFalse(self.user.must_change_password)
        self.assertEqual(PasswordResetToken.objects.filter(used_at__isnull=False).count(), 1)
