import { useResource } from "../api/client";
import { AppButton, AppCard, BottomBar, Feedback, Ic } from "../ui/index";
import type { Go, Order, Role } from "../../types";
import { Receipt } from "./OrderDetail";

/** 입고 검사 합격 직후: 정산까지 끝난 거래의 영수증과 남은 일(인계서, 후기). */
export function TradeDone({ appRole: role, id, go }: { appRole: Role; id: number; go: Go }) {
  const r = useResource<Order>(role, `/orders/${id}`, true);
  const o = r.data;
  return (
    <>
      <div className="stack done">
        <div className="done-check"><Ic name="check_done" /></div>
        <h1>거래 완료</h1>
        <p className="muted">입고 검사 합격, 받은 무게 기준으로 정산 완료</p>
      </div>
      <Feedback {...r} />
      {o && <Receipt o={o} role={role} />}
      {o && (
        <AppCard className="card16">
          <div className="stack">
            <b>남은 일</b>
            <p className="muted tiny" style={{ wordBreak: "keep-all" }}>{o.allbaro_no ? "인계서 등록 완료, 거래 후기 작성 가능" : "처리자 인계서 작성 후 올바로 번호 등록, 그다음 거래 후기 작성 가능"}</p>
            {o.allbaro_no
              ? <AppButton outlined onClick={() => go({ name: "review", id })}>거래 후기 남기기</AppButton>
              : <AppButton outlined onClick={() => go({ name: "handover", id })}>인계서 작성</AppButton>}
          </div>
        </AppCard>
      )}
      <BottomBar>
        <div className="done-actions">
          <AppButton outlined onClick={() => go({ name: "home" })}>홈으로</AppButton>
          <AppButton onClick={() => go({ name: "orders" })}>거래내역 보기</AppButton>
        </div>
      </BottomBar>
    </>
  );
}
