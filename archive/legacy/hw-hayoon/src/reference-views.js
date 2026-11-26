import { icon } from './icons.js';
import { money, escapeHtml } from './format.js';
import { compareMetrics, suitabilityChecks, transportProgress } from './insights.js';

const distance = value => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const orderNumber = order => `HW-${String(order.id).padStart(4, '0')}`;

function comparisonCard(order, costPerKm) {
  const estimate = compareMetrics(order, costPerKm);
  return `<article class="comparison-card" data-comparison-card data-order-id="${order.id}">
    <header class="comparison-card-header"><span>${orderNumber(order)}</span><button class="comparison-remove" data-action="remove-comparison" data-id="${order.id}" aria-label="${escapeHtml(order.from)} ${escapeHtml(order.to)} 비교에서 빼기">${icon('close', 17)}</button></header>
    <h3>${escapeHtml(order.from)}<span>${icon('arrow', 15)} ${escapeHtml(order.to)}</span></h3>
    <p class="comparison-material">${escapeHtml(order.item)}</p>
    <div class="comparison-fare"><span>운임 상한</span><strong>${money(order.fare)}<small>원</small></strong></div>
    <dl class="comparison-facts">
      <div><dt>공차 포함 거리</dt><dd>${distance(estimate.totalKm)}km</dd></div>
      <div><dt>공차 / 적재 이동</dt><dd>${distance(order.emptyKm)} / ${distance(order.loadedKm)}km</dd></div>
      <div><dt>공차 포함 km당 운임</dt><dd>${money(estimate.ratePerKm)}원</dd></div>
      <div><dt>적재량 / 마대</dt><dd>${distance(order.ton)}톤 / ${order.bags}개</dd></div>
      <div><dt>상차 조건</dt><dd>${escapeHtml(order.cond)}</dd></div>
    </dl>
    <div class="comparison-estimate"><div><span>예상 주행비</span><strong>${money(estimate.drivingCost)}원</strong></div><div class="comparison-remainder ${estimate.afterDrivingCost < 0 ? 'is-negative' : ''}"><span>주행비 차감 참고액</span><strong>${money(estimate.afterDrivingCost)}원</strong></div><p>운임 상한에서 위 주행비만 차감한 값</p></div>
    <button class="button button-secondary button-full" data-action="comparison-detail" data-id="${order.id}">운송 조건 자세히 ${icon('chevron', 16)}</button>
  </article>`;
}

export function comparisonDialog(orders, state) {
  const costPerKm = state.preferences.costPerKm;
  return `<div class="comparison-intro"><p>같은 기준으로 운임과 이동 부담을 비교하세요.</p><div class="comparison-intro-actions"><span class="comparison-count">${orders.length} / 3건</span><button class="text-button" data-action="clear-comparison" ${orders.length ? '' : 'disabled'}>선택 비우기</button></div></div>
    <form id="comparison-cost-form" class="comparison-cost-form">
      <label for="cost-per-km"><strong>내 주행비 가정</strong><span>공차 + 적재 거리 1km당</span></label>
      <div class="comparison-cost-controls"><div class="comparison-cost-input"><input id="cost-per-km" name="costPerKm" type="number" min="0" max="10000" step="1" value="${costPerKm}" inputmode="numeric" required aria-describedby="comparison-cost-hint"/><span>원/km</span></div><button class="button button-primary" type="submit">적용</button></div>
      <p id="comparison-cost-hint">기본 450원/km는 시연 가정입니다. 내 차량의 비용 기준으로 바꿔보세요. 아래 계산은 운임 상한 기준이며 실제 수익이 아닙니다.</p>
      <div id="form-error" class="form-error" role="alert"></div>
    </form>
    ${orders.length ? `<div class="comparison-grid" style="--comparison-columns:${orders.length}">${orders.map(order => comparisonCard(order, costPerKm)).join('')}</div>` : `<div class="comparison-empty">${icon('grid', 30)}<h3>비교할 콜을 골라주세요</h3><p>목록에서 ‘비교’를 눌러 최대 3건까지 담을 수 있어요.</p><button class="button button-primary" data-action="close-dialog">콜 고르기</button></div>`}
    <div class="comparison-disclaimer">${icon('info', 18)}<p><strong>실제 수익이나 확정 운임이 아닙니다.</strong> 주행비 차감 참고액에는 인건비·세금·차량 고정비·대기 비용 등이 반영되지 않았어요. 실제 운임은 수락할 때 확정하며, 경로와 비용도 달라질 수 있어요.</p></div>`;
}

