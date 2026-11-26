import { OrderChecklist } from './OrderChecklist';
import { orderStatusText } from "../orderStatus";
import { money as won, dateText } from "../format";
import { api, useAction, useResource } from "../api/client";
import { AppButton, AppCard, Feedback, StatusTag, TopBar } from "../ui/index";
import type { ReactNode } from "react";
import "./receipt.css";
import { fmt, shortName, type Go, type Order, type Role } from "../../types";
import { Steps } from './OrderSteps';

/** 입고지 하차 장비 표기. */
const DOCK_UNLOAD: Record<string, string> = { forklift: "지게차 있음", crane: "크레인, 호이스트 있음", both: "지게차, 크레인 모두 있음", manual: "장비 없음, 인력 하차", none: "장비 없음, 운송 차량이 직접 하차" };

/** 영수증 한 줄: 항목, 점선, 값. total이면 합계처럼 굵게. */
function Line({ label, value, total }: { label: string; value: ReactNode; total?: boolean }) {
  return <div className={`receipt-line${total ? " total" : ""}`}><span>{label}</span><i aria-hidden="true" /><b>{value}</b></div>;
}

/** 거래 영수증 본문. 주문 상세와 구매 요청 완료 화면이 함께 쓴다. */
export function Receipt({ o, role }: { o: Order; role: Role }) {
  return (
    <div className="receipt-wrap">
      <article className="receipt" aria-label={`주문 ${o.id} 영수증`}>
        <header className="receipt-head">
          <img src="/icons/logo_mark.svg" alt="" />
          <small>잔재미 거래 영수증</small>
          <h2>{shortName(o.waste_name)}</h2>
          <StatusTag>{orderStatusText(o.status, o.transport)}</StatusTag>
        </header>
        <hr />
        <Line label="주문 번호" value={o.id} />
        {!!o.history?.length && <Line label="최근 갱신" value={dateText(o.history.at(-1)!.at)} />}
        <hr />
        <h3>거래처</h3>
        <Line label="판매자" value={o.factory_name ?? "확인 중"} />
        <Line label="구매자" value={o.recycler_name ?? "확인 중"} />
        <hr />
        <h3>내역</h3>
        <Line label="수량" value={`${fmt(o.total_kg)} kg`} />
        {o.goods_krw != null && <Line label="원료비" value={won(o.goods_krw)} />}
        {o.transport !== "self" && <Line label="운임" value="판매자 부담" />}
        {o.held_krw != null && <Line label={role === "buyer" ? "결제 보류 금액" : "보류액"} value={won(o.held_krw)} total={role === "buyer" && !o.settlement} />}
        {(o.transport || o.payment || o.desired_date || o.delivery_address || o.note) && <hr />}
        {o.transport && <Line label="운송 방식" value={o.transport === "self" ? "직접 수거" : "판매자 운송"} />}
        {o.payment && <Line label="결제 방식" value={o.payment === "invoice" ? "세금계산서 발행 후 계좌이체" : "안전결제 (에스크로)"} />}
        {o.tax_invoice && <Line label="세금계산서" value={`발행 요청, ${o.tax_invoice.email}`} />}
        {o.desired_date && <Line label="희망 도착일" value={dateText(o.desired_date)} />}
        {o.delivery_address && <Line label="입고지" value={o.delivery_address} />}
        {o.note && <Line label="판매자에게 남길 말" value={o.note} />}
        {o.dock && <>
          <hr />
          <h3>입고지 하차 조건</h3>
          <Line label="하차 장비" value={DOCK_UNLOAD[o.dock.unload] ?? o.dock.unload} />
          <Line label="진입 가능 차량" value={o.dock.max_vehicle} />
          {o.dock.hours && <Line label="가능 시간" value={o.dock.hours} />}
          {o.dock.note && <Line label="위치, 주의" value={o.dock.note} />}
        </>}
        {o.settlement && <>
          <hr />
          <h3>정산 내역</h3>
          {o.settlement.factory_krw != null && <Line label="판매자 정산" value={won(o.settlement.factory_krw)} />}
          {o.settlement.platform_krw != null && <Line label="플랫폼 수수료" value={won(o.settlement.platform_krw)} />}
          {o.settlement.refund_krw != null && <Line label="환불" value={won(o.settlement.refund_krw)} />}
          {o.settlement.invoice && <p className="receipt-note">원료비는 판매자에게 직접 정산</p>}
          {role === "buyer" && !o.settlement.invoice && o.held_krw != null && o.settlement.refund_krw != null && <Line label="최종 결제 금액" value={won(o.held_krw - o.settlement.refund_krw)} total />}
        </>}
        {!!o.history?.length && <>
          <hr />
          <h3>진행 이력</h3>
          {o.history.map((h, i) => <Line key={i} label={orderStatusText(h.to)} value={dateText(h.at)} />)}
        </>}
      </article>
    </div>
  );
}

/** id로 주문을 불러와 영수증만 그린다(구매 요청 완료 화면에서 펼칠 때). */
export function OrderReceipt({ appRole, id }: { appRole: Role; id: number }) {
  const r = useResource<Order>(appRole, `/orders/${id}`, true);
  return <><Feedback {...r} />{r.data && <Receipt o={r.data} role={appRole} />}</>;
}

export function OrderDetail({ appRole: role, id, go, back }: { appRole: Role; id: number; go: Go; back: () => void }) {
  const r = useResource<Order>(role, `/orders/${id}`, true);
  const a = useAction();
  const o = r.data;
  const cancel = () => {
    if (!window.confirm("주문 취소 확인")) return;
    void a.run(() => api(role, `/orders/${id}/cancel`, "POST", {}), () => void r.refresh());
  };
  return (
    <>
      <TopBar title="주문 상세" back={back} />
      <Feedback {...r} />
      <Feedback {...a} />
      {o && (
        <>
          <section className="order-progress" aria-label="진행 단계">
            <div className="order-progress-head">
              <b>{orderStatusText(o.status, o.transport)}</b>
              <small>주문 {o.id}</small>
            </div>
            <Steps status={o.status} transport={o.transport} />
          </section>
          {role === "buyer" && ["picked_up", "arrived"].includes(o.status) && (
            <AppButton onClick={() => go({ name: "review", id })}>도착 확인, 입고 검사</AppButton>
          )}
          <Receipt o={o} role={role} />
          {(role === 'buyer' || role === 'seller') && <OrderChecklist appRole={role} id={id} />}
          {!!o.weight_warning && <p className="error">신고 무게와 실측 무게 차이 확인 필요</p>}
          {o.status === "disputed" && <AppCard><h2>분쟁 처리 중</h2><p>{o.dispute_reason || "분쟁 사유 확인 중"}</p></AppCard>}
          <section className="order-actions" aria-label="주문 관리">
            <AppButton outlined onClick={() => go({ name: "chat", id })}>거래 대화</AppButton>
            <AppButton outlined onClick={() => go({ name: "handover", id })}>인계서 보기, 작성</AppButton>
            <AppButton outlined onClick={() => go({ name: "support", id })}>문의, 분쟁</AppButton>
            {o.allbaro_no && ["settled", "rated"].includes(o.status) && (
              <AppButton outlined onClick={() => go({ name: "review", id })}>후기 작성</AppButton>
            )}
            {role === "buyer" && ["payment_held", "dispatched"].includes(o.status) && (
              <AppButton outlined className="order-cancel" disabled={a.busy} onClick={cancel}>주문 취소</AppButton>
            )}
          </section>
        </>
      )}
    </>
  );
}
