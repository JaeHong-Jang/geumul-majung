import { Ic, Tabs } from "../components/ui";
import { DEPOT, GRAPH, LEDGER, PENDING, WEEK, WEEK_TOTAL } from "../lib/data";
import { won } from "../lib/orders";
import type { ScreenProps } from "./api";

const GOAL = 800000;

export function Earn({ a }: ScreenProps) {
  const v = a.version;
  const max = Math.max(...WEEK.map((d) => d[1]));
  const pct = Math.round((WEEK_TOTAL / GOAL) * 100);
  const rows = v === "c" ? LEDGER.slice(0, 3) : LEDGER;
  return (
    <>
      <div className="view">
        <div className="appbar">
          <div className="bar-title"><span className="t20 b">정산</span></div>
          <div className="bar-body between">
            <span className="t28 b num">{won(WEEK_TOTAL)}</span>
            <span className="stack-1 right"><span className="t12 dim">10.28 ~ 11.03 수입</span><span className="t12 m">운행 7건 · 묶음 3건</span></span>
          </div>
        </div>
        <div className="scroll">
          <div className="card">
            <div className="row between">
              <div className="stack-1"><span className="t12 dim m">다음 정산 · 11.06 (금) 입금</span><span className="t20 b num">{won(PENDING)}</span><span className="t12 dim">세금계산서 자동 발행 · 수수료 0원</span></div>
              <button type="button" className="btn line" onClick={() => a.say("세금계산서 내역을 엽니다 (시연)")}>내역</button>
            </div>
          </div>
          {v !== "b" && (
            <div className="card">
              <span className="t16 b">최근 7일 수입</span>
              <div className="bars" role="img" aria-label="최근 7일 일별 수입. 화요일 184,000원이 가장 높습니다.">
                {WEEK.map((d, i) => <div key={d[0]} className={"barcol" + (i === 6 ? " today" : "")}><i style={{ height: Math.max(4, Math.round((d[1] / max) * 76)) }} />{d[0]}</div>)}
              </div>
            </div>
          )}
          {v === "c" ? (
            <div className="card"><span className="t12 dim m">이번 주 목표 {won(GOAL)}</span><div className="bar"><i style={{ width: pct + "%" }} /></div><span className="t14 b num">{pct}% 달성 · {won(GOAL - WEEK_TOTAL)} 남음</span></div>
          ) : (
            <div className="card accent-card"><span className="t12 dim m">주유 쿠폰</span><span className="t14 b">이번 주 묶음 운행 3건 달성 · 15,000원 지급</span></div>
          )}
          <div className="card">
            <span className="t16 b">운행 내역</span>
            <div className="stack" style={{ gap: "var(--s3)" }}>
              {rows.map((l) => (
                <div className="list-row" key={l.d + l.n}>
                  <span className="stack-1 grow"><span className="t14 b">{l.n}{l.bundle && <> <span className="tag y">묶음</span></>}</span><span className="t12 dim">{l.d}</span></span>
                  <span className="stack-1 right"><span className="t14 b num">{won(l.v)}</span><span className={"t12 " + (l.s === "정산 예정" ? "warn" : "dim")}>{l.s}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Tabs screen="earn" go={a.go} />
    </>
  );
}

export function My({ a }: ScreenProps) {
  const g = GRAPH.meta;
  return (
    <>
      <div className="view">
        <div className="appbar">
          <div className="bar-title"><span className="t20 b">마이</span></div>
          <div className="bar-body"><span className="t14 m">경북 89바 1234 · 5톤 윙바디</span></div>
        </div>
        <div className="scroll">
          <div className="card">
            <span className="t16 b">경로 계산에 쓰는 차량 조건</span>
            <div className="stack" style={{ gap: "var(--s3)" }}>
              <div className="list-row"><span className="t14">전고</span><span className="t14 b num">{g.vehicle.heightM}m</span></div>
              <div className="list-row"><span className="t14">총중량</span><span className="t14 b num">{g.vehicle.grossT}t</span></div>
              <div className="list-row"><span className="t14">통행 제한으로 뺀 도로</span><span className="t14 b num">{g.excludedWays}구간</span></div>
            </div>
            <span className="t12 dim">높이·중량 제한이 차량 조건에 걸리는 도로는 경로에서 뺍니다.</span>
          </div>
          <div className="card">
            <span className="t16 b">내 인증</span>
            <div className="row wrap"><span className="tag y"><Ic k="check" s={16} />통과증 스캐너 인증</span><span className="tag">인계서 자동 작성</span></div>
          </div>
          <div className="card">
            <div className="list-row"><span className="stack-1"><span className="t12 dim m">차고지</span><span className="t14 b">{DEPOT.name}</span></span><span className="t12 dim num">{DEPOT.at.join(", ")}</span></div>
          </div>
        </div>
      </div>
      <Tabs screen="my" go={a.go} />
    </>
  );
}
