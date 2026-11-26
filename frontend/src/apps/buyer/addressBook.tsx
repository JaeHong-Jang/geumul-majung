import './addressBook.css';
import { useEffect, useState } from "react";
import { api, useAction, useResource } from "../../shared/api/client";
import { loadPostcode } from "../../shared/screens/geocode";
import { BottomSheet } from "../../shared/ui/BottomSheet";
import { AppButton, Empty, Feedback, Field, StatusTag, TopBar } from "../../shared/ui/index";
import type { Address, Company } from "../../types";

/**
 * 입고지 주소록. 쇼핑몰 배송지 관리와 같은 흐름:
 * 주문 화면에는 고른 입고지 한 장과 [변경] → 저장한 입고지 목록에서 고르기, [수정], [+ 새 입고지 추가]
 * 추가할 때는 이름(제1공장 등) → 도로명 주소 검색(우편번호 찾기) → 상세 주소 → 기본 입고지 여부
 */
const NAMES = ["본사 공장", "제1공장", "제2공장", "제3공장", "물류창고"];
const DETAIL_SEP = ", ";

const split = (full: string) => {
  const i = full.indexOf(DETAIL_SEP);
  return i < 0 ? { road: full, detail: "" } : { road: full.slice(0, i), detail: full.slice(i + DETAIL_SEP.length) };
};
const list = (data: unknown) => (Array.isArray(data) ? (data as Address[]) : []);

/** 새 입고지 또는 수정 양식. */
export function AddressForm({ initial, onSaved, onCancel }: { initial?: Address | undefined; onSaved: (a: Address) => void; onCancel: () => void }) {
  const start = initial ? split(initial.address) : { road: "", detail: "" };
  const [label, setLabel] = useState(initial?.label ?? "");
  const [road, setRoad] = useState(start.road);
  const [detail, setDetail] = useState(start.detail);
  const [makeDefault, setMakeDefault] = useState(initial?.is_default ?? false);
  const profile = useResource<Company>("buyer", "/me/profile");
  const a = useAction();
  const search = () => void a.run(async () => {
    await loadPostcode();
    new window.daum!.Postcode({ oncomplete: (d) => { setRoad(d.roadAddress || d.address); setDetail(""); } }).open();
  });
  const signup = profile.data?.address;
  const save = () => void a.run(
    async () => {
      const body = { label: label.trim(), address: detail.trim() ? `${road.trim()}${DETAIL_SEP}${detail.trim()}` : road.trim() };
      const saved = await api<Address>("buyer", initial ? `/me/addresses/${initial.id}` : "/me/addresses", initial ? "PUT" : "POST", body);
      return makeDefault && !saved.is_default ? api<Address>("buyer", `/me/addresses/${saved.id}/default`, "POST", {}) : saved;
    },
    onSaved,
  );
  return (
    <div className="address-form">
      <Field label="입고지 이름" value={label} maxLength={100} placeholder="예) 제1공장" onChange={(e) => setLabel(e.target.value)} />
      <div className="address-chips" role="group" aria-label="입고지 이름 예시">
        {NAMES.map((n) => <button key={n} type="button" aria-pressed={label === n} onClick={() => setLabel(n)}>{n}</button>)}
      </div>
      <label className="field">
        <span>도로명 주소</span>
        <span className="address-search">
          <input value={road} placeholder="주소 검색으로 입력" onChange={(e) => setRoad(e.target.value)} aria-label="도로명 주소" />
          <button type="button" onClick={search}>주소 검색</button>
        </span>
      </label>
      {signup && !initial && (
        <button type="button" className="text-button address-signup" onClick={() => { setRoad(signup); setDetail(""); if (!label) setLabel("본사 공장"); }}>
          가입할 때 등록한 사업장 주소 불러오기
        </button>
      )}
      <Field label="상세 주소" value={detail} maxLength={200} placeholder="예) 2동 하역장, 3층" onChange={(e) => setDetail(e.target.value)} />
      <label className="row small-check"><input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />기본 입고지로 설정</label>
      <Feedback {...a} />
      <div className="address-form-actions">
        <AppButton type="button" outlined onClick={onCancel}>취소</AppButton>
        <AppButton type="button" disabled={a.busy || !label.trim() || !road.trim()} onClick={save}>{initial ? "수정 저장" : "입고지 저장"}</AppButton>
      </div>
    </div>
  );
}

