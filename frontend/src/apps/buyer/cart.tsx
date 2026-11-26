import { TabTitle } from '../../shared/ui/Navigation';
import { EmptyState } from '../../shared/ui/EmptyState';
import { TouchCheckbox } from "../../shared/ui";
import { readCart, writeCart } from "./cartStore";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";
import { AiNote, BottomBar, AppButton, AppCard, Feedback, Ic, InfoRow } from "../../shared/ui/index";
import { MaterialPicture } from "./listing";
import { itemName, keyOf, mainMaterial, priceParts, weight } from "./catalog";
import { fmt, won, type Go, type Preview } from "../../types";
export function Cart({ go }: { go: Go }) {
  const [items, setItems] = useState(readCart);
  useEffect(() => {
    const update = () => setItems(readCart());
    window.addEventListener("janjaemi-cart", update);
    return () => window.removeEventListener("janjaemi-cart", update);
  }, []);
  const [selected, setSelected] = useState(() => readCart().map((x) => x.id));
  const ids = useMemo(
    () => selected.filter((id) => items.some((x) => x.id === id)),
    [selected, items],
  );
  const [preview, setPreview] = useState<Preview>();
  const [previewIds, setPreviewIds] = useState("");
  const currentIds = ids.join(",");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!ids.length) return;
    void api<Preview>("buyer", "/orders/preview", "POST", {
      listing_ids: ids,
      transport: "seller",
    })
      .then((x) => {
        if (active) {
          setPreview(x);
          setPreviewIds(ids.join(","));
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [ids]);
  function remove(removeIds: number[]) {
    const next = items.filter((x) => !removeIds.includes(x.id));
    setItems(next);
    setSelected((s) => s.filter((id) => !removeIds.includes(id)));
    writeCart(next);
  }
  return (
    <>
      <TabTitle title="장바구니" />
      <div className="row between">
        <label className="row">
          <TouchCheckbox
            type="checkbox"
            checked={items.length > 0 && ids.length === items.length}
            onChange={() =>
              setSelected(
                ids.length === items.length ? [] : items.map((x) => x.id),
              )
            }
          />
          전체 선택 ({items.length})
        </label>
        <button onClick={() => remove(ids)}>선택 삭제</button>
      </div>
      {items.map((l) => (
        <AppCard key={l.id}>
          <div className="row">
            <TouchCheckbox
              aria-label={`${mainMaterial(l)} 선택`}
              type="checkbox"
              checked={selected.includes(l.id)}
              onChange={() =>
                setSelected((s) =>
                  s.includes(l.id)
                    ? s.filter((id) => id !== l.id)
                    : [...s, l.id],
                )
              }
            />
            <MaterialPicture k={keyOf(l)} />
            <div className="listing-copy">
              <b style={{ fontSize: 20 }}>{mainMaterial(l)}</b>
              <small>{itemName(l)}</small>
              <small>
                {l.region}, {weight(l.total_kg)}
              </small>
              <b>{priceParts(l.price_krw_per_kg, 'kg').value}{priceParts(l.price_krw_per_kg, 'kg').suffix}</b>
            </div>
            <button
              aria-label={`${mainMaterial(l)} 삭제`}
              onClick={() => remove([l.id])}
            >
              <Ic name="close" />
            </button>
          </div>
        </AppCard>
      ))}
      {!items.length && <EmptyState title="장바구니 비어 있음" description="매물 탭에서 들어가 장바구니 담기" action="매물 보러 가기" onAction={()=>go({name:"explore"})}/>}
      <Feedback error={error} />
      {ids.length > 0 && preview && previewIds === currentIds && (
        <>
          {preview.pickup_groups?.map((g, i) => (
            <AiNote key={i} title="운송 묶음 제안">
              매물 {g.listing_ids.length}건, 합계 {fmt(g.total_kg)} kg
            </AiNote>
          ))}
          <AppCard className="card16">
            <div className="stack">
              <InfoRow label="선택 품목" value={`${ids.length}건`} />
              <InfoRow label="예상 원료비" value={won(preview.goods_krw)} />
              <InfoRow label="플랫폼 수수료" value={won(preview.fee_krw)} />
              <InfoRow label="운임" value="판매자 부담" />
              <InfoRow label="결제 보류 예상 금액" value={won(preview.held_krw)} />
            </div>
          </AppCard>
        </>
      )}
      <BottomBar><AppButton
        disabled={!ids.length}
        onClick={() => go({ name: "purchase", ids })}
      >
        구매 요청하기 ({ids.length}건)
      </AppButton></BottomBar>
    </>
  );
}
