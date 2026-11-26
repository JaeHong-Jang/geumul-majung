import { useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import BottomActions from '../components/BottomActions';
import Button from '../components/Button';
import Notice from '../components/Notice';
import { ErrorNote } from '../../../shared/ui/Note';
import { useNav } from '../lib/nav';
import { api, errorText } from '../../../shared/api/seller';
import { getDraft, setDraft } from '../lib/draft';
import { WASTE_CODES } from '../lib/wasteCodes';
import { ITEMS } from './Screen07Register';
import { dateText, perKg, won, materialName } from '../lib/format';
import { PhotoStrip, Receipt, SaleSteps, TRANSPORTS, tradeNo, unloadText, weightText } from '../components/SaleParts';
import './Screen08Confirm.css';

const today = () => dateText(new Date().toISOString());

// 판매 내용 확인: 등록한 내용을 영수증처럼 보여 주고 판매를 확정한다
export default function Screen08Confirm() {
  const nav = useNav();
  const draft = getDraft();
  const [grade, setGrade] = useState(draft && draft.grade);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!draft || !draft.bag) {
    return (
      <Screen id="confirm">
        <ScreenHeader title="판매 내용 확인" back />
        <ScrollBody>
          <Notice empty title="확인할 등록 내용 없음">판매 정보 먼저 입력</Notice>
          <Button onClick={() => nav.go('register')}>판매 등록하기</Button>
        </ScrollBody>
      </Screen>
    );
  }

  const { bag, form } = draft;
  const price = Number(String(form.price).replace(/,/g, ''));
  const total = Math.round(bag.total_kg * price);
  const gr = grade && grade.grade;
  const ok = !!(gr && gr.grade);
  const mode = form.mode;
  const terms = { unload_forklift: form.unloadForklift, unload_crane: form.unloadCrane };

  // 위험 재질 메모 때문에 판매가 보류됐을 때: 없음을 확인하고 다시 확인 요청
  const regrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/bags/${bag.id}/grade`, { method: 'POST', body: { confirm_no_hazard: true } });
      setGrade(r);
      setDraft({ ...draft, grade: r });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = { bag_ids: [bag.id], mode, price_krw_per_kg: price, transport: form.transport || 'own',
        unload_forklift: !!form.unloadForklift, unload_crane: !!form.unloadCrane };
      if (form.availableFrom) body.available_from = form.availableFrom;
      if (form.pickupNote?.trim()) body.pickup_note = form.pickupNote.trim();
      if (form.shipHours) body.ship_hours = form.shipHours;
      const l = await api('/listings', { method: 'POST', body });
      sessionStorage.setItem(`advice_${l.id}`, JSON.stringify(l.advice || null));
      setDraft(null);
      nav.go('bag', { listing: l.id });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const wasteName = (ITEMS.find((w) => w.code === bag.waste_code) || WASTE_CODES.find((w) => w.code === bag.waste_code) || {}).name || bag.waste_code;
  return (
    <Screen id="confirm">
      <ScreenHeader title="판매 내용 확인" back />
      <ScrollBody>
        <SaleSteps at={1} />

        {!ok && (
          <div className="sale-warn" role="alert">
            <b>판매 전 확인 필요</b>
            {(gr?.reasons || []).length ? gr.reasons.join(', ') : '메모에 위험 재질로 보이는 말이 있어 판매가 보류됨'}
            <div style={{ marginTop: 10 }}>
              <Button variant="secondary" onClick={regrade} disabled={busy}>위험 재질 없음 확인하고 다시 확인</Button>
            </div>
          </div>
        )}

        <Receipt
          title="판매 등록서"
          no={tradeNo('R', bag.id)}
          date={`${today()} 작성`}
          rows={[
            ['품목', wasteName],
            ['주 재질', materialName(bag.target_material)],
            ['무게', weightText(bag.total_kg)],
            ['판매 방식', mode === 'bundle' ? '모아서 판매' : '바로 판매'],
            ['판매 단가', perKg(price)],
            'line',
            ['출고 가능일', form.availableFrom ? `${dateText(form.availableFrom)}부터` : '바로 출고'],
            ['출고 시간', form.shipHours || '구매자와 조율'],
            ['운송', TRANSPORTS[form.transport || 'own'].title, { sub: '운임 판매자 부담' }],
            ['하차 지원', unloadText(terms)],
            form.pickupNote?.trim() && ['현장 안내', form.pickupNote.trim()],
            form.note?.trim() && ['메모', form.note.trim()],
          ]}
          total={['예상 판매금액', won(total)]}
          footnote="최종 대금은 입고지 도착 검사 무게로 정산. 판매 확정 뒤 구매자 화면에 바로 공개"
        >
          <PhotoStrip urls={(form.photos || []).map((p) => p.url)} />
        </Receipt>
        {draft.photoError && <ErrorNote error={draft.photoError} />}
        <ErrorNote error={error} />

        <Button variant="secondary" onClick={() => nav.go('register')}>입력 정보 수정</Button>
      </ScrollBody>
      <BottomActions height={96}>
        <Button onClick={confirm} disabled={busy || !ok}>
          {busy ? '처리 중…' : mode === 'bundle' ? '모아서 판매 확정' : '바로 판매 확정'}
        </Button>
      </BottomActions>
    </Screen>
  );
}
