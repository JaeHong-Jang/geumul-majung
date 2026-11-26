import { FileInput } from '../ui/FileInput';
import { imagePayload } from '../supportFiles';
import { orderStatusText } from "../orderStatus";
import { splitTotal, validTotal } from "../../weights";
import { useState } from "react";
import { api, useAction, useResource } from "../api/client";
import { AppButton, BottomBar, AppCard, Feedback, Field, GradeBadge, Ic, InfoRow, Section, StatusTag, TopBar } from "../ui/index";
import { fmt, shortName, type Go, type Order, type Role } from "../../types";
export function RatingStars({
  score,
  onChange,
  small = false,
  label,
}: {
  score: number;
  onChange: (n: number) => void;
  small?: boolean;
  label: string;
}) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          aria-label={`${label} ${n}점`}
          aria-pressed={score === n}
          className={!small && n > score ? "star-off" : ""}
          onClick={() => onChange(n)}
        >
          <Ic
            name={
              small
                ? n <= score
                  ? "star_small_on"
                  : "star_small_off"
                : "star_large"
            }
          />
        </button>
      ))}
    </div>
  );
}
export function Review({
  appRole: role,
  id,
  go,
  back,
}: {
  appRole: Role;
  id: number;
  go: Go;
  back: () => void;
}) {
  const r = useResource<Order>(role, `/orders/${id}`, true);
  const a = useAction();
  const [total, setTotal] = useState("");
  const [passed, setPassed] = useState(true);
  const [note, setNote] = useState("");
  const [inspectNote, setInspectNote] = useState("");
  const [score, setScore] = useState(0);
  const [praised, setPraised] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const o = r.data;
  const inspect = role === "buyer" && ["picked_up", "arrived"].includes(o?.status ?? "");   // 도착 확인과 검사를 한 번에
  const target = role === "seller" ? "recycler" : "factory";
  const rating = (who: string, value: number) =>
    void a.run(
      () =>
        api(role, "/ratings", "POST", {
          order_id: id,
          target: who,
          score: value,
          comment: [...praised, note].filter(Boolean).join(", "),
        }),
      () => {
        setSubmitted((s) => [...s, who]);
        a.setMessage("후기 저장 완료");
      },
    );
  return (
    <>
      <TopBar title={role === "buyer" ? "입고 확인, 후기" : "거래 후기"} back={back} />
      <Feedback {...r} />
      {o && (
        <>
          <AppCard className="card16" style={{ padding: 14 }}>
            <div className="row" style={{ gap: 12 }}>
              {role === "buyer" ? <Ic name="tab_list_on" size={28} /> : <GradeBadge {...(o.grade ? { grade: o.grade } : {})} />}
              <div className="listing-copy">
                <b>{shortName(o.waste_name)}</b>
                <small className="muted">
                  판매자 {o.factory_name}, {fmt(o.total_kg)} kg
                </small>
              </div>
              <StatusTag>{orderStatusText(o.status, o.transport)}</StatusTag>
            </div>
          </AppCard>
          {role === "buyer" && (
            <Section title="입고 검수">
              <p className="muted tiny" style={{ wordBreak: "keep-all" }}>
                받은 무게와 품질 확인, 제출하면 도착 확인도 함께 기록, 결과는 정산과 판매자 신뢰도에 반영
              </p>
              <AppCard className="card16">
                <div className="stack" style={{ gap: 14 }}>
                  <InfoRow
                    label="주문 무게"
                    value={`${fmt(o.total_kg)} kg`}
                  />
                  {inspect ? (
                    <>
                      <Field
                        label="받은 전체 무게 (kg)"
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        step="any"
                        required
                        value={total}
                        placeholder={`주문 ${fmt(o.total_kg)} kg`}
                        onChange={(e) => setTotal(e.target.value)}
                      />
                      {Number(total) > 0 && Math.abs(Number(total) / o.total_kg - 1) > 0.05 && (
                        <p className="muted tiny">주문 무게와 5% 넘게 차이, 제출하면 이의 확인으로 넘어감</p>
                      )}
                      <hr className="divider" />
                      <b>품질</b>
                      <div className="row">
                        <label className="row">
                          <input
                            type="radio"
                            checked={passed}
                            onChange={() => setPassed(true)}
                          />
                          합격
                        </label>
                        <label className="row">
                          <input
                            type="radio"
                            checked={!passed}
                            onChange={() => setPassed(false)}
                          />
                          불합격
                        </label>
                      </div>
                      <label className="field">
                        검사 메모
                        <textarea
                          value={inspectNote}
                          onChange={(e) => setInspectNote(e.target.value)}
                        />
                      </label>
                      <FileInput label="검사 사진 첨부" accept="image/jpeg,image/png,image/webp" disabled={a.busy} onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void a.run(async () => api(role, `/orders/${id}/photos`, "POST", {stage:"inspect", ...await imagePayload(file)}), () => a.setMessage("검사 사진 등록 완료"));
                      }} />
                    </>
                  ) : (
                    <p className="muted">
                      {o.status === "disputed"
                        ? "검사 이의 확인 중"
                        : o.status === "settled" ||
                            o.status === "confirmed" ||
                            o.status === "rated"
                          ? "입고 검사 완료"
                          : "판매자 출고 후 검사 가능"}
                    </p>
                  )}
                </div>
              </AppCard>
            </Section>
          )}
          <Section
            title={
              role === "seller" ? "구매자 평가" : "판매자 평가"
            }
          >
            <AppCard className="card16">
              <div className="stack" style={{ gap: 14 }}>
                <RatingStars
                  score={score}
                  onChange={setScore}
                  label={role === "seller" ? "구매자" : "판매자"}
                />
                <b className="green" style={{ textAlign: "center" }}>
                  {
                    [
                      "불만족",
                      "다소 불만족",
                      "보통",
                      "만족",
                      "매우 만족",
                    ][score - 1]
                  }
                </b>
                <div className="row wrap">
                  {(role === "seller" ? ["정산 약속 준수", "원활한 연락", "신속한 입고 확인"] : [
                    "분류 상태 양호",
                    "약정 수량 일치",
                    "품목 설명 일치",
                    "포장 상태 양호",
                    "원활한 연락",
                  ]).map((p) => (
                    <button
                      key={p}
                      className="praise-chip"
                      aria-pressed={praised.includes(p)}
                      onClick={() =>
                        setPraised((v) =>
                          v.includes(p) ? v.filter((x) => x !== p) : [...v, p],
                        )
                      }
                    >
                      {praised.includes(p) && <Ic name="check_chip" />}
                      {p}
                    </button>
                  ))}
                </div>
                {!inspect && (
                  <AppButton
                    outlined
                    disabled={
                      a.busy || (role === "seller" && !["settled", "rated"].includes(o.status)) || score === 0 || !o.allbaro_no || submitted.includes(target)
                    }
                    onClick={() => rating(target, score)}
                  >
                    {submitted.includes(target)
                      ? "후기 등록 완료"
                      : "후기 등록"}
                  </AppButton>
                )}
              </div>
            </AppCard>
          </Section>
          <label className="field">
            거래 후기
            <textarea
              style={{ height: 96 }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="거래 후기 입력"
            />
          </label>
          {role === "seller" && !["settled", "rated"].includes(o.status) && <p>정산 완료 후 거래 별점 작성 가능</p>}
          {!o.allbaro_no && (
            <p className="muted">
              세 칸의 인계서와 올바로 번호 등록 후 후기 작성 가능
            </p>
          )}
          {role === "buyer" && <Section title="처리자 인계서">
            <AppCard>
              <div className="stack">
                <p>입고 검사 확정 후 처리 방법 작성</p>
                <AppButton
                  outlined
                  onClick={() => go({ name: "handover", id })}
                >
                  인계서 작성, 확인
                </AppButton>
              </div>
            </AppCard>
          </Section>}
          {inspect && (
            <BottomBar>
              <AppButton
                disabled={a.busy || !validTotal(o, Number(total))}
                onClick={() =>
                  void a.run(
                    () =>
                      api<Order>(role, `/orders/${id}/inspect`, "POST", {
                        bag_weights: splitTotal(o, Number(total)),
                        passed,
                        note: inspectNote,
                      }),
                    (result) => {
                      if (result.status !== "disputed") return go({ name: "trade-done", id });
                      a.setMessage("무게 차이 또는 불합격으로 이의 확인 상태로 전환");
                      void r.refresh();
                    },
                  )
                }
              >
                입고 검사 제출
              </AppButton>
            </BottomBar>
          )}
        </>
      )}
      <Feedback {...a} />
    </>
  );
}
