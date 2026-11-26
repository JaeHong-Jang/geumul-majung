"""요청 본문 형식. 길이 검사는 라우터에서(계약 21.3: 공백을 뺀 1~300자가 아니면 422)."""
from pydantic import BaseModel


class ChatIn(BaseModel):
    message: str
