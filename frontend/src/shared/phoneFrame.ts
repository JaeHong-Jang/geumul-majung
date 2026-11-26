/**
 * PC 브라우저에서 앱 주소(/buyer/ 등)를 바로 열면 iPhone 14 Pro(393×852) 모양 틀 안에 앱을 띄운다.
 * 실제 아이폰처럼 앱은 화면 전체(393×852)에 그리고, 맨 위 59px 상태 표시줄(시계, 다이내믹 아일랜드, 배터리)은 그 위에 겹친다.
 * 앱 쪽에는 안전 영역 59px을 알려 내용이 상태 표시줄 아래에서 시작하게 한다. 상태 표시줄 글자색만 앱 맨 위 색에 맞춘다.
 * 틀 안에는 같은 주소를 ?inframe=1 로 다시 연다(그 안에서는 앱을 그대로 그림).
 * 휴대폰처럼 좁은 화면, 세 폰 비교 화면(이미 iframe 안), ?noframe=1 이면 틀 없이 바로 그린다.
 */
const SCREEN = { w: 393, h: 852 };        // iPhone 14 Pro 화면(CSS 픽셀)
const STATUS = 59;                        // 상태 표시줄 높이(iPhone 14 Pro 위쪽 안전 영역)
const HOME = 34;                          // 홈 막대 높이(iPhone 14 Pro 아래쪽 안전 영역), 탭 막대는 49
const BEZEL = 12;                         // 테두리 두께
const RADIUS = 55;                        // 화면 모서리

export function startApp(mount: () => void, label: string): void {
  const params = new URLSearchParams(location.search);
  if (params.has("inframe")) {
    // 틀 안에서는 브라우저가 안전 영역(env)을 주지 않으므로 같은 값을 변수로 넣는다
    document.documentElement.style.setProperty("--screen-top-inset", `${STATUS}px`);
    document.documentElement.style.setProperty("--frame-safe-top", `${STATUS}px`);
    document.documentElement.dataset.inframe = "1";
    // 화면마다 위쪽 여백 규칙이 달라, 틀 안에서만 상태 표시줄 높이만큼 내용을 내린다(초록 머리글은 상태 표시줄 뒤까지 칠함)
    const safe = document.createElement("style");
    safe.textContent = `
      html[data-inframe] .app .page-body:not(.shared-login, .auth-secondary):not(:has(.shell-header)) { padding-top: ${20 + STATUS}px; }
      html[data-inframe] .explore-hero { margin-top: ${-20 - STATUS}px; }
      html[data-inframe] .shell-header.shell-header:first-child { padding-top: ${STATUS + 8}px; }
      html[data-inframe] .explore-hero { padding: ${STATUS + 8}px 20px 20px; margin-left: -20px; margin-right: -20px; }
      html[data-inframe] .shell-tabs.shell-tabs.shell-tabs { height: ${49 + HOME}px; min-height: ${49 + HOME}px; padding-top: 4px; padding-bottom: ${HOME}px; }
      html[data-inframe] .page-body.shared-login .login-body { padding-top: ${24 + STATUS}px; }
      html[data-inframe] .page-body.auth-secondary .auth-secondary-body { padding-top: ${24 + STATUS}px; }
      html[data-inframe] .app .screen > .top-bar { margin-top: ${STATUS + 4}px; }
      html[data-inframe] .app .screen > .tab-heading { padding-top: ${STATUS + 4}px !important; }
      html[data-inframe] .app .screen > :is(.top-bar, .tab-heading) ~ .page-body { padding-top: 12px !important; }
    `;
    document.head.appendChild(safe);
  }
  const framed = window.top !== window;
  if (framed || params.has("inframe") || params.has("noframe") || window.innerWidth < 600) {
    mount();
    return;
  }
  renderFrame(label);
}

/** 화면 맨 위 색(투명이면 부모로 올라가며)을 찾는다. */
const solid = (el: Element | null | undefined) => {
  if (!el) return null;
  const c = getComputedStyle(el).backgroundColor;
  return c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c) ? c : null;
};
/**
 * 상태 표시줄 바탕색: 지금 화면의 맨 위 요소 색(홈·원료 찾기는 초록 머리글, 나머지는 화면 바탕).
 * 스크롤해도 바뀌지 않게 실제 아이폰 앱처럼 단색으로 칠한다. 시작 화면(그림)일 때는 투명.
 */
function topColor(doc: Document): string | null {
  if (doc.querySelector(".splash")) return null;
  const view = [...doc.querySelectorAll<HTMLElement>(".route-view .route-view")].find((v) => !v.hidden) ?? doc.querySelector(".app");
  // 초록 머리글이 있는 화면(홈, 원료 찾기)은 그 색, 아니면 화면 바탕색
  const header = view?.querySelector(".shell-header, .explore-hero");
  const body = view?.querySelector(".shell-home, .page-body") ?? view;
  for (const el of [header, body, view, doc.querySelector(".app"), doc.body]) {
    const c = solid(el);
    if (c) return c;
  }
  return "rgb(255, 255, 255)";
}
const isDark = (rgb: string) => {
  const [r = 255, g = 255, b = 255] = (rgb.match(/\d+/g) ?? []).map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
};

