import { HeroCard, Badge } from '../../shared/ui/shell';
import { weightText } from "../../shared/format";
import { AiNote, BottomBar, AppButton, AppCard, Ic, InfoRow, Section, TopBar } from "../../shared/ui/index";
import { MaterialPicture } from "./listing";
import { keyOf, weight as tons } from "./catalog";
import { fmt, material, shortName, won, type Bundle, type Go } from "../../types";
export function BundleCard({ bundle, go }: { bundle: Bundle; go: Go }) {
 return <HeroCard eyebrow="공동판매 묶음" title={<>{material(bundle.target_material)||shortName(bundle.waste_name)} 공동판매</>} badge={bundle.meets_min_lot?<Badge>최소 구매량 충족</Badge>:undefined} actions={<><AppButton onClick={()=>go({name:'purchase',ids:bundle.listing_ids})}>구매 요청하기</AppButton><AppButton outlined onClick={()=>go({name:'bundle',bundle})}>자세히</AppButton></>}>{fmt(bundle.seller_count)}개 기업 참여, 합계 {weightText(bundle.total_kg)}</HeroCard>;
}
export function BundleDetail({
  bundle,
  go,
  back,
}: {
  bundle: Bundle;
  go: Go;
  back: () => void;
}) {
  return (
    <>
      <TopBar title="공동판매 묶음" back={back} />
      <div className="bundle-card bundle-detail">
        <div className="row kicker">
          <Ic name="sparkle_16" />
          공동판매 묶음
        </div>
        <h2>
          {material(bundle.target_material) || shortName(bundle.waste_name)}
          <br />
          {bundle.seller_count}개 기업 묶음
        </h2>
        <div className="bundle-figures">
          {[
            ["합계", `${weightText(bundle.total_kg)}`],
            ["참여 기업", `${bundle.seller_count}곳`],
            ["평균 거리", `${bundle.avg_distance_km.toFixed(1)} km`],
          ].map(([t, v]) => (
            <div key={t}>
              <small>{t}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row between">
            <small>최소 구매량 {fmt(bundle.min_lot_kg)} kg</small>
            <b style={{ color: "var(--color-gold)", fontSize: "var(--font-secondary)" }}>
              {bundle.meets_min_lot ? "충족" : "모집 중"}
            </b>
          </div>
          <div className="bundle-progress">
            <i
              style={{
                width: `${Math.min(100, (bundle.total_kg / Math.max(bundle.min_lot_kg, 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>
      <Section title="묶음 구성 기준">
        {bundle.reasons.map((x) => (
          <div className="bundle-reason" key={x}>
            <span>
              <Ic name="check_reason" />
            </span>
            <p>{x.replace(/([\d,]+(?:\.\d+)?)\s*kg/g, (_, number: string) => weightText(Number(number.replaceAll(",", ""))))}</p>
          </div>
        ))}
      </Section>
      <Section title="참여 기업">
        {bundle.listings.map((l) => (
          <AppCard key={l.id}>
            <button
              className="row"
              style={{ width: "100%", textAlign: "left", gap: 12 }}
              onClick={() => go({ name: "listing", id: l.id })}
            >
              <MaterialPicture k={keyOf(l)} size={40} />
              <span className="listing-copy">
                <b>{l.factory_name}</b>
                <small className="muted">
                  {l.region}
                </small>
              </span>
              <b>{tons(l.total_kg)}</b>
            </button>
          </AppCard>
        ))}
      </Section>
      <AiNote title="함께 모은 물량">
        <InfoRow label="합계" value={`${weightText(bundle.total_kg)}`} />
        <InfoRow label="평균 단가" value={`${won(bundle.avg_price)}/kg`} />
      </AiNote>
      <BottomBar>
        <AppButton
          onClick={() => go({ name: "purchase", ids: bundle.listing_ids })}
        >
          묶음 구매 요청
        </AppButton>
      </BottomBar>
    </>
  );
}
