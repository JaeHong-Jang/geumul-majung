import { useEffect, useRef } from "react";
import type { Filters, Region } from "../types";
import { DEFAULT_FILTERS, MAX_FIT_TON, won } from "../lib/orders";

const REGIONS: [Region, string][] = [["all", "전체"], ["local", "구미·칠곡권"], ["far", "다른 지역"]];
const EMPTY_LIMITS: (number | null)[] = [null, 5, 10, 20];
const PER_KM: (number | null)[] = [null, 2000, 3000, 4000];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="stack" role="group" aria-label={title}>
      <span className="t14 b">{title}</span>
      <div className="row wrap">{children}</div>
    </div>
  );
}
function Chip({ on, onClick, children, id }: { on: boolean; onClick: () => void; children: React.ReactNode; id?: string }) {
  return <button type="button" className="chip" aria-pressed={on} data-chip={id} onClick={onClick}>{children}</button>;
}

interface Props {
  filters: Filters;
  callTypes: string[];
  resultCount: number;
  onChange: (f: Filters) => void;
  onClose: () => void;
}

/** 공차 상한과 최저 km당 운임은 로드보드 앱에서 기사들이 가장 많이 찾는 조건이다. */
export default function FilterSheet({ filters: f, callTypes, resultCount, onChange, onClose }: Props) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    done.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const toggleType = (t: string) => onChange({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] });

  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 바깥 눌러 닫기. 키보드는 Esc로 닫는다 */
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="콜 필터">
        <div className="modal-body">
          <Group title="콜 종류">
            {callTypes.map((t) => <Chip key={t} id={t} on={f.types.includes(t)} onClick={() => toggleType(t)}>{t}</Chip>)}
          </Group>
          <Group title="지역">
            {REGIONS.map(([r, n]) => <Chip key={r} id={"region-" + r} on={f.region === r} onClick={() => onChange({ ...f, region: r })}>{n}</Chip>)}
          </Group>
          <Group title="공차 거리 상한">
            {EMPTY_LIMITS.map((v) => <Chip key={String(v)} id={"empty-" + String(v)} on={f.maxEmptyKm === v} onClick={() => onChange({ ...f, maxEmptyKm: v })}>{v === null ? "제한 없음" : `${v}km 이내`}</Chip>)}
          </Group>
          <Group title="공차 포함 km당 운임 하한">
            {PER_KM.map((v) => <Chip key={String(v)} id={"per-" + String(v)} on={f.minPerKm === v} onClick={() => onChange({ ...f, minPerKm: v })}>{v === null ? "제한 없음" : `${won(v)} 이상`}</Chip>)}
          </Group>
          <Group title="그 밖의 조건">
            <Chip id="fit" on={f.fit} onClick={() => onChange({ ...f, fit: !f.fit })}>내 차량 맞춤 ({MAX_FIT_TON}톤 이하)</Chip>
            <Chip id="saved" on={f.savedOnly} onClick={() => onChange({ ...f, savedOnly: !f.savedOnly })}>저장한 콜만</Chip>
          </Group>
        </div>
        <div className="row">
          <button type="button" className="btn line" data-filter-reset onClick={() => onChange(DEFAULT_FILTERS)}>초기화</button>
          <button type="button" className="btn grow" ref={done} data-filter-done onClick={onClose}>콜 {resultCount}건 보기</button>
        </div>
      </div>
    </div>
  );
}
