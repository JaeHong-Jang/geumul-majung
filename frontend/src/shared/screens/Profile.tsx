import { AddressInput, type LocationValue } from "./AddressInput";
import { useState } from "react";
import { api, useAction, useResource } from "../api/client";
import { AppButton, AppCard, Feedback, InfoRow, StatusTag, TopBar } from "../ui/index";
import { type Company, type Role } from "../../types";
export function ProfileForm({
  appRole: role,
  initial,
}: {
  appRole: Role;
  initial: Company;
}) {
  const [location, setLocation] = useState<LocationValue>({region:initial.region ?? "",address:initial.address ?? "", ...(initial.lat != null && initial.lon != null ? {lat:initial.lat,lon:initial.lon} : {})});
  const a = useAction();
  return (
    <>
      <AddressInput appRole={role} value={location} onChange={setLocation} />
      <Feedback {...a} />
      <AppButton
        disabled={a.busy}
        onClick={() =>
          void a.run(
            () =>
              api(role, "/me/profile", "PATCH", {
                ...location,
              }),
            () => a.setMessage("정보 저장 완료"),
          )
        }
      >
        정보 저장
      </AppButton>
    </>
  );
}
export function Profile({
  appRole: role,
  kind,
  back,
}: {
  appRole: Role;
  kind: string;
  back: () => void;
}) {
  const r = useResource<Company>(role, "/me/profile");
  return (
    <>
      <TopBar
        title={
          kind === "verification"
            ? "내 인증"
            : kind === "depot"
              ? "주소 관리"
              : "정보 수정"
        }
        back={back}
      />
      <Feedback {...r} />
      {r.data &&
        (kind === "verification" ? (
          <AppCard>
            <div className="stack">
              <StatusTag>
                {r.data.verified ? "인증 완료" : "인증 대기"}
              </StatusTag>
              <InfoRow
                label="사업자등록번호"
                value={r.data.biz_no || "미등록"}
              />
              <InfoRow label="허가 번호" value={r.data.permit_no || "미등록"} />
              <InfoRow
                label="허가 폐기물 코드"
                value={r.data.permit_codes.join(", ")}
              />
            </div>
          </AppCard>
        ) : (
          <ProfileForm appRole={role} initial={r.data} />
        ))}
    </>
  );
}
