from __future__ import annotations

import string
from secrets import choice, randbelow


_ALPHABET_LOWER = string.ascii_lowercase
_ALPHABET_UPPER = string.ascii_uppercase
_ALPHABET_DIGITS = string.digits
_ALPHABET_SYMBOLS = "@#$%*!?"


def generate_temporary_password(length: int = 14) -> str:
    if length < 12:
        length = 12

    required = [
        choice(_ALPHABET_LOWER),
        choice(_ALPHABET_UPPER),
        choice(_ALPHABET_DIGITS),
        choice(_ALPHABET_SYMBOLS),
    ]
    remaining_length = length - len(required)
    pool = _ALPHABET_LOWER + _ALPHABET_UPPER + _ALPHABET_DIGITS + _ALPHABET_SYMBOLS
    generated = required + [choice(pool) for _ in range(remaining_length)]

    # Fisher-Yates shuffle without relying on non-cryptographic random
    for idx in range(len(generated) - 1, 0, -1):
        swap_idx = randbelow(idx + 1)
        generated[idx], generated[swap_idx] = generated[swap_idx], generated[idx]

    return "".join(generated)


PASSWORD_CHANGE_ALLOWED_PATH_PREFIXES = (
    "/api/users/me/",
    "/api/users/change_password/",
    "/api/auth/logout/",
)


def is_password_change_exempt_path(path: str) -> bool:
    normalized = (path or "").strip()
    return any(normalized.startswith(prefix) for prefix in PASSWORD_CHANGE_ALLOWED_PATH_PREFIXES)
