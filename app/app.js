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
    warn = false;
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
    const i = items.findIndex((x) => x.id === r.id);
    if (i < 0) items.unshift(r);
    else items[i] = r;
    persist();
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
    const maxW = 6.5;

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
    const spark = (() => {
      if (upcoming.length < 2) return "M0 30L140 30";
      return upcoming
        .map(
          (r, i) =>
            (i ? "L" : "M") +
            ((i / (upcoming.length - 1)) * 140).toFixed(1) +
            " " +
            (36 - (r.weight / maxW) * 30).toFixed(1),
        )
        .join("");
    })();
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
      `<div class="grid2">` +
      kpi(
        "▣",
        "전체 반출",
        items.length,
        0,
        "건",
        `<div class="split">${["registered", "confirmed", "settled"].map((st) => `<i class="${st}" style="flex:${count(st)}"></i>`).join("")}</div>`,
      ) +
      kpi(
        "⚖",
        "반출 예정 중량",
        active.reduce((s, r) => s + r.weight, 0),
        1,
        "톤",
        `<svg class="spark" viewBox="0 0 140 40" preserveAspectRatio="none"><path d="${spark}L140 40L0 40Z" class="area"/><path d="${spark}" class="line"/></svg>`,
      ) +
      kpi(
        "⤓",
        "누적 인수 중량",
        accepted,
        1,
        "톤",
        `<div class="lolli">${settled.map((r) => `<i style="--h:${(r.actual.accepted / maxW) * 100}%"></i><i class="ghost" style="--h:${(r.actual.total / maxW) * 100}%"></i>`).join("")}</div>`,
      ) +
      `<div class="card kpi"><div class="tile-head"><span>%</span>누적 인수율</div><div class="gauge"><svg viewBox="0 0 100 100">${ring(ratio, "ocean", 40, 10)}</svg><b>${total ? (ratio * 100).toFixed(1) : "—"}</b></div></div>` +
      `</div>` +
      `<section class="card"><div class="sec-title"><div><h2>인수 구성</h2><p>정산 완료 반출의 실계량 기준</p></div></div>
        <div class="rings"><div class="ringbox"><svg viewBox="0 0 100 100">${ring(ratio, "ocean", 44, 8)}${ring(total ? 1 - ratio : 0, "sand", 32, 7)}${ring(settled.length / Math.max(items.length, 1), "sea", 21, 6)}</svg><b>${Math.round(ratio * 100)}%</b></div>
        <div class="legend"><div><i class="ocean"></i><span>인수 중량<b>${tons(accepted)}</b></span></div><div><i class="sand"></i><span>잔재 중량<b>${tons(Math.round((total - accepted) * 1000) / 1000)}</b></span></div><div><i class="sea"></i><span>정산 완료<b>${settled.length}/${items.length}건</b></span></div></div></div></section>` +
      `<section class="card"><div class="sec-title"><div><h2>반출별 중량</h2><p>출항일 순 · 오늘 출항 강조</p></div><span class="chip">최대 6톤</span></div>
        <div class="bars">${byDate.map((r, i) => `<a href="#/s/${esc(r.id)}" class="bar ${day(r.departure) === M.DEMO_DATE ? "today" : ""}" style="--h:${(r.weight / maxW) * 100}%;--i:${i}"><em>${tons(r.weight)}</em><i></i><small>${r.id.slice(-3)}</small></a>`).join("")}</div></section>` +
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
      `<div class="stack">${head}${info}<form id="edit" data-id="${esc(r.id)}" novalidate>${body}</form></div>`
    );
  }

  function quoteEditor(r) {
    const cards = r.quotes
      .map(
        (
          q,
          i,
        ) => `<section class="group"><h3>${esc(q.label)}</h3><div class="card flat qcard" data-q="${i}">
        <label class="choose"><input type="radio" name="choice" value="${i}"> 이 조건 선택</label>
        <label class="field"><span>인수 조건</span><textarea name="condition" rows="2">${esc(q.condition)}</textarea></label>
        ${field("예상 인수량 (톤)", "expected", q.expected)}${field("인수분 처리비 (원/톤)", "rate", q.rate)}
        ${field("잔재물 처리비 (원/톤)", "residualRate", q.residualRate)}${field("추가 선별·운반비 (원/건)", "extra", q.extra)}
        ${field("견적 유효일", "validUntil", q.validUntil, "date")}<p class="qtotal" id="qt${i}"></p></div></section>`,
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
          field("예상 반출량 (톤)", "weight", "") +
          field("마대 수 (개)", "bags", "") +
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
  function fail(e) {
    const box = $("#err");
    box.textContent = e?.message || "입력 내용 확인 필요";
    box.hidden = false;
    box.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const acts = {
    guide: () => $("#guide").showModal(),
    reset() {
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
      acts[el.dataset.act]();
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "term") {
      term = e.target.value;
      $("#rows").innerHTML = listRows($("#rows").dataset.filter);
      return;
    }
    const form = e.target.closest("#edit");
    if (!form) return;
    const r = find(form.dataset.id);
    if (r.status === "registered") updateQuotes(form, r);
    else updateSettle(form, r);
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
  }
  window.addEventListener("hashchange", render);
  render();
})();
