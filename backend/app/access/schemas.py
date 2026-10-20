from uuid import UUID

from pydantic import Field

from app.api_model import ApiModel

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class AuthConfigOut(ApiModel):
    terms_url: str
    terms_version: str
    personal_data_url: str
    personal_data_version: str
    providers: list[str]


class RegisterIn(ApiModel):
    email: str = Field(max_length=320, pattern=EMAIL_PATTERN)
    password: str = Field(max_length=128)
    display_name: str = Field(min_length=1, max_length=100)
    accept_terms: bool
    accept_personal_data: bool
    terms_version: str = Field(max_length=32)
    personal_data_version: str = Field(max_length=32)


class EmailIn(ApiModel):
    email: str = Field(max_length=320, pattern=EMAIL_PATTERN)


class TokenIn(ApiModel):
    token: str = Field(min_length=1, max_length=128)


class LoginIn(ApiModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=128)


class PasswordResetIn(ApiModel):
    token: str = Field(min_length=1, max_length=128)
    password: str = Field(max_length=128)


class AccountOut(ApiModel):
    id: UUID
    email: str | None
    display_name: str


class SessionOut(ApiModel):
    account: AccountOut
    csrf_token: str