export function resourcePanel(order, trip = null) {
  const hasWeights = Array.isArray(trip?.bagWeights) && trip.bagWeights.length === order.bags
    && trip.bagWeights.every(weight => Number.isFinite(weight) && weight > 0);
  const actualKg = hasWeights ? trip.bagWeights.reduce((sum, weight) => sum + weight, 0) : null;
  return `<section class="resource-passport" data-resource-passport>
    <header class="reference-section-heading"><span class="reference-section-symbol">${icon('box', 21)}</span><div><h3>자원 운송 정보</h3><p>어떤 자원이 어디로 이동하는지 확인하세요.</p></div></header>
    <div class="resource-provenance"><span>등록 정보 · 시연 자료</span><span>${orderNumber(order)}</span></div>
    <dl class="resource-facts">
      <div><dt>재질</dt><dd>${escapeHtml(order.material || order.item)}</dd></div>
      <div><dt>품질 분류</dt><dd>프로젝트 등급 ${escapeHtml(order.grade)}</dd></div>
      <div><dt>등록 중량</dt><dd>${money(order.ton * 1000)}kg</dd></div>
      <div><dt>포장·수량</dt><dd>마대 ${order.bags}개</dd></div>
      <div class="resource-actual-weight"><dt>기사 수거 실측</dt><dd>${hasWeights ? `${money(actualKg)}kg <small>기록됨</small>` : '<span class="resource-unconfirmed">상차 확인 전</span>'}</dd></div>
    </dl>
    <div class="resource-trade-route"><div><span>판매 공장</span><strong>${escapeHtml(order.shipper)}</strong></div>${icon('arrow', 18)}<div><span>구매·입고 업체</span><strong>${escapeHtml(order.consignee)}</strong></div></div>
    <p class="resource-trade-note">원료 매매와 별도로, 하윤 파트너는 이 구간의 운송을 맡아요.</p>
    <details class="resource-more"><summary>아직 확인되지 않은 정보 ${icon('down', 15)}</summary><dl><div><dt>발생 공정</dt><dd>미등록</dd></div><div><dt>오염도·성분 검사</dt><dd>미등록</dd></div><div><dt>구매자 입고 검사</dt><dd>${trip?.completedAt ? '구매자 검사 대기' : '입고 후 구매자 확인'}</dd></div></dl></details>
    <p class="reference-footnote">등급은 프로젝트 내 분류이며 법정 인증이 아닙니다. 등록 정보와 현장 상태는 다를 수 있어요.</p>
  </section>`;
}

export function readinessPanel(order) {
  const statuses = { ok: ['check', '등록 확인'], review: ['info', '별도 확인'], blocked: ['close', '수락 불가'] };
  return `<section class="transport-readiness" data-readiness>
    <header class="reference-section-heading"><span class="reference-section-symbol">${icon('list', 21)}</span><div><h3>수락 전 확인할 조건</h3><p>차량·현장·허가 조건을 나눠 확인하세요.</p></div></header>
    <ul>${suitabilityChecks(order).map(row => { const [symbol, label] = statuses[row.status] || statuses.review; return `<li class="readiness-row status-${escapeHtml(row.status)}" data-readiness-condition="${escapeHtml(row.id)}"><span class="readiness-symbol">${icon(symbol, 17)}</span><div><strong>${escapeHtml(row.label)}</strong><p>${escapeHtml(row.value)}</p></div><span class="readiness-status">${label}</span></li>`; }).join('')}</ul>
  </section>`;
}

function recordTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '시각 미기록';
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date(value));
}

export function recordPanel(order, trip) {
  const rows = transportProgress(order, trip);
  return `<section class="transport-record" data-transport-record>
    <header class="reference-section-heading"><span class="reference-section-symbol">${icon('file', 21)}</span><div><h3>운송 기록</h3><p>${orderNumber(order)} · 직접 진행한 단계만 기록해요.</p></div></header>
    <ol class="transport-record-timeline">${rows.map(row => `<li class="record-${escapeHtml(row.status)}" data-record-step="${escapeHtml(row.id)}"><span class="record-step-marker">${icon(row.status === 'done' ? 'check' : row.status === 'current' ? 'clock' : 'minus', 14)}</span><div><strong>${escapeHtml(row.label)}</strong><span>${row.status === 'done' ? escapeHtml(recordTime(row.at)) : row.id === 'inspection' ? '구매자가 별도로 확인' : row.status === 'current' ? '다음 진행 단계' : '아직 진행 전'}</span></div><small>${row.status === 'done' ? '기록됨' : row.status === 'current' ? '대기 중' : '예정'}</small></li>`).join('')}</ol>
    <div class="record-inspection-note">${icon('info', 17)}<p>기사의 도착 확인과 구매자 검사는 별도 단계예요. 구매자 검사와 정산을 기사 화면에서 승인할 수 없어요.</p></div>
    <button class="button button-secondary button-full" data-action="download-record" data-id="${order.id}">${icon('file', 17)} 운송 기록 내려받기</button>
    <p class="reference-footnote">이 브라우저의 시연 기록입니다. 법정 인계서나 올바로 제출 서류를 대체하지 않습니다.</p>
  </section>`;
}
