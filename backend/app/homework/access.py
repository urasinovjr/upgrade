from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import User
from app.access.passwords import hash_password, verify_password
from app.access.rules import new_token, password_is_weak, token_hash
from app.access.sessions import revoke_user_sessions
from app.errors import DomainError
from app.homework.models import StudentAccess
from app.students import owned_student


async def invite_student(session: AsyncSession, teacher_id: UUID, student_id: UUID) -> dict:
    student = await owned_student(session, teacher_id, student_id)
    await session.refresh(student, with_for_update=True)
    access = await session.get(StudentAccess, student_id)
    if access is None:
        user = User(display_name=student.name)
        session.add(user)
        await session.flush()
        access = StudentAccess(student_id=student_id, user_id=user.id, login="u" + uuid4().hex[:16])
        session.add(access)
    else:
        await revoke_user_sessions(session, access.user_id)
        user = await session.get(User, access.user_id)
        user.password_hash = None
    token = new_token()
    access.invitation_hash = token_hash(token)
    access.invitation_expires_at = datetime.now(UTC) + timedelta(days=7)
    await session.commit()
    return {"token": token, "login": access.login}


async def activate_student(session: AsyncSession, token: str, password: str) -> StudentAccess:
    if password_is_weak(password, None):
        raise DomainError("password_too_weak")
    access = await session.scalar(
        select(StudentAccess)
        .where(
            StudentAccess.invitation_hash == token_hash(token),
            StudentAccess.invitation_expires_at > datetime.now(UTC),
        )
        .with_for_update()
    )
    if access is None:
        raise DomainError("token_invalid")
    user = await session.get(User, access.user_id)
    user.password_hash = await hash_password(password)
    access.invitation_hash = None
    access.invitation_expires_at = None
    await revoke_user_sessions(session, user.id)
    return access


async def login_student(session: AsyncSession, login: str, password: str) -> StudentAccess:
    access = await session.scalar(select(StudentAccess).where(StudentAccess.login == login))
    user = await session.get(User, access.user_id) if access else None
    valid = await verify_password(user.password_hash if user else None, password)
    if not valid or access is None:
        raise DomainError("invalid_credentials")
    return access
