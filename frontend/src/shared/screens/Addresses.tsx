import { useState } from "react";
import { api, useAction, useResource } from "../api/client";
import { AppButton, AppCard, Empty, Feedback, Field, StatusTag, TopBar } from "../ui/index";
import { type Address, type Role } from "../../types";
export function Addresses({
  appRole: role,
  back,
}: {
  appRole: Role;
  back: () => void;
}) {
  const r = useResource<Address[]>(role, "/me/addresses");
  const a = useAction();
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  return (
    <>
      <TopBar title="배송지 관리" back={back} />
      <Feedback {...r} />
      {r.data?.map((x) => (
        <AppCard key={x.id}>
          <div className="stack">
            <div className="row">
              <b>{x.label}</b>
              {x.is_default && <StatusTag>기본 배송지</StatusTag>}
            </div>
            <p>{x.address}</p>
            <div className="row">
              <AppButton
                outlined
                disabled={a.busy || x.is_default}
                onClick={() =>
                  void a.run(
                    () =>
                      api(role, `/me/addresses/${x.id}/default`, "POST", {}),
                    () => void r.refresh(),
                  )
                }
              >
                기본으로 설정
              </AppButton>
              <AppButton
                outlined
                disabled={a.busy}
                onClick={() =>
                  void a.run(
                    () => api(role, `/me/addresses/${x.id}`, "DELETE"),
                    () => void r.refresh(),
                  )
                }
              >
                삭제
              </AppButton>
            </div>
          </div>
        </AppCard>
      ))}
      {!r.loading && !r.error && !r.data?.length && <Empty>등록 배송지 없음</Empty>}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(
            () =>
              api(role, "/me/addresses", "POST", {
                label: label.trim(),
                address: address.trim(),
              }),
            () => {
              setLabel("");
              setAddress("");
              void r.refresh();
            },
          );
        }}
      >
        <Field
          label="배송지 이름"
          value={label}
          required
          onChange={(e) => setLabel(e.target.value)}
        />
        <Field
          label="주소"
          value={address}
          required
          onChange={(e) => setAddress(e.target.value)}
        />
        <AppButton disabled={a.busy || !label.trim() || !address.trim()}>
          배송지 추가
        </AppButton>
      </form>
      <Feedback {...a} />
    </>
  );
}
