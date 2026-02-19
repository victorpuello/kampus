from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase


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
