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
    online = false, // 서버(gm-api.js)에 붙었는지. 아니면 브라우저 저장소
    // 서버에 붙는 중이면 첫 화면은 자리 표시(스켈레톤)로 둔다. ?api=off면 바로 기기 기록
    loading = Boolean(window.GmServer) && window.GmServer.base !== "off",
    invalidStorage = false,
    toastTimer;
  const view = () =>
    Object.hasOwn(views, location.hash.slice(1))
      ? location.hash.slice(1)
      : "overview";
  const byId = (list) =>
    list.sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
  function loadRecords() {
    if (online) return; // 서버 모드에서는 rows가 서버 기록의 사본이다
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
    if (online) {
      rows = byId([updated, ...rows.filter((r) => r.id !== updated.id)]);
      sync(old, updated);
      render();
      return structuredClone(updated);
    }
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
  // 화면은 바로 바꾸고 서버 저장은 뒤따른다. 서버가 거절하면 서버 기록으로 되돌린다.
  function sync(old, record) {
    window.GmServer.push(old, record)
      .then((rec) => {
        rows = byId(rows.map((r) => (r.id === record.id ? rec : r)));
        render();
      })
      .catch(async (e) => {
        toast("서버 저장 실패, " + e.message);
        try {
          rows = byId(await window.GmServer.list());
        } catch {}
        render();
      });
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
  // 판매·업체 회신처럼 서버가 바로 저장하고 새 기록을 돌려주는 동작은 그 기록으로 바꿔 끼운다
  function replace(record) {
    rows = byId(rows.map((r) => (r.id === record.id ? record : r)));
    render();
  }
  window.NetApp = {
    records: () => structuredClone(rows),
    save,
    toast,
    replace,
    online: () => online,
  };
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
  // 정산 1건의 실측 손익
  const result = (r) =>
    model.calculate(
      r,
      r.quotes[r.choice],
      r.actual.total,
      r.actual.accepted,
      r.actual.extra,
    );
  const sailed = (r) => r.departure.slice(0, 10) <= model.DEMO_DATE;
  let selected = null;
  function brief(r) {
    if (r.status === "settled") {
      const a = r.actual,
        c = result(r);
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
    const waiting = r.status === "confirmed" && !sailed(r);
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
      " · " +
      esc(model.packLabel(r)) +
      " · " +
      d.short +
      " (" +
      d.day +
      ") " +
      d.time +
      '</p><div class="card-label">' +
      esc(b.label) +
      '</div><div class="card-big"><span class="card-num">' +
      b.big +
      "</span><em>" +
      b.em +
      '</em></div><dl class="card-stats">' +
      b.stats
        .map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + v + "</dd></div>")
        .join("") +
      '</dl><button class="cta' +
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
  const counter = (value, digits = 0) =>
    '<span data-count="' +
    value +
    '" data-digits="' +
    digits +
    '">' +
    Number(value).toFixed(digits) +
    "</span>";
  // 그래프 색: 단계 배지와 같은 색. 정산 완료는 인수(파랑)·잔재(중립 회색)로 나눔
  const TONE = {
    registered: "var(--st-wait)",
    confirmed: "var(--st-go)",
    settled: "var(--st-done)",
    residual: "var(--neutral)",
  };
  // 손익분기 인수율(%) · 사업계획서 기준: 5톤 반출 1건, '로프 분리 후 인수' 조건(model.defaults 2안),
  // 시연 기본 단가(model.seed). model.calculate는 인수량에 선형이므로 인수 0톤·전량 인수 두 점으로
  // 고객 절감과 팀 공헌이익이 0이 되는 인수량을 각각 구해 큰 쪽을 씀 (2.75톤 / 5톤 = 55%)
  const breakEven = (() => {
    const t = 5,
      r = seeds[0],
      q = model.defaults(t, model.DEMO_DATE)[1];
    const zero = (key) => {
      const a = model.calculate(r, q, t, 0)[key],
        b = model.calculate(r, q, t, t)[key];
      return (-a / (b - a)) * t;
    };
    return (Math.max(zero("savings"), zero("margin")) / t) * 100;
  })();
  const byDeparture = (a, b) => a.departure.localeCompare(b.departure);
  // 지금 처리할 일: 단계별 건수 + 가장 급한 건 + 그 건을 바로 여는 버튼
  function tasks() {
    const deadline = (r) =>
      r.weight > 1 ? model.noticeBy(r.departure) : r.departure;
    return [
      {
        tone: "registered",
        name: "인수 조건 협의",
        list: rows.filter((r) => r.status === "registered").sort(byDeparture),
        cta: "조건 비교",
        due: (r) =>
          (r.weight > 1 ? "업체 신청 기한 " : "출항 ") + when(deadline(r)),
        late: (r) => deadline(r).slice(0, 10) < model.DEMO_DATE,
        primary: true,
      },
      {
        tone: "confirmed",
        name: "검수·정산 입력",
        list: rows
          .filter((r) => r.status === "confirmed" && sailed(r))
          .sort(byDeparture),
        cta: "정산 입력",
        due: (r) => dateParts(r.departure).short + " 출항분 · 하선 후 계량 입력",
        late: () => false,
        primary: true,
      },
      {
        tone: "waiting",
        name: "출항 대기",
        list: rows
          .filter((r) => r.status === "confirmed" && !sailed(r))
          .sort(byDeparture),
        cta: "상세 보기",
        due: (r) => when(r.departure) + " 출항",
        late: () => false,
      },
    ];
  }
  function taskRow(t) {
    const first = t.list[0],
      late = first && t.late(first);
    return (
      '<li class="task ' +
      t.tone +
      '"><span class="task-dot" aria-hidden="true"></span><div class="task-main"><strong>' +
      t.name +
      ' <b class="task-count">' +
      t.list.length +
      "건</b></strong><small" +
      (late ? ' class="late"' : "") +
      ">" +
      (first
        ? (late ? "기한 지남 · " : "") +
          esc(first.id) +
          " · " +
          t.due(first)
        : "지금 처리할 건 없음") +
      "</small></div>" +
      (first
        ? '<button class="btn btn-sm ' +
          (t.primary ? "btn-primary" : "btn-secondary") +
          '" data-open="' +
          esc(first.id) +
          '" aria-label="' +
          esc(first.id) +
          " " +
          t.cta +
          '">' +
          t.cta +
          svg("arrow-right", 16) +
          "</button>"
        : "") +
      "</li>"
    );
  }
  // 누적 인수율 불릿 그래프: 0~손익분기 구간(진한 회색)·그 위(옅은 회색) 배경, 측정 막대, 손익분기 표지
  function bullet(ratio, has) {
    const be = breakEven.toFixed(0);
    return (
      '<div class="bullet' +
      (has && ratio < breakEven ? " below" : "") +
      '" role="img" aria-label="누적 인수율 ' +
      (has ? ratio.toFixed(0) + "%" : "없음") +
      ", 손익분기 " +
      be +
      '%"><span class="bullet-band" style="width:' +
      be +
      '%"></span>' +
      (has
        ? '<span class="bullet-bar" style="width:' +
          Math.min(100, ratio).toFixed(1) +
          '%"></span>'
        : "") +
      '<span class="bullet-mark" style="left:' +
      be +
      '%"></span></div><div class="bullet-axis" aria-hidden="true"><span>0</span><span class="be" style="left:' +
      be +
      '%">손익분기 ' +
      be +
      "%</span><span>100%</span></div>"
    );
  }
  const tile = (label, value, cmp) =>
    '<div class="block kpi span-4"><span class="kpi-label">' +
    label +
    '</span><span class="kpi-value">' +
    value +
    '</span><div class="kpi-cmp">' +
    cmp +
    "</div></div>";
  // 단계 구성 막대: 구간 안에 '협의 2'처럼 이름+건수를 직접 적음(범례 없음, 원칙 9·10).
  // 구간이 좁으면 건수만 또는 비우고, 그때만 막대 아래 문장으로 전부 적음
  const SHORT = { registered: "협의", confirmed: "확정", settled: "정산" };
  function stageBar(total) {
    const parts = ["registered", "confirmed", "settled"]
      .map((st) => [st, rows.filter((r) => r.status === st).length])
      .filter(([, n]) => n > 0);
    return (
      '<div class="seg-bar" role="img" aria-label="' +
      parts.map(([st, n]) => names[st] + " " + n + "건").join(", ") +
      '">' +
      parts
        .map(([st, n]) => {
          const share = n / total;
          return (
            '<i class="' +
            st +
            '" style="flex:' +
            n +
            '" title="' +
            names[st] +
            " " +
            n +
            '건">' +
            (share >= 0.2 ? SHORT[st] + " " + n : share >= 0.08 ? n : "") +
            "</i>"
          );
        })
        .join("") +
      "</div>" +
      (parts.every(([, n]) => n / total >= 0.2)
        ? ""
        : '<p class="seg-note">' +
          parts.map(([st, n]) => names[st] + " " + n).join(" · ") +
          "</p>")
    );
  }
  // 정산 표 한 줄 (운영 현황 '정산 내역'과 정산 내역 화면이 같이 씀)
  function ledgerCells(r) {
    const c = result(r),
      d = dateParts(r.departure);
    const signed = (v) =>
      '<td class="n' + (v < 0 ? " negative" : "") + '">' + man(v) + "</td>";
    return (
      '<td class="date-cell">' +
      d.short +
      " <small>(" +
      d.day +
      ")</small></td>" +
      '<td class="n">' +
      tons(r.actual.total) +
      ' <small>톤</small></td><td class="n">' +
      tons(r.actual.accepted) +
      ' <small>톤</small></td><td class="n' +
      (c.ratio < breakEven ? " negative" : "") +
      '">' +
      c.ratio.toFixed(0) +
      "%</td>" +
      signed(c.savings) +
      signed(c.margin)
    );
  }
  const LEDGER_COLS = [
    ["반출번호"],
    ["품목"],
    ["출항일"],
    ["계량", "n"],
    ["인수", "n"],
    ["인수율", "n"],
    ["고객 절감", "n"],
    ["팀 공헌이익", "n"],
    ["정산서", "row-end"],
  ];
  // 자원 순환 판매 (서버 모드만): 판매 완료 묶음의 돈과 매입 제안 받는 중인 묶음
  const wanText = (won) =>
    (won < 0 ? "−" : "") +
    nf.format(Math.round(Math.abs(won) / 1000) / 10) +
    "만 원";
  const wan = (won) => wanText(won).replace("만 원", "<small>만 원</small>");
  // 판매로 들어온 돈(매각 + 피한 처리비)이 어디로 가는지: 100% 가로 막대 1개, 구간 안에 직접 라벨 (원칙 9·10)
  function moneySplit(sum) {
    const total = sum.revenue + sum.avoided;
    const parts = [
      ["gain", "집하장 몫", sum.siteGain],
      ["prep", "준비비(섬 작업·추가 운송)", sum.prep],
      ["fee", "그물마중 수수료", sum.teamFee],
    ].filter(([, , v]) => v > 0);
    const head =
      '<p class="split-head">판매로 들어온 돈 <b>' +
      wanText(total) +
      "</b> = 매각 " +
      wanText(sum.revenue) +
      " + 처리 안 보내서 아낀 처리비 " +
      wanText(sum.avoided) +
      "</p>";
    if (!total || sum.siteGain < 0) return head;
    const label = (name, v) => name.replace(/\(.*\)/, "") + " " + wanText(v);
    return (
      head +
      '<div class="seg-bar split-bar" role="img" aria-label="' +
      parts.map(([, n, v]) => n + " " + wanText(v)).join(", ") +
      '">' +
      parts
        .map(
          ([k, n, v]) =>
            '<i class="' +
            k +
            '" style="flex:' +
            v +
            '" title="' +
            n +
            " " +
            wanText(v) +
            '">' +
            (v / total >= 0.2 ? label(n, v) : "") +
            "</i>",
        )
        .join("") +
      "</div>" +
      // 좁아서 라벨을 못 단 구간만 막대 아래에 적음
      (parts.every(([, , v]) => v / total >= 0.2)
        ? ""
        : '<p class="seg-note">' +
          parts
            .filter(([, , v]) => v / total < 0.2)
            .map(
              ([k, n, v]) =>
                '<i class="sw ' + k + '"></i>' + n + " " + wanText(v),
            )
            .join(" · ") +
          "</p>")
    );
  }
  function circBlock() {
    if (!online) return "";
    const sum = rows.reduce((a, r) => {
      const c = r.circulation;
      if (c)
        for (const k of [
          "lots",
          "tons",
          "revenue",
          "avoided",
          "prep",
          "saleFee",
          "savingFee",
          "teamFee",
          "siteGain",
        ])
          a[k] = (a[k] || 0) + (c[k] || 0);
      return a;
    }, {});
    const open = rows.flatMap((r) =>
      (r.sales || [])
        .filter((s) => s.status === "offering")
        .map((s) => ({ ...s, ship: r.id })),
    );
    const fig = (label, value, note, cls) =>
      '<div><dt class="kpi-label">' +
      label +
      '</dt><dd class="kpi-value' +
      (cls ? " " + cls : "") +
      '">' +
      value +
      '</dd><dd class="kpi-cmp">' +
      note +
      "</dd></div>";
    const sold = sum.lots
      ? '<dl class="circ-figs">' +
        fig(
          "판매 완료",
          tons(sum.tons) + "<small>톤</small>",
          sum.lots + "묶음 · 처리 대신 원료로",
        ) +
        fig("매각액", wan(sum.revenue), "구매 업체가 냄") +
        fig(
          "집하장 몫",
          wan(sum.siteGain),
          "처리비 아낀 돈 포함",
          sum.siteGain < 0 ? "negative" : "",
        ) +
        fig(
          "그물마중 수수료",
          wan(sum.teamFee),
          "매각 " +
            wanText(sum.saleFee).replace(" 원", "") +
            " + 절감 " +
            wanText(sum.savingFee).replace(" 원", ""),
        ) +
        "</dl>" +
        moneySplit(sum)
      : '<div class="empty-block"><strong>아직 판매 완료된 묶음 없음</strong><p>반출 시트에서 종류별로 떼어 놓은 그물·로프를 판매 등록하고 업체 제안을 수락하면 여기에 쌓임</p></div>';
    const lot = (s) => {
      const best = Math.max(
        0,
        ...s.offers.filter((o) => o.status === "open").map((o) => o.price),
      );
      return (
        '<li><button class="circ-lot" data-open="' +
        esc(s.ship) +
        '" data-section="sales"><span class="circ-lot-main"><strong>' +
        esc(s.kind) +
        " · " +
        esc(s.material) +
        " " +
        tons(s.weight) +
        "톤</strong><small>" +
        esc(s.ship) +
        " · 제안 " +
        s.offers.length +
        "건" +
        (best ? " · 최고 " + wanText(best) + "/톤" : " · 제안 기다리는 중") +
        '</small></span><span class="circ-lot-cta">제안 보기' +
        svg("arrow-right", 16) +
        "</span></button></li>"
      );
    };
    return (
      '<section class="block circ-block span-12" aria-labelledby="circ-title"><div class="block-head"><div><h2 id="circ-title">자원 순환 판매</h2><p class="block-sub">떼어 놓은 그물·로프는 재활용 원료로 팔고 나머지만 처리 · 서버 기록 기준</p></div></div><div class="circ-grid"><div class="circ-sold">' +
      sold +
      '</div><div class="circ-open"><h3>매입 제안 받는 중 <span class="count">' +
      open.length +
      '</span></h3><ul class="circ-lots">' +
      (open.length
        ? open.map(lot).join("")
        : '<li class="circ-none">지금 제안을 받는 묶음 없음</li>') +
      "</ul></div></div></section>"
    );
  }
  function overview() {
    const active = rows.filter((r) => r.status !== "settled");
    const settled = rows.filter((r) => r.status === "settled");
    const byDate = [...rows].sort(byDeparture);
    const next = [...active]
      .sort(byDeparture)
      .find((r) => r.departure.slice(0, 10) >= model.DEMO_DATE);
    if (!rows.some((r) => r.id === selected))
      selected = (next || byDate.at(-1))?.id ?? null;
    const total = settled.reduce((s, r) => s + r.actual.total, 0);
    const accepted = settled.reduce((s, r) => s + r.actual.accepted, 0);
    const ratio = total ? (accepted / total) * 100 : 0;
    const count = (st) => rows.filter((r) => r.status === st).length;
    const today = rows.filter(
      (r) => r.departure.slice(0, 10) === model.DEMO_DATE,
    ).length;
    // 정산 건은 실계량(인수+잔재), 나머지는 예상 중량
    const amountOf = (r) => (r.status === "settled" ? r.actual.total : r.weight);
    const step = Math.ceil(Math.max(6, ...rows.map(amountOf)) / 3);
    const scale = step * 3;
    const gap = ratio - breakEven;
    const list = tasks();
    const urgent = list[0].list.length + list[1].list.length;
    const savings = settled.reduce((s, r) => s + result(r).savings, 0);
    return (
      '<div class="ops">' +
      // 행1: 누적 인수율(히어로) + 지금 처리할 일
      '<section class="block hero-kpi span-5" aria-labelledby="hero-label"><span class="kpi-label" id="hero-label">누적 인수율</span><span class="kpi-value hero-num">' +
      (total ? counter(ratio, 0) + "<small>%</small>" : "—") +
      '</span><p class="kpi-cmp">' +
      (total
        ? '<b class="' +
          (gap < 0 ? "down" : "up") +
          '">' +
          (gap < 0 ? "▼ −" : "▲ +") +
          Math.abs(gap).toFixed(0) +
          "%p</b> 손익분기 " +
          breakEven.toFixed(0) +
          "% 대비 " +
          (gap < 0 ? "미달" : "상회") +
          '<small>정산 ' +
          settled.length +
          "건 · 계량 " +
          tons(total) +
          "톤 중 " +
          tons(accepted) +
          "톤 인수</small>"
        : "아직 정산된 반출 없음 · 정산하면 인수율이 쌓임") +
      "</p>" +
      bullet(ratio, total > 0) +
      '<p class="kpi-foot">손익분기는 5톤 표준 반출(로프 분리 후 인수 조건) 기준. 이 아래면 고객 절감이나 팀 공헌이익이 적자</p></section>' +
      '<section class="block tasks span-7" aria-labelledby="task-title"><div class="block-head"><h2 id="task-title">지금 처리할 일 <span class="count">' +
      urgent +
      '</span></h2><span class="block-sub">출항 순 · 가장 급한 건부터</span></div><ul class="task-list">' +
      list.map(taskRow).join("") +
      "</ul></section>" +
      // 행2: 같은 형식의 보조 지표 3개. 단계 구성은 전체 반출 칸 안의 막대 하나로
      tile(
        "전체 반출",
        counter(rows.length) + "<small>건</small>",
        rows.length ? stageBar(rows.length) : "",
      ) +
      tile(
        "반출 예정 중량",
        counter(
          active.reduce((s, r) => s + r.weight, 0),
          1,
        ) + "<small>톤</small>",
        "대기 " + active.length + "건 · 금일 출항 " + today + "건",
      ) +
      tile(
        "누적 인수 중량",
        counter(accepted, 1) + "<small>톤</small>",
        "계량 " + tons(total) + "톤 중 · 잔재 " + tons(total - accepted) + "톤",
      ) +
      // 행2-1: 자원 순환 판매 (서버 모드만)
      circBlock() +
      // 행3: 반출별 중량 + 선택한 반출
      '<section class="block chart span-8" aria-labelledby="chart-title"><div class="block-head"><div><h2 id="chart-title">반출별 중량</h2><p class="block-sub">출항일 순 · 정산 건은 실계량 · 막대를 누르면 오른쪽 카드가 바뀜</p></div><ul class="chart-key" aria-label="범례">' +
      [
        [names.registered, TONE.registered],
        [names.confirmed, TONE.confirmed],
        ["정산 · 인수", TONE.settled],
        ["정산 · 잔재", TONE.residual],
      ]
        .map(([n, c]) => '<li><i style="--tone:' + c + '"></i>' + n + "</li>")
        .join("") +
      '</ul></div><div class="bars"><div class="grid" aria-hidden="true">' +
      [0, 1, 2, 3]
        .map(
          (k) =>
            '<span style="--y:' +
            ((k / 3) * 100).toFixed(1) +
            '%"><b>' +
            tons(k * step) +
            (k === 3 ? "톤" : "") +
            "</b></span>",
        )
        .join("") +
      "</div>" +
      byDate
        .map((r) => {
          const amt = amountOf(r),
            segs =
              r.status === "settled"
                ? [
                    [r.actual.accepted, TONE.settled],
                    [amt - r.actual.accepted, TONE.residual],
                  ]
                : [[amt, TONE[r.status]]],
            label =
              esc(r.id) +
              " · " +
              names[r.status] +
              " · " +
              (r.status === "settled"
                ? "계량 " +
                  tons(amt) +
                  "톤 (인수 " +
                  tons(r.actual.accepted) +
                  " · 잔재 " +
                  tons(amt - r.actual.accepted) +
                  ")"
                : "예상 " + tons(amt) + "톤");
          return (
            '<button class="bar" data-pick="' +
            esc(r.id) +
            '" style="--h:' +
            ((amt / scale) * 100).toFixed(1) +
            '%" aria-label="' +
            label +
            '" data-tip="' +
            label +
            '"><span class="stack">' +
            segs
              .filter(([v]) => v > 0)
              .map(([v, c]) => '<i style="flex:' + v + ";--tone:" + c + '"></i>')
              .join("") +
            "</span><em>" +
            tons(amt) +
            "톤</em><small>" +
            dateParts(r.departure).short +
            "</small></button>"
          );
        })
        .join("") +
      "</div></section>" +
      '<section class="block pick span-4" aria-label="선택한 반출"><div class="card" id="ops-card">' +
      card(rows.find((r) => r.id === selected)) +
      "</div></section>" +
      // 행4: 정산 내역 (건별 손익과 최근 정산을 한 표로)
      '<section class="block ledger-block span-12" aria-labelledby="ledger-title"><div class="block-head"><div><h2 id="ledger-title">정산 내역 <span class="count">' +
      settled.length +
      '</span></h2><p class="block-sub">정산 완료 반출 · 행을 누르면 정산서</p></div><p class="ledger-sum">누적 고객 절감 <b>' +
      man(savings) +
      "</b></p></div>" +
      (settled.length
        ? '<div class="table-scroll">' +
          table(
            "ledger",
            "ledger-title",
            LEDGER_COLS,
            [...settled].sort(byDeparture).reverse().slice(0, 5),
          ) +
          "</div>" +
          (settled.length > 5
            ? '<button class="text-btn more" data-action="ledger">전체 정산 보기 ' +
              svg("arrow-right", 15) +
              "</button>"
            : "")
        : '<div class="empty-block"><strong>아직 정산된 반출 없음</strong><p>하선·계량이 끝난 반출을 정산하면 여기에 건별 손익이 쌓임</p>' +
          (list[1].list[0]
            ? '<button class="btn btn-primary btn-sm" data-open="' +
              esc(list[1].list[0].id) +
              '">검수·정산 입력</button>'
            : "") +
          "</div>") +
      "</section></div>"
    );
  }
  // 첫 진입 때 서버를 기다리는 동안 블록 모양 그대로 보여 주는 자리 표시
  function skeleton() {
    const box = (cls, lines) =>
      '<div class="block ' +
      cls +
      ' skel" aria-hidden="true">' +
      lines.map((w) => '<i style="width:' + w + '%"></i>').join("") +
      "</div>";
    return (
      '<div class="ops" aria-busy="true"><p class="sr" role="status">서버에서 반출 기록 불러오는 중</p>' +
      box("span-5", [40, 55, 90, 100]) +
      box("span-7", [35, 100, 100, 100]) +
      [0, 1, 2].map(() => box("span-4", [50, 60, 80])).join("") +
      box("span-8 tall", [30, 100]) +
      box("span-4 tall", [100, 60, 40]) +
      "</div>"
    );
  }
  function pick(id) {
    selected = id;
    $("ops-card").innerHTML = card(rows.find((x) => x.id === id));
    document.querySelectorAll(".bar[data-pick]").forEach((el) => {
      el.classList.toggle("is-on", el.dataset.pick === id);
      el.setAttribute("aria-pressed", String(el.dataset.pick === id));
    });
  }
  // 숫자 올라가기: 첫 진입 1회만, 300ms. 다시 그릴 때는 돌리지 않음
  let counted = false;
  function countUp() {
    if (counted) return;
    counted = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll("[data-count]").forEach((el) => {
      const end = Number(el.dataset.count),
        digits = Number(el.dataset.digits),
        start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 300);
        el.textContent = (end * (1 - Math.pow(1 - t, 3))).toFixed(digits);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function row(r, isLedger) {
    const id = esc(r.id),
      when = dateParts(r.departure);
    const middle = isLedger
      ? ledgerCells(r)
      : '<td class="n">' +
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
    return (
      '<tr data-row="' +
      id +
      '"><td><button class="id-link" data-open="' +
      id +
      '">' +
      id +
      '</button></td><td><div class="kind"><strong>' +
      esc(r.kind) +
      "</strong><small>" +
      esc(r.material) +
      "</small></div></td>" +
      middle +
      '<td class="row-end"><span class="row-arrow" aria-hidden="true">' +
      svg("chevron", 15) +
      "</span></td></tr>"
    );
  }
  function table(cls, labelledby, cols, list, emptyHtml) {
    const isLedger = cls === "ledger";
    return (
      '<table class="' +
      cls +
      '" aria-labelledby="' +
      labelledby +
      '"><thead><tr>' +
      cols
        .map(
          ([s, c]) =>
            '<th scope="col"' +
            (c ? ' class="' + c + '"' : "") +
            ">" +
            (c === "row-end" ? '<span class="sr">' + s + "</span>" : s) +
            "</th>",
        )
        .join("") +
      "</tr></thead><tbody>" +
      (list.length
        ? list.map((r) => row(r, isLedger)).join("")
        : '<tr><td colspan="' +
          cols.length +
          '" class="empty">' +
          emptyHtml +
          "</td></tr>") +
      "</tbody></table>"
    );
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
      ? LEDGER_COLS
      : [
          ["반출번호"],
          ["품목 · 재질"],
          ["예상 반출량", "n"],
          ["출항 예정"],
          ["진행 상태"],
          ["상세", "row-end"],
        ];
    const empty =
      "<strong>" +
      (term || filter
        ? "조건에 맞는 반출 없음"
        : isLedger
          ? "아직 정산된 반출 없음"
          : "등록된 반출 없음") +
      "</strong><p>" +
      (term || filter
        ? "검색어나 상태를 바꿔 보세요"
        : isLedger
          ? "하선·계량이 끝난 반출을 정산하면 여기에 쌓임"
          : "새 반출 등록으로 첫 반출을 올려 보세요") +
      "</p>" +
      (term || filter
        ? '<button class="text-btn" data-action="clear">검색 조건 초기화</button>'
        : "");
    $("table-wrap").innerHTML = table(
      isLedger ? "ledger" : "shipment-table",
      "list-title",
      cols,
      visible,
      empty,
    );
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
    $("overview-content").innerHTML = home
      ? loading
        ? skeleton()
        : overview()
      : "";
    if (home && !loading) {
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
    if (loading)
      $("table-wrap").innerHTML =
        '<div class="skel-rows" aria-hidden="true"><i></i><i></i><i></i></div>';
    else renderList();
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
      window.NetForms.open(el.dataset.open || el.dataset.row, el.dataset.section);
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
        if (online) {
          window.GmServer.reset()
            .then((list) => {
              rows = byId(list);
              $("guide").close();
              render();
              toast("시연 데이터 초기 상태 복원 완료");
            })
            .catch((e) => toast("서버 초기화 실패, " + e.message));
          break;
        }
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
      case "ledger":
        location.hash = "settlements";
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
  window.GmServer?.start().then((list) => {
    loading = false;
    if (!list) return render();
    online = true;
    rows = byId(list);
    $("storage-warning").hidden = true;
    render();
    toast("서버 저장 모드로 연결됨");
  });
})();
