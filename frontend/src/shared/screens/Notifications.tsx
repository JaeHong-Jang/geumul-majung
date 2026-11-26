import { groupNotifications, notificationIcon, notificationTime } from "./notification-format";
import { api, useAction, useResource } from "../api/client";
import { Empty, Feedback, TopBar } from "../ui/index";
import { fmt, type Go, type Role } from "../../types";
export function Notifications({
  appRole: role,
  go,
  back,
}: {
  appRole: Role;
  go: Go;
  back: () => void;
}) {
  const r = useResource<{
    unread: number;
    items: {
      id: number;
      title: string;
      body: string;
      order_id: number | null;
      read: boolean;
      created_at: string;
    }[];
  }>(role, "/notifications", true);
  const a = useAction();
  const now = new Date();
  return (
    <>
      <TopBar title="알림" back={back} />
      <div className="row between">
        <span>읽지 않은 알림 {fmt(r.data?.unread)}개</span>
        <button
          className="text-button"
          disabled={a.busy}
          onClick={() =>
            void a.run(
              () => api(role, "/notifications/read-all", "POST", {}),
              () => void r.refresh(),
            )
          }
        >
          모두 읽음
        </button>
      </div>
      <Feedback {...r} />
      <Feedback {...a} />
      {groupNotifications(r.data?.items ?? [], now).map(group => (
        <section className="notification-group" aria-label={group.label} key={group.label}>
          <h2>{group.label}</h2>
          {group.items.map(n => (
            <button type="button" className={`notification-card${n.read ? '' : ' is-unread'}`} key={n.id} disabled={a.busy}
              onClick={() => void a.run(() => api(role, `/notifications/${n.id}/read`, "POST", {}), () => {void r.refresh();if(n.order_id)go({name:"order",id:n.order_id});})}>
              <span className="notification-icon" aria-hidden="true"><img src={`/icons/${notificationIcon(n.title)}.svg`} alt="" /></span>
              <span className="notification-copy">
                <span className="notification-heading"><b>{n.title}</b><time dateTime={n.created_at}>{notificationTime(n.created_at, now)}</time></span>
                <span className="notification-body">{n.body}</span>
                {!n.read && <span className="notification-unread-label">읽지 않음</span>}
              </span>
            </button>
          ))}
        </section>
      ))}
      {!r.loading && !r.error && !r.data?.items.length && (
        <Empty>도착한 알림 없음</Empty>
      )}
    </>
  );
}
