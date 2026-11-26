"""메일 발송(ARCHITECTURE §14.3). MAIL_MODE=log(기본)는 본문을 파일로만 쓰고 로그에는 토큰을 남기지 않는다."""
import logging
import os
import smtplib
import time
from email.message import EmailMessage
from pathlib import Path


log = logging.getLogger(__name__)


def mail_mode() -> str:
    return os.environ.get("MAIL_MODE", "log").strip().lower()


def send_mail(to: str, subject: str, body: str) -> None:
    """실패해도 예외를 밖으로 내지 않는다(응답이 계정 유무를 드러내지 않게). 실패는 로그로 남긴다."""
    try:
        if mail_mode() == "smtp":
            msg = EmailMessage()
            msg["From"], msg["To"], msg["Subject"] = os.environ["MAIL_FROM"], to, subject
            msg.set_content(body)
            with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587")), timeout=10) as smtp:
                smtp.starttls()
                if os.environ.get("SMTP_USER"):
                    smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
                smtp.send_message(msg)
        else:
            outbox = Path(os.environ.get("MAIL_OUTBOX_DIR", "mail_outbox"))
            outbox.mkdir(parents=True, exist_ok=True, mode=0o700)
            path = outbox / f"{time.time_ns()}.txt"
            path.write_text(f"To: {to}\nSubject: {subject}\n\n{body}\n", encoding="utf-8")
            path.chmod(0o600)
            log.info("메일을 outbox에 썼음: %s", path.name)
    except Exception:
        log.exception("메일 발송 실패")
