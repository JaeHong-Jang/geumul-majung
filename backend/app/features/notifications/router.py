"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_company, get_or_404
from app.core.util import iso
from app.db.models import Company, Notification
from app.db.session import get_session
from app.features.notifications.schemas import NotificationSettings
from app.features.notifications.service import unread_count


router = APIRouter(prefix="/v1")


@router.get("/notifications")
def list_notifications(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    rows = (session.query(Notification).filter_by(company_id=me.id)
            .order_by(Notification.id.desc()).limit(50).all())
    return {"unread": unread_count(session, me),
            "items": [{"id": n.id, "title": n.title, "body": n.body, "order_id": n.order_id, "read": n.read,
                       "created_at": iso(n.created_at)} for n in rows]}


@router.post("/notifications/read-all")
def read_all(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    session.query(Notification).filter_by(company_id=me.id, read=False).update({"read": True})
    session.commit()
    return {"unread": 0}


@router.post("/notifications/{notification_id}/read")
def read_one(notification_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    n = get_or_404(session, Notification, notification_id)
    if n.company_id != me.id:
        raise HTTPException(404, "알림을 찾을 수 없음")
    n.read = True
    session.commit()
    return {"id": n.id, "read": True, "unread": unread_count(session, me)}


@router.get("/me/notification-settings")
def get_notification_settings(me: Company = Depends(current_company)):
    return {"orders": me.notify_orders, "market": me.notify_market}


@router.put("/me/notification-settings")
def put_notification_settings(body: NotificationSettings, me: Company = Depends(current_company),
                              session: Session = Depends(get_session)):
    me.notify_orders, me.notify_market = body.orders, body.market
    session.commit()
    return {"orders": me.notify_orders, "market": me.notify_market}