function renderFrame(label: string) {
  const inner = new URL(location.href);
  inner.searchParams.set("inframe", "1");
  inner.searchParams.set("v", String(Date.now()));   // 틀 안 화면이 브라우저에 저장된 옛 빌드로 열리지 않게 매번 새 주소로 연다
  const plain = new URL(location.href);
  plain.searchParams.set("noframe", "1");

  const style = document.createElement("style");
  style.textContent = `
    html, body { margin: 0; height: 100%; overflow: hidden; background: #EEEEEE; color: #252525;
      font-family: "Malgun Gothic", "Noto Sans KR", sans-serif; }
    .pf-stage { position: absolute; left: 50%; top: 50%; display: flex; flex-direction: column; align-items: center; gap: 14px;
      transform-origin: center; }
    .pf-caption { font-size: 20px; font-weight: 700; text-align: center; }
    .pf-caption small { display: block; margin-top: 4px; font-size: 13px; font-weight: 400; color: #6B6B6B; }
    .pf-device { position: relative; width: ${SCREEN.w + BEZEL * 2}px; height: ${SCREEN.h + BEZEL * 2}px;
      border-radius: ${RADIUS + BEZEL}px; background: #1C1C1E; box-shadow: inset 0 0 0 2px #3A3A3C, 0 24px 60px rgba(0,0,0,.22); }
    .pf-device > i { position: absolute; width: 4px; border-radius: 2px; background: #2C2C2E; }
    .pf-screen { position: absolute; inset: ${BEZEL}px; border-radius: ${RADIUS}px; overflow: hidden; background: #000;
      clip-path: inset(0 round ${RADIUS}px); isolation: isolate; }
    .pf-status { position: absolute; z-index: 2; top: 0; left: 0; right: 0; height: ${STATUS}px; display: flex; align-items: center; justify-content: space-between;
      padding: 0 30px 0 44px; box-sizing: border-box; font: 600 16px -apple-system, "Segoe UI", sans-serif; color: #fff; pointer-events: none; transition: color .2s; }
    .pf-status svg { display: block; fill: currentColor; }
    .pf-status .pf-right { display: flex; align-items: center; gap: 6px; }
    .pf-island { position: absolute; top: 11px; left: 50%; width: 126px; height: 37px; margin-left: -63px; border-radius: 20px; background: #000; }
    .pf-screen iframe { display: block; width: ${SCREEN.w}px; height: ${SCREEN.h}px; border: 0; border-radius: ${RADIUS}px; }
    .pf-home { position: absolute; left: 50%; bottom: 8px; width: 134px; height: 5px; margin-left: -67px; border-radius: 3px;
      background: rgba(0,0,0,.75); pointer-events: none; }
    .pf-link { font-size: 13px; color: #1F5A3F; }
  `;
  document.head.appendChild(style);

  const stage = document.createElement("div");
  stage.className = "pf-stage";
  stage.innerHTML = `
    <div class="pf-caption">${label}<small>iPhone 14 Pro 화면 ${SCREEN.w} × ${SCREEN.h}</small></div>
    <div class="pf-device">
      <i style="left:-4px;top:150px;height:30px"></i><i style="left:-4px;top:205px;height:62px"></i>
      <i style="left:-4px;top:280px;height:62px"></i><i style="right:-4px;top:240px;height:100px"></i>
      <div class="pf-screen">
        <div class="pf-status">
          <span>9:41</span>
          <span class="pf-island" aria-hidden="true"></span>
          <span class="pf-right" aria-hidden="true">
            <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
            <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3C13.3 1.5 10.8.4 8 .4S2.7 1.5.8 3.3L2 4.6c1.6-1.5 3.7-2.4 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3C11.4 4.7 9.8 4 8 4s-3.4.7-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3zM8 9.4l2.2-2.1C9.6 6.8 8.8 6.5 8 6.5s-1.6.3-2.2.8L8 9.4z"/></svg>
            <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="19" height="9" rx="2"/><rect x="24" y="4.5" width="2" height="4" rx="1" opacity=".5"/></svg>
          </span>
        </div>
        <iframe title="${label}" allow="microphone" src="${inner.pathname}${inner.search}${inner.hash}"></iframe>
      </div>
      <div class="pf-home" aria-hidden="true"></div>
    </div>
    <a class="pf-link" href="${plain.pathname}${plain.search}${plain.hash}">틀 없이 전체 화면으로 보기</a>`;
  const root = document.getElementById("root") ?? document.body;
  root.replaceChildren(stage);

  // 상태 표시줄 색은 앱 맨 위 색을 따라간다(화면이 바뀌면 같이 바뀜)
  const status = stage.querySelector<HTMLElement>(".pf-status")!;
  const frame = stage.querySelector("iframe")!;
  const sync = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const c = topColor(doc);
      status.style.background = c ?? "transparent";
      status.style.color = !c || isDark(c) ? "#fff" : "#000";
    } catch { /* 다른 출처면 그대로 둔다 */ }
  };
  setInterval(sync, 300);

  // 창 크기에 맞춰 폰 전체를 함께 줄인다(앱 내부 크기는 그대로)
  const fit = () => {
    const s = Math.min(1, (innerHeight - 24) / stage.offsetHeight, (innerWidth - 24) / stage.offsetWidth);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  addEventListener("resize", fit);
  fit();
}
