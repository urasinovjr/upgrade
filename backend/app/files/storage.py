from collections.abc import AsyncIterator
from contextlib import AsyncExitStack
from typing import Protocol

from aiobotocore.config import AioConfig
from aiobotocore.session import get_session
from botocore.exceptions import BotoCoreError, ClientError

from app.config import Settings

CHUNK_SIZE = 64 * 1024
DELETE_BATCH = 1000
MISSING_CODES = {"NoSuchKey", "404", "NotFound"}


class StorageError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...

    async def open(self, key: str) -> AsyncIterator[bytes]: ...

    async def delete_prefix(self, prefix: str) -> int: ...

    async def close(self) -> None: ...


class S3Storage:
    def __init__(self, client, bucket: str, exit_stack: AsyncExitStack):
        self.client = client
        self.bucket = bucket
        self.exit_stack = exit_stack

    @classmethod
    async def connect(cls, settings: Settings) -> "S3Storage":
        exit_stack = AsyncExitStack()
        client = await exit_stack.enter_async_context(
            get_session().create_client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                region_name=settings.s3_region,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
                config=AioConfig(s3={"addressing_style": "path"}),
            )
        )
        storage = cls(client, settings.s3_bucket, exit_stack)
        if settings.s3_create_bucket:
            await storage.ensure_bucket()
        return storage

    async def ensure_bucket(self) -> None:
        try:
            await self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            await self.client.create_bucket(Bucket=self.bucket)

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        try:
            await self.client.put_object(
                Bucket=self.bucket, Key=key, Body=data, ContentType=content_type
            )
        except (BotoCoreError, ClientError) as error:
            raise StorageError("storage_unavailable") from error

    async def open(self, key: str) -> AsyncIterator[bytes]:
        try:
            response = await self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in MISSING_CODES:
                raise StorageError("file_not_found") from error
            raise StorageError("storage_unavailable") from error
        except BotoCoreError as error:
            raise StorageError("storage_unavailable") from error
        return self.chunks(response["Body"])

    async def chunks(self, body) -> AsyncIterator[bytes]:
        try:
            while chunk := await body.read(CHUNK_SIZE):
                yield chunk
        finally:
            body.close()

    async def delete_prefix(self, prefix: str) -> int:
        deleted = 0
        try:
            paginator = self.client.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
                for start in range(0, len(keys), DELETE_BATCH):
                    batch = keys[start : start + DELETE_BATCH]
                    await self.client.delete_objects(
                        Bucket=self.bucket, Delete={"Objects": batch, "Quiet": True}
                    )
                    deleted += len(batch)
        except (BotoCoreError, ClientError) as error:
            raise StorageError("storage_unavailable") from error
        return deleted

    async def close(self) -> None:
        await self.exit_stack.aclose()