/** 저장한 입고지 목록(고르기, 수정, 삭제, 기본 설정). pick이 있으면 고르기 목록. */
function AddressList({ items, selected, pick, refresh }: { items: Address[]; selected?: string; pick?: (a: Address) => void; refresh: () => void }) {
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const a = useAction();
  if (editing) {
    return <AddressForm initial={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)}
      onSaved={(saved) => { setEditing(null); refresh(); if (pick && editing === "new") pick(saved); }} />;
  }
  return (
    <div className="address-list">
      {items.map((x) => (
        <article key={x.id} className={`address-item ${selected === x.address ? "selected" : ""}`}>
          <button type="button" className="address-pick" disabled={!pick} onClick={() => pick?.(x)} aria-pressed={pick ? selected === x.address : undefined}>
            <span className="address-name"><b>{x.label}</b>{x.is_default && <StatusTag>기본 입고지</StatusTag>}</span>
            <span className="address-line">{x.address}</span>
          </button>
          <span className="address-actions">
            <button type="button" className="text-button" onClick={() => setEditing(x)}>수정</button>
            {!x.is_default && <button type="button" className="text-button" disabled={a.busy} onClick={() => void a.run(() => api("buyer", `/me/addresses/${x.id}/default`, "POST", {}), refresh)}>기본으로</button>}
            <button type="button" className="text-button" disabled={a.busy} onClick={() => { if (window.confirm(`${x.label} 삭제 확인`)) void a.run(() => api("buyer", `/me/addresses/${x.id}`, "DELETE"), refresh); }}>삭제</button>
          </span>
        </article>
      ))}
      {!items.length && <Empty>저장한 입고지 없음</Empty>}
      <Feedback {...a} />
      <button type="button" className="address-add" onClick={() => setEditing("new")}>+ 새 입고지 추가</button>
    </div>
  );
}

/** 주문, 구매 희망 화면의 입고지 칸: 고른 입고지 한 장 + 변경. 값은 주소 문자열(주문에 그대로 저장). */
export function AddressPicker({ value, onChange }: { value: string; onChange: (address: string) => void }) {
  const r = useResource<Address[]>("buyer", "/me/addresses", true);
  const [open, setOpen] = useState(false);
  const items = list(r.data);
  const current = items.find((x) => x.address === value) ?? (value ? undefined : items.find((x) => x.is_default) ?? items[0]);
  const shown = current ?? (value ? { id: 0, label: "입고지", address: value, is_default: false } : undefined);
  // 아직 고르지 않았으면 기본 입고지를 먼저 고른다
  const fallback = !value ? current?.address : undefined;
  useEffect(() => { if (fallback) onChange(fallback); }, [fallback, onChange]);
  return (
    <>
      <div className="address-card">
        {shown ? (
          <div className="address-card-body">
            <span className="address-name"><b>{shown.label}</b>{shown.is_default && <StatusTag>기본 입고지</StatusTag>}</span>
            <span className="address-line">{shown.address}</span>
          </div>
        ) : <p className="muted">등록한 입고지 없음</p>}
        <button type="button" className="address-change" onClick={() => setOpen(true)}>{shown ? "변경" : "추가"}</button>
      </div>
      <Feedback error={r.error} />
      {open && (
        <BottomSheet title="입고지 선택" sub="원료를 받을 공장을 고르거나 새로 추가" onClose={() => setOpen(false)}>
          <AddressList items={items} {...(shown ? { selected: shown.address } : {})} refresh={() => void r.refresh()}
            pick={(x) => { onChange(x.address); setOpen(false); }} />
        </BottomSheet>
      )}
    </>
  );
}

/** 내 정보 > 입고지 관리. */
export function AddressBook({ back }: { back: () => void }) {
  const r = useResource<Address[]>("buyer", "/me/addresses", true);
  return (
    <>
      <TopBar title="입고지 관리" back={back} />
      <p className="muted tiny">원료를 받는 공장 주소. 기본 입고지는 주문할 때 먼저 선택됨</p>
      <Feedback {...r} />
      <AddressList items={list(r.data)} refresh={() => void r.refresh()} />
    </>
  );
}
