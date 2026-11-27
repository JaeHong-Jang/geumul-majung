(function () {
  "use strict";
  const model = window.NetModel;
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    package:
      '<path d="m3 7 9-5 9 5v10l-9 5-9-5zM3 7l9 5 9-5m-9 5v10M7.5 4.5l9 5"/>',
    receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8m-8 4h7"/>',
    ship: '<path d="m3 14 9-3 9 3-3 5M6 19l-3-5m3-1V7h12v6M10 7V4h4v3M2 20c2 2 4 2 6 0 3 2 5 2 8 0 2 2 4 2 6 0"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5m10-5v5M3 11h18"/>',
    scale:
      '<path d="M5 19h14l2-12H3z"/><path d="M8 11a5 5 0 0 1 8 0m-4 3 2-4"/>',
    layers: '<path d="m2 7 10-5 10 5-10 5zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
    cycle:
      '<path d="M4 10a8 8 0 0 1 14-4l2 3m0-5v5h-5M20 14a8 8 0 0 1-14 4l-2-3m0 5v-5h5"/>',
    trend: '<path d="m3 17 6-6 4 3 8-9m-6 0h6v6"/>',
    anchor:
      '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v13M3 14c0 4 4 7 9 7s9-3 9-7M2 16l1-3 3 1m15 2-1-3-3 1M8 10h8"/>',
    clipboard:
      '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6m-6 4h4"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0z"/><circle cx="12" cy="10" r="2"/>',
    panel:
      '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9a2.7 2.7 0 1 1 4.2 2.2c-1.2.8-1.6 1.3-1.6 2.8m0 3h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    "arrow-right": '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    sliders:
      '<path d="M3 7h4m4 0h10M3 17h10m4 0h4"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
    net: '<path d="m4 6 3-3 13 13-3 4a9 9 0 0 1-13-1c-3-4-2-9 0-13zM3 10l9 10m-8-15 13 13M3 15l7-7m-4 11 8-8m-3 10 6-7"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    calculator:
      '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 7h8M8 12h1m5 0h1m-7 5h1m5 0h1"/>',
    camera:
      '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="3"/>',
  };
  const svg = (name, size = 20) =>
    '<svg aria-hidden="true" focusable="false" width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
    (icons[name] || icons.package) +
    "</svg>";
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const nf = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });
  const tons = (number) => nf.format(number);
  const money = (value) => Math.round(value).toLocaleString("ko-KR") + "원";
  const when = (value) => {
    const p = dateParts(value);
    return p.short + " (" + p.day + ") " + p.time;
  };
  window.NetUI = { icon: svg, esc, money, tons, when };
  document
    .querySelectorAll("[data-icon]")
    .forEach((el) => el.replaceWith(iconNode(el.dataset.icon)));
  function iconNode(name) {
    const template = document.createElement("template");
    template.innerHTML = svg(name);
    return template.content.firstChild;
  }
  document.querySelector(".brand-mark").innerHTML =
    '<svg aria-hidden="true" width="30" height="29" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 15 5l12 7-11 8-12-7ZM5 18l11 7 11-8M7 24l9 5 8-6"/><path d="m10 9 11 8m0-9-11 8"/></svg>';
  const $ = (id) => document.getElementById(id);
  const names = {
    registered: "인수 협의",
    confirmed: "인수 확정",
    settled: "정산 완료",
  };
  const views = {
    overview: "운영 현황",
    shipments: "반출 목록",
    settlements: "정산 내역",
  };
  const storagePrefix = "geumulmajung:v1:";
  const seeds = model.seed();
  let rows = seeds,
    invalidStorage = false,
    toastTimer;
  const view = () =>
    Object.hasOwn(views, location.hash.slice(1))
      ? location.hash.slice(1)
      : "overview";
  function loadRecords() {
    const map = new Map(seeds.map((r) => [r.id, r]));
    invalidStorage = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(storagePrefix)) continue;
        const data = JSON.parse(localStorage.getItem(key));
        model.verify(data);
        if (key !== storagePrefix + data.id) throw Error();
        map.set(data.id, data);
      }
      $("storage-warning").hidden = true;
    } catch {
      invalidStorage = true;
      $("storage-warning").textContent =
        "저장 기록 일부 판독 불가 · 보기 모드로 전환함. 로컬 서버 실행 또는 저장소 설정 확인 필요";
      $("storage-warning").hidden = false;
    }
    rows = Array.from(map.values()).sort((a, b) =>
      b.id.localeCompare(a.id, "en", { numeric: true }),
    );
  }
  function save(record, isNew = false) {
    loadRecords();
    if (invalidStorage) throw Error("브라우저 저장소 확인 후 재저장 필요");
    model.verify(record);
    const old = rows.find((r) => r.id === record.id);
    if (
      isNew
        ? old || record.status !== "registered"
        : !old || (old._rev ?? 0) !== (record._rev ?? 0)
    )
      throw Error("동일 반출번호 변경 감지 · 창 재실행 후 확인 필요");
    if (
      !isNew &&
      !(
        (old.status === "registered" &&
          ["registered", "confirmed"].includes(record.status)) ||
        (old.status === "confirmed" && record.status === "settled")
      )
    )
      throw Error("반출 단계 변경 감지 · 최신 상태 확인 필요");
    const updated = { ...record, _rev: (old?._rev ?? 0) + 1 };
    try {
      localStorage.setItem(storagePrefix + updated.id, JSON.stringify(updated));
    } catch {
      throw Error(
        "저장 공간 부족 또는 저장 제한 · 사진 크기 및 브라우저 설정 확인 필요",
      );
    }
    loadRecords();
    render();
    return structuredClone(updated);
  }
  function toast(msg) {
    clearTimeout(toastTimer);
    $("toast").textContent = msg;
    // 열린 dialog 위에 보이도록 top layer로 다시 올린다
    if ($("toast").showPopover) {
      if ($("toast").matches(":popover-open")) $("toast").hidePopover();
      $("toast").showPopover();
    }
    $("toast").classList.add("show");
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600);
  }
  window.NetApp = { records: () => structuredClone(rows), save, toast };
  function dateParts(value) {
    const d = new Date(value);
    return {
      short:
        d.getMonth() + 1 + ". " + String(d.getDate()).padStart(2, "0") + ".",
      day: ["일", "월", "화", "수", "목", "금", "토"][d.getDay()],
      time: value.slice(11, 16),
    };
  }
  function badge(status) {
    return (
      '<span class="badge ' +
      status +
      '"><span></span>' +
      names[status] +
      "</span>"
    );
  }
  const man = (won) =>
    (won > 0 ? "+" : won < 0 ? "−" : "") +
    nf.format(Math.round(Math.abs(won) / 1000) / 10) +
    "만 원";
  let selected = null;
  function brief(r) {
    if (r.status === "settled") {
      const a = r.actual,
        c = model.calculate(
          r,
          r.quotes[r.choice],
          a.total,
          a.accepted,
          a.extra,
        );
      return {
        label: "실측 인수율",
        big: c.ratio.toFixed(0) + "<small>%</small>",
        em: "고객 절감 " + man(c.savings),
        stats: [
          ["인수", tons(a.accepted) + "톤"],
          ["잔재", tons(c.residual) + "톤"],
          ["팀 이익", man(c.margin)],
        ],
        cta: "정산서 열람",
      };
    }
    const options = r.quotes.map((q) => ({
      q,
      c: model.calculate(r, q, r.weight, q.expected),
    }));
    const best =
      r.status === "confirmed"
        ? options[r.choice]
        : options.reduce((a, b) => (b.c.savings > a.c.savings ? b : a));
    const waiting =
      r.status === "confirmed" && r.departure.slice(0, 10) > model.DEMO_DATE;
    return {
      label:
        r.status === "confirmed"
          ? "확정 조건 예상 인수량"
          : "최적 조건 예상 인수량 · " + best.q.label,
      big: tons(best.q.expected) + "<small>톤</small>",
      em: "고객 절감 " + man(best.c.savings),
      stats: [
        ["인수율", best.c.ratio.toFixed(0) + "%"],
        ["운영료", man(best.c.fee)],
        ["견적", r.quotes.length + "건"],
      ],
      cta:
        r.status === "registered"
          ? "인수 조건 비교"
          : waiting
            ? "출항 대기 · 상세 열람"
            : "검수·정산 입력",
      wait: waiting,
    };
  }
  function card(r) {
    if (!r) return "";
    const b = brief(r),
      d = dateParts(r.departure);
    return (
      '<div class="card-photo" style="background-image:url(' +
      (r.photo ? "'" + r.photo + "'" : "'assets/daecheon.jpg'") +
      ')">' +
      badge(r.status) +
      '</div><div class="card-body"><h3>' +
      esc(r.id) +
      " · " +
      esc(r.kind) +
      '</h3><p class="card-meta">' +
      esc(r.material) +
      " · 마대 " +
      r.bags +
      "개 · " +
      d.short +
      " (" +
      d.day +
      ") " +
      d.time +
      '</p><div class="card-label">' +
      esc(b.label) +
      '</div><div class="card-big"><span class="num">' +
      b.big +
      "</span><em>" +
      b.em +
      '</em></div><div class="card-stats">' +
      b.stats
        .map(([k, v]) => "<span>" + k + " <b>" + v + "</b></span>")
        .join("") +
      '</div><button class="cta' +
      (b.wait ? " wait" : "") +
      '" data-open="' +
      esc(r.id) +
      '">' +
      b.cta +
      " " +
      svg("arrow-right", 17) +
      "</button></div>"
    );
  }
  function detail() {
    return (
      '<section class="glass side card-panel rise"><div class="card" id="ops-card">' +
      card(rows.find((r) => r.id === selected)) +
      "</div></section>"
    );
  }
  const counter = (value, digits = 0) =>
    '<span data-count="' +
    value +
    '" data-digits="' +
    digits +
    '">' +
    Number(value).toFixed(digits) +
    "</span>";
  function overview() {
    const active = rows.filter((r) => r.status !== "settled");
    const settled = rows.filter((r) => r.status === "settled");
    const byDate = [...rows].sort((a, b) =>
      a.departure.localeCompare(b.departure),
    );
    const upcoming = [...active].sort((a, b) =>
      a.departure.localeCompare(b.departure),
    );
    const next = upcoming.find(
      (r) => r.departure.slice(0, 10) >= model.DEMO_DATE,
    );
    if (!rows.some((r) => r.id === selected))
      selected = (next || byDate.at(-1))?.id ?? null;
    const total = settled.reduce((s, r) => s + r.actual.total, 0);
    const accepted = settled.reduce((s, r) => s + r.actual.accepted, 0);
    const ratio = total ? (accepted / total) * 100 : 0;
    const count = (st) => rows.filter((r) => r.status === st).length;
    const today = rows.filter(
      (r) => r.departure.slice(0, 10) === model.DEMO_DATE,
    ).length;
    const maxW = Math.max(6, ...rows.map((r) => r.weight));
    const spark = upcoming.length
      ? upcoming
          .map(
            (r, i) =>
              (i ? "L" : "M") +
              ((i / Math.max(1, upcoming.length - 1)) * 140).toFixed(1) +
              " " +
              (40 - (r.weight / maxW) * 34).toFixed(1),
          )
          .join("")
      : "M0 40L140 40";
    const ring = (rad, pct, color, w) =>
      '<circle cx="80" cy="80" r="' +
      rad +
      '" stroke="#edf3f6" stroke-width="' +
      w +
      '"/><circle class="arc" cx="80" cy="80" r="' +
      rad +
      '" pathLength="100" stroke="' +
      color +
      '" stroke-width="' +
      w +
      '" style="--off:' +
      (100 - pct).toFixed(1) +
      '"/>';
    return (
      '<div class="ops">' +
      '<div class="ops-main">' +
      '<section class="glass side kpi-panel rise" style="--d:1"><div class="side-head"><h2>반출 현황</h2><span class="chip">금일 출항 ' +
      today +
      '건</span></div><div class="kpis">' +
      '<div class="kpi"><span class="kpi-label">전체 반출</span><span class="num">' +
      counter(rows.length) +
      '<small>건</small></span><div class="viz split">' +
      [
        ["registered", "var(--amber)"],
        ["confirmed", "var(--cyan)"],
        ["settled", "var(--slate)"],
      ]
        .map(
          ([st, c]) =>
            '<i style="flex:' +
            count(st) +
            ";--tone:" +
            c +
            '" title="' +
            names[st] +
            " " +
            count(st) +
            '건"></i>',
        )
        .join("") +
      '</div></div><div class="kpi"><span class="kpi-label">반출 예정 중량</span><span class="num">' +
      counter(
        active.reduce((s, r) => s + r.weight, 0),
        1,
      ) +
      '<small>톤</small></span><span class="chip">대기 ' +
      active.length +
      '건</span><svg class="viz spark" viewBox="0 0 140 44" preserveAspectRatio="none"><path d="' +
      spark +
      '" fill="none" stroke="#0a6ebd" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg></div>' +
      '<div class="kpi"><span class="kpi-label">누적 인수 중량</span><span class="num">' +
      counter(accepted, 1) +
      '<small>톤</small></span><div class="viz lolli">' +
      settled
        .map(
          (r) =>
            '<i style="--h:' +
            ((r.actual.accepted / maxW) * 100).toFixed(0) +
            '%;--c:#0a6ebd" title="' +
            esc(r.id) +
            ' 인수"></i><i style="--h:' +
            ((r.actual.total / maxW) * 100).toFixed(0) +
            '%" title="' +
            esc(r.id) +
            ' 계량"></i>',
        )
        .join("") +
      '</div></div><div class="kpi"><span class="kpi-label">누적 인수율</span><div class="gauge"><svg viewBox="0 0 120 66"><path d="M10 60a50 50 0 0 1 100 0" fill="none" stroke="#e5edf1" stroke-width="9" stroke-linecap="round"/><path class="arc" d="M10 60a50 50 0 0 1 100 0" pathLength="100" fill="none" stroke="#0a6ebd" stroke-width="9" stroke-linecap="round" style="--off:' +
      (100 - ratio).toFixed(1) +
      '"/></svg><span class="num">' +
      (total ? counter(ratio, 1) : "—") +
      "<small>%</small></span></div></div></div></section>" +
      '<div class="widgets"><section class="glass widget rise" style="--d:2"><h2 class="w-title">인수 구성</h2><p class="w-sub">정산 완료 반출의 실계량 기준</p><div class="rings-wrap"><div class="rings"><svg width="160" height="160" viewBox="0 0 160 160">' +
      ring(68, ratio, "#0a6ebd", 12) +
      ring(49, total ? 100 - ratio : 0, "#e8a83a", 10) +
      ring(
        32,
        rows.length ? (settled.length / rows.length) * 100 : 0,
        "#18b4cc",
        8,
      ) +
      '</svg><div class="rings-center"><span class="num">' +
      counter(ratio) +
      '</span><small>% 인수</small></div></div><div class="key">' +
      '<div><i style="background:#0a6ebd"></i>인수 중량<b>' +
      counter(accepted, 1) +
      "톤</b></div>" +
      '<div><i style="background:#e8a83a"></i>잔재 중량<b>' +
      counter(total - accepted, 1) +
      "톤</b></div>" +
      '<div><i style="background:#18b4cc"></i>정산 완료<b>' +
      settled.length +
      "/" +
      rows.length +
      "건</b></div></div></div></section>" +
      '<section class="glass widget rise" style="--d:3"><div class="w-head"><div><h2 class="w-title">반출별 중량</h2><p class="w-sub">출항일 순 정렬 · 막대 선택 시 상세 카드 연동</p></div><span class="chip">최대 ' +
      tons(maxW) +
      '톤</span></div><div class="bars">' +
      byDate
        .map(
          (r, i) =>
            '<button class="bar" data-pick="' +
            esc(r.id) +
            '" style="--i:' +
            i +
            ";--h:" +
            ((r.weight / maxW) * 100).toFixed(1) +
            '%" aria-label="' +
            esc(r.id) +
            " " +
            tons(r.weight) +
            '톤"><i></i><span class="tip">' +
            esc(r.id.slice(-3)) +
            "번 · " +
            tons(r.weight) +
            "톤</span><small>" +
            dateParts(r.departure).short +
            "</small></button>",
        )
        .join("") +
      "</div></section></div></div>" +
      '<div class="ops-aside">' +
      detail() +
      '<aside class="glass side rise" style="--d:4"><div class="side-head"><h2 class="w-title">처리할 업무</h2></div>' +
      '<div class="todo">' +
      todo(
        "registered",
        "인수 조건 협의",
        "업체 조건 2안 비교 후 확정",
        "var(--amber)",
        active.length,
      ) +
      todo(
        "confirmed",
        "검수·정산 입력",
        "하선 후 실계량·증빙 입력",
        "var(--cyan)",
        active.length,
      ) +
      "</div>" +
      // 누적 성과 (서천서부수협 회수량·절감액 보고 방식 참고)
      '<div class="side-head"><h2 class="w-title">최근 정산</h2><span class="chip">누적 고객 절감 ' +
      man(
        settled.reduce((sum, r) => {
          const a = r.actual;
          return (
            sum +
            model.calculate(r, r.quotes[r.choice], a.total, a.accepted, a.extra)
              .savings
          );
        }, 0),
      ) +
      '</span></div><div class="feed">' +
      (settled.length
        ? settled
            .map((r) => {
              const a = r.actual,
                c = model.calculate(
                  r,
                  r.quotes[r.choice],
                  a.total,
                  a.accepted,
                  a.extra,
                );
              return (
                '<button class="feed-item" data-pick="' +
                esc(r.id) +
                '"><i>' +
                esc(r.id.slice(-3)) +
                "</i><span><strong>" +
                esc(r.kind) +
                " " +
                tons(a.accepted) +
                "톤 인수</strong><small>고객 " +
                man(c.savings) +
                " · 팀 " +
                man(c.margin) +
                "</small></span><time>" +
                dateParts(r.departure).short +
                "</time></button>"
              );
            })
            .join("")
        : '<p class="w-sub">정산 완료 반출 없음</p>') +
      "</div></aside></div></div>"
    );
  }
  function todo(status, label, sub, tone, of) {
    const n = rows.filter((r) => r.status === status).length;
    return (
      '<button class="todo-row" data-filter="' +
      status +
      '" style="--tone:' +
      tone +
      '"><strong>' +
      label +
      "</strong><b>" +
      n +
      "</b><small>" +
      sub +
      '</small><span class="segs">' +
      Array.from(
        { length: Math.max(of, 1) },
        (_, i) => '<i class="' + (i < n ? "on" : "") + '"></i>',
      ).join("") +
      "</span></button>"
    );
  }
  function pick(id) {
    selected = id;
    $("ops-card").innerHTML = card(rows.find((x) => x.id === id));
    $("ops-card").style.animation = "none";
    void $("ops-card").offsetWidth;
    $("ops-card").style.animation = "";
    document
      .querySelectorAll(".bar[data-pick]")
      .forEach((el) => el.classList.toggle("is-on", el.dataset.pick === id));
  }
  function countUp() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll("[data-count]").forEach((el) => {
      const end = Number(el.dataset.count),
        digits = Number(el.dataset.digits),
        start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 1100);
        el.textContent = (end * (1 - Math.pow(1 - t, 3))).toFixed(digits);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function renderList() {
    const current = view(),
      term = $("search").value.trim().toLowerCase(),
      filter = $("status").value;
    const isLedger = current === "settlements";
    const matches = rows.filter(
      (r) =>
        (!isLedger || r.status === "settled") &&
        (!filter || r.status === filter) &&
        (!term ||
          [r.id, r.kind, r.material, r.facility].some((field) =>
            field.toLowerCase().includes(term),
          )),
    );
    const visible = current === "overview" ? matches.slice(0, 5) : matches;
    $("list-count").textContent =
      current === "overview" ? visible.length : matches.length;
    const cols = isLedger
      ? [
          "반출번호",
          "품목",
          "최종 인수량",
          "고객 순절감액",
          "팀 공헌이익",
          "정산서",
        ]
      : [
          "반출번호",
          "품목 · 재질",
          "예상 반출량",
          "출항 예정",
          "진행 상태",
          "상세",
        ];
    let content = visible
      .map((r) => {
        const id = esc(r.id),
          when = dateParts(r.departure);
        let middle;
        if (isLedger) {
          const a = r.actual,
            c = model.calculate(
              r,
              r.quotes[r.choice],
              a.total,
              a.accepted,
              a.extra,
            );
          middle =
            '<td class="weight">' +
            tons(a.accepted) +
            ' 톤</td><td class="' +
            (c.savings < 0 ? "negative" : "positive") +
            '">' +
            money(c.savings) +
            '</td><td class="' +
            (c.margin < 0 ? "negative" : "positive") +
            '">' +
            money(c.margin) +
            "</td>";
        } else {
          middle =
            '<td class="weight">' +
            tons(r.weight) +
            ' <small>톤</small></td><td class="date-cell">' +
            when.short +
            " <small>(" +
            when.day +
            ") " +
            when.time +
            "</small></td><td>" +
            badge(r.status) +
            "</td>";
        }
        return (
          '<tr data-row="' +
          id +
          '"><td><button class="id-link" data-open="' +
          id +
          '">' +
          id +
          '</button></td><td><div class="kind"><i>' +
          svg("net", 18) +
          "</i><div><strong>" +
          esc(r.kind) +
          "</strong><small>" +
          esc(r.material) +
          "</small></div></div></td>" +
          middle +
          '<td class="row-end"><button class="row-link" data-open="' +
          id +
          '" aria-label="' +
          id +
          ' 상세 열기">' +
          svg("chevron", 15) +
          "</button></td></tr>"
        );
      })
      .join("");
    if (!content) {
      content =
        '<tr><td colspan="6" class="empty">' +
        svg("search", 25) +
        "<strong>" +
        (term || filter
          ? "조건에 부합하는 반출 없음"
          : isLedger
            ? "정산 완료 반출 없음"
            : "등록된 반출 없음") +
        "</strong>" +
        (term || filter
          ? '<button class="text-btn" data-action="clear">검색 조건 초기화</button>'
          : "") +
        "</td></tr>";
    }
    $("table-wrap").innerHTML =
      '<table class="' +
      (isLedger ? "ledger" : "shipment-table") +
      '" aria-labelledby="list-title"><thead><tr>' +
      cols
        .map(
          (s, i) =>
            '<th scope="col"' +
            (i === 5 ? ' class="row-end"' : "") +
            ">" +
            (i === 5 ? '<span class="sr">' + s + "</span>" : s) +
            "</th>",
        )
        .join("") +
      "</tr></thead><tbody>" +
      content +
      "</tbody></table>";
  }
  function render() {
    const current = view(),
      home = current === "overview";
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === current)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    $("page-title").textContent = home ? "반출 운영 현황" : views[current];
    document.title = "그물마중 · " + views[current];
    $("crumb-view").textContent = views[current];
    $("overview-content").innerHTML = home ? overview() : "";
    if (home) {
      if (selected) pick(selected);
      countUp();
    }
    $("list-title").textContent = home
      ? "최근 반출"
      : current === "shipments"
        ? "등록된 반출"
        : "완료된 정산";
    $("all-link").hidden = !home;
    $("list-tools").hidden = home;
    $("status").closest("label").hidden = current === "settlements";
    renderList();
  }
  let pendingFilter = "";
  function goList(filter = "") {
    pendingFilter = filter;
    if (view() === "shipments") changeView();
    else location.hash = "shipments";
  }
  function changeView() {
    $("search").value = "";
    $("status").value = pendingFilter;
    pendingFilter = "";
    render();
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", (event) => {
    const el = event.target.closest(
      "[data-action],[data-open],[data-filter],[data-row],[data-pick]",
    );
    if (!el) return;
    if (el.dataset.pick) {
      pick(el.dataset.pick);
      return;
    }
    if (el.dataset.open || el.dataset.row) {
      window.NetForms.open(el.dataset.open || el.dataset.row);
      return;
    }
    if (el.dataset.filter) {
      goList(el.dataset.filter);
      return;
    }
    switch (el.dataset.action) {
      case "create":
        window.NetForms.create();
        break;
      case "help":
        $("guide").showModal();
        break;
      case "reset":
        try {
          Object.keys(localStorage)
            .filter((key) => key.startsWith(storagePrefix))
            .forEach((key) => localStorage.removeItem(key));
        } catch {
          // 저장소를 못 쓰는 환경이면 지울 기록도 없다
        }
        $("guide").close();
        loadRecords();
        render();
        toast("시연 데이터 초기 상태 복원 완료");
        break;
      case "all":
        goList();
        break;
      case "clear":
        $("search").value = "";
        $("status").value = "";
        renderList();
        break;
    }
  });
  $("search").addEventListener("input", renderList);
  $("status").addEventListener("change", renderList);
  window.addEventListener("hashchange", changeView);
  window.addEventListener("storage", (event) => {
    if (!event.key || event.key.startsWith(storagePrefix)) {
      loadRecords();
      render();
    }
  });
  loadRecords();
  render();
})();
