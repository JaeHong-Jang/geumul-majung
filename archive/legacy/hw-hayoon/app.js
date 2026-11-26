import { ORDERS, DRIVER, LEDGER } from './src/data.js';
import { createInitialState, sanitizeState, toggleSaved, filterOrders, acceptOrder, advanceTrip, assertConnected } from './src/domain.js';
import { shell, callsView, tripsView, earningsView, profileView, orderDetail, money, escapeHtml, routes } from './src/views.js';
import { icon, truckArt } from './src/icons.js';
import { mountCallMap } from './src/map.js';
import { toggleComparison, setCostPerKm, buildTransportRecord } from './src/insights.js';
import { comparisonDialog, readinessPanel, resourcePanel, recordPanel } from './src/reference-views.js';
import { koreanDate } from './src/format.js';

const STORAGE_KEY = 'hw-hayoon-partner-v1';
const app = document.getElementById('app');
const dialogRoot = document.getElementById('dialog-root');
let state;
try { state = sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { state = createInitialState(); }
const ui = { query: '', category: '전체', sort: state.preferences.sort, matched: state.preferences.matched, minFare: 0, maxEmptyKm: 100, selectedId: 1, view: innerWidth < 760 ? 'list' : 'split', earningsFilter: 'all' };
let mapController = null;
let renderVersion = 0;
let toastTimer;
let dialogReturnFocus;
let composingSearch = false;
let route = currentRoute();

function currentRoute() {
  const key = location.hash.slice(1);
  return key in routes ? key : 'calls';
}

function commit(next) {
  state = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { toast('브라우저 저장 공간을 사용할 수 없어 이번 방문에서만 유지돼요.'); }
}

function filteredOrders(savedOnly = route === 'saved') {
  return filterOrders(ORDERS, { ...ui, savedOnly, savedIds: state.savedIds, excludedIds: [...state.completedTrips.map(trip => trip.orderId), ...(state.trip ? [state.trip.orderId] : [])] });
}

async function render({ searchFocus = false } = {}) {
  const version = ++renderVersion;
  const search = document.getElementById('call-search');
  const cursor = search && document.activeElement === search ? search.selectionStart : null;
  const listScroll = document.getElementById('call-list')?.scrollTop || 0;
  const mainScroll = window.scrollY;
  mapController?.destroy();
  mapController = null;
  route = currentRoute();
  let content;
  const filtered = filteredOrders();
  if (['calls', 'saved'].includes(route)) {
    if (!filtered.some(order => order.id === ui.selectedId)) ui.selectedId = filtered[0]?.id || null;
    content = callsView(state, ui, filtered, route === 'saved');
  } else if (route === 'trips') content = tripsView(state);
  else if (route === 'earnings') content = earningsView(state, ui);
  else content = profileView(state);
  app.innerHTML = shell(route, state, content);
  if (document.getElementById('app-dialog') && dialogReturnFocus && !dialogReturnFocus.isConnected) {
    const action = dialogReturnFocus.dataset.action;
    const id = dialogReturnFocus.dataset.id;
    if (action) {
      const selector = `[data-action="${CSS.escape(action)}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}`;
      dialogReturnFocus = app.querySelector(selector) || app.querySelector('[data-action="open-comparison"]');
    }
  }
  document.title = `${routes[route][0]} · HW 하윤`;
  if (document.getElementById('call-list')) document.getElementById('call-list').scrollTop = listScroll;
  if (searchFocus || cursor !== null) {
    const input = document.getElementById('call-search');
    input?.focus({ preventScroll: true });
    if (input && input.type !== 'search' && cursor !== null) input.setSelectionRange(cursor, cursor);
  }
  window.scrollTo({ top: mainScroll, behavior: 'instant' });
  const target = document.getElementById(route === 'trips' ? 'trip-map' : 'call-map');
  if (target) {
    try {
      const controller = await mountCallMap(target, { orders: filtered, selectedId: ui.selectedId, mode: route === 'trips' ? 'trip' : 'calls', activeOrder: state.trip ? ORDERS.find(order => order.id === state.trip.orderId) : null, onSelect: (id) => selectCall(Number(id)) });
      if (version !== renderVersion) controller.destroy();
      else mapController = controller;
    } catch (error) {
      if (version === renderVersion) target.innerHTML = '<div class="empty-state"><p>지도 대신 목록에서 운송 조건을 확인해 주세요.</p></div>';
      console.error('지도 표시 오류', error);
    }
  }
}

function toast(message) {
  const element = document.getElementById('toast');
  clearTimeout(toastTimer);
  element.innerHTML = `${icon('check', 19)}<span>${escapeHtml(message)}</span>`;
  element.classList.add('is-visible');
  toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3400);
}

