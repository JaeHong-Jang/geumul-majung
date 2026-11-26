"""요청 본문 크기 제한(ARCHITECTURE §17)."""

MAX_BODY = 8 * 1024 * 1024


class BodyLimit:
    """/v1/* 요청 본문 8MB 제한. Content-Length가 크면 바로, 길이를 안 밝힌 스트림은 읽는 도중 413(§17)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/v1"):
            return await self.app(scope, receive, send)
        declared = dict(scope["headers"]).get(b"content-length")
        started, total, rejected = False, 0, False

        async def reject():
            nonlocal rejected
            rejected = True
            await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": '{"detail":"요청 본문은 8MB 이하여야 함"}'.encode()})

        if declared and declared.isdigit() and int(declared) > MAX_BODY:
            return await reject()

        async def limited_receive():
            nonlocal total
            msg = await receive()
            if msg["type"] == "http.request":
                total += len(msg.get("body", b""))
                if total > MAX_BODY:
                    # FastAPI는 본문을 읽다 난 예외를 400으로 바꾸므로, 413은 여기서 먼저 보내고 이후 응답은 버린다
                    if not started:
                        await reject()
                    raise _TooLarge()
            return msg

        async def tracking_send(msg):
            nonlocal started
            if rejected:
                return
            started = started or msg["type"] == "http.response.start"
            await send(msg)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _TooLarge:
            pass


class _TooLarge(Exception):
    pass
