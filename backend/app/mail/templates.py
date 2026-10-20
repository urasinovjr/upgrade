from dataclasses import dataclass
from urllib.parse import urlencode


@dataclass(frozen=True)
class Letter:
    subject: str
    text: str


def link(public_url: str, path: str, token: str | None = None) -> str:
    address = public_url.rstrip("/") + path
    if token is None:
        return address
    return f"{address}?{urlencode({'token': token})}"


def confirm_letter(public_url: str, token: str) -> Letter:
    return Letter(
        subject="Подтвердите почту в UpGrade",
        text=(
            "Здравствуйте!\n\n"
            "Чтобы закончить регистрацию в UpGrade, откройте ссылку:\n"
            f"{link(public_url, '/auth/confirm', token)}\n\n"
            "Ссылка действует 24 часа. Если вы не регистрировались, просто удалите письмо."
        ),
    )


def reset_letter(public_url: str, token: str) -> Letter:
    return Letter(
        subject="Новый пароль для UpGrade",
        text=(
            "Здравствуйте!\n\n"
            "Чтобы задать новый пароль, откройте ссылку:\n"
            f"{link(public_url, '/auth/reset/confirm', token)}\n\n"
            "Ссылка действует 1 час. Если вы не запрашивали смену пароля, удалите письмо: "
            "старый пароль продолжит работать."
        ),
    )


def account_exists_letter(public_url: str) -> Letter:
    return Letter(
        subject="Вы уже зарегистрированы в UpGrade",
        text=(
            "Здравствуйте!\n\n"
            "Кто-то пытался зарегистрироваться в UpGrade с этой почтой, "
            "но аккаунт уже существует.\n"
            f"Войти: {link(public_url, '/login')}\n"
            f"Забыли пароль: {link(public_url, '/auth/reset')}\n\n"
            "Если это были не вы, ничего делать не нужно."
        ),
    )


def build_letter(template: str, public_url: str, token: str | None) -> Letter:
    if template == "confirm" and token is not None:
        return confirm_letter(public_url, token)
    if template == "reset" and token is not None:
        return reset_letter(public_url, token)
    if template == "account_exists":
        return account_exists_letter(public_url)
    raise ValueError(f"unknown letter {template}")
