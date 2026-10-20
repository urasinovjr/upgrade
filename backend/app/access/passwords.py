import asyncio

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash("upgrade-dummy-password")


async def hash_password(password: str) -> str:
    return await asyncio.to_thread(hasher.hash, password)


def check_password(stored_hash: str, password: str) -> bool:
    try:
        return hasher.verify(stored_hash, password)
    except (VerificationError, InvalidHashError):
        return False


async def verify_password(stored_hash: str | None, password: str) -> bool:
    if stored_hash is None:
        await asyncio.to_thread(check_password, DUMMY_HASH, password)
        return False
    return await asyncio.to_thread(check_password, stored_hash, password)


def needs_rehash(stored_hash: str) -> bool:
    return hasher.check_needs_rehash(stored_hash)
