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
    box.textContent = error?.message || "입력 내용을 확인해 주세요.";
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
          "이 반출 건이 변경됐습니다. 창을 닫고 다시 열어 최신 내용을 확인해 주세요.",
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
      throw new Error("JPG, PNG 또는 WebP 사진을 선택해 주세요.");
    }
    if (file.size > 12 * 1024 * 1024)
      throw new Error("12MB 이하 사진을 선택해 주세요.");
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
      field("출항 예정 일시", "departure", "2026-11-29T09:00", {
        type: "datetime-local",
      }),
      field("지정 처리업체", "facility", demoFacility, { maxLength: 70 }),
      field("혼입물·현장 메모 (선택)", "note", "", {
        type: "textarea",
        required: false,
        wide: true,
        maxLength: 400,
      }),
      '<label class="field field-wide"><span>현장 사진 (선택)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>',
      '<div class="field-wide" data-preview></div>',
    ].join("");
    const finance = [
      numericField("기존 방식 처리비 (원/톤)", "baseRate", 300000),
      numericField("인수 톤당 운영료 (원)", "feeRate", 40000),
      numericField("건별 팀 직접비 (원)", "directCost", 110000),
    ].join("");
    const form = show({
      kicker: "삽시도 집하장",
      title: "반출 등록",
      body: `<div class="sheet-grid">${basics}</div><p class="sheet-note">등록 후 같은 지정 업체의 두 처리 조건을 비교합니다.</p><details class="sheet-section"><summary>시연 비용 가정 조정</summary><div class="sheet-grid finance-grid">${finance}</div></details>`,
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
        saved(record, "반출 건을 등록했습니다.");
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
            ? new Error("사진을 읽을 수 없습니다. 다른 파일을 선택해 주세요.")
            : error,
        );
      } finally {
        if (revision === photoRevision) submit.disabled = false;
      }
    });
  }

  function shipmentSummary(record) {
    return (
      description([
        ["반출 예정", record.departure.replace("T", " ")],
        ["예상 반출량", `${weight(record.weight)} · ${record.bags}마대`],
        ["어구 · 재질", `${record.kind} · ${record.material}`],
        ["지정 처리업체", record.facility],
      ]) +
      (record.note
        ? `<p class="sheet-note">현장 메모 · ${esc(record.note)}</p>`
        : "") +
      optionalPhoto(record.photo)
    );
  }

  function quoteCard(quote, index) {
    const iname = (key) => `q${index}_${key}`;
    return `<fieldset class="quote-card"><legend>${esc(quote.label)}</legend>
      <label class="quote-choice"><input type="radio" name="choice" value="${index}"> 이 조건 선택</label>
      ${field("인수 조건", iname("condition"), quote.condition, { maxLength: 240 })}
      ${numericField("예상 인수량 (톤)", iname("expected"), quote.expected, { step: "0.001" })}
      ${numericField("인수분 처리비 (원/톤)", iname("rate"), quote.rate)}
      ${numericField("잔재물 처리비 (원/톤)", iname("residualRate"), quote.residualRate)}
      ${numericField("추가 선별·운반비 (원/건)", iname("extra"), quote.extra)}
      ${field("견적 유효일", iname("validUntil"), quote.validUntil, { type: "date" })}
      <p class="quote-total" id="q-total-${index}" aria-live="polite"></p></fieldset>`;
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
    const body =
      section("반출 정보", shipmentSummary(record)) +
      section(
        "지정 업체 인수 조건",
        `<p class="sheet-note">같은 업체의 두 선별 조건입니다. 예상 총비용에 인수 톤당 운영료 ${amount(record.feeRate)}가 포함됩니다. 초깃값은 시연용 가정입니다.</p>
      <div class="quote-comparison" data-comparison aria-live="polite"></div><div class="quote-grid">${record.quotes.map(quoteCard).join("")}</div>`,
      );
    function saveQuotes(form, confirm) {
      const quotes = record.quotes.map((quote, index) =>
        readQuote(form, quote, index),
      );
      let choice = null;
      if (confirm) {
        const selected = form.querySelector("input[name=choice]:checked");
        if (!selected)
          throw new Error("확정할 인수 조건을 하나 선택해 주세요.");
        choice = Number(selected.value);
        if (quotes[choice].validUntil < record.departure.slice(0, 10)) {
          throw new Error(
            "선택한 견적이 출항일 전에 만료됩니다. 견적의 유효일을 다시 확인해 주세요.",
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
        confirm
          ? "출항 전 인수 조건을 확정했습니다."
          : "인수 조건 초안을 저장했습니다.",
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
          output.textContent = `예상 총비용 ${amount(totals.cost)} · 고객 순절감 ${amount(totals.savings)}`;
          if (next.validUntil >= record.departure.slice(0, 10))
            options.push({ label: quote.label, cost: totals.cost });
        } catch {
          output.textContent = "비용을 계산하려면 물량과 단가를 확인해 주세요.";
        }
      });
      const comparison = form.querySelector("[data-comparison]");
      if (options.length !== 2) {
        comparison.textContent =
          "두 견적의 수량·단가와 출항일까지의 유효일을 확인해 주세요.";
      } else {
        options.sort((a, b) => a.cost - b.cost);
        const difference = options[1].cost - options[0].cost;
        comparison.textContent = difference
          ? `예상 총비용은 ‘${options[0].label}’ 조건이 ${amount(difference)} 낮습니다.`
          : "두 조건의 예상 총비용이 같습니다.";
      }
    };
    form.addEventListener("input", update);
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
    const header = `<details class="sheet-section"><summary>반출 정보와 확정 조건</summary>${shipmentSummary(record)}${confirmedConditions(record, quote)}</details>`;
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
          ["잔재 사유", actual.reason || "전량 인수"],
        ]),
      );
      show({
        kicker: `${record.id} · ${statusNames[record.status]}`,
        title: "반출 정산서",
        body: header + summary + section("정산 내역", resultRows(totals)),
      });
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
      field("잔재 발생 사유", "reason", "", {
        type: "textarea",
        required: false,
        maxLength: 350,
        wide: true,
      }),
    ].join("");
    const body =
      header +
      section(
        "검수 입력",
        `<p class="sheet-note">${esc(record.facility)} · ${esc(quote.label)}. 입력된 중량은 견적 예상치이므로 실측값으로 확인해 주세요.</p><div class="sheet-grid">${fields}</div>`,
      ) +
      section("예상 정산 내역", '<div data-results aria-live="polite"></div>');
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
        };
        if (actual.accepted < actual.total && !actual.reason)
          throw new Error("인수하지 못한 물량의 사유를 적어 주세요.");
        const next = { ...record, status: "settled", actual };
        persist(next, snapshot);
        saved(next, "실제 인수량으로 정산을 확정했습니다.");
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
        target.textContent =
          "계량한 전체 반출량과 그 범위 안의 인수량을 입력해 주세요.";
      }
    };
    form.addEventListener("input", update);
    update();
  }

  function open(id) {
    const record = app()
      .records()
      .find((item) => item.id === id);
    if (!record) {
      app().toast("반출 건을 찾을 수 없습니다.");
      return;
    }
    const snapshot = JSON.stringify(record);
    if (record.status === "registered") quoteStep(record, snapshot);
    else settlementStep(record, snapshot);
  }

  window.NetForms = Object.freeze({ create, open });
})();
