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
  window.NetUI = { icon: svg, esc, money, tons };
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
        "이 브라우저의 저장 기록을 모두 읽을 수 없어 보기 모드로 열었습니다. 로컬 서버에서 열거나 저장소 사용 설정을 확인해 주세요.";
      $("storage-warning").hidden = false;
    }
    rows = Array.from(map.values()).sort((a, b) =>
      b.id.localeCompare(a.id, "en", { numeric: true }),
    );
  }
  function save(record, isNew = false) {
    loadRecords();
    if (invalidStorage)
      throw Error("브라우저 저장소를 확인한 후 다시 저장해 주세요.");
    model.verify(record);
    const old = rows.find((r) => r.id === record.id);
    if (
      isNew
        ? old || record.status !== "registered"
        : !old || (old._rev ?? 0) !== (record._rev ?? 0)
    )
      throw Error(
        "같은 반출번호가 변경됐습니다. 창을 다시 열고 확인해 주세요.",
      );
    if (
      !isNew &&
      !(
        (old.status === "registered" &&
          ["registered", "confirmed"].includes(record.status)) ||
        (old.status === "confirmed" && record.status === "settled")
      )
    )
      throw Error(
        "반출 단계가 변경되었습니다. 최신 반출 상태를 확인해 주세요.",
      );
    const updated = { ...record, _rev: (old?._rev ?? 0) + 1 };
    try {
      localStorage.setItem(storagePrefix + updated.id, JSON.stringify(updated));
    } catch {
      throw Error(
        "저장 공간이 부족하거나 저장이 제한되었습니다. 사진 크기와 브라우저 설정을 확인해 주세요.",
      );
    }
    loadRecords();
    render();
    return structuredClone(updated);
  }
  function toast(msg) {
    clearTimeout(toastTimer);
    $("toast").textContent = msg;
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
  function metric(label, num, unit, icon, tone) {
    return (
      '<div class="metric"><div class="metric-label">' +
      label +
      '<i class="metric-icon ' +
      tone +
      '">' +
      svg(icon, 18) +
      '</i></div><div class="metric-amount"><b>' +
      num +
      "</b><span>" +
      unit +
      "</span></div></div>"
    );
  }
  function task(status, icon, label, sub, tone) {
    const count = rows.filter((r) => r.status === status).length;
    return (
      '<button class="task" data-filter="' +
      status +
      '"><i class="task-icon ' +
      tone +
      '">' +
      svg(icon, 19) +
      '</i><span class="task-name"><strong>' +
      label +
      "</strong><small>" +
      sub +
      "</small></span><b>" +
      count +
      "</b>" +
      svg("chevron", 14) +
      "</button>"
    );
  }
  function overview() {
    const active = rows.filter((r) => r.status !== "settled");
    const sorted = [...active].sort((a, b) =>
      a.departure.localeCompare(b.departure),
    );
    const next = sorted.find(
      (r) => r.departure.slice(0, 10) >= model.DEMO_DATE,
    );
    const settled = rows.filter((r) => r.status === "settled");
    const total = settled.reduce((acc, r) => acc + r.actual.total, 0);
    const accepted = settled.reduce((acc, r) => acc + r.actual.accepted, 0);
    const when = next ? dateParts(next.departure) : null;
    const feature = next
      ? '<div class="hero"><div class="hero-body"><div class="hero-tag">' +
        svg("ship", 15) +
        '다음 반출 일정</div><h2>삽시도 <span>→</span> 대천항</h2><p class="hero-meta">' +
        svg("calendar", 16) +
        "<span>" +
        when.short +
        " (" +
        when.day +
        ") " +
        when.time +
        "</span><i></i>" +
        svg("scale", 16) +
        "<span>" +
        tons(next.weight) +
        '톤</span></p><button class="hero-btn" data-open="' +
        esc(next.id) +
        '">반출 상세 보기 ' +
        svg("arrow-right", 15) +
        '</button></div><span class="photo-caption">' +
        svg("pin", 12) +
        "보령 대천항</span></div>"
      : '<div class="hero"><div class="hero-body"><div class="hero-tag">' +
        svg("ship", 15) +
        '다음 반출 일정</div><h2>예정된 반출이 없습니다</h2><button class="hero-btn" data-action="create">새 반출 등록 ' +
        svg("plus", 15) +
        "</button></div></div>";
    return (
      '<div class="spotlight">' +
      feature +
      '<section class="panel queue"><div class="queue-title"><h2>처리할 업무</h2><span class="queue-count">' +
      active.length +
      "건</span></div>" +
      task(
        "registered",
        "clipboard",
        "인수 조건 협의",
        "업체 인수 기준과 비용 비교",
        "sand",
      ) +
      task(
        "confirmed",
        "scale",
        "검수·정산 입력",
        "실제 인수량과 증빙 확인",
        "mint",
      ) +
      "</section></div>" +
      '<section class="metrics" aria-label="반출 요약">' +
      metric("전체 반출 건수", rows.length, "건", "layers", "blue") +
      metric(
        "반출 예정 중량",
        tons(active.reduce((sum, r) => sum + r.weight, 0)),
        "톤",
        "package",
        "sand",
      ) +
      metric("누적 인수 중량", tons(accepted), "톤", "cycle", "mint") +
      metric(
        "누적 인수율",
        total ? ((accepted / total) * 100).toFixed(1) : "—",
        "%",
        "trend",
        "violet",
      ) +
      "</section>"
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
          ? "조건에 맞는 반출이 없습니다."
          : isLedger
            ? "아직 정산한 반출이 없습니다."
            : "아직 등록한 반출이 없습니다.") +
        "</strong>" +
        (term || filter
          ? '<button class="text-btn" data-action="clear">검색 조건 지우기</button>'
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
      "[data-action],[data-open],[data-filter],[data-row]",
    );
    if (!el) return;
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
