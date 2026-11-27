(function () {
  "use strict";

  const model = () => window.NetModel;
  const app = () => window.NetApp;
  const sheet = () => document.getElementById("sheet");
  const esc = (value) => window.NetUI.esc(String(value ?? ""));
  const amount = (value) =>
    new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value) +
    "원";
  const weight = (value) =>
    new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 }).format(value) +
    "톤";
  const demoFacility = "보령 지정 재활용업체 (가상)";
  const statusNames = {
    registered: "인수 협의",
    confirmed: "인수 확정",
    settled: "정산 완료",
  };

  function field(label, name, value, config = {}) {
    const type = config.type || "text";
    const attrs = [
      config.required === false ? "" : "required",
      config.maxLength ? `maxlength="${config.maxLength}"` : "",
      config.min != null ? `min="${esc(config.min)}"` : "",
      config.max != null ? `max="${esc(config.max)}"` : "",
      config.step ? `step="${esc(config.step)}"` : "",
    ].join(" ");
    let control = `<input type="${type}" name="${name}" value="${esc(value)}" ${attrs}>`;
    if (config.options) {
      control = `<select name="${name}" ${attrs}>${config.options
        .map(
          (option) =>
            `<option value="${esc(option)}"${value === option ? " selected" : ""}>${esc(option)}</option>`,
        )
        .join("")}</select>`;
    }
    if (type === "textarea") {
      control = `<textarea name="${name}" rows="2" ${attrs}>${esc(value)}</textarea>`;
    }
    return `<label class="field${config.wide ? " field-wide" : ""}"><span>${esc(label)}</span>${control}</label>`;
  }

  function numericField(label, name, value, config = {}) {
    return field(label, name, value, {
      type: "number",
      min: 0,
      step: 1,
      ...config,
    });
  }

  function section(title, content) {
    return `<section class="sheet-section"><h3>${esc(title)}</h3>${content}</section>`;
  }

  function description(rows) {
    return `<dl class="sheet-summary">${rows
      .map(
        ([label, value]) =>
          `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`,
      )
      .join("")}</dl>`;
  }

  function errorMessage(form, error) {
    const box = form.querySelector(".sheet-error");
    box.textContent = error?.message || "입력 내용 확인 필요";
    box.hidden = false;
    box.scrollIntoView({ block: "nearest" });
  }

  function clearError(form) {
    const box = form.querySelector(".sheet-error");
    box.textContent = "";
    box.hidden = true;
  }

  function show({ kicker, title, body, action, onSave, extraAction }) {
    const dialog = sheet();
    const focusTarget = document.activeElement;
    const opening = !dialog.open;
    const page = [];
    page.push(
      `<div class="sheet-head"><div><p class="sheet-kicker">${esc(kicker)}</p><h2 id="net-form-title" class="sheet-title" tabindex="-1">${esc(title)}</h2></div>`,
    );
    page.push(
      '<button type="button" class="sheet-close" data-dismiss aria-label="닫기">×</button></div>',
    );
    page.push(
      `<form><div class="sheet-body">${body}<p class="sheet-error" role="alert" hidden></p></div>`,
    );
    page.push(
      '<div class="sheet-foot"><button type="button" class="btn btn-secondary" data-dismiss>닫기</button>',
    );
    if (extraAction)
      page.push(
        `<button type="button" class="btn btn-secondary" data-secondary>${esc(extraAction.label)}</button>`,
      );
    if (action)
      page.push(
        `<button type="submit" class="btn btn-primary">${esc(action)}</button>`,
      );
    page.push("</div></form>");
    dialog.innerHTML = page.join("");
    dialog.setAttribute("aria-labelledby", "net-form-title");
    if (opening) {
      dialog.showModal();
      dialog.addEventListener(
        "close",
        () => {
          if (
            focusTarget?.isConnected &&
            typeof focusTarget.focus === "function"
          )
            focusTarget.focus();
        },
        { once: true },
      );
    }
    dialog.scrollTop = 0;
    dialog.querySelector(".sheet-title").focus({ preventScroll: true });
    const form = dialog.querySelector("form");
    for (const button of dialog.querySelectorAll("[data-dismiss]")) {
      button.addEventListener("click", () => dialog.close());
    }
    if (extraAction) {
      form.querySelector("[data-secondary]").addEventListener("click", () => {
        if (!form.reportValidity()) return;
        try {
          extraAction.onClick(form);
        } catch (error) {
          errorMessage(form, error);
        }
      });
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!onSave) return;
      clearError(form);
      try {
        onSave(form);
      } catch (error) {
        errorMessage(form, error);
      }
    });
    return form;
  }

  function persist(record, snapshot = null) {
    if (snapshot) {
      const current = app()
        .records()
        .find((item) => item.id === record.id);
      if (!current || JSON.stringify(current) !== snapshot) {
        throw new Error(
          "해당 반출 건 변경 감지 · 창 재실행 후 최신 내용 확인 필요",
        );
      }
    }
    model().verify(record);
    app().save(record, snapshot === null);
  }

  function saved(record, message) {
    open(record.id);
    app().toast(message);
  }

  function optionalPhoto(src) {
    if (!/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(src || ""))
      return "";
    return `<img class="photo-preview" src="${esc(src)}" alt="반출 폐어망 현장 사진">`;
  }

  async function reducePhoto(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("JPG·PNG·WebP 형식 사진만 선택 가능");
    }
    if (file.size > 12 * 1024 * 1024)
      throw new Error("12MB 이하 사진만 선택 가능");
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const ratio = Math.min(
        1,
        840 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.72);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function create() {
    let photo = "";
    let photoRevision = 0;
    const basics = [
      field("어구 종류", "kind", "폐어망", {
        options: ["폐어망", "폐자망", "폐통발 그물", "혼합 그물"],
      }),
      field("재질", "material", "미확인", {
        options: ["미확인", "나일론", "폴리에틸렌", "폴리프로필렌", "혼합"],
      }),
      numericField("예상 반출량 (톤)", "weight", "", {
        min: 0.001,
        step: "0.001",
      }),
      numericField("마대 수 (개)", "bags", "", { min: 1 }),
      field("출항 예정 일시", "departure", model().DEMO_DATE + "T13:00", {
        type: "datetime-local",
      }),
      field("지정 처리업체", "facility", demoFacility, { maxLength: 70 }),
      field("혼입물·현장 메모 (선택)", "note", "", {
        type: "textarea",
        required: false,
        wide: true,
        maxLength: 400,
      }),
      checklist(),
      '<label class="field field-wide"><span>현장 사진 (선택)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>',
      '<div class="field-wide" data-preview></div>',
    ].join("");
    const finance = [
      numericField("기존 방식 처리비 (원/톤)", "baseRate", 300000),
      numericField("인수 톤당 운영료 (원)", "feeRate", 40000),
      numericField("건별 팀 직접비 (원)", "directCost", 110000),
      '<p class="sheet-note field-wide">참고 단가 · 군산시수협 2026 인양쓰레기 기초단가 224,500원/톤(선별·계량·운반·재활용 포함) · 태안군 2026 하반기 폐어망 수거·처리 계약 84,268,800원</p>',
    ].join("");
    const form = show({
      kicker: "삽시도 집하장",
      title: "반출 등록",
      body: `<div class="sheet-grid">${basics}</div><p class="sheet-note">등록 후 동일 지정 업체의 처리 조건 2안 비교</p><details class="sheet-section"><summary>시연 비용 가정 조정</summary><div class="sheet-grid finance-grid">${finance}</div></details>`,
      action: "반출 등록",
      onSave(current) {
        const data = new FormData(current);
        const departure = data.get("departure");
        const estimated = Number(data.get("weight"));
        const record = {
          id: model().allocateId(app().records()),
          kind: data.get("kind"),
          material: data.get("material"),
          bags: Number(data.get("bags")),
          weight: estimated,
          departure,
          note: data.get("note").trim(),
          checks: data.getAll("checks"),
          photo,
          facility: data.get("facility").trim(),
          status: "registered",
          quotes: model().defaults(estimated, departure.slice(0, 10)),
          choice: null,
          actual: null,
          baseRate: Number(data.get("baseRate")),
          feeRate: Number(data.get("feeRate")),
          directCost: Number(data.get("directCost")),
        };
        persist(record);
        saved(record, "반출 건 등록 완료");
      },
    });
    form.elements.photo.addEventListener("change", async (event) => {
      const file = event.currentTarget.files[0];
      const revision = ++photoRevision;
      const submit = form.querySelector("[type=submit]");
      form.querySelector("[data-preview]").replaceChildren();
      clearError(form);
      photo = "";
      submit.disabled = Boolean(file);
      if (!file) return;
      try {
        const result = await reducePhoto(file);
        if (revision !== photoRevision || !form.isConnected) return;
        photo = result;
        form.querySelector("[data-preview]").innerHTML = optionalPhoto(result);
      } catch (error) {
        if (revision !== photoRevision || !form.isConnected) return;
        form.elements.photo.value = "";
        errorMessage(
          form,
          error?.name === "EncodingError"
            ? new Error("사진 판독 불가 · 다른 파일 선택 필요")
            : error,
        );
      } finally {
        if (revision === photoRevision) submit.disabled = false;
      }
    });
  }

  // 처리 이력 (어망내망 수거·계량 이력 · 클리어비드 진행 현황 참고)
  function timeline(record) {
    const sailed = record.departure.slice(0, 10) <= model().DEMO_DATE;
    const steps = [
      ["반출 등록", true],
      ["인수 조건 확정", record.status !== "registered"],
      ["출항·하선", record.status !== "registered" && sailed],
      ["검수·정산", record.status === "settled"],
    ];
    // 끝난 단계는 done, 다음에 할 단계 하나는 now(현재 단계)
    const now = steps.findIndex(([, done]) => !done);
    return `<ol class="track">${steps
      .map(([label, done], i) =>
        done
          ? `<li class="done">${label}</li>`
          : i === now
            ? `<li class="now" aria-current="step">${label}</li>`
            : `<li>${label}</li>`,
      )
      .join("")}</ol>`;
  }

  function checklist(checks = []) {
    return `<fieldset class="checks field-wide"><legend>인수 기준 사전 점검 · 미충족 항목은 업체 거절·추가비 사유</legend>${model()
      .CHECKS.map(
        (c) =>
          `<label><input type="checkbox" name="checks" value="${esc(c)}"${checks.includes(c) ? " checked" : ""}> ${esc(c)}</label>`,
      )
      .join("")}</fieldset>`;
  }

  function shipmentSummary(record) {
    return (
      description([
        ["반출 예정", window.NetUI.when(record.departure)],
        ["예상 반출량", `${weight(record.weight)} · ${record.bags}마대`],
        ["어구 · 재질", `${record.kind} · ${record.material}`],
        ["지정 처리업체", record.facility],
        [
          "사전 점검",
          record.checks?.length
            ? `${record.checks.length}/${model().CHECKS.length} · ${record.checks.join(", ")}`
            : "미기록",
        ],
      ]) +
      (record.note
        ? `<p class="sheet-note">현장 메모 · ${esc(record.note)}</p>`
        : "") +
      optionalPhoto(record.photo)
    );
  }

  function quoteCard(quote, index) {
    const iname = (key) => `q${index}_${key}`;
    // 카드 빈 곳 어디를 눌러도 이 조건이 선택됨(quoteStep의 click 처리)
    return `<fieldset class="quote-card"><legend class="sr">${esc(quote.label)}</legend>
      <label class="quote-choice"><input type="radio" name="choice" value="${index}"><span class="quote-name">${esc(quote.label)}</span><span class="quote-state" aria-hidden="true"></span></label>
      ${quote.repliedBy ? `<p class="quote-reply">${chip(`업체 회신 · ${quote.repliedBy}`, "pos")}</p>` : ""}
      <p class="quote-total" id="q-total-${index}" aria-live="polite"></p>
      ${field("인수 조건", iname("condition"), quote.condition, { maxLength: 240 })}
      ${numericField("예상 인수량 (톤)", iname("expected"), quote.expected, { step: "0.001" })}
      ${numericField("인수분 처리비 (원/톤)", iname("rate"), quote.rate)}
      ${numericField("잔재물 처리비 (원/톤)", iname("residualRate"), quote.residualRate)}
      ${numericField("추가 선별·운반비 (원/건)", iname("extra"), quote.extra)}
      ${field("견적 유효일", iname("validUntil"), quote.validUntil, { type: "date" })}
      ${online() ? `<div class="trade-actions"><button type="button" class="btn btn-secondary btn-sm" data-trade="reply" data-q="${index}">업체 회신으로 저장</button></div><p class="trade-error" role="alert" hidden></p>` : ""}</fieldset>`;
  }

  function readQuote(form, original, index) {
    const get = (key) => form.elements.namedItem(`q${index}_${key}`).value;
    const num = (key) => (get(key) === "" ? NaN : Number(get(key)));
    return {
      ...original,
      condition: get("condition").trim(),
      expected: num("expected"),
      rate: num("rate"),
      residualRate: num("residualRate"),
      extra: num("extra"),
      validUntil: get("validUntil"),
    };
  }

  function quoteStep(record, snapshot) {
    const heavy = record.weight > 1;
    const body =
      timeline(record) +
      section("반출 정보", shipmentSummary(record)) +
      (heavy
        ? `<p class="sheet-note notice">1톤 초과 반입 · 업체 신청 기한 ${esc(window.NetUI.when(model().noticeBy(record.departure)))}(출항 24시간 전)</p>`
        : "") +
      section(
        "지정 업체 인수 조건",
        `<p class="sheet-note">동일 업체의 선별 조건 2안 · 예상 총비용에 인수 톤당 운영료 ${amount(record.feeRate)} 포함 · 초깃값은 시연용 가정값</p>
      <div class="quote-comparison" data-comparison aria-live="polite"></div><div class="quote-grid">${record.quotes.map(quoteCard).join("")}</div>`,
      ) +
      trade(record);
    function saveQuotes(form, confirm) {
      const quotes = record.quotes.map((quote, index) =>
        readQuote(form, quote, index),
      );
      let choice = null;
      if (confirm) {
        const selected = form.querySelector("input[name=choice]:checked");
        if (!selected) throw new Error("확정할 인수 조건 1건 선택 필요");
        choice = Number(selected.value);
        if (quotes[choice].validUntil < record.departure.slice(0, 10)) {
          throw new Error(
            "선택 견적의 출항일 전 만료 · 견적 유효일 재확인 필요",
          );
        }
      }
      const next = {
        ...record,
        quotes,
        choice,
        status: confirm ? "confirmed" : "registered",
      };
      persist(next, snapshot);
      saved(
        next,
        confirm ? "출항 전 인수 조건 확정 완료" : "인수 조건 초안 저장 완료",
      );
    }
    const form = show({
      kicker: `${record.id} · ${statusNames[record.status]}`,
      title: "인수 조건 비교",
      body,
      action: "인수 조건 확정",
      onSave: (current) => saveQuotes(current, true),
      extraAction: {
        label: "견적 임시 저장",
        onClick: (current) => saveQuotes(current, false),
      },
    });
    const update = () => {
      const options = [];
      record.quotes.forEach((quote, index) => {
        const next = readQuote(form, quote, index);
        const output = form.querySelector(`#q-total-${index}`);
        try {
          const totals = model().calculate(
            record,
            next,
            record.weight,
            next.expected,
          );
          output.innerHTML = `<span>예상 총비용</span><b>${amount(totals.cost)}</b><small>고객 순절감 ${amount(totals.savings)}</small>`;
          if (next.validUntil >= record.departure.slice(0, 10))
            options.push({ label: quote.label, cost: totals.cost });
        } catch {
          output.textContent = "비용 산출을 위한 물량·단가 확인 필요";
        }
      });
      const comparison = form.querySelector("[data-comparison]");
      if (options.length !== 2) {
        comparison.textContent =
          "두 견적의 수량·단가 및 출항일까지의 유효일 확인 필요";
      } else {
        options.sort((a, b) => a.cost - b.cost);
        const difference = options[1].cost - options[0].cost;
        comparison.textContent = difference
          ? `‘${options[0].label}’ 조건의 예상 총비용 ${amount(difference)} 절감`
          : "두 조건의 예상 총비용 동일";
      }
    };
    wireTrade(form, record);
    form.addEventListener("input", update);
    form.addEventListener("click", (event) => {
      const choice = event.target.closest(".quote-card");
      if (!choice || event.target.closest("input, select, textarea, label, button"))
        return;
      choice.querySelector("input[type=radio]").checked = true;
    });
    update();
  }

  function resultRows(totals) {
    const metrics = [
      ["재활용업체 인수율", `${Number(totals.ratio.toFixed(1))}%`],
      ["잔재량", weight(totals.residual)],
      ["기존 방식 비용", amount(totals.baseline)],
      ["새 방식 총비용", amount(totals.cost)],
      ["고객 순절감액", amount(totals.savings), totals.savings],
      ["운영료 매출", amount(totals.fee)],
      ["팀 공헌이익", amount(totals.margin), totals.margin],
    ];
    return `<dl class="result-grid">${metrics
      .map(
        ([label, value, signed]) =>
          `<div class="result-item"><dt>${esc(label)}</dt><dd${signed == null ? "" : ` class="${signed < 0 ? "negative" : "positive"}"`}>${esc(value)}</dd></div>`,
      )
      .join("")}</dl>`;
  }

  function confirmedConditions(record, quote) {
    return description([
      ["선택한 조건", quote.label],
      ["인수 기준", quote.condition],
      ["인수분 처리비", amount(quote.rate) + "/톤"],
      ["잔재물 처리비", amount(quote.residualRate) + "/톤"],
      ["기존 방식 단가", amount(record.baseRate) + "/톤"],
      ["운영료", amount(record.feeRate) + "/인수 톤"],
      ["팀 직접비", amount(record.directCost) + "/건"],
      ["견적 유효일", quote.validUntil],
    ]);
  }

  function settlementStep(record, snapshot) {
    const quote = record.quotes[record.choice];
    const settled = record.status === "settled";
    const header = `${timeline(record)}<details class="sheet-section"><summary>반출 정보와 확정 조건</summary>${shipmentSummary(record)}${confirmedConditions(record, quote)}</details>`;
    if (settled) {
      const actual = record.actual;
      const totals = model().calculate(
        record,
        quote,
        actual.total,
        actual.accepted,
        actual.extra ?? quote.extra,
      );
      const summary = section(
        "계량·인수 결과",
        description([
          ["실제 반출량", weight(actual.total)],
          ["최종 인수량", weight(actual.accepted)],
          ["선별·운반 등 추가비", amount(actual.extra ?? quote.extra)],
          ["계량·인수 증빙", actual.reference],
          ["업체 확인자", actual.signer || "미기록"],
          ["잔재 사유", actual.reason || "전량 인수"],
        ]),
      );
      const form = show({
        kicker: `${record.id} · ${statusNames[record.status]}`,
        title: "반출 정산서",
        body:
          header +
          summary +
          section("정산 내역", resultRows(totals)) +
          trade(record),
      });
      wireTrade(form, record);
      return;
    }
    if (record.departure.slice(0, 10) > model().DEMO_DATE) {
      const form = show({
        kicker: `${record.id} · ${statusNames[record.status]}`,
        title: "출항 대기",
        body:
          header +
          section(
            "검수 입력 전",
            `<p class="sheet-note">${esc(window.NetUI.when(record.departure))} 출항 후 대천항 하선·계량 완료 시 실제 인수량 입력 가능</p>`,
          ) +
          trade(record),
      });
      wireTrade(form, record);
      return;
    }
    const fields = [
      numericField("실제 반출량 (톤)", "total", record.weight, {
        step: "0.001",
        min: 0.001,
      }),
      numericField("최종 인수량 (톤)", "accepted", quote.expected, {
        step: "0.001",
      }),
      numericField("실제 추가 선별·운반비 (원/건)", "extra", quote.extra),
      field("계량·인수 증빙번호", "reference", "", { maxLength: 100 }),
      field("업체 확인자", "signer", "", { maxLength: 40 }),
      field("잔재 발생 사유", "reason", "", {
        type: "textarea",
        required: false,
        maxLength: 350,
        wide: true,
      }),
      '<label class="agree field-wide"><input type="checkbox" name="agree" required> 계량표·인수 내역 집하장·업체 상호 대조 완료</label>',
    ].join("");
    const body =
      header +
      section(
        "검수 입력",
        `<p class="sheet-note">${esc(record.facility)} · ${esc(quote.label)} · 입력 중량은 견적 예상치이므로 실측값 확인 필요</p><div class="sheet-grid">${fields}</div>`,
      ) +
      section("예상 정산 내역", '<div data-results aria-live="polite"></div>') +
      trade(record);
    const form = show({
      kicker: `${record.id} · ${statusNames[record.status]}`,
      title: "검수 및 정산",
      body,
      action: "정산 확정",
      onSave(current) {
        const number = (key) => current.elements[key].valueAsNumber;
        const actual = {
          total: number("total"),
          accepted: number("accepted"),
          extra: number("extra"),
          reference: current.elements.reference.value.trim(),
          reason: current.elements.reason.value.trim(),
          signer: current.elements.signer.value.trim(),
        };
        if (actual.accepted < actual.total && !actual.reason)
          throw new Error("미인수 물량의 사유 기재 필요");
        const next = { ...record, status: "settled", actual };
        persist(next, snapshot);
        saved(next, "실제 인수량 기준 정산 확정 완료");
      },
    });
    const update = () => {
      const total = form.elements.total.valueAsNumber;
      const accepted = form.elements.accepted.valueAsNumber;
      const extra = form.elements.extra.valueAsNumber;
      form.elements.reason.required =
        Number.isFinite(accepted) && accepted < total;
      if (Number.isFinite(total)) form.elements.accepted.max = String(total);
      else form.elements.accepted.removeAttribute("max");
      const target = form.querySelector("[data-results]");
      try {
        target.innerHTML = resultRows(
          model().calculate(record, quote, total, accepted, extra),
        );
      } catch {
        target.textContent = "계량 총 반출량 및 그 범위 내 인수량 입력 필요";
      }
    };
    wireTrade(form, record);
    form.addEventListener("input", update);
    update();
  }

  // ── 자원 순환 판매 · AI 서류 안내 · 업체 회신 (서버 모드만, GmServer.trade) ──
  const online = () => Boolean(app().online?.());
  const GEAR = ["폐자망", "폐어망", "폐로프", "폐통발 그물", "폐부표", "혼합 그물"];
  const MATS = ["나일론", "폴리에틸렌", "폴리프로필렌", "혼합", "미확인"];
  const ORIGINS = ["쓰다가 배출", "조업 중 인양", "침적 수거", "해안 수거", "모름"];
  const ATTACH = ["뜸줄", "발줄", "납 봉돌", "부표", "철 틀", "금속 고리"];
  // 칩 색: 완료(파랑) · 손볼 일(주황) · 안 됨(빨강) · 나머지 중립. 글자를 항상 같이 씀
  const TONE = {
    "판매 후보": "pos",
    조건부: "warn",
    "처리 대상": "neg",
    "초안 완성": "pos",
    "일부 채움": "warn",
    "입력 필요": "warn",
  };
  const chip = (text, tone = TONE[text]) =>
    `<span class="chip${tone ? " " + tone : ""}">${esc(text)}</span>`;
  const docsCache = new Map(); // 반출번호:버전 → 서류 안내 응답

  function moneyLine(m) {
    return `<p class="money-line">매각 ${amount(m.revenue)} + 피한 처리비 ${amount(m.avoided)} − 준비비 ${amount(m.prep)} − 수수료 ${amount(m.teamFee)} = <b>집하장 몫 ${amount(m.siteGain)}</b></p>`;
  }

  function offerRow(lot, o) {
    const action =
      lot.status === "offering" && o.status === "open"
        ? `<button type="button" class="btn btn-secondary btn-sm" data-trade="accept" data-lot="${esc(lot.id)}" data-offer="${esc(o.id)}">이 제안 수락</button>`
        : o.status === "accepted"
          ? chip("수락함", "pos")
          : chip(o.status === "declined" ? "마감" : "열림");
    return `<li class="offer"><div><p><b>${esc(o.buyer)}</b> · ${amount(o.price)}/톤 · ${esc(o.validUntil)}까지</p>${o.condition ? `<small>${esc(o.condition)}</small>` : ""}${o.money ? moneyLine(o.money) : ""}</div>${action}</li>`;
  }

  function lotCard(lot) {
    const offers = lot.offers.map((o) => offerRow(lot, o)).join("");
    const form =
      lot.status === "offering"
        ? `<div class="offer-form">${field("구매 업체 · 비우면 처리업체 계정 제안", "o_buyer", "", { required: false, maxLength: 40 })}${numericField("매입가 (원/톤)", "o_price", "", { required: false, step: 1000 })}${field("제안 유효일", "o_until", model().DEMO_DATE.slice(0, 8) + "30", { type: "date", required: false })}<button type="button" class="btn btn-secondary btn-sm" data-trade="offer" data-lot="${esc(lot.id)}">매입 제안 입력</button></div>`
        : "";
    return `<li class="lot-card" data-lot-card><div class="lot-head"><b>${esc(lot.kind)} · ${esc(lot.material)} ${weight(lot.weight)}</b>${chip(lot.grade)}${lot.status === "sold" ? chip("판매 완료", "pos") : chip("판매 중", "go")}</div>
      <p class="lot-meta">${esc(lot.origin)}${lot.attachments?.length ? ` · 남은 부착물 ${lot.attachments.map(esc).join(", ")}` : ""}${lot.note ? ` · ${esc(lot.note)}` : ""}</p>
      ${lot.fixes?.length ? `<ul class="todo">${lot.fixes.map((f) => `<li>${chip("할 일", "warn")}<span>${esc(f)}</span></li>`).join("")}</ul>` : ""}
      <ul class="offers">${offers || `<li class="offer none">아직 매입 제안 없음</li>`}</ul>${form}<p class="trade-error" role="alert" hidden></p></li>`;
  }

  function salesSection(record) {
    if (!online()) return "";
    const c = record.circulation;
    const lots = record.sales || [];
    const sum = c?.lots
      ? description([
          ["판매 완료", `${c.lots}묶음 · ${weight(c.tons)}`],
          ["매각액", amount(c.revenue)],
          ["집하장 몫", amount(c.siteGain)],
          ["그물마중 수수료", amount(c.teamFee)],
        ])
      : "";
    const select = (label, name, list, value) =>
      field(label, name, value, { options: list, required: false });
    const add = `<details class="lot-new" data-lot-new${lots.length ? "" : " open"}><summary>떼어 놓은 묶음 판매 등록</summary>
      <div class="sheet-grid">${select("어구 종류", "s_kind", GEAR, "폐자망")}${select("재질", "s_material", MATS, "나일론")}${numericField("중량 (톤)", "s_weight", "", { required: false, step: "0.001" })}${select("나온 곳", "s_origin", ORIGINS, "쓰다가 배출")}
      <fieldset class="checks field-wide"><legend>묶음 상태</legend><label><input type="checkbox" name="s_separated" checked> 다른 어구와 따로 떼어 놓음</label><label><input type="checkbox" name="s_intact" checked> 자르지 않은 온전한 상태</label></fieldset>
      <fieldset class="checks field-wide"><legend>아직 붙어 있는 것</legend>${ATTACH.map((a) => `<label><input type="checkbox" name="s_att" value="${esc(a)}"> ${esc(a)}</label>`).join("")}</fieldset></div>
      <div class="trade-actions"><button type="button" class="btn btn-secondary btn-sm" data-trade="check">AI 판매 판정</button><button type="button" class="btn btn-secondary btn-sm" data-trade="add">판매 등록</button></div>
      <div data-sale-out aria-live="polite"></div><p class="trade-error" role="alert" hidden></p></details>`;
    return `<section class="sheet-section trade" id="trade-sales"><h3>자원 순환 판매</h3><p class="sheet-note">종류별로 떼어 놓은 그물·로프는 재활용 원료로 팔고 나머지만 처리. 매입가는 업체 제안으로만 받고, 준비비(섬 작업·추가 운송)와 수수료율은 팀 가정</p>${sum}${lots.length ? `<ul class="lot-list">${lots.map(lotCard).join("")}</ul>` : ""}${add}</section>`;
  }

  function readLot(box) {
    const v = (name) => box.querySelector(`[name=${name}]`);
    return {
      kind: v("s_kind").value,
      material: v("s_material").value,
      weight: Number(v("s_weight").value),
      origin: v("s_origin").value,
      separated: v("s_separated").checked,
      intact: v("s_intact").checked,
      attachments: [...box.querySelectorAll("[name=s_att]:checked")].map(
        (c) => c.value,
      ),
    };
  }

  function gradeView(g) {
    const items = [
      ...g.blockers.map((b) => `<li>${chip("안 됨", "neg")}<span>${esc(b)}</span></li>`),
      ...g.fixes.map((f) => `<li>${chip("할 일", "warn")}<span>${esc(f)}</span></li>`),
    ].join("");
    return `<div class="grade-out"><p class="grade-head">AI 판정 ${chip(g.grade)}</p>${items ? `<ul class="todo">${items}</ul>` : ""}${g.buyers.length ? `<p class="lot-meta">받는다고 공개한 업체 · ${g.buyers.map((b) => `${esc(b.name)}(${esc(b.region)}${b.km != null ? `, ${b.km}km` : ""})`).join(", ")}</p>` : ""}</div>`;
  }

  function docRow(d) {
    const draft =
      d.needed && Object.values(d.fields).some((v) => v != null && v !== "");
    return `<li class="doc-row"><div><p>${chip(d.status)} <b>${esc(d.name)}</b></p><small>${esc(d.owner)} · ${esc(d.when)}</small>${d.needed && d.missing.length ? `<small class="doc-missing">직접 입력할 칸 · ${d.missing.map(esc).join(", ")}</small>` : ""}<small>근거 · ${esc(d.basis)}${d.note ? ` · ${esc(d.note)}` : ""}</small></div>${draft ? `<button type="button" class="btn btn-secondary btn-sm" data-trade="doc" data-key="${esc(d.key)}">초안 보기</button>` : ""}</li>`;
  }

  function docsView(data) {
    const need = data.docs.filter((d) => d.needed);
    const skip = data.docs.filter((d) => !d.needed);
    return (
      `<p class="docs-sum">이 단계에 필요한 서류 ${need.length}종</p><ul class="doc-list">${need.map(docRow).join("")}</ul>` +
      (skip.length
        ? `<details class="docs-skip"><summary>지금 단계에선 필요 없음 ${skip.length}종</summary><ul class="doc-list">${skip.map(docRow).join("")}</ul></details>`
        : "")
    );
  }

  function docsSection(record) {
    if (!online()) return "";
    const key = record.id + ":" + record.version;
    return `<section class="sheet-section trade" id="trade-docs"><h3>AI 서류 안내</h3><p class="sheet-note">반출 단계와 기록을 보고 필요한 서류를 정하고, 앱 기록으로 채울 수 있는 칸은 채움. 제출과 서명은 서류의 주인이 함</p><div data-docs="${esc(key)}">${docsCache.has(key) ? docsView(docsCache.get(key)) : '<p class="sheet-note">필요 서류 확인 중</p>'}</div><p class="trade-error" role="alert" hidden></p></section>`;
  }

  const trade = (record) => salesSection(record) + docsSection(record);

  async function loadDocs(form, record) {
    const box = form.querySelector("[data-docs]");
    const key = box?.dataset.docs;
    if (!box || docsCache.has(key)) return;
    try {
      docsCache.set(key, await window.GmServer.trade.docs(record.id));
      if (box.isConnected) box.innerHTML = docsView(docsCache.get(key));
    } catch (error) {
      if (box.isConnected) box.innerHTML = `<p class="trade-error" role="alert">${esc(error.message)}</p>`;
    }
  }

  // 서버가 저장한 새 기록으로 바꾸고 시트를 같은 스크롤 위치로 다시 그린다
  function refresh(record, message) {
    const top = sheet().scrollTop;
    app().replace(record);
    open(record.id);
    sheet().scrollTop = top;
    app().toast(message);
  }

  function wireTrade(form, record) {
    if (!online()) return;
    loadDocs(form, record);
    // 판매 칸에서 Enter가 시트의 주 동작(조건 확정·정산 확정)을 제출하지 않게
    form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.matches(".trade input"))
        event.preventDefault();
    });
    form.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-trade]");
      if (!button || button.disabled) return;
      const box = button.closest("[data-lot-card], [data-lot-new], .quote-card, .trade");
      const fail = box.querySelector(".trade-error");
      const T = window.GmServer.trade;
      fail.hidden = true;
      button.disabled = true;
      try {
        switch (button.dataset.trade) {
          case "check":
            box.querySelector("[data-sale-out]").innerHTML = '<p class="sheet-note">AI가 판정하는 중</p>';
            box.querySelector("[data-sale-out]").innerHTML = gradeView(await T.checkLot(record.id, readLot(box)));
            break;
          case "add":
            refresh(await T.addLot(record.id, readLot(box)), "판매 묶음 등록 완료 · 업체 매입 제안 대기");
            break;
          case "offer": {
            const v = (name) => box.querySelector(`[name=${name}]`).value.trim();
            const body = { price: Number(v("o_price")), validUntil: v("o_until") };
            if (v("o_buyer")) body.buyer = v("o_buyer");
            refresh(await T.offer(record.id, button.dataset.lot, body), "매입 제안 입력 완료");
            break;
          }
          case "accept":
            refresh(await T.accept(record.id, button.dataset.lot, button.dataset.offer), "판매 확정 · 집하장 몫 계산 완료");
            break;
          case "reply": {
            const i = Number(button.dataset.q);
            refresh(await T.reply(record.id, i, readQuote(form, record.quotes[i], i)), "업체 회신으로 저장 완료");
            break;
          }
          case "doc":
            await T.openDoc(record.id, button.dataset.key);
            break;
        }
      } catch (error) {
        if (button.dataset.trade === "check") box.querySelector("[data-sale-out]").innerHTML = "";
        fail.textContent = error?.message || "서버 요청 실패";
        fail.hidden = false;
        fail.scrollIntoView({ block: "nearest" });
      } finally {
        button.disabled = false;
      }
    });
  }

  function open(id, focus) {
    const record = app()
      .records()
      .find((item) => item.id === id);
    if (!record) {
      app().toast("해당 반출 건 조회 불가");
      return;
    }
    const snapshot = JSON.stringify(record);
    if (record.status === "registered") quoteStep(record, snapshot);
    else settlementStep(record, snapshot);
    // 운영 현황 '매입 제안 받는 중'에서 열면 판매 구역으로 바로 이동
    if (focus) sheet().querySelector("#trade-" + focus)?.scrollIntoView({ block: "start" });
  }

  window.NetForms = Object.freeze({ create, open });
})();
