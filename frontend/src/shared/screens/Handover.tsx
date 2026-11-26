import { dateTimeText, weightText } from "../format";
import { useState } from "react";
import { api, useAction, useResource } from "../api/client";
import { AppButton, AppCard, Feedback, Field, InfoRow, StatusTag, TopBar } from "../ui/index";
import { FilterChips } from "../ui/FilterChips";
import { type Handover, type Order, type Role } from "../../types";
import "./handover.css";

const LABELS: Record<string, string> = {
  company_name: "회사명", biz_no: "사업자번호", waste_code: "폐기물 코드", waste_name: "폐기물", carrier_name: "운반자",
  prepared_at: "작성일", vehicle_no: "차량 번호", picked_up_at: "출고일", total_kg: "출고 무게", received_kg: "입고 무게", method: "처리 방법",
};
// 처리 방법은 고르기, 목록에 없으면 직접 입력
const METHODS = ["재활용 (재생원료 생산)", "파쇄 후 재활용", "선별 후 재활용"] as const;
const OWN = "__own";
const AFTER_PICKUP = ["picked_up", "arrived", "confirmed", "settled", "rated"];
const AFTER_INSPECT = ["confirmed", "settled", "rated"];
const WHO: Record<Role, string> = { seller: "판매자", buyer: "구매자" };

type Key = "emitter" | "carrier" | "processor" | "number";
interface Step { key: Key; title: string; owner: Role; open: boolean; wait: string; todo: string }

/** 인계서 네 단계와 담당, 열리는 조건. 판매자 운송이면 운반자 칸도 판매자 몫. */
function stepsOf(o: Order, h: Handover): Step[] {
  const shipped = AFTER_PICKUP.includes(o.status);
  const inspected = AFTER_INSPECT.includes(o.status);
  const three: Step[] = [
    { key: "emitter", title: "배출자", owner: "seller", open: shipped, wait: "판매자 출고 완료 뒤 작성", todo: "배출자 인계서 작성" },
    { key: "carrier", title: "운반자", owner: o.transport === "self" ? "buyer" : "seller", open: shipped, wait: "출고 완료 뒤 작성", todo: "차량 번호 넣고 운반자 인계서 작성" },
    { key: "processor", title: "처리자", owner: "buyer", open: inspected, wait: "구매자 입고 검사 확정 뒤 작성", todo: "처리 방법 고르고 처리자 인계서 작성" },
  ];
  const left = three.filter((s) => !h[s.key as "emitter" | "carrier" | "processor"]);
  return [...three, { key: "number", title: "올바로 번호", owner: "seller", open: !left.length,
    wait: `${left.map((s) => `${WHO[s.owner]} ${s.title}`).join(", ")} 인계서 작성 뒤 입력`, todo: "올바로시스템 인계서 번호 등록" }];
}

