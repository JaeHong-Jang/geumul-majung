"""사진·증빙 업로드 공통(ARCHITECTURE §12.8, §13.5): base64 크기·형식을 디코드 전후로 검사하고, 내려줄 때는 nosniff."""
import base64
import binascii
from typing import Literal

from fastapi import HTTPException, Response
from pydantic import BaseModel, Field


MAX_BYTES = 2 * 1024 * 1024


MAX_B64 = (MAX_BYTES + 2) // 3 * 4   # 디코드 전에 걸러 내는 base64 글자 수 상한


MAGIC = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n", "image/webp": b"RIFF", "application/pdf": b"%PDF-"}


class ImageIn(BaseModel):
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    data_base64: str = Field(min_length=1, max_length=MAX_B64)


class DocumentIn(BaseModel):
    content_type: Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]
    data_base64: str = Field(min_length=1, max_length=MAX_B64)


def decode_upload(content_type: str, data_base64: str) -> bytes:
    try:
        raw = base64.b64decode(data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "파일 내용이 올바르지 않음")
    if not raw or len(raw) > MAX_BYTES:
        raise HTTPException(400, "파일은 2MB 이하만 가능")
    if not raw.startswith(MAGIC[content_type]) or (content_type == "image/webp" and raw[8:12] != b"WEBP"):
        raise HTTPException(400, "파일 형식이 선언한 형식과 다름")
    return raw


def file_response(data: bytes, content_type: str) -> Response:
    """저장된 content_type으로만 내려준다. PDF는 화면에 열지 않고 첨부로."""
    headers = {"X-Content-Type-Options": "nosniff"}
    if content_type == "application/pdf":
        headers["Content-Disposition"] = 'attachment; filename="document.pdf"'
    return Response(content=data, media_type=content_type, headers=headers)