function navigate(page) {
  closeDialog();
  if (currentRoute() === page) render();
  else location.hash = page;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function openDialog(title, body, { wide = false } = {}) {
  const alreadyOpen = Boolean(document.getElementById('app-dialog'));
  if (!alreadyOpen) dialogReturnFocus = document.activeElement;
  document.getElementById('app-dialog')?.close();
  dialogRoot.innerHTML = `<dialog id="app-dialog" class="app-dialog ${wide ? 'dialog-wide' : ''}" aria-labelledby="dialog-title"><header class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="닫기">${icon('close', 22)}</button></header><div class="dialog-content">${body}</div></dialog>`;
  const dialog = document.getElementById('app-dialog');
  dialog.showModal();
  document.body.classList.add('modal-open');
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
  });
}

function closeDialog() {
  const dialog = document.getElementById('app-dialog');
  if (!dialog) return;
  dialog.close();
  dialogRoot.replaceChildren();
  document.body.classList.remove('modal-open');
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus({ preventScroll: true });
  else document.querySelector('.nav-item.active, .mobile-nav a.active')?.focus({ preventScroll: true });
}

function selectCall(id) {
  ui.selectedId = id;
  if (innerWidth < 760) showDetail(id);
  else {
    const list = document.getElementById('call-list');
    list?.querySelectorAll('.order-card').forEach(card => card.classList.toggle('is-selected', Number(card.dataset.orderId) === id));
    const selected = ORDERS.find(order => order.id === id);
    mapController?.update({ selectedId: id });
    const selection = document.querySelector('.map-selection');
    if (selection && selected) {
      selection.dataset.id = String(id);
      selection.querySelector('strong').innerHTML = `${escapeHtml(selected.from)} ${icon('arrow', 13)} ${escapeHtml(selected.to)}`;
      selection.querySelector('small').innerHTML = `상차지까지 공차 ${selected.emptyKm.toFixed(1)}km <span>·</span> 적재 후 ${selected.loadedKm.toFixed(1)}km 예상`;
    }
    const card = document.querySelector(`[data-order-id="${id}"]`);
    if (card && list) list.scrollTo({ top: card.offsetTop - list.offsetTop - 12, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
}

function showDetail(id, fromComparison = false) {
  const order = ORDERS.find(item => item.id === id);
  const back = fromComparison ? `<button class="text-button comparison-return" data-action="open-comparison">${icon('chevron', 14)} 콜 비교로 돌아가기</button>` : '';
  if (order) openDialog('운송 콜 상세', back + orderDetail(order, state));
}

function showComparison() {
  const selected = state.comparisonIds.map(id => ORDERS.find(order => order.id === id)).filter(Boolean);
  openDialog('운임과 운송 조건 비교', comparisonDialog(selected, state), { wide: true });
}

function findTrip(id) {
  return state.trip?.orderId === id ? state.trip : state.completedTrips.find(trip => trip.orderId === id);
}

function showRecord(id) {
  const trip = findTrip(id);
  const order = ORDERS.find(order => order.id === id);
  if (trip && order) openDialog('자원 운송 기록', resourcePanel(order, trip) + recordPanel(order, trip));
}

function showAccept(order) {
  openDialog('운송 수락', `<div class="confirm-illustration">${icon('truck', 40)}</div><div class="confirm-heading"><h3>이 운송을 함께할까요?</h3><p>${escapeHtml(order.from)} ${icon('arrow', 14)} ${escapeHtml(order.to)}</p></div><div class="accept-summary"><span>품목 · 적재량</span><strong>${escapeHtml(order.item)} · ${order.ton}톤</strong><span>상차 시간</span><strong>${escapeHtml(order.window)}</strong><span>운임 상한</span><strong>${money(order.fare)}원</strong></div>${readinessPanel(order)}<form id="accept-form"><label class="field-label" for="accepted-fare">확정할 운송 운임</label><div class="amount-input"><input id="accepted-fare" name="fare" type="number" min="1" max="${order.fare}" step="1" value="${order.fare}" required inputmode="numeric"/><span>원</span></div><p class="field-hint">운임 상한 ${money(order.fare)}원 이내에서 확정해요.</p><label class="confirmation-checkbox"><input id="accept-terms" type="checkbox" required/><span>차량 적재량과 상차 조건을 확인했어요.</span></label><div id="form-error" class="form-error" role="alert"></div><button class="button button-primary button-full" type="submit" data-order-id="${order.id}">${money(order.fare)}원 운송 수락 ${icon('check', 18)}</button><p class="modal-footnote">시연 중에는 실제 배차나 결제가 발생하지 않아요.</p></form>`);
}

function showWeights() {
  if (!state.trip) return;
  const order = ORDERS.find(item => item.id === state.trip.orderId);
  const base = Math.floor(order.ton * 1000 / order.bags * 100) / 100;
  const weights = state.trip.bagWeights.length === order.bags ? state.trip.bagWeights : Array.from({ length: order.bags }, (_, index) => index === order.bags - 1 ? Number((order.ton * 1000 - base * (order.bags - 1)).toFixed(2)) : base);
  openDialog('상차 마대 확인', `<div class="weights-summary"><span class="metric-icon">${icon('scan', 25)}</span><div><h3>마대 ${order.bags}개를 확인해 주세요</h3><p>등록 중량 ${money(order.ton * 1000)}kg · ${escapeHtml(order.item)}</p></div></div><div class="inline-info">${icon('info', 17)} 시연용 수거 무게가 입력되어 있어요. 실제와 다른 값은 마대별로 수정할 수 있어요.</div><form id="weights-form"><div class="bag-weight-grid">${weights.map((weight, index) => `<label class="bag-weight-field"><span>마대 ${String(index + 1).padStart(2, '0')}</span><span><input name="weight" type="number" min="0.01" max="2000" step="0.01" value="${weight}" required aria-label="마대 ${index + 1} 수거 무게" inputmode="decimal"/>kg</span></label>`).join('')}</div><label class="confirmation-checkbox"><input type="checkbox" required/><span>마대 수와 각 마대의 수거 무게를 확인했어요.</span></label><div id="form-error" class="form-error" role="alert"></div><button class="button button-primary button-full" type="submit">${order.bags}개 확인하고 운송 시작 ${icon('arrow', 17)}</button></form>`);
}

function showFilters() {
  openDialog('상세 필터', `<p class="dialog-description">내 운행 조건에 맞는 콜을 더 빠르게 찾아보세요.</p><form id="filters-form"><label class="field-label" for="min-fare">최소 운임</label><div class="amount-input"><input id="min-fare" name="minFare" type="number" min="0" step="1000" value="${ui.minFare}" inputmode="numeric"/><span>원 이상</span></div><label class="field-label" for="max-empty">상차지까지 최대 공차거리</label><div class="range-row"><input id="max-empty" name="maxEmptyKm" type="range" min="1" max="100" value="${ui.maxEmptyKm}"/><output id="empty-range-value">${ui.maxEmptyKm}km</output></div><label class="confirmation-checkbox"><input name="matched" type="checkbox" ${ui.matched ? 'checked' : ''}/><span>내 차량 적재량 5톤에 맞는 콜만 보기</span></label><div class="filter-explainer">${icon('route', 25)}<p>공차는 차고지에서 상차지까지<br/>빈 차로 이동하는 거리예요.</p></div><div class="dialog-button-row"><button class="button button-secondary" data-action="reset-filter-dialog" type="button">초기화</button><button class="button button-primary" type="submit">조건 적용하기 ${icon('check', 17)}</button></div></form>`);
}

function showGuide() {
  openDialog('운송 파트너 가이드', `<div class="guide-truck">${truckArt}</div><div class="confirm-heading"><h3>확인하고, 안전하게 연결해요.</h3><p>운송 전부터 도착 확인까지</p></div><ol class="guide-list"><li><span>1</span><div><strong>내 차량과 조건 확인</strong><p>적재량·차량 전고·허가 코드·상차 방법을 확인하세요. 경로와 소요 시간은 예상치예요.</p></div></li><li><span>2</span><div><strong>마대별 수거 무게 확인</strong><p>모든 마대의 무게를 기록하세요. 등록 무게와 5%를 넘게 차이 나면 인계 전에 확인이 필요해요.</p></div></li><li><span>3</span><div><strong>도착 확인과 인계 정보</strong><p>도착 뒤 구매자의 검사가 진행돼요. 인계서의 운반자 칸은 본인만 작성하며 올바로 제출은 외부에서 진행해요.</p></div></li><li><span>4</span><div><strong>정산 상태 확인</strong><p>검사 대기, 정산 예정, 정산 완료를 구별해 확인하세요. 운송기사는 구매자의 검사를 대신 완료할 수 없어요.</p></div></li></ol><button class="button button-primary button-full" data-action="close-dialog">확인했어요</button>`);
}

function showHandoff(id) {
  const trip = state.completedTrips.find(item => item.orderId === id);
  const order = ORDERS.find(item => item.id === id);
  if (!trip || !order) return;
  openDialog('운송 인계 정보', `<div class="inline-info">${icon('info', 18)} 구매자의 도착 검사를 기다리고 있어요. 이 화면은 올바로 제출용 서류를 대체하지 않아요.</div><div class="handoff-status"><div><span>${icon('building', 19)}</span><strong>배출자</strong><small>배출자 작성 필요</small></div><div class="active"><span>${icon('truck', 19)}</span><strong>운반자</strong><small>수거 정보 기록됨</small></div><div><span>${icon('leaf', 19)}</span><strong>처리자</strong><small>도착 검사 대기</small></div></div><dl class="fare-breakdown handoff-values"><div><dt>운송 번호</dt><dd>HW-${String(id).padStart(4, '0')}</dd></div><div><dt>운반업체</dt><dd>하윤운송</dd></div><div><dt>운송 품목</dt><dd>${escapeHtml(order.item)}</dd></div><div><dt>마대 수</dt><dd>${order.bags}개</dd></div><div><dt>수거 중량 합계</dt><dd>${money(trip.bagWeights.reduce((sum, weight) => sum + weight, 0))}kg</dd></div><div><dt>올바로 번호</dt><dd>외부 발급 후 배출자가 기록</dd></div></dl><button class="button button-primary button-full" data-action="copy-handoff" data-id="${id}">${icon('file', 18)} 인계용 운송 정보 복사</button>${recordPanel(order, trip)}`);
}

function showNotifications() {
  commit({ ...state, notificationsRead: true });
  render();
  openDialog('파트너 알림', `<div class="notification-list"><div><span class="notification-symbol">${icon('wallet', 22)}</span><div><strong>다음 정산일을 확인하세요</strong><p>정산 예정 운임 354,000원의 다음 지급 예정일은 11월 6일이에요.</p><small>시연 알림</small><button class="text-button" data-action="navigate" data-page="earnings">정산 내역 보기 ${icon('arrow', 14)}</button></div></div><div><span class="notification-symbol">${icon('shield', 22)}</span><div><strong>운송 전 차량 조건을 확인해 주세요</strong><p>5톤 적재량과 3.6m 전고, 폐기물 허가 코드가 운송 조건에 맞는지 확인해 주세요.</p><small>파트너 안내</small></div></div></div>`);
}

function handleError(error) {
  const target = document.getElementById('form-error');
  if (target) target.textContent = error.message;
  else toast(error.message);
}

document.addEventListener('click', async event => {
  if (event.target.closest('a.skip-link')) {
    event.preventDefault();
    const main = document.getElementById('main-content');
    main.focus({ preventScroll: true });
    main.scrollIntoView({ behavior: 'instant', block: 'start' });
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const id = Number(button.dataset.id);
  const order = ORDERS.find(item => item.id === id);
  try {
    switch (button.dataset.action) {
      case 'navigate': navigate(button.dataset.page); break;
      case 'browse-calls': ui.query = ''; ui.category = '전체'; navigate('calls'); break;
      case 'toggle-online': commit({ ...state, online: !state.online }); await render(); toast(state.online ? '운행을 시작했어요. 새로운 콜을 수락할 수 있어요.' : '휴식 상태로 바꿨어요. 진행 중인 운송은 유지돼요.'); break;
      case 'toggle-matched': ui.matched = !state.preferences.matched; commit({ ...state, preferences: { ...state.preferences, matched: ui.matched } }); render(); break;
      case 'select-call': selectCall(id); break;
      case 'detail': showDetail(id); break;
      case 'open-comparison': showComparison(); break;
      case 'comparison-detail': showDetail(id, true); break;
      case 'compare-from-detail':
        if (state.trip?.orderId === id || state.completedTrips.some(trip => trip.orderId === id)) throw new Error('진행 중이거나 완료된 콜은 비교에 담을 수 없어요.');
        if (!state.comparisonIds.includes(id)) { commit(toggleComparison(state, id)); await render(); }
        showComparison();
        break;
      case 'clear-comparison':
        commit({ ...state, comparisonIds: [] });
        await render();
        showComparison();
        toast('비교 선택을 모두 비웠어요. 주행비 가정은 유지돼요.');
        break;
      case 'toggle-comparison':
      case 'remove-comparison': {
        const inDialog = button.dataset.action === 'remove-comparison';
        commit(toggleComparison(state, id));
        await render();
        if (inDialog) showComparison();
        else document.querySelector(`[data-action="toggle-comparison"][data-id="${id}"]`)?.focus({ preventScroll: true });
        toast(state.comparisonIds.includes(id) ? `비교할 콜 ${state.comparisonIds.length}건을 담았어요. 최대 3건까지 비교할 수 있어요.` : '비교 목록에서 뺐어요.');
        break;
      }
      case 'record': showRecord(id); break;
      case 'download-record': {
        const trip = findTrip(id);
        if (!trip || !order) throw new Error('운송 기록을 찾을 수 없어요. 내 운송에서 다시 확인해 주세요.');
        const record = buildTransportRecord(order, trip);
        const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url; link.download = `HW-${String(id).padStart(4, '0')}-운송기록.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('시연용 운송 기록을 내려받았어요. 법정 인계서와는 별도 자료예요.');
        break;
      }
      case 'save':
      case 'save-dialog': {
        const inDialog = button.dataset.action === 'save-dialog';
        commit(toggleSaved(state, id));
        await render();
        if (inDialog) showDetail(id);
        toast(state.savedIds.includes(id) ? '콜을 저장했어요. 저장한 콜에서 다시 볼 수 있어요.' : '저장한 콜에서 해제했어요.');
        break;
      }
      case 'category': ui.category = button.dataset.category; render(); break;
      case 'set-view': ui.view = button.dataset.view; render(); break;
      case 'clear-search': ui.query = ''; render({ searchFocus: true }); break;
      case 'filters': showFilters(); break;
      case 'reset-filters': Object.assign(ui, { query: '', category: '전체', minFare: 0, maxEmptyKm: 100, matched: true }); commit({ ...state, preferences: { ...state.preferences, matched: true } }); render(); break;
      case 'reset-filter-dialog': {
        const form = document.getElementById('filters-form');
        form.elements.minFare.value = '0';
        form.elements.maxEmptyKm.value = '100';
        form.elements.matched.checked = true;
        document.getElementById('empty-range-value').value = '100km';
        break;
      }
      case 'close-dialog': closeDialog(); break;
      case 'accept-confirm': if (order) showAccept(order); break;
      case 'advance-trip': {
        if (!state.trip) break;
        const selected = ORDERS.find(item => item.id === state.trip.orderId);
        const previous = state.trip.stage;
        assertConnected(navigator.onLine, previous === 'arrived' ? '도착 확인을 전송' : '운송 단계를 전송');
        commit(advanceTrip(state, selected));
        await render();
        toast(previous === 'arrived' ? '도착 확인을 보냈어요. 구매자의 검사가 끝나면 정산이 진행돼요.' : previous === 'to-pickup' ? '상차지 도착을 확인했어요. 마대별 수거 무게를 확인해 주세요.' : '하차지 도착을 확인했어요. 수령 확인을 요청해 주세요.');
        break;
      }
      case 'bag-weights': showWeights(); break;
      case 'cancel-trip': openDialog('배차 해제', '<div class="confirm-heading"><h3>현재 배차를 해제할까요?</h3><p>수거를 시작하기 전에는 배차를 해제할 수 있어요.<br/>콜은 다시 모집 목록에 표시됩니다.</p></div><div class="dialog-button-row"><button class="button button-secondary" data-action="close-dialog">계속 운송</button><button class="button button-primary" data-action="confirm-cancel-trip">배차 해제</button></div>'); break;
      case 'confirm-cancel-trip': if (state.trip?.stage === 'to-pickup') { commit({ ...state, trip: null }); closeDialog(); render(); toast('배차를 해제했어요. 다른 콜을 찾아보세요.'); } break;
      case 'earnings-filter': ui.earningsFilter = button.dataset.filter; render(); break;
      case 'handoff': showHandoff(id); break;
      case 'copy-handoff': {
        const trip = state.completedTrips.find(item => item.orderId === id);
        const text = `HW-${String(id).padStart(4, '0')}\n운반업체: 하윤운송\n품목: ${order.item}\n운송: ${order.from} → ${order.to}\n마대: ${order.bags}개\n수거 중량: ${trip.bagWeights.reduce((sum, weight) => sum + weight, 0).toFixed(2)}kg\n상태: 구매자 도착 검사 대기\n올바로 제출용 서류가 아닌 운송 참고 정보입니다.`;
        try { await navigator.clipboard.writeText(text); toast('인계용 운송 정보를 복사했어요.'); }
        catch { openDialog('인계 정보 복사', `<p class="dialog-description">아래 내용을 선택해 복사해 주세요.</p><textarea class="copy-textarea" readonly>${escapeHtml(text)}</textarea>`); }
        break;
      }
      case 'download-ledger': {
        const rows = [['운송일', '출발지', '도착지', '운임(원)', '상태'], ...LEDGER.map(row => [row.date, row.from, row.to, row.fare, row.status === 'paid' ? '정산 완료' : '정산 예정']), ...state.completedTrips.map(trip => { const item = ORDERS.find(value => value.id === trip.orderId); return [koreanDate(trip.completedAt), item.from, item.to, trip.fare, '구매자 검사 대기']; })];
        const csv = '\uFEFF' + rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'HW-하윤-정산내역.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('정산 내역을 내려받았어요.'); break;
      }
      case 'reset-demo': openDialog('시연 데이터 초기화', '<div class="confirm-heading"><h3>처음 상태로 되돌릴까요?</h3><p>이 브라우저에 저장된 콜과 운송 기록이 초기화돼요.<br/>실제 서버 데이터에는 영향을 주지 않아요.</p></div><div class="dialog-button-row"><button class="button button-secondary" data-action="close-dialog">유지하기</button><button class="button button-primary" data-action="confirm-reset">초기화</button></div>'); break;
      case 'confirm-reset': commit(createInitialState()); Object.assign(ui, { query: '', category: '전체', matched: true, sort: 'recommended', minFare: 0, maxEmptyKm: 100 }); closeDialog(); navigate('calls'); toast('시연 데이터를 처음 상태로 되돌렸어요.'); break;
      case 'guide': showGuide(); break;
      case 'notifications': showNotifications(); break;
      case 'region': openDialog('내 운행 지역', `<p class="dialog-description">하윤님의 차고지를 기준으로 가까운 상차지를 찾아드려요.</p><button class="region-option" data-action="select-region"><span class="metric-icon">${icon('pin', 23)}</span><span><strong>경북 구미 · 칠곡</strong><small>차고지 · 구미 산업단지</small></span>${icon('check', 20)}</button><div class="inline-info">${icon('info', 17)} 이번 프로토타입은 저장소의 구미 지역 예시 콜을 사용해요.</div>`); break;
      case 'select-region': closeDialog(); mapController?.locate(); toast('구미 차고지를 중심으로 보고 있어요.'); break;
      case 'locate-map': mapController?.locate(); break;
      case 'zoom-in': mapController?.zoomIn(); break;
      case 'zoom-out': mapController?.zoomOut(); break;
    }
  } catch (error) { handleError(error); }
});

document.addEventListener('input', event => {
  if (event.target.id === 'call-search') {
    ui.query = event.target.value;
    if (!composingSearch && !event.isComposing) render({ searchFocus: true });
  }
  if (event.target.id === 'max-empty') document.getElementById('empty-range-value').value = `${event.target.value}km`;
  if (event.target.id === 'accepted-fare') {
    const button = document.querySelector('#accept-form button[type="submit"]');
    if (button) button.innerHTML = `${money(Number(event.target.value))}원 운송 수락 ${icon('check', 18)}`;
  }
});

document.addEventListener('compositionstart', event => {
  if (event.target.id === 'call-search') composingSearch = true;
});
document.addEventListener('compositionend', event => {
  if (event.target.id !== 'call-search') return;
  composingSearch = false;
  ui.query = event.target.value;
  render({ searchFocus: true });
});

document.addEventListener('change', event => {
  if (event.target.id === 'call-sort') { ui.sort = event.target.value; commit({ ...state, preferences: { ...state.preferences, sort: ui.sort } }); render(); }
  if (event.target.id === 'vehicle-matched') { ui.matched = event.target.checked; commit({ ...state, preferences: { ...state.preferences, matched: ui.matched } }); render(); }
});

document.addEventListener('submit', async event => {
  if (!['accept-form', 'weights-form', 'filters-form', 'comparison-cost-form'].includes(event.target.id)) return;
  event.preventDefault();
  try {
    const form = event.target;
    if (form.id === 'comparison-cost-form') {
      const rawCost = form.elements.costPerKm.value.trim();
      if (!rawCost) throw new Error('비교에 사용할 km당 주행비를 입력해 주세요.');
      commit(setCostPerKm(state, Number(rawCost)));
      showComparison();
      document.getElementById('cost-per-km')?.focus({ preventScroll: true });
      toast('주행비 가정을 비교에 적용했어요. 실제 수익과는 다를 수 있어요.');
    } else if (form.id === 'accept-form') {
      const order = ORDERS.find(item => item.id === Number(form.querySelector('[data-order-id]').dataset.orderId));
      assertConnected(navigator.onLine, '콜을 수락');
      commit(acceptOrder(state, order, Number(form.elements.fare.value)));
      closeDialog(); navigate('trips'); toast('운송을 수락했어요. 상차지와 다음 할 일을 확인하세요.');
    } else if (form.id === 'weights-form') {
      const order = ORDERS.find(item => item.id === state.trip?.orderId);
      const bagWeights = [...form.querySelectorAll('[name="weight"]')].map(input => Number(input.value));
      assertConnected(navigator.onLine, '마대 중량을 전송');
      commit(advanceTrip(state, order, { bagWeights }));
      closeDialog(); await render(); toast(state.trip.weightWarning ? '등록 무게와 차이가 있어요. 안내를 확인한 후 안전하게 운송해 주세요.' : '모든 마대의 수거 무게를 확인했어요. 안전 운송하세요.');
    } else {
      ui.minFare = Math.max(0, Number(form.elements.minFare.value));
      ui.maxEmptyKm = Number(form.elements.maxEmptyKm.value);
      ui.matched = form.elements.matched.checked;
      commit({ ...state, preferences: { ...state.preferences, matched: ui.matched } });
      closeDialog(); render(); toast('선택한 운송 조건을 적용했어요.');
    }
  } catch (error) { handleError(error); }
});

document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.getElementById('app-dialog')) {
    const search = document.getElementById('call-search');
    if (search) { event.preventDefault(); search.focus(); }
  }
});
window.addEventListener('hashchange', () => { closeDialog(); window.scrollTo({ top: 0, behavior: 'instant' }); render(); });
// 연결이 끊기면 위에 안내를 띄운다. 수락·단계 전송은 assertConnected가 이유와 함께 막는다.
function syncConnection(announce = false) {
  const banner = document.getElementById('offline-banner');
  banner.hidden = navigator.onLine;
  if (announce && navigator.onLine) toast('다시 연결됐어요. 수락과 운송 단계 전송을 이어서 할 수 있어요.');
}
window.addEventListener('online', () => syncConnection(true));
window.addEventListener('offline', () => syncConnection());
syncConnection();
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  try { state = sanitizeState(JSON.parse(event.newValue)); ui.matched = state.preferences.matched; ui.sort = state.preferences.sort; render(); } catch { /* A damaged record never replaces the current usable state. */ }
});
render();
