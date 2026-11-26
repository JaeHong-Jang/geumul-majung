import { useResource } from "../api/client";
import { AppCard, Empty, Feedback, InfoRow, TopBar } from "../ui/index";
import { fmt, type Role } from "../../types";
export function Frequent({
  appRole: role,
  back,
}: {
  appRole: Role;
  back: () => void;
}) {
  const r = useResource<
    {
      factory_id: number;
      name: string;
      region: string;
      order_count: number;
      total_kg: number;
      avg_rating: number | null;
    }[]
  >(role, "/me/frequent-sellers");
  return (
    <>
      <TopBar title="자주 거래하는 판매자" back={back} />
      <Feedback {...r} />
      {r.data?.map((s) => (
        <AppCard key={s.factory_id}>
          <div className="stack">
            <h2>{s.name}</h2>
            <small>{s.region}</small>
            <InfoRow label="거래 횟수" value={`${fmt(s.order_count)}건`} />
            <InfoRow label="거래 물량" value={`${fmt(s.total_kg)} kg`} />
            {s.avg_rating != null && (
              <InfoRow label="평점" value={`${fmt(s.avg_rating)} / 5`} />
            )}
          </div>
        </AppCard>
      ))}
      {!r.loading && !r.error && !r.data?.length && (
        <Empty>완료한 거래가 쌓이면 판매자 표시</Empty>
      )}
    </>
  );
}
