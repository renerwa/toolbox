(function () {
  "use strict";

  const frameParser = window.SinopecFrameParser;
  const payloadParser = window.SinopecPayloadParser;

  const elements = {
    input: document.getElementById("commandInput"),
    inputCounter: document.getElementById("inputCounter"),
    inputMessage: document.getElementById("inputMessage"),
    parseButton: document.getElementById("parseButton"),
    clearInputButton: document.getElementById("clearInputButton"),
    toggleAllButton: document.getElementById("toggleAllButton"),
    clearAllButton: document.getElementById("clearAllButton"),
    emptyState: document.getElementById("emptyState"),
    results: document.getElementById("results"),
    uniqueCount: document.getElementById("uniqueCount"),
    duplicateCount: document.getElementById("duplicateCount"),
    crcCount: document.getElementById("crcCount"),
    errorCount: document.getElementById("errorCount"),
  };

  const state = {
    occurrences: [],
    collapsed: new Set(),
    batchId: 0,
    allCollapsed: false,
  };

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }

  function button(className, label, title) {
    const element = createElement("button", className, label);
    element.type = "button";
    if (title) {
      element.title = title;
      element.setAttribute("aria-label", title);
    }
    return element;
  }

  function setMessage(message, tone) {
    elements.inputMessage.textContent = message || "";
    elements.inputMessage.className = `input-message${tone ? ` is-${tone}` : ""}`;
  }

  function updateInputState() {
    elements.inputCounter.textContent = `${elements.input.value.length} 字符`;
    elements.clearInputButton.disabled = elements.input.value.length === 0;
  }

  function crcSummary(group) {
    if (group.crcStates.includes("invalid")) return { text: "CRC 异常", tone: "error" };
    if (group.crcStates.includes("valid") && group.crcStates.includes("missing")) {
      return { text: "CRC 正确 / 部分未提供", tone: "success" };
    }
    if (group.crcStates.includes("valid")) return { text: "CRC 正确", tone: "success" };
    return { text: "CRC 未提供", tone: "neutral" };
  }

  function hasFieldWarnings(parsed) {
    return parsed.groups.some((group) => group.fields.some((field) => field.warnings.length));
  }

  function groupHasException(group, parsed) {
    return !group.frame.complete
      || group.crcStates.includes("invalid")
      || group.frame.diagnostics.some((item) => item.level !== "info")
      || parsed.diagnostics.some((item) => item.level !== "info")
      || hasFieldWarnings(parsed);
  }

  function badge(text, tone) {
    const className = tone && tone !== "neutral" ? `badge badge-${tone}` : "badge";
    return createElement("span", className, text);
  }

  function renderRawBytes(frame) {
    const block = createElement("div", "raw-block");
    const label = createElement("div", "raw-label");
    label.append(createElement("span", "", "原始报文"));
    const trailingCount = frame.trailingBytes ? frame.trailingBytes.length : 0;
    label.append(createElement("span", "", `${frame.canonical.length}${frame.crc.received !== null ? " + 2 CRC" : ""}${trailingCount ? ` + ${trailingCount} 额外` : ""} 字节`));
    block.append(label);

    const bytes = createElement("div", "raw-bytes");
    frame.canonical.forEach((value, index) => {
      let className = "raw-byte";
      if (index === 0) className += " raw-byte-sync";
      if (index === 4 || index === 5) className += " raw-byte-length";
      if (index === 6) className += " raw-byte-command";
      const item = createElement("span", className, frameParser.byteHex(value));
      item.title = `偏移 0x${index.toString(16).padStart(2, "0").toUpperCase()}`;
      bytes.append(item);
    });
    if (frame.crc.received !== null) {
      [frame.crc.received >>> 8, frame.crc.received & 0xff].forEach((value, crcIndex) => {
        const item = createElement("span", "raw-byte raw-byte-crc", frameParser.byteHex(value));
        item.title = `CRC ${crcIndex === 0 ? "高" : "低"}字节`;
        bytes.append(item);
      });
    }
    (frame.trailingBytes || []).forEach((value, extraIndex) => {
      const item = createElement("span", "raw-byte raw-byte-extra", frameParser.byteHex(value));
      item.title = `声明长度之后的额外字节 ${extraIndex + 1}`;
      bytes.append(item);
    });
    block.append(bytes);
    return block;
  }

  function metaCell(label, value) {
    const cell = createElement("div", "meta-cell");
    cell.append(createElement("span", "", label));
    cell.append(createElement("strong", "", value));
    return cell;
  }

  function renderFrameMeta(frame) {
    const meta = createElement("div", "frame-meta");
    meta.append(metaCell("目的地址", `${frameParser.byteHex(frame.destination)}H`));
    meta.append(metaCell("源地址", `${frameParser.byteHex(frame.source)}H`));
    meta.append(metaCell("帧号 / 控制", `${frame.frameNumber} / ${frameParser.byteHex(frame.control)}H`));
    meta.append(metaCell("通信模式", frame.caller));
    meta.append(metaCell("有效数据长度", `${frame.declaredLength ?? "-"} / 实际 ${frame.actualLength} B`));
    const crcValue = frame.crc.received === null
      ? "未提供"
      : `${frame.crc.received.toString(16).padStart(4, "0").toUpperCase()}H`;
    meta.append(metaCell("CRC 报文值", crcValue));
    return meta;
  }

  function renderDiagnostics(frame, parsed) {
    const all = frame.diagnostics.concat(parsed.diagnostics);
    const fieldWarnings = parsed.groups.flatMap((group) => group.fields.flatMap((field) => field.warnings.map((message) => ({ level: "warning", message: `${field.name}：${message}` }))));
    const unique = [];
    const seen = new Set();
    all.concat(fieldWarnings).forEach((item) => {
      const key = `${item.level}:${item.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    });
    if (!unique.length) return null;

    const container = createElement("div", "diagnostics");
    unique.forEach((item) => {
      const tone = item.level === "error" ? " diagnostic-error" : item.level === "info" ? " diagnostic-info" : "";
      container.append(createElement("div", `diagnostic${tone}`, item.message));
    });
    return container;
  }

  function renderFieldTable(group) {
    const wrap = createElement("div", "table-wrap");
    const table = createElement("table", "field-table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    [
      ["偏移", "column-offset"],
      ["长度", "column-length"],
      ["字段", "column-name"],
      ["原始字节", "column-raw"],
      ["解析值与说明", ""],
    ].forEach(([text, className]) => headRow.append(createElement("th", className, text)));
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    group.fields.forEach((field) => {
      const row = document.createElement("tr");
      row.append(createElement("td", "field-offset", `0x${field.offset.toString(16).padStart(2, "0").toUpperCase()}`));
      row.append(createElement("td", "field-length", field.actualLength === field.length ? String(field.length) : `${field.actualLength}/${field.length}`));
      row.append(createElement("td", "field-name", field.name));
      row.append(createElement("td", "field-raw", field.rawHex || "-"));
      const valueCell = createElement("td", "field-value");
      valueCell.append(createElement("strong", "", field.value || "-"));
      if (field.description) valueCell.append(createElement("span", "field-description", field.description));
      field.warnings.forEach((warning) => valueCell.append(createElement("span", "field-warning", warning)));
      row.append(valueCell);
      tbody.append(row);
    });
    table.append(tbody);
    wrap.append(table);
    return wrap;
  }

  function renderGroups(parsed) {
    const container = createElement("div", "field-groups");
    parsed.groups.forEach((item, index) => {
      const details = createElement("details", "field-group");
      if (!parsed.isLong || index === 0) details.open = true;
      const summary = document.createElement("summary");
      summary.append(createElement("span", "", item.title));
      summary.append(createElement("span", "group-count", `${item.fields.length} 个字段`));
      details.append(summary);
      details.append(renderFieldTable(item));
      container.append(details);
    });
    return container;
  }

  function renderOccurrences(group) {
    const details = createElement("details", "occurrences");
    const summary = document.createElement("summary");
    summary.textContent = `日志来源 · 共出现 ${group.count} 次`;
    details.append(summary);
    const list = createElement("ol", "occurrence-list");
    group.occurrences.forEach((item) => {
      const crc = item.crcState === "valid" ? "CRC 正确" : item.crcState === "invalid" ? "CRC 错误" : "无 CRC";
      list.append(createElement("li", "", `第 ${item.batchId} 批 · 第 ${item.lineNumber} 行 · ${item.stage} · ${crc}`));
    });
    details.append(list);
    return details;
  }

  function renderResultCard(group, index) {
    const parsed = payloadParser.parsePayload(group.frame);
    const card = createElement("article", "result-card");
    if (state.collapsed.has(group.key)) card.classList.add("is-collapsed");
    card.dataset.key = group.key;

    const header = createElement("header", "result-header");
    header.append(createElement("span", "result-index", String(index + 1).padStart(2, "0")));
    const title = createElement("div", "result-title");
    title.append(createElement("h3", "", `${parsed.codeHex}H · ${parsed.variant}`));
    title.append(createElement("p", "", parsed.description));
    header.append(title);

    const badges = createElement("div", "result-badges");
    const lengthTone = group.frame.complete && group.frame.actualLength === group.frame.declaredLength ? "success" : "error";
    badges.append(badge(`${group.frame.declaredLength ?? "-"} B`, lengthTone));
    const crc = crcSummary(group);
    badges.append(badge(crc.text, crc.tone));
    if (group.count > 1) badges.append(badge(`出现 ${group.count} 次`, "neutral"));
    if (group.frame.escapedInput) badges.append(badge("已反转义", "neutral"));
    header.append(badges);

    const actions = createElement("div", "result-actions");
    const collapse = button("collapse-button", "", state.collapsed.has(group.key) ? "展开结果" : "折叠结果");
    collapse.append(createElement("span", "", "⌃"));
    collapse.addEventListener("click", () => {
      if (state.collapsed.has(group.key)) state.collapsed.delete(group.key);
      else state.collapsed.add(group.key);
      render();
    });
    const remove = button("icon-button", "×", "删除这条报文");
    remove.addEventListener("click", () => {
      state.occurrences = state.occurrences.filter((frame) => frameParser.bytesHex(frame.canonical) !== group.key);
      state.collapsed.delete(group.key);
      render();
    });
    actions.append(collapse, remove);
    header.append(actions);
    card.append(header);

    const body = createElement("div", "result-body");
    const diagnostics = renderDiagnostics(group.frame, parsed);
    if (diagnostics) body.append(diagnostics);
    body.append(renderRawBytes(group.frame));
    body.append(renderFrameMeta(group.frame));
    body.append(renderGroups(parsed));
    body.append(renderOccurrences(group));
    card.append(body);
    return { card, parsed };
  }

  function render() {
    const groups = frameParser.aggregateFrames(state.occurrences);
    elements.results.replaceChildren();
    const parsedGroups = [];
    groups.forEach((group, index) => {
      const rendered = renderResultCard(group, index);
      parsedGroups.push({ group, parsed: rendered.parsed });
      elements.results.append(rendered.card);
    });

    const duplicateCount = Math.max(state.occurrences.length - groups.length, 0);
    const crcCount = groups.filter((group) => group.crcStates.includes("valid") && !group.crcStates.includes("invalid")).length;
    const errorCount = parsedGroups.filter(({ group, parsed }) => groupHasException(group, parsed)).length;
    elements.uniqueCount.textContent = String(groups.length);
    elements.duplicateCount.textContent = String(duplicateCount);
    elements.crcCount.textContent = String(crcCount);
    elements.errorCount.textContent = String(errorCount);
    elements.emptyState.hidden = groups.length > 0;
    elements.toggleAllButton.disabled = groups.length === 0;
    elements.clearAllButton.disabled = groups.length === 0;
    elements.toggleAllButton.textContent = state.allCollapsed ? "全部展开" : "全部折叠";
  }

  function parseAndAdd() {
    const source = elements.input.value;
    const nextBatch = state.batchId + 1;
    const result = frameParser.extractFrames(source, { batchId: nextBatch });
    if (!result.frames.length) {
      const message = result.diagnostics.map((item) => item.message).join(" ") || "没有识别到报文。";
      setMessage(message, "error");
      return;
    }

    state.batchId = nextBatch;
    const beforeUnique = frameParser.aggregateFrames(state.occurrences).length;
    state.occurrences = result.frames.concat(state.occurrences);
    const afterUnique = frameParser.aggregateFrames(state.occurrences).length;
    const addedUnique = Math.max(afterUnique - beforeUnique, 0);
    const merged = result.frames.length - addedUnique;
    setMessage(`已识别 ${result.frames.length} 条，新增 ${addedUnique} 条，合并 ${merged} 条重复报文。`, "success");
    elements.input.value = "";
    updateInputState();
    render();
    elements.input.focus();
  }

  elements.input.addEventListener("input", updateInputState);
  elements.input.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      parseAndAdd();
    }
  });
  elements.parseButton.addEventListener("click", parseAndAdd);
  elements.clearInputButton.addEventListener("click", () => {
    elements.input.value = "";
    setMessage("", "");
    updateInputState();
    elements.input.focus();
  });
  elements.clearAllButton.addEventListener("click", () => {
    state.occurrences = [];
    state.collapsed.clear();
    state.allCollapsed = false;
    setMessage("已清空全部解析结果。", "");
    render();
  });
  elements.toggleAllButton.addEventListener("click", () => {
    const groups = frameParser.aggregateFrames(state.occurrences);
    state.allCollapsed = !state.allCollapsed;
    state.collapsed = state.allCollapsed ? new Set(groups.map((group) => group.key)) : new Set();
    render();
  });

  updateInputState();
  render();
})();