export function HandoverScreen({ appRole: role, id, back, home }: { appRole: Role; id: number; back: () => void; home?: () => void }) {
  const r = useResource<Handover>(role, `/orders/${id}/handover`, true);
  const order = useResource<Order>(role, `/orders/${id}`);
  const [vehicle, setVehicle] = useState<string | null>(null);   // null이면 지난번 쓴 차량 번호
  const [pick, setPick] = useState("");
  const [own, setOwn] = useState("");
  const [number, setNumber] = useState("");
  const a = useAction();
  const h = r.data;
  const o = order.data;
  const save = (part: string, body: unknown) =>
    void a.run(() => api(role, `/orders/${id}/handover/${part}`, "POST", body), () => { a.setMessage("인계서 저장 완료"); void r.refresh(); });

  const steps = h && o ? stepsOf(o, h) : [];
  const done = (k: Key) => (k === "number" ? !!h?.allbaro_no : !!h?.[k]);
  // 위 카드는 내 칸을 먼저 본다(운반자 칸과 처리자 칸은 따로 진행). 내 칸이 다 끝났으면 남은 칸
  const next = steps.find((s) => !done(s.key) && s.owner === role && s.open)
    ?? steps.find((s) => !done(s.key) && s.owner === role)
    ?? steps.find((s) => !done(s.key));
  const vehicleNo = (vehicle ?? h?.vehicle_hint ?? "").trim();
  const method = (pick === OWN ? own : pick).trim();

  // 내 차례이고 열린 단계의 입력칸
  const form = (s: Step) => {
    if (s.key === "emitter")
      return <AppButton disabled={a.busy} onClick={() => save("emitter", {})}>배출자 인계서 작성</AppButton>;
    if (s.key === "carrier")
      return <>
        <Field label="운송 차량 번호" placeholder="예: 12가 3456" value={vehicle ?? h?.vehicle_hint ?? ""} onChange={(e) => setVehicle(e.target.value)} />
        {h?.vehicle_hint && <p className="handover-hint">지난번 쓴 차량 번호 자동 입력</p>}
        <AppButton disabled={!vehicleNo || a.busy} onClick={() => save("carrier", { vehicle_no: vehicleNo })}>운반자 인계서 작성</AppButton>
        {!vehicleNo && <p className="handover-hint">차량 번호 입력 필요</p>}
      </>;
    if (s.key === "processor")
      return <>
        <FilterChips label="처리 방법" value={pick} onChange={setPick} options={[...METHODS.map((m) => [m, m] as const), [OWN, "직접 입력"] as const]} />
        {pick === OWN && <Field label="처리 방법 직접 입력" placeholder="예: 세척 후 펠릿 생산" value={own} onChange={(e) => setOwn(e.target.value)} />}
        <AppButton disabled={!method || a.busy} onClick={() => save("processor", { method })}>처리자 인계서 작성</AppButton>
        {!method && <p className="handover-hint">처리 방법 선택 필요</p>}
      </>;
    return <>
      <Field label="올바로 번호" placeholder="올바로시스템 인계서 번호" value={number} onChange={(e) => setNumber(e.target.value)} />
      <AppButton disabled={!number.trim() || a.busy} onClick={() => save("number", { allbaro_no: number.trim() })}>번호 등록</AppButton>
      <p className="handover-hint">번호를 넣으면 인계서 잠금, 고칠 수 없음</p>
    </>;
  };

  return (
    <>
      <TopBar title="폐기물 인계서" back={back} />
      <Feedback {...r} />
      <Feedback {...order} />
      {h && o && (
        <>
          <AppCard className="handover-next">
            <small>{next ? (next.owner === role && next.open ? "지금 할 일" : "기다리는 중") : "인계서 완료"}</small>
            <b>{!next ? "올바로 번호 등록 완료, 인계서 잠금"
              : next.owner === role && next.open ? next.todo
              : next.open ? `${WHO[next.owner]} ${next.title} ${next.key === "number" ? "등록" : "인계서 작성"} 대기`
              : next.key === "processor" && ["picked_up", "arrived"].includes(o.status) && role === "buyer" ? "입고 검사 확정 뒤 처리자 인계서 작성"
              : next.wait}</b>
            <ol className="handover-steps" aria-label="인계서 단계">
              {steps.map((s) => <li key={s.key} className={done(s.key) ? "is-done" : s === next ? "is-now" : undefined}>{s.title}<small>{WHO[s.owner]}</small></li>)}
            </ol>
          </AppCard>
          {role === "seller" && <InfoRow label="총 무게" value={weightText(o.total_kg)} />}
          {steps.map((s) => {
            const mine = s.owner === role;
            const data = s.key === "number" ? null : (h[s.key] as Record<string, unknown> | null);
            return (
              <AppCard key={s.key}>
                <div className="stack">
                  <div className="row between">
                    <h2>{s.title} <small className="handover-owner">{mine ? "내 칸" : WHO[s.owner]}</small></h2>
                    <StatusTag>{done(s.key) ? (s.key === "number" ? "등록 완료" : "작성 완료") : "미작성"}</StatusTag>
                  </div>
                  {s.key === "number" && h.allbaro_no && <InfoRow label="올바로 번호, 작성 잠금" value={h.allbaro_no} />}
                  {data && typeof data === "object" && Object.entries(data)
                    .filter(([, v]) => typeof v === "string" || typeof v === "number")
                    .map(([k, v]) => <InfoRow key={k} label={LABELS[k] ?? k}
                      value={k.endsWith("_at") ? dateTimeText(String(v)) : k.endsWith("_kg") ? weightText(Number(v)) : String(v)} />)}
                  {!done(s.key) && !h.allbaro_no && (mine && s.open ? form(s) : <p className="handover-hint">{s.open ? `${WHO[s.owner]} 작성 차례` : s.wait}</p>)}
                </div>
              </AppCard>
            );
          })}
          {home && <AppButton outlined onClick={home}>홈으로</AppButton>}
        </>
      )}
      <Feedback {...a} />
    </>
  );
}
