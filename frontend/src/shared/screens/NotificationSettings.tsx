import { Switch } from '../ui/Switch';
import { useState } from "react";
import { api, useAction, useResource } from "../api/client";
import { AppButton, AppCard, Feedback, TopBar } from "../ui/index";
import { type Role } from "../../types";
export function SettingsForm({
  appRole: role,
  initial,
}: {
  appRole: Role;
  initial: { orders: boolean; market: boolean };
}) {
  const [values, setValues] = useState(initial);
  const a = useAction();
  return (
    <>
      {(
        [
          ["orders", "주문 상태 알림"],
          ["market", "시세 알림"],
        ] as const
      ).map(([key, title]) => (
        <AppCard key={key}>
          <div className="row between">
            {title}
            <Switch label={title} checked={values[key]} onChange={checked => setValues({...values,[key]:checked})} />
          </div>
        </AppCard>
      ))}
      <Feedback {...a} />
      <AppButton
        disabled={a.busy}
        onClick={() =>
          void a.run(
            () => api(role, "/me/notification-settings", "PUT", values),
            () => a.setMessage("알림 설정 저장 완료"),
          )
        }
      >
        알림 설정 저장
      </AppButton>
    </>
  );
}
export function NotificationSettings({
  appRole: role,
  back,
}: {
  appRole: Role;
  back: () => void;
}) {
  const r = useResource<{ orders: boolean; market: boolean }>(
    role,
    "/me/notification-settings",
  );
  return (
    <>
      <TopBar title="알림 설정" back={back} />
      <Feedback {...r} />
      {r.data && <SettingsForm appRole={role} initial={r.data} />}
    </>
  );
}
