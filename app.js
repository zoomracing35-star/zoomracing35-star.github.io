(function () {
  "use strict";
  const config = Object.assign({ title: "Лайв-тайминг", refreshSeconds: 10, timeZone: "Europe/Moscow", timeZoneLabel: "МСК" }, window.TIMING_CONFIG || {});
  const refreshSeconds = Math.max(5, Number(config.refreshSeconds) || 10);
  const demo = !config.sheetUrl;
  const elements = {};
  ["event-title", "event-description", "event-details", "connection", "connection-label", "clock", "clock-zone", "clock-date", "sync-label", "demo-banner", "error-banner", "search", "refresh", "table-head", "table-body", "timing-table", "empty-state", "empty-title", "empty-description", "row-count", "result-summary", "refresh-note", "footer-note", "footer-mode"].forEach(function (id) { elements[id] = document.getElementById(id); });
  let data = { columns: [], rows: [] };
  let lastSuccess = 0;
  let nextRefresh = 0;
  let inFlight = false;
  let state = "loading";
  let previousRows = new Map();
  let demoTick = 0;
  let clockFormat, dateFormat;
  try {
    clockFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: config.timeZone });
    dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: config.timeZone });
  } catch (_) {
    clockFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }
  document.title = "ZoomRacing — " + config.title + " · Октябрь";
  elements["event-title"].textContent = config.title;
  const titleDot = document.createElement("span");
  titleDot.className = "title-dot";
  titleDot.textContent = ".";
  elements["event-title"].appendChild(titleDot);
  elements["event-description"].textContent = config.description || "";
  elements["event-details"].textContent = config.eventDetails || "";
  elements["event-details"].hidden = !config.eventDetails;
  elements["footer-note"].textContent = config.footerNote || "";
  elements["footer-note"].hidden = !config.footerNote;
  elements["clock-zone"].textContent = config.timeZoneLabel;
  elements["demo-banner"].hidden = !demo;
  if (demo) elements["footer-mode"].textContent = "Демонстрация / вымышленные результаты";

  function setState(value, label) {
    state = value;
    elements.connection.className = "connection " + value;
    elements["connection-label"].textContent = label;
  }
  function matchesHeader(label, labels) {
    return (labels || []).some(function (candidate) { return candidate.toLocaleLowerCase("ru") === label.trim().toLocaleLowerCase("ru"); });
  }
  function rowKey(row, index) {
    const participantIndex = data.columns.findIndex(function (column) { return matchesHeader(column.label, config.participantHeaders); });
    return participantIndex >= 0 ? row[participantIndex] : row.join("|") + ":" + index;
  }
  function renderTable() {
    const query = elements.search.value.trim().toLocaleLowerCase("ru");
    const visible = data.rows.filter(function (row) { return !query || row.some(function (cell) { return String(cell).toLocaleLowerCase("ru").includes(query); }); });
    const header = document.createElement("tr");
    data.columns.forEach(function (column) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = column.label || column.id;
      header.appendChild(cell);
    });
    elements["table-head"].replaceChildren(header);
    const body = document.createDocumentFragment();
    visible.forEach(function (row) {
      const tr = document.createElement("tr");
      const originalIndex = data.rows.indexOf(row);
      const previous = previousRows.get(rowKey(row, originalIndex));
      data.columns.forEach(function (column, index) {
        const td = document.createElement("td");
        const text = String(row[index] == null ? "" : row[index]);
        td.textContent = text || "—";
        if (matchesHeader(column.label, config.participantHeaders)) td.classList.add("participant");
        else if (column.type === "number" || /время|от лидера|баллы|место|time|gap/i.test(column.label)) td.classList.add("numeric");
        if (matchesHeader(column.label, config.statusHeaders)) {
          const badge = document.createElement("span");
          badge.className = "status-badge";
          if (/финиш|finished|завершено/i.test(text)) badge.classList.add("finished");
          if (/dns|dnf|дисквалиф|не старт/i.test(text)) badge.classList.add("inactive");
          badge.textContent = text || "—";
          td.replaceChildren(badge);
        }
        if (previous && previous[index] !== text) td.classList.add("updated");
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    elements["table-body"].replaceChildren(body);
    elements["row-count"].textContent = String(data.rows.length);
    elements["result-summary"].textContent = visible.length === data.rows.length ? "Участников: " + data.rows.length : "Найдено: " + visible.length + " из " + data.rows.length;
    elements["timing-table"].hidden = visible.length === 0;
    elements["empty-state"].hidden = visible.length > 0;
    if (!visible.length) {
      elements["empty-title"].textContent = query ? "Участник не найден" : (state === "error" ? "Не удалось получить результаты" : "Ожидаем результаты");
      elements["empty-description"].textContent = query ? "Попробуйте другое имя или очистите поиск." : "Данные появятся после успешного чтения протокола.";
    }
  }
  function demoData() {
    demoTick++;
    return {
      columns: ["Место", "Участник", "Лучшее время", "От лидера", "Баллы"].map(function (label, index) { return { id: String(index), label: label, type: "string" }; }),
      rows: [["1", "Пример участника 1", "1:31.278", "—", "6"], ["2", "Пример участника 2", "1:32.286", "+1.008", "5"], ["3", "Пример участника 3", demoTick % 2 ? "1:33.079" : "1:32.970", demoTick % 2 ? "+1.801" : "+1.692", "4"]]
    };
  }
  async function refresh() {
    if (inFlight || document.hidden) return;
    inFlight = true;
    elements.refresh.disabled = true;
    elements.refresh.classList.add("loading");
    elements["sync-label"].textContent = "Проверяем протокол…";
    try {
      const response = demo ? demoData() : await window.TimingSheets.read({ sheetUrl: config.sheetUrl, gid: config.gid, range: config.range, headerRows: config.headerRows, query: config.query, timeoutMs: 12000 });
      const nextData = config.transform === "october" && !demo ? window.TimingModel.october(response) : response;
      previousRows = new Map(data.rows.map(function (row, index) { return [rowKey(row, index), row]; }));
      data = nextData;
      lastSuccess = Date.now();
      setState(demo ? "demo" : "live", demo ? "Демонстрация" : "Данные доступны");
      elements["error-banner"].hidden = true;
      if (nextData.car && nextData.track) {
        elements["event-details"].textContent = nextData.car + " / " + nextData.track;
        elements["event-details"].hidden = false;
        elements["footer-mode"].textContent = "Октябрь · " + nextData.track;
      }
      renderTable();
    } catch (error) {
      setState("error", navigator.onLine ? "Нет свежих данных" : "Нет соединения");
      const detail = error && error.message ? error.message : "Не удалось прочитать таблицу.";
      elements["error-banner"].textContent = (lastSuccess ? "Показываем последние полученные результаты. " : "Результаты пока недоступны. ") + detail + " Следующая попытка — автоматически.";
      elements["error-banner"].hidden = false;
      renderTable();
    } finally {
      inFlight = false;
      elements.refresh.disabled = false;
      elements.refresh.classList.remove("loading");
      nextRefresh = Date.now() + refreshSeconds * 1000;
      updateClock();
    }
  }
  function updateClock() {
    const now = new Date();
    const formatted = clockFormat.format(now);
    elements.clock.textContent = formatted.slice(0, 5);
    const seconds = document.createElement("span");
    seconds.textContent = formatted.slice(5);
    elements.clock.appendChild(seconds);
    elements.clock.dateTime = now.toISOString();
    elements["clock-date"].textContent = dateFormat.format(now);
    if (!inFlight) elements["sync-label"].textContent = lastSuccess ? "Проверено в " + clockFormat.format(new Date(lastSuccess)) : "Ожидаем протокол";
    const countdown = Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000));
    elements["refresh-note"].textContent = inFlight ? "Обновляем результаты…" : "Следующая проверка через " + countdown + " с";
    if (!inFlight && nextRefresh && Date.now() >= nextRefresh) refresh();
  }
  elements.search.addEventListener("input", renderTable);
  elements.refresh.addEventListener("click", refresh);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { updateClock(); refresh(); } });
  window.addEventListener("online", refresh);
  updateClock();
  refresh();
  window.setInterval(updateClock, 1000);
})();
