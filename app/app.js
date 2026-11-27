// 그물마중 모바일 앱 (iOS SwiftUI 앱의 웹 버전). 계산·검증은 ../model.js 공유.
(function () {
  "use strict";
  const M = window.NetModel;
  const KEY = "geumulmajung:app:v1";
  const $ = (s) => document.querySelector(s);
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const NAMES = {
    registered: "인수 협의",
    confirmed: "인수 확정",
    settled: "정산 완료",
  };
  const ICON = { registered: "📋", confirmed: "⛴", settled: "✔" };

  // ── 저장소 ──
  let items,
    warn = false,
    online = false, // 서버(gm-api.js)에 붙었는지. 아니면 기기 저장소
    aiOn = { stt: false, vision: false }; // 서버의 AI 기능 사용 가능 여부(/ai/status)
  const checkCache = {}; // 반출번호 → 법·현장 점검 결과(화면을 다시 그려도 유지)
  try {
    items = JSON.parse(localStorage.getItem(KEY) || "null");
    items?.forEach(M.verify);
  } catch {
    items = null;
    warn = true;
  }
  if (!Array.isArray(items)) items = M.seed();
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {}
  };
  const find = (id) => items.find((r) => r.id === id);
  function save(r) {
    M.verify(r);
    const old = find(r.id);
    const i = items.findIndex((x) => x.id === r.id);
    if (i < 0) items.unshift(r);
    else items[i] = r;
    if (online) sync(old, r);
    else persist();
  }
  // 화면은 바로 바꾸고 서버 저장은 뒤따른다. 서버가 거절하면 서버 기록으로 되돌린다.
  function sync(old, r) {
    window.GmServer.push(old, r)
      .then((rec) => {
        items = items.map((x) => (x.id === r.id ? rec : x));
        if (rec.id !== r.id && location.hash === "#/s/" + r.id)
          location.replace("#/s/" + rec.id);
        render();
      })
      .catch(async (e) => {
        toast("서버 저장 실패, " + e.message);
        try {
          items = await window.GmServer.list();
        } catch {}
        render();
      });
  }

  // ── 형식 ──
  const nf = (d) =>
    new Intl.NumberFormat("ko-KR", { maximumFractionDigits: d });
  const won = (v) => nf(0).format(v) + "원";
  const man = (v) =>
    (v > 0 ? "+" : v < 0 ? "−" : "") +
    nf(1).format(Math.abs(v) / 10000) +
    "만 원";
  const tons = (v) => nf(3).format(v) + "톤";
  const day = (d) => d.slice(0, 10);
  const sailed = (r) => day(r.departure) <= M.DEMO_DATE;
  const when = (d) => {
    const t = new Date(d.length > 10 ? d : d + "T00:00");
    return (
      t.toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }) + (d.length > 10 ? " " + d.slice(11, 16) : "")
    );
  };
  const short = (d) => +d.slice(5, 7) + "." + +d.slice(8, 10);
  const totals = (r) => {
    try {
      const a = r.actual;
      return M.calculate(r, r.quotes[r.choice], a.total, a.accepted, a.extra);
    } catch {
      return null;
    }
  };
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove("on"), 2200);
  }

  // ── 조각 ──
  const badge = (st) => `<span class="badge ${st}"><i></i>${NAMES[st]}</span>`;
  const statusIcon = (st) => `<span class="sicon ${st}">${ICON[st]}</span>`;
  const ring = (pct, cls, r = 42, w = 9) =>
    `<circle cx="50" cy="50" r="${r}" class="track" stroke-width="${w}"/><circle cx="50" cy="50" r="${r}" class="arc ${cls}" stroke-width="${w}" pathLength="100" style="--off:${(100 - pct * 100).toFixed(1)}"/>`;
  const top = (title, left = "", right = "") =>
    `<header class="top"><div class="top-btns">${left || "<span></span>"}${right}</div><h1>${title}</h1></header>`;
  const menuBtn = `<button class="round" data-act="guide" aria-label="시연 안내">⋯</button>`;
  const newBtn = `<a class="round plus" href="#/new" aria-label="새 반출 등록">＋</a>`;
  const backBtn = `<button class="round" data-act="back" aria-label="뒤로">‹</button>`;

  function row(r) {
    return `<a class="card rowcard" href="#/s/${esc(r.id)}">${statusIcon(r.status)}<div class="grow">
      <div class="between"><b class="mono">${esc(r.id)}</b>${badge(r.status)}</div>
      <div class="muted">${esc(r.kind)} · ${esc(r.material)} · ${r.bags}마대</div>
      <div class="between small"><span class="muted">📅 ${when(r.departure)}</span><b class="blue">${tons(r.weight)}</b></div></div></a>`;
  }
  function settleRow(r, bare) {
    const t = totals(r) || { ratio: 0, savings: 0, margin: 0 };
    const pill = (txt, v) =>
      `<span class="pill ${v < 0 ? "neg" : ""}">${txt}</span>`;
    return `<a class="${bare ? "feed" : "card rowcard"}" href="#/s/${esc(r.id)}">
      <span class="mini-ring"><svg viewBox="0 0 100 100">${ring(t.ratio / 100, "ocean", 40, 11)}</svg><b>${Math.round(t.ratio)}%</b></span>
      <div class="grow"><div class="between"><b class="mono">${esc(r.id)}</b><span class="muted small">${short(r.departure)}</span></div>
      <div class="muted small">${esc(r.kind)} · 인수 ${tons(r.actual.accepted)} / 계량 ${tons(r.actual.total)}</div>
      <div class="pills">${pill("고객 " + man(t.savings), t.savings)}${pill("팀 " + man(t.margin), t.margin)}</div></div></a>`;
  }

  // ── 그래프 ──
  // 색: 단계 배지와 같은 색. 정산 완료는 인수(진한 회청)·잔재(옅은 회청)로 나눔
  const TONE = {
    registered: "var(--sand)",
    confirmed: "var(--sea)",
    settled: "var(--c-settled)",
    residual: "var(--c-residual)",
  };
  // 손익분기 인수율(%) · 사업계획서 기준: 5톤 반출 1건, '로프 분리 후 인수' 조건(M.defaults 2안),
  // 시연 기본 단가(M.seed). M.calculate는 인수량에 선형이므로 인수 0톤·전량 인수 두 점으로
  // 고객 절감과 팀 공헌이익이 0이 되는 인수량을 각각 구해 큰 쪽을 씀 (2.75톤 / 5톤 = 55%)
  const breakEven = (() => {
    const t = 5,
      r = M.seed()[0],
      q = M.defaults(t, M.DEMO_DATE)[1];
    const zero = (key) => {
      const a = M.calculate(r, q, t, 0)[key],
        b = M.calculate(r, q, t, t)[key];
      return (-a / (b - a)) * t;
    };
    return (Math.max(zero("savings"), zero("margin")) / t) * 100;
  })();
  const amt = (v) => nf(3).format(v);
  // 한 줄 구성 막대 + 이름·값 범례
  const parts = (list, unit) => {
    const shown = list.filter(([, v]) => v > 0);
    return `<div class="split" role="img" aria-label="${list.map(([n, v]) => n + " " + amt(v) + unit).join(", ")}">${
      shown.length
        ? shown.map(([, v, c]) => `<i style="flex:${v};--tone:${c}"></i>`).join("")
        : `<i style="flex:1;--tone:var(--line)"></i>`
    }</div><ul class="kpi-key">${list.map(([n, v, c]) => `<li><i style="--tone:${c}"></i>${n}<b>${amt(v)}${unit}</b></li>`).join("")}</ul>`;
  };

  // ── 운영 현황 ──
  function home() {
    const settled = items.filter((r) => r.status === "settled");
    const active = items.filter((r) => r.status !== "settled");
    const total = settled.reduce((s, r) => s + r.actual.total, 0);
    const accepted = settled.reduce((s, r) => s + r.actual.accepted, 0);
    const ratio = total ? accepted / total : 0;
    const savings = settled.reduce((s, r) => s + (totals(r)?.savings || 0), 0);
    const byDate = [...items].sort((a, b) =>
      a.departure.localeCompare(b.departure),
    );
    const upcoming = byDate.filter((r) => r.status !== "settled");
    const next = upcoming.find((r) => day(r.departure) >= M.DEMO_DATE);
    const atSea = items.filter(
      (r) => r.status === "confirmed" && day(r.departure) === M.DEMO_DATE,
    ).length;
    const count = (st) => items.filter((r) => r.status === st).length;
    const weightOf = (st) =>
      active.filter((r) => r.status === st).reduce((s, r) => s + r.weight, 0);

    let hero = "";
    if (next) {
      const q = next.quotes[next.choice ?? 1];
      const t = M.calculate(next, q, next.weight, q.expected);
      hero = `<a class="hero" href="#/s/${esc(next.id)}">
        <div class="between"><span class="glass">📍 충남 보령 · 삽시도</span><span class="tag">${day(next.departure) === M.DEMO_DATE ? "오늘 출항" : "출항 예정"}</span></div>
        <div class="hero-bottom"><div class="hero-sub">다음 반출 · ${esc(next.id)}</div>
        <div class="between end"><div class="big"><span data-count="${next.weight}" data-d="${Number.isInteger(next.weight) ? 0 : 1}">${next.weight}</span><small>톤</small></div>
        <div class="right"><small>예상 고객 절감</small><b>${man(t.savings)}</b></div></div>
        <div class="between"><span class="small">🕗 ${when(next.departure)}</span><span class="hero-cta">${next.status === "registered" ? "인수 조건 비교" : "검수·정산 입력"} →</span></div></div></a>`;
    }
    // 정산 건은 실계량(인수+잔재), 나머지는 예상 중량
    const amountOf = (r) =>
      r.status === "settled" ? r.actual.total : r.weight;
    const step = Math.ceil(Math.max(6, ...items.map(amountOf)) / 3);
    const scale = step * 3;
    const gap = ratio * 100 - breakEven;
    // 누적 인수율 링의 손익분기 눈금 (12시 방향에서 시계 방향)
    const tick = (from, to) => {
      const a = (breakEven / 100) * 2 * Math.PI,
        x = (r) => (50 + r * Math.sin(a)).toFixed(1),
        y = (r) => (50 - r * Math.cos(a)).toFixed(1);
      return `M${x(from)} ${y(from)}L${x(to)} ${y(to)}`;
    };
    const pnl = settled.map((r) => ({ r, t: totals(r) })).filter((p) => p.t);
    const wons = pnl.flatMap(({ t }) => [t.savings, t.margin]);
    const lo = Math.min(0, ...wons),
      span = Math.max(0, ...wons) - lo || 1;
    const pnlBar = (name, v) =>
      `<div class="pnl-row"><span>${name}</span><span class="pnl-track" style="--z:${((-lo / span) * 100).toFixed(1)}%"><i class="${v < 0 ? "neg" : ""}" style="left:${(((Math.min(v, 0) - lo) / span) * 100).toFixed(1)}%;width:${((Math.abs(v) / span) * 100).toFixed(1)}%"></i></span><b>${man(v)}</b></div>`;
    const kpi = (icon, title, value, d, unit, viz) =>
      `<div class="card kpi"><div class="tile-head"><span>${icon}</span>${title}</div><div class="num"><span data-count="${value}" data-d="${d}">${value.toFixed(d)}</span><small>${unit}</small></div>${viz}</div>`;

    return (
      top("반출 운영 현황", menuBtn, newBtn) +
      `<div class="stack">` +
      (warn
        ? `<p class="warn">⚠ 저장 기록 일부 판독 불가 · 시연 데이터로 표시함</p>`
        : "") +
      hero +
      `<section class="card"><div class="sec-title"><div><h2>반출 경로</h2><p>개념도 · 단계별 반출 건수</p></div></div>
        <div class="route"><svg viewBox="0 0 300 60" preserveAspectRatio="none"><path class="lane" d="M30 26Q150 50 270 26"/></svg><span class="boat">⛴</span>
        <div class="node"><i class="sand">⌂</i><b>삽시도 집하장</b><small class="t-sand">${items.length - atSea - settled.length}건</small></div>
        <div class="node"><i class="sea">≋</i><b>해상 운반</b><small class="t-sea">${atSea}건</small></div>
        <div class="node"><i class="ocean">♻</i><b>재활용업체</b><small class="t-ocean">${settled.length}건</small></div></div></section>` +
      circHome() +
      `<div class="grid2">` +
      kpi(
        "▣",
        "전체 반출",
        items.length,
        0,
        "건",
        parts(
          ["registered", "confirmed", "settled"].map((st) => [
            NAMES[st],
            count(st),
            TONE[st],
          ]),
          "건",
        ),
      ) +
      kpi(
        "⚖",
        "반출 예정 중량",
        active.reduce((s, r) => s + r.weight, 0),
        1,
        "톤",
        `<span class="chip">대기 ${active.length}건</span>` +
          parts(
            ["registered", "confirmed"].map((st) => [
              NAMES[st],
              weightOf(st),
              TONE[st],
            ]),
            "톤",
          ),
      ) +
      kpi(
        "⤓",
        "누적 인수 중량",
        accepted,
        1,
        "톤",
        `<span class="chip">정산 ${settled.length}건 계량 ${amt(total)}톤</span>` +
          parts(
            [
              ["인수", accepted, TONE.settled],
              ["잔재", total - accepted, TONE.residual],
            ],
            "톤",
          ),
      ) +
      `<div class="card kpi"><div class="tile-head"><span>%</span>누적 인수율</div><div class="gauge"><svg viewBox="0 0 100 100" role="img" aria-label="누적 인수율 ${(ratio * 100).toFixed(1)}%, 손익분기 ${breakEven.toFixed(0)}%">${ring(ratio, "ocean", 40, 10)}<path d="${tick(32, 48)}" stroke="#fff" stroke-width="5"/><path d="${tick(33, 47)}" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round"/></svg><b>${total ? (ratio * 100).toFixed(1) + "<small>%</small>" : "—"}</b></div><p class="kpi-note"><span><i></i>손익분기 ${breakEven.toFixed(0)}%</span>${total ? `<span><b>${gap < 0 ? "−" : "+"}${Math.abs(gap).toFixed(1)}%p</b> ${gap < 0 ? "미달" : "상회"}</span>` : ""}</p></div>` +
      `</div>` +
      `<section class="card"><div class="sec-title"><div><h2>정산 건별 손익</h2><p>정산 완료 반출 기준</p></div><span class="chip">정산 ${settled.length}건</span></div><div class="pnl">${
        pnl.length
          ? pnl
              .map(
                ({ r, t }) =>
                  `<a class="pnl-lot" href="#/s/${esc(r.id)}"><span class="pnl-head"><b class="mono">${esc(r.id)}</b><small>${esc(r.kind)} · ${short(r.departure)} · 인수율 ${Math.round(t.ratio)}%</small></span>${pnlBar("고객 절감", t.savings)}${pnlBar("팀 공헌이익", t.margin)}</a>`,
              )
              .join("")
          : `<p class="muted">정산 완료 반출 없음</p>`
      }</div></section>` +
      `<section class="card"><div class="sec-title"><div><h2>반출별 중량</h2><p>출항일 순 · 정산 완료 건은 실계량</p></div></div>
        <ul class="chart-key">${[
          [NAMES.registered, TONE.registered],
          [NAMES.confirmed, TONE.confirmed],
          ["정산 완료 · 인수", TONE.settled],
          ["정산 완료 · 잔재", TONE.residual],
        ]
          .map(([n, c]) => `<li><i style="--tone:${c}"></i>${n}</li>`)
          .join("")}</ul>
        <div class="bars"><div class="grid" aria-hidden="true">${[0, 1, 2, 3].map((k) => `<span style="--y:${((k / 3) * 100).toFixed(1)}%"><b>${amt(k * step)}${k === 3 ? "톤" : ""}</b></span>`).join("")}</div>${byDate
          .map((r, i) => {
            const w = amountOf(r),
              segs =
                r.status === "settled"
                  ? [
                      [r.actual.accepted, TONE.settled],
                      [w - r.actual.accepted, TONE.residual],
                    ]
                  : [[w, TONE[r.status]]],
              label = `${esc(r.id)} · ${NAMES[r.status]} · ${r.status === "settled" ? `계량 ${tons(w)} (인수 ${tons(r.actual.accepted)} · 잔재 ${tons(w - r.actual.accepted)})` : `예상 ${tons(w)}`}`,
              today = day(r.departure) === M.DEMO_DATE;
            return `<a href="#/s/${esc(r.id)}" class="bar ${today ? "today" : ""}" style="--h:${((w / scale) * 100).toFixed(1)}%;--i:${i}" aria-label="${label}" title="${label}"><span class="col">${segs
              .filter(([v]) => v > 0)
              .map(([v, c]) => `<i style="flex:${v};--tone:${c}"></i>`)
              .join("")}</span><em>${tons(w)}</em><small>${today ? "오늘" : short(r.departure)}</small></a>`;
          })
          .join("")}</div></section>` +
      `<div class="sec-title pad"><h2>처리할 업무</h2></div><div class="grid2">` +
      [
        ["registered", "인수 조건 협의", "업체 조건 2안 비교", "sand", "📋"],
        ["confirmed", "검수·정산 입력", "하선 후 실계량·증빙", "sea", "⚖"],
      ]
        .map(
          ([st, t, s, c, ic]) =>
            `<a class="card todo" href="#/list/${st}"><div class="between"><span class="todo-ic ${c}">${ic}</span><b class="num">${count(st)}</b></div><b>${t}</b><small class="muted">${s}</small><div class="segs">${Array.from({ length: Math.max(active.length, 1) }, (_, i) => `<i class="${i < count(st) ? c : ""}"></i>`).join("")}</div></a>`,
        )
        .join("") +
      `</div>` +
      `<section class="card"><div class="sec-title"><h2>최근 정산</h2><span class="chip">누적 고객 절감 ${man(savings)}</span></div>` +
      (settled.length
        ? settled.map((r) => settleRow(r, true)).join("")
        : `<p class="muted">정산 완료 반출 없음</p>`) +
      `</section></div>`
    );
  }

  // ── 목록 ──
  let term = "";
  function listRows(filter) {
    const rows = items.filter(
      (r) =>
        (!filter || r.status === filter) &&
        (!term ||
          [r.id, r.kind, r.material, r.facility].some((v) =>
            v.toLowerCase().includes(term.toLowerCase()),
          )),
    );
    return rows.length
      ? rows.map(row).join("")
      : `<p class="empty">조건에 부합하는 반출 없음</p>`;
  }
  function list(filter) {
    return (
      top("반출 목록", "", newBtn) +
      `<div class="stack"><label class="search">🔍<input id="term" type="search" placeholder="반출번호, 품목, 업체 검색" value="${esc(term)}" autocomplete="off"></label>
      <div class="seg">${[
        ["", "전체"],
        ["registered", "인수 협의"],
        ["confirmed", "인수 확정"],
        ["settled", "정산 완료"],
      ]
        .map(
          ([v, l]) =>
            `<a href="#/list${v ? "/" + v : ""}" class="${(filter || "") === v ? "on" : ""}">${l}</a>`,
        )
        .join(
          "",
        )}</div><div id="rows" class="stack tight" data-filter="${filter || ""}">${listRows(filter)}</div></div>`
    );
  }
  function settlements() {
    const rows = items.filter((r) => r.status === "settled");
    return (
      top("정산 내역") +
      `<div class="stack tight">${rows.length ? rows.map((r) => settleRow(r)).join("") : `<p class="empty">정산 완료 반출 없음</p>`}</div>`
    );
  }

  // ── 상세 ──
  function track(r) {
    const steps = [
      ["등록", true],
      ["조건 확정", r.status !== "registered"],
      ["출항·하선", r.status !== "registered" && sailed(r)],
      ["정산", r.status === "settled"],
    ];
    const done = steps.filter((s) => s[1]).length;
    return `<div class="track" style="--p:${((done - 1) / 3) * 75}%">${steps
      .map(
        ([l, ok], i) =>
          `<div class="${ok ? "ok" : ""}"><i>${ok ? "✓" : i + 1}</i><small>${l}</small></div>`,
      )
      .join("")}</div>`;
  }
  const kv = (rows) =>
    `<dl class="kv">${rows.map(([k, v, cls]) => `<div><dt>${k}</dt><dd class="${cls || ""}">${esc(v)}</dd></div>`).join("")}</dl>`;
  const group = (title, body, foot = "") =>
    `<section class="group"><h3>${title}</h3><div class="card flat">${body}</div>${foot ? `<p class="foot">${foot}</p>` : ""}</section>`;
  const results = (t) =>
    kv([
      ["재활용업체 인수율", nf(1).format(t.ratio) + "%"],
      ["잔재량", tons(t.residual)],
      ["기존 방식 비용", won(t.baseline)],
      ["새 방식 총비용", won(t.cost)],
      ["고객 순절감액", won(t.savings), t.savings < 0 ? "neg" : "pos"],
      ["운영료 매출", won(t.fee)],
      ["팀 공헌이익", won(t.margin), t.margin < 0 ? "neg" : "pos"],
    ]);
  function terms(r) {
    const q = r.quotes[r.choice];
    return group(
      "확정 조건",
      kv([
        ["선택한 조건", q.label],
        ["인수 기준", q.condition],
        ["인수분 처리비", won(q.rate) + "/톤"],
        ["잔재물 처리비", won(q.residualRate) + "/톤"],
        ["기존 방식 단가", won(r.baseRate) + "/톤"],
        ["운영료", won(r.feeRate) + "/인수 톤"],
        ["팀 직접비", won(r.directCost) + "/건"],
      ]),
    );
  }
  const field = (label, name, value, type = "number", extra = "") =>
    `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${type === "number" ? 'inputmode="decimal" step="any" min="0"' : ""} ${extra}></label>`;

  // ── AI 조각 (서버 모드일 때만) ──
  const factList = (facts) =>
    `<ul class="ai-facts">${facts.map((f) => `<li>${f.headline ? `<b>${esc(f.headline)}</b> ` : ""}${esc(f.text)}${f.detail ? `<details><summary>조문 보기</summary><p>${esc(f.detail)}</p></details>` : ""}</li>`).join("")}</ul>`;
  function aiIntake() {
    if (!online) return "";
    const mic = aiOn.stt && navigator.mediaDevices?.getUserMedia && window.MediaRecorder;
    return group(
      "AI로 채우기",
      `<label class="field"><span>말하거나 적은 내용</span><textarea id="ai-text" rows="2" maxlength="300" placeholder="예: 자망 나일론 5톤 마대 12개 다음 주 월요일 오전 8시 반 출항, 로프는 다 뗐음"></textarea></label>
      <div class="ai-row">${mic ? `<button type="button" class="btn ghost" data-act="ai-rec" id="ai-rec">🎤 녹음</button>` : ""}<button type="button" class="btn ghost" data-act="ai-text">글로 채우기</button></div>
      <div id="ai-out"></div>`,
      "숫자는 말한 내용에서만 읽음, 못 읽은 칸은 직접 입력. 음성은 서버 안에서 글로 바꾸고 저장하지 않음",
    );
  }
  function aiCheck(r) {
    if (!online) return "";
    return group(
      "AI 법·현장 점검",
      `<div id="ai-check" data-id="${esc(r.id)}">${checkCache[r.id] ? checkView(checkCache[r.id]) : `<p class="muted">점검 불러오는 중</p>`}</div>
      <label class="field"><span>법 질문</span><input id="ai-q" type="text" maxlength="300" placeholder="예: 폐어망 실어 나르려면 허가 받아야 해?"></label>
      <div class="ai-row"><button type="button" class="btn ghost" data-act="ai-ask">질문</button></div><div id="ai-ans"></div>`,
      "폐어구 관련 조문 57개에서만 답함, 법률 자문 확인 필요",
    );
  }
  const OK = { true: ["pos", "완료"], false: ["neg", "확인 필요"], null: ["", "안내"] };
  const checkItems = (list) =>
    `<ul class="ai-check">${list.map((i) => `<li><span class="ai-tag ${OK[i.ok][0]}">${OK[i.ok][1]}</span>${esc(i.text)}${i.law.length ? `<small>근거 ${i.law.map(esc).join(", ")}</small>` : ""}</li>`).join("")}</ul>`;
  // 확인 필요 항목을 먼저 보이고, 완료·안내는 접어 둔다
  const checkView = (c) => {
    const need = c.items.filter((i) => i.ok === false),
      rest = c.items.filter((i) => i.ok !== false);
    return (
      `<p class="ai-sum ${need.length ? "neg" : "pos"}">${need.length ? `확인 필요 ${need.length}건` : "확인 필요 없음"} <small>전체 ${c.items.length}건 중</small></p>` +
      (need.length ? checkItems(need) : "") +
      (rest.length
        ? `<details class="ai-more"><summary>완료·안내 ${rest.length}건 보기</summary>${checkItems(rest)}</details>`
        : "")
    );
  };
  function aiScan() {
    if (!online) return "";
    return group(
      "계량증명서 사진으로 채우기",
      aiOn.vision
        ? `<label class="field"><span>계량증명서 사진</span><input id="ai-photo" type="file" accept="image/*" capture="environment"></label><div id="ai-scan"></div>`
        : `<p class="muted">사진 읽기 모델이 꺼져 있어 계량값 직접 입력 필요</p>`,
      "읽은 값은 원본과 대조해 확인한 뒤에만 입력 칸에 들어감",
    );
  }

  // ── 자원 순환 판매 (서버 모드) ──
  const GEAR = ["폐자망", "폐어망", "폐로프", "폐통발 그물", "폐부표", "혼합 그물"];
  const MATS = ["나일론", "폴리에틸렌", "폴리프로필렌", "혼합", "미확인"];
  const ORIGINS = ["쓰다가 배출", "조업 중 인양", "침적 수거", "해안 수거", "모름"];
  const ATTACH = ["뜸줄", "발줄", "납 봉돌", "부표", "철 틀", "금속 고리"];
  const GRADE = { "판매 후보": "pos", 조건부: "", "처리 대상": "neg" };
  const docsCache = {};
  function replaceItem(rec) {
    items = items.map((x) => (x.id === rec.id ? rec : x));
    delete docsCache[rec.id];
    delete checkCache[rec.id];
    render();
  }
  function circHome() {
    if (!online) return "";
    const lots = items.flatMap((r) => (r.sales || []).map((s) => ({ ...s, ship: r.id })));
    if (!lots.length) return "";
    const sold = items.reduce(
      (a, r) => {
        const c = r.circulation;
        return c ? { tons: a.tons + c.tons, revenue: a.revenue + c.revenue, gain: a.gain + c.siteGain } : a;
      },
      { tons: 0, revenue: 0, gain: 0 },
    );
    const open = lots.filter((s) => s.status === "offering");
    return `<section class="card"><div class="sec-title"><div><h2>자원 순환 판매</h2><p>떼어 놓은 묶음은 원료로 팔고 나머지만 처리</p></div></div>
      ${kv([
        ["판매 완료", `${nf(3).format(sold.tons)}톤 · 매각 ${won(sold.revenue)}`],
        ["집하장에 남은 돈", won(sold.gain), sold.gain >= 0 ? "pos" : "neg"],
        ["매입 제안 받는 중", `${open.length}건`],
      ])}
      ${open.map((s) => `<a class="row" href="#/s/${esc(s.ship)}"><b>${esc(s.ship)} · ${esc(s.kind)} ${esc(s.material)} ${s.weight}톤</b><small>제안 ${s.offers.length}건 ›</small></a>`).join("")}</section>`;
  }
  const opt = (list, sel) => list.map((o) => `<option${o === sel ? " selected" : ""}>${o}</option>`).join("");
  function lotView(r, s) {
    const offers = s.offers
      .map((o) => {
        const m = o.money;
        const act =
          s.status === "offering" && o.status === "open"
            ? `<button type="button" class="btn ghost sm" data-act="sale-accept" data-lot="${esc(s.id)}" data-offer="${esc(o.id)}">수락</button>`
            : `<span class="ai-tag ${o.status === "accepted" ? "pos" : ""}">${o.status === "accepted" ? "수락" : o.status === "declined" ? "마감" : "열림"}</span>`;
        return `<li><b>${esc(o.buyer)}</b> ${won(o.price)}/톤 · ${o.validUntil}까지${o.condition ? ` · ${esc(o.condition)}` : ""}${m ? `<small>매각 ${won(m.revenue)} · 피한 처리비 ${won(m.avoided)} · 준비비 −${won(m.prep)} · 수수료 −${won(m.teamFee)} → 집하장 ${won(m.siteGain)}</small>` : ""}<div class="ai-row">${act}</div></li>`;
      })
      .join("");
    const form =
      s.status === "offering"
        ? `<div class="offer-form">${field("구매 업체", "o-buyer", "", "text", 'maxlength="40" placeholder="업체가 직접 내면 비워 둠"')}${field("매입가 (원/톤)", "o-price", "", "number", 'placeholder="예: 200000"')}${field("유효일", "o-until", M.DEMO_DATE.slice(0, 8) + "30", "date")}<div class="ai-row"><button type="button" class="btn ghost sm" data-act="sale-offer" data-lot="${esc(s.id)}">매입 제안 입력</button></div></div>`
        : "";
    return `<li class="lot"><p><b>${esc(s.kind)} · ${esc(s.material)} ${s.weight}톤</b> <span class="ai-tag ${GRADE[s.grade] ?? ""}">${esc(s.grade)}</span> <span class="ai-tag ${s.status === "sold" ? "pos" : ""}">${s.status === "sold" ? "판매 완료" : "판매 중"}</span></p>
      <small>${esc(s.origin)}${s.note ? ` · ${esc(s.note)}` : ""}</small>${s.fixes?.length ? `<small>할 일: ${s.fixes.map(esc).join(" / ")}</small>` : ""}
      <ul class="ai-check">${offers || `<li class="muted">아직 매입 제안 없음</li>`}</ul>${form}</li>`;
  }
  function circSection(r) {
    if (!online) return "";
    const c = r.circulation;
    const lots = (r.sales || []).map((s) => lotView(r, s)).join("");
    const add = `<details class="ai-more" id="sale-new"><summary>떼어 놓은 묶음 판매 등록</summary>
      <label class="field"><span>어구 종류</span><select name="s-kind">${opt(GEAR, "폐자망")}</select></label>
      <label class="field"><span>재질</span><select name="s-material">${opt(MATS, "나일론")}</select></label>
      ${field("중량 (톤)", "s-weight", "", "number", 'placeholder="예: 1"')}
      <label class="field"><span>나온 곳</span><select name="s-origin">${opt(ORIGINS, "쓰다가 배출")}</select></label>
      <label class="choose"><input type="checkbox" name="s-separated" checked> 다른 어구와 따로 떼어 놓음</label>
      <label class="choose"><input type="checkbox" name="s-intact" checked> 자르지 않은 온전한 상태</label>
      <p class="muted">아직 붙어 있는 것</p>${ATTACH.map((a) => `<label class="choose"><input type="checkbox" name="s-att" value="${a}"> ${a}</label>`).join("")}
      <div class="ai-row"><button type="button" class="btn ghost" data-act="sale-check">AI 판매 판정</button><button type="button" class="btn ghost" data-act="sale-add">판매 등록</button></div>
      <div id="sale-out"></div></details>`;
    return group(
      "자원 순환 판매",
      (c && c.lots ? kv([["판매 완료", `${c.tons}톤 · 매각 ${won(c.revenue)}`], ["집하장에 남은 돈", won(c.siteGain), c.siteGain >= 0 ? "pos" : "neg"], ["그물마중 수수료", won(c.teamFee)]]) : "") +
        (lots ? `<ul class="lots">${lots}</ul>` : `<p class="muted">판매 묶음 없음. 종류별로 떼어 놓은 그물, 로프는 원료로 팔 수 있음</p>`) +
        add,
      "준비비(섬 작업, 추가 운송)와 수수료율은 팀 가정. 매입가는 업체 제안으로만 받음",
    );
  }
  function readLot() {
    const box = $("#sale-new"),
      v = (n) => box.querySelector(`[name=${n}]`);
    return {
      kind: v("s-kind").value,
      material: v("s-material").value,
      weight: Number(v("s-weight").value),
      origin: v("s-origin").value,
      separated: v("s-separated").checked,
      intact: v("s-intact").checked,
      attachments: [...box.querySelectorAll("[name=s-att]:checked")].map((c) => c.value),
    };
  }
  const STATUS_TAG = { "초안 완성": "pos", "일부 채움": "", "입력 필요": "neg", "받아야 함": "", "해당 없음": "" };
  const docsView = (d) => {
    const need = d.docs.filter((x) => x.needed),
      skip = d.docs.filter((x) => !x.needed);
    const li = (x) =>
      `<li><span class="ai-tag ${STATUS_TAG[x.status] ?? ""}">${esc(x.status)}</span><b>${esc(x.name)}</b><small>${esc(x.owner)} · ${esc(x.when)}</small>${x.missing.length && x.needed ? `<small>직접 입력: ${x.missing.map(esc).join(", ")}</small>` : ""}<small>${esc(x.basis)}${x.note ? ` · ${esc(x.note)}` : ""}</small>${x.needed && Object.values(x.fields).some((v) => v != null && v !== "") ? `<div class="ai-row"><button type="button" class="btn ghost sm" data-act="doc-open" data-key="${esc(x.key)}">초안 보기</button></div>` : ""}</li>`;
    return (
      `<p class="ai-sum">필요 서류 ${need.length}종</p><ul class="ai-check">${need.map(li).join("")}</ul>` +
      (skip.length ? `<details class="ai-more"><summary>지금 단계에선 필요 없음 ${skip.length}종</summary><ul class="ai-check">${skip.map(li).join("")}</ul></details>` : "")
    );
  };
  function docsSection(r) {
    if (!online) return "";
    return group(
      "AI 서류 안내",
      `<div id="docs" data-id="${esc(r.id)}">${docsCache[r.id] ? docsView(docsCache[r.id]) : `<p class="muted">필요 서류 확인 중</p>`}</div>`,
      "반출 단계와 기록을 보고 필요한 서류를 정하고 채울 수 있는 칸을 채움, 제출과 서명은 서류의 주인이 함",
    );
  }
  async function loadDocs() {
    const box = $("#docs");
    if (!box || docsCache[box.dataset.id]) return;
    const id = box.dataset.id;
    try {
      docsCache[id] = await window.GmServer.trade.docs(id);
      if ($("#docs")?.dataset.id === id) $("#docs").innerHTML = docsView(docsCache[id]);
    } catch (e) {
      box.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    }
  }

  function detail(id) {
    const r = find(id);
    if (!r)
      return (
        top("반출 상세", backBtn) +
        `<p class="empty">해당 반출 건 조회 불가</p>`
      );
    const head = `<div class="dhead"><div class="between start"><div><small>${esc(r.id)}</small><h2>${esc(r.kind)} · ${esc(r.material)}</h2></div><span class="dicon">${ICON[r.status]}</span></div>
      <div class="between end"><div class="big">${nf(3).format(r.weight)}<small>톤 · ${r.bags}마대</small></div><span class="glass">${NAMES[r.status]}</span></div>${track(r)}</div>`;
    const info = group(
      "반출 정보",
      kv([
        ["반출 예정", when(r.departure)],
        ["예상 반출량", `${tons(r.weight)} · ${r.bags}마대`],
        ["어구 · 재질", `${r.kind} · ${r.material}`],
        ["지정 처리업체", r.facility],
        [
          "사전 점검",
          r.checks?.length
            ? `${r.checks.length}/${M.CHECKS.length} · ${r.checks.join(", ")}`
            : "미기록",
        ],
      ]) + (r.note ? `<p class="memo">현장 메모 · ${esc(r.note)}</p>` : ""),
    );
    let body = "";
    if (r.status === "registered") body = quoteEditor(r);
    else if (r.status === "confirmed" && !sailed(r))
      body =
        group(
          "검수 입력 전",
          `<p class="muted">${when(r.departure)} 출항 후 대천항 하선·계량 완료 시 실제 인수량 입력 가능</p>`,
        ) + terms(r);
    else if (r.status === "confirmed") body = settleEditor(r) + terms(r);
    else {
      const a = r.actual,
        t = totals(r);
      body =
        group(
          "계량·인수 결과",
          kv([
            ["실제 반출량", tons(a.total)],
            ["최종 인수량", tons(a.accepted)],
            ["선별·운반 등 추가비", won(a.extra ?? r.quotes[r.choice].extra)],
            ["계량·인수 증빙", a.reference],
            ["업체 확인자", a.signer || "미기록"],
            ["잔재 사유", a.reason || "전량 인수"],
          ]),
        ) +
        group("정산 내역", results(t)) +
        terms(r);
    }
    return (
      top(esc(r.id), backBtn) +
      `<div class="stack">${head}${info}${r.status !== "settled" ? aiCheck(r) : ""}${circSection(r)}${docsSection(r)}<form id="edit" data-id="${esc(r.id)}" novalidate>${body}</form></div>`
    );
  }

  function quoteEditor(r) {
    const cards = r.quotes
      .map(
        (
          q,
          i,
        ) => `<section class="group"><h3>${esc(q.label)}${q.repliedBy ? ` <span class="ai-tag pos">업체 회신 · ${esc(q.repliedBy)}</span>` : ""}</h3><div class="card flat qcard" data-q="${i}">
        <label class="choose"><input type="radio" name="choice" value="${i}"> 이 조건 선택</label>
        <label class="field"><span>인수 조건</span><textarea name="condition" rows="2">${esc(q.condition)}</textarea></label>
        ${field("예상 인수량 (톤)", "expected", q.expected)}${field("인수분 처리비 (원/톤)", "rate", q.rate)}
        ${field("잔재물 처리비 (원/톤)", "residualRate", q.residualRate)}${field("추가 선별·운반비 (원/건)", "extra", q.extra)}
        ${field("견적 유효일", "validUntil", q.validUntil, "date")}<p class="qtotal" id="qt${i}"></p>${online ? `<div class="ai-row"><button type="button" class="btn ghost sm" data-act="quote-reply" data-q="${i}">업체 회신으로 저장</button></div>` : ""}</div></section>`,
      )
      .join("");
    return (
      `<section class="group"><h3>인수 조건 비교</h3><div class="card flat">` +
      (r.weight > 1
        ? `<p class="notice">⏰ 1톤 초과 반입 · 업체 신청 기한 ${when(M.noticeBy(r.departure))}(출항 24시간 전)</p>`
        : "") +
      `<p class="compare" id="compare"></p></div><p class="foot">동일 업체의 선별 조건 2안 · 예상 총비용에 인수 톤당 운영료 ${won(r.feeRate)} 포함 · 초깃값은 시연용 가정값</p></section>` +
      cards +
      `<p class="err" id="err" hidden></p><div class="actions"><button type="button" class="btn" data-act="confirm-quote">인수 조건 확정</button><button type="button" class="btn ghost" data-act="draft-quote">견적 임시 저장</button></div>`
    );
  }
  function readQuotes(form, r) {
    return r.quotes.map((q, i) => {
      const box = form.querySelector(`[data-q="${i}"]`);
      const v = (n) => box.querySelector(`[name=${n}]`).value;
      const num = (n) => (v(n) === "" ? NaN : Number(v(n)));
      return {
        ...q,
        condition: v("condition").trim(),
        expected: num("expected"),
        rate: num("rate"),
        residualRate: num("residualRate"),
        extra: num("extra"),
        validUntil: v("validUntil"),
      };
    });
  }
  function updateQuotes(form, r) {
    const options = [];
    readQuotes(form, r).forEach((q, i) => {
      const out = $("#qt" + i);
      try {
        const t = M.calculate(r, q, r.weight, q.expected);
        out.textContent = `예상 총비용 ${won(t.cost)} · 고객 순절감 ${won(t.savings)}`;
        out.classList.remove("neg");
        if (q.validUntil >= day(r.departure))
          options.push({ label: q.label, cost: t.cost });
      } catch {
        out.textContent = "비용 산출을 위한 물량·단가 확인 필요";
        out.classList.add("neg");
      }
    });
    options.sort((a, b) => a.cost - b.cost);
    $("#compare").textContent =
      options.length !== 2
        ? "두 견적의 수량·단가 및 출항일까지의 유효일 확인 필요"
        : options[1].cost > options[0].cost
          ? `‘${options[0].label}’ 조건의 예상 총비용 ${won(options[1].cost - options[0].cost)} 절감`
          : "두 조건의 예상 총비용 동일";
  }

  function settleEditor(r) {
    const q = r.quotes[r.choice];
    return (
      aiScan() +
      group(
        "검수 입력",
        field("실제 반출량 (톤)", "total", r.weight) +
          field("최종 인수량 (톤)", "accepted", q.expected) +
          field("실제 추가 선별·운반비 (원)", "extra", q.extra) +
          field(
            "계량·인수 증빙번호",
            "reference",
            "",
            "text",
            'maxlength="100"',
          ) +
          field("업체 확인자", "signer", "", "text", 'maxlength="40"') +
          `<label class="field"><span>잔재 발생 사유</span><textarea name="reason" rows="2" maxlength="350"></textarea></label>
          <label class="choose agree"><input type="checkbox" name="agree"> 계량표·인수 내역 집하장·업체 상호 대조 완료</label>`,
        `${esc(r.facility)} · ${esc(q.label)} · 입력 중량은 견적 예상치이므로 실측값 확인 필요`,
      ) +
      `<section class="group"><h3>예상 정산 내역</h3><div class="card flat" id="results"></div></section>
      <p class="err" id="err" hidden></p><div class="actions"><button type="button" class="btn" data-act="settle" disabled>정산 확정</button></div>`
    );
  }
  function readActual(form) {
    const n = (k) =>
      form.elements[k].value === "" ? NaN : Number(form.elements[k].value);
    return {
      total: n("total"),
      accepted: n("accepted"),
      extra: n("extra"),
      reference: form.elements.reference.value.trim(),
      signer: form.elements.signer.value.trim(),
      reason: form.elements.reason.value.trim(),
    };
  }
  function updateSettle(form, r) {
    const a = readActual(form);
    form.querySelector("[data-act=settle]").disabled =
      !form.elements.agree.checked;
    try {
      $("#results").innerHTML = results(
        M.calculate(r, r.quotes[r.choice], a.total, a.accepted, a.extra),
      );
    } catch {
      $("#results").innerHTML =
        `<p class="muted">계량 총 반출량 및 그 범위 내 인수량 입력 필요</p>`;
    }
  }

  // ── 반출 등록 ──
  function create() {
    const sel = (label, name, opts) =>
      `<label class="field"><span>${label}</span><select name="${name}">${opts.map((o) => `<option>${o}</option>`).join("")}</select></label>`;
    return (
      top("반출 등록", backBtn) +
      `<form id="create" class="stack" novalidate>` +
      aiIntake() +
      group(
        "집하 정보",
        sel("어구 종류", "kind", [
          "폐어망",
          "폐자망",
          "폐통발 그물",
          "혼합 그물",
        ]) +
          sel("재질", "material", [
            "미확인",
            "나일론",
            "폴리에틸렌",
            "폴리프로필렌",
            "혼합",
          ]) +
          field("예상 반출량 (톤)", "weight", "", "number", 'placeholder="예: 4.5"') +
          field("마대 수 (개)", "bags", "", "number", 'placeholder="예: 10"') +
          field(
            "출항 예정 일시",
            "departure",
            M.DEMO_DATE + "T13:00",
            "datetime-local",
          ) +
          field(
            "지정 처리업체",
            "facility",
            "보령 지정 재활용업체 (가상)",
            "text",
            'maxlength="70"',
          ) +
          `<label class="field"><span>혼입물·현장 메모 (선택)</span><textarea name="note" rows="2" maxlength="400"></textarea></label>`,
      ) +
      group(
        "인수 기준 사전 점검",
        M.CHECKS.map(
          (c) =>
            `<label class="choose"><input type="checkbox" name="checks" value="${esc(c)}"> ${esc(c)}</label>`,
        ).join(""),
        "미충족 항목은 업체 거절·추가비 사유",
      ) +
      `<details class="group"><summary>시연 비용 가정 조정</summary><div class="card flat">` +
      field("기존 방식 처리비 (원/톤)", "baseRate", 300000) +
      field("인수 톤당 운영료 (원)", "feeRate", 40000) +
      field("건별 팀 직접비 (원)", "directCost", 110000) +
      `</div><p class="foot">참고 단가 · 군산시수협 2026 인양쓰레기 기초단가 224,500원/톤(선별·계량·운반·재활용 포함) · 태안군 2026 하반기 폐어망 수거·처리 계약 84,268,800원</p></details>` +
      `<p class="err" id="err" hidden></p><div class="actions"><button type="button" class="btn" data-act="create">반출 등록</button></div></form>`
    );
  }

  // ── 동작 ──
  const curId = () => decodeURIComponent((location.hash.split("/")[2] || ""));
  function fail(e) {
    const box = $("#err");
    box.textContent = e?.message || "입력 내용 확인 필요";
    box.hidden = false;
    box.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  // ── AI 동작 ──
  const busy = (el, on, label) => {
    if (!el) return;
    el.disabled = on;
    if (label) el.textContent = label;
  };
  function fillCreate(f) {
    const form = $("#create");
    if (!form) return;
    const set = (name, v) => {
      if (v != null && form.elements[name]) form.elements[name].value = v;
    };
    set("kind", f.kind);
    set("material", f.material);
    set("weight", f.weight);
    set("bags", f.bags);
    set("departure", f.departure);
    form
      .querySelectorAll("[name=checks]")
      .forEach((c) => (c.checked = (f.checks || []).includes(c.value)));
  }
  async function runIntake(body) {
    const out = $("#ai-out");
    out.innerHTML = `<p class="muted">AI가 칸을 채우는 중</p>`;
    try {
      const r = await window.GmServer.ai.intake(body);
      fillCreate(r.fields);
      out.innerHTML =
        (body.audio_base64 ? `<p class="memo">들은 말 · ${esc(r.heard)}</p>` : "") + factList(r.facts);
      toast("AI가 채운 칸 확인 후 등록 필요");
    } catch (e) {
      out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    }
  }
  let recorder = null;
  async function toggleRecord() {
    const btn = $("#ai-rec");
    if (recorder) return recorder.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder = null;
        busy(btn, false, "🎤 녹음");
        const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () =>
          runIntake({
            audio_base64: String(reader.result).split(",")[1],
            content_type: blob.type.split(";")[0],
          });
        reader.readAsDataURL(blob);
      };
      recorder.start();
      btn.textContent = "■ 멈추고 채우기";
      setTimeout(() => recorder?.stop(), 30000); // 서버는 30초까지 받음
    } catch {
      toast("마이크를 쓸 수 없음, 글로 입력 필요");
    }
  }
  async function loadCheck() {
    const box = $("#ai-check");
    if (!box || checkCache[box.dataset.id]) return;
    const id = box.dataset.id;
    try {
      checkCache[id] = await window.GmServer.ai.checklist(id);
      if ($("#ai-check")?.dataset.id === id) $("#ai-check").innerHTML = checkView(checkCache[id]);
    } catch (e) {
      box.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    }
  }
  // 사진은 긴 변 1600px JPEG로 줄여 보낸다(휴대폰 원본은 수 MB)
  const shrink = (file) =>
    new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => no(new Error("사진을 열 수 없음"));
      img.src = URL.createObjectURL(file);
    });
  let lastScan = null;
  async function runScan(file) {
    const box = $("#ai-scan"),
      id = $("#edit")?.dataset.id;
    box.innerHTML = `<p class="muted">계량증명서 읽는 중</p>`;
    try {
      lastScan = await window.GmServer.ai.scan(id, await shrink(file));
      const f = lastScan.fields;
      box.innerHTML =
        kv([
          ["증명서 번호", f.cert_no || "읽지 못함"],
          ["계량 일자", f.date || "읽지 못함"],
          ["차량번호", f.vehicle_no || "읽지 못함"],
          ["총중량", f.gross_kg != null ? nf(0).format(f.gross_kg) + " kg" : "읽지 못함"],
          ["공차중량", f.tare_kg != null ? nf(0).format(f.tare_kg) + " kg" : "읽지 못함"],
          ["실중량", f.net_kg != null ? nf(0).format(f.net_kg) + " kg" : "읽지 못함"],
        ]) +
        `<ul class="ai-check">${lastScan.checks.map((c) => `<li><span class="ai-tag ${c.ok ? "pos" : "neg"}">${c.ok ? "맞음" : "확인 필요"}</span>${esc(c.text)}</li>`).join("")}</ul>` +
        `<div class="ai-row"><button type="button" class="btn ghost" data-act="ai-use">원본과 대조함, 이 값으로 채우기</button></div>`;
    } catch (e) {
      box.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    }
  }
  async function useScan() {
    const form = $("#edit");
    try {
      const s = await window.GmServer.ai.confirmScan(lastScan.id, {});
      if (s.suggest.total != null) form.elements.total.value = s.suggest.total;
      if (s.suggest.reference) form.elements.reference.value = s.suggest.reference;
      updateSettle(form, find(form.dataset.id));
      $("#ai-scan").innerHTML = `<p class="memo">계량증명서 확인 완료 · 실제 반출량과 증빙번호 채움, 인수량은 업체 검수 결과로 입력</p>`;
    } catch (e) {
      toast(e.message);
    }
  }

  const acts = {
    "ai-text": () => {
      const t = $("#ai-text").value.trim();
      t ? runIntake({ text: t }) : toast("말하거나 적은 내용 입력 필요");
    },
    "ai-rec": toggleRecord,
    async "ai-ask"() {
      const q = $("#ai-q").value.trim();
      if (!q) return toast("질문 입력 필요");
      $("#ai-ans").innerHTML = `<p class="muted">조문 찾는 중</p>`;
      try {
        const r = await window.GmServer.ai.ask(q);
        $("#ai-ans").innerHTML = `<p class="memo">${esc(r.answer)}</p>` + factList(r.facts);
      } catch (e) {
        $("#ai-ans").innerHTML = `<p class="err">${esc(e.message)}</p>`;
      }
    },
    "ai-use": useScan,
    async "sale-check"() {
      const out = $("#sale-out");
      out.innerHTML = `<p class="muted">AI가 판정하는 중</p>`;
      try {
        const g = await window.GmServer.trade.checkLot(curId(), readLot());
        out.innerHTML =
          `<p class="ai-sum ${GRADE[g.grade] ?? ""}">판정: ${esc(g.grade)}</p>` +
          (g.blockers.length ? `<ul class="ai-check">${g.blockers.map((b) => `<li><span class="ai-tag neg">안 됨</span>${esc(b)}</li>`).join("")}</ul>` : "") +
          (g.fixes.length ? `<ul class="ai-check">${g.fixes.map((f) => `<li><span class="ai-tag">할 일</span>${esc(f)}</li>`).join("")}</ul>` : "") +
          (g.buyers.length ? `<p class="memo">받는다고 공개한 업체: ${g.buyers.map((b) => `${esc(b.name)}(${esc(b.region)}${b.km != null ? `, ${b.km}km` : ""})`).join(", ")}</p>` : "");
      } catch (e) {
        out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
      }
    },
    async "sale-add"() {
      try {
        replaceItem(await window.GmServer.trade.addLot(curId(), readLot()));
        toast("판매 묶음 등록 완료, 업체 매입 제안 대기");
      } catch (e) {
        $("#sale-out").innerHTML = `<p class="err">${esc(e.message)}</p>`;
      }
    },
    async "sale-offer"(el) {
      const box = el.closest(".offer-form"),
        v = (n) => box.querySelector(`[name=${n}]`).value.trim();
      try {
        const body = { price: Number(v("o-price")), validUntil: v("o-until") };
        if (v("o-buyer")) body.buyer = v("o-buyer");
        replaceItem(await window.GmServer.trade.offer(curId(), el.dataset.lot, body));
        toast("매입 제안 입력 완료");
      } catch (e) {
        toast(e.message);
      }
    },
    async "sale-accept"(el) {
      try {
        replaceItem(await window.GmServer.trade.accept(curId(), el.dataset.lot, el.dataset.offer));
        toast("판매 확정, 집하장 몫 계산 완료");
      } catch (e) {
        toast(e.message);
      }
    },
    async "quote-reply"(el) {
      const form = $("#edit"),
        r = find(form.dataset.id),
        i = Number(el.dataset.q);
      try {
        const q = readQuotes(form, r)[i];
        replaceItem(await window.GmServer.trade.reply(r.id, i, q));
        toast("업체 회신으로 저장 완료");
      } catch (e) {
        fail(e);
      }
    },
    async "doc-open"(el) {
      try {
        await window.GmServer.trade.openDoc(curId(), el.dataset.key);
      } catch (e) {
        toast(e.message);
      }
    },
    guide: () => $("#guide").showModal(),
    async reset() {
      if (online) {
        try {
          items = await window.GmServer.reset();
        } catch (e) {
          return toast("서버 초기화 실패, " + e.message);
        }
        $("#guide").close();
        render();
        return toast("시연 데이터 초기 상태 복원 완료");
      }
      items = M.seed();
      warn = false;
      persist();
      $("#guide").close();
      render();
      toast("시연 데이터 초기 상태 복원 완료");
    },
    back: () =>
      history.length > 1 ? history.back() : (location.hash = "#/home"),
    "confirm-quote": () => saveQuote(true),
    "draft-quote": () => saveQuote(false),
    settle() {
      const form = $("#edit"),
        r = find(form.dataset.id);
      try {
        const a = readActual(form);
        if (a.accepted < a.total && !a.reason)
          throw new Error("미인수 물량의 사유 기재 필요");
        save({ ...r, status: "settled", actual: a });
        render();
        toast("실제 인수량 기준 정산 확정 완료");
      } catch (e) {
        fail(e);
      }
    },
    create() {
      const f = $("#create"),
        d = new FormData(f);
      try {
        const weight = Number(d.get("weight")),
          departure = d.get("departure");
        const r = {
          id: M.allocateId(items),
          kind: d.get("kind"),
          material: d.get("material"),
          bags: Number(d.get("bags")),
          weight,
          departure,
          note: d.get("note").trim(),
          photo: null,
          facility: d.get("facility").trim(),
          checks: d.getAll("checks"),
          status: "registered",
          quotes: M.defaults(weight, String(departure).slice(0, 10)),
          choice: null,
          actual: null,
          baseRate: Number(d.get("baseRate")),
          feeRate: Number(d.get("feeRate")),
          directCost: Number(d.get("directCost")),
        };
        save(r);
        location.replace("#/s/" + r.id);
        toast("반출 건 등록 완료");
      } catch (e) {
        fail(e);
      }
    },
  };
  function saveQuote(confirm) {
    const form = $("#edit"),
      r = find(form.dataset.id);
    try {
      const quotes = readQuotes(form, r);
      let choice = null;
      if (confirm) {
        const c = form.querySelector("[name=choice]:checked");
        if (!c) throw new Error("확정할 인수 조건 1건 선택 필요");
        choice = Number(c.value);
        if (quotes[choice].validUntil < day(r.departure))
          throw new Error(
            "선택 견적의 출항일 전 만료 · 견적 유효일 재확인 필요",
          );
      }
      save({
        ...r,
        quotes,
        choice,
        status: confirm ? "confirmed" : "registered",
      });
      render();
      toast(
        confirm ? "출항 전 인수 조건 확정 완료" : "인수 조건 초안 저장 완료",
      );
    } catch (e) {
      fail(e);
    }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el && acts[el.dataset.act]) {
      e.preventDefault();
      acts[el.dataset.act](el);
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "term") {
      term = e.target.value;
      $("#rows").innerHTML = listRows($("#rows").dataset.filter);
      return;
    }
    const form = e.target.closest("#edit");
    if (!form || e.target.closest("#ai-scan")) return;
    const r = find(form.dataset.id);
    if (r.status === "registered") updateQuotes(form, r);
    else updateSettle(form, r);
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "ai-photo" && e.target.files[0]) runScan(e.target.files[0]);
  });

  function countUp() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll("[data-count]").forEach((el) => {
      const end = Number(el.dataset.count),
        d = Number(el.dataset.d),
        t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 1000);
        el.textContent = (end * (1 - Math.pow(1 - t, 3))).toFixed(d);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function render() {
    const [, view = "home", arg] = (location.hash || "#/home").split("/");
    const screens = {
      home,
      list: () => list(arg),
      settle: settlements,
      s: () => detail(decodeURIComponent(arg || "")),
      new: create,
    };
    const screen = $("#screen");
    screen.innerHTML = (screens[view] || home)();
    screen.scrollTop = 0;
    const tab = view === "s" || view === "new" ? "" : view;
    document
      .querySelectorAll("[data-tab]")
      .forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    document.body.classList.toggle("sub", !tab);
    const form = $("#edit");
    if (form) {
      const r = find(form.dataset.id);
      if (r.status === "registered") updateQuotes(form, r);
      else if (r.status === "confirmed" && sailed(r)) updateSettle(form, r);
    }
    countUp();
    loadCheck();
    loadDocs();
  }
  window.addEventListener("hashchange", render);
  render();
  window.GmServer?.start().then((list) => {
    if (!list) return;
    items = list;
    online = true;
    window.GmServer.ai
      .status()
      .then((s) => (aiOn = s))
      .catch(() => {})
      .finally(render);
    toast("서버 저장 모드로 연결됨");
  });
})();
