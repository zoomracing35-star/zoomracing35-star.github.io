/* Public Google Sheets adapter. No build step, API key, or Google Charts loader. */
(function (global) {
  "use strict";

  const DEFAULT_RANGE = "A1:Z1000";
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const ignoreLateResponse = function () {};
  let sequence = 0;
  let callbackRoot = "_timingSheets_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  while (own(global, callbackRoot)) callbackRoot += "_";

  // Only active requests occupy this map. A removed request still resolves to a
  // no-op, so a late JSONP response cannot raise a missing-callback exception.
  const activeCallbacks = Object.create(null);
  global[callbackRoot] = new Proxy(activeCallbacks, {
    get(target, key) {
      return own(target, key) ? target[key] : ignoreLateResponse;
    }
  });

  function sourceError(message) {
    return new Error(message);
  }

  function normalizeGid(value) {
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) {
      throw sourceError("ID листа (gid) должен быть целым неотрицательным числом.");
    }
    return text.replace(/^0+(?=\d)/, "");
  }

  function parseSource(urlOrId, gidOverride) {
    if (typeof urlOrId !== "string" || !urlOrId.trim()) {
      throw sourceError("Укажите ссылку на Google Таблицу или её ID.");
    }
    const input = urlOrId.trim();
    let id;
    let sourceGid = "0";
    if (/^[A-Za-z0-9_-]+$/.test(input)) {
      id = input;
    } else {
      let url;
      try {
        url = new URL(input);
      } catch (_) {
        throw sourceError("Нужна обычная ссылка вида https://docs.google.com/spreadsheets/d/ID/edit.");
      }
      if (url.protocol !== "https:" || url.hostname !== "docs.google.com" ||
          url.port || url.username || url.password) {
        throw sourceError("Разрешены только HTTPS-ссылки docs.google.com/spreadsheets/d/ID.");
      }
      if (/^\/spreadsheets\/d\/e(?:\/|$)/.test(url.pathname)) {
        throw sourceError("Это опубликованная ссылка /d/e/. Скопируйте обычную ссылку /d/ID/edit из адресной строки таблицы.");
      }
      const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/.*)?$/);
      if (!match) {
        throw sourceError("В ссылке не найден ID Google Таблицы. Используйте ссылку /spreadsheets/d/ID/edit.");
      }
      id = match[1];
      const queryGid = url.searchParams.get("gid");
      const hashGid = new URLSearchParams(url.hash.slice(1)).get("gid");
      sourceGid = queryGid !== null ? queryGid : hashGid !== null ? hashGid : "0";
    }
    if (/^2PACX-/.test(id)) {
      throw sourceError("Нужен ID исходной таблицы, а не ID опубликованной версии 2PACX-. Откройте таблицу и скопируйте обычную ссылку /d/ID/edit.");
    }
    const hasOverride = gidOverride !== undefined && gidOverride !== null && String(gidOverride).trim() !== "";
    return { id, gid: normalizeGid(hasOverride ? gidOverride : sourceGid) };
  }

  function columnNumber(letters) {
    return letters.split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  }

  function normalizeRange(value) {
    const range = String(value || DEFAULT_RANGE).trim().toUpperCase().replace(/\$/g, "");
    const match = range.match(/^([A-Z]{1,3})([1-9]\d*)(?::([A-Z]{1,3})([1-9]\d*))?$/);
    if (!match) {
      throw sourceError("Укажите ограниченный диапазон ячеек, например A1:Z1000.");
    }
    const startColumn = columnNumber(match[1]);
    const startRow = Number(match[2]);
    const endColumn = columnNumber(match[3] || match[1]);
    const endRow = Number(match[4] || match[2]);
    if (!Number.isSafeInteger(startRow) || !Number.isSafeInteger(endRow) ||
        endColumn < startColumn || endRow < startRow) {
      throw sourceError("Начало диапазона должно находиться перед его концом.");
    }
    if ((endColumn - startColumn + 1) * (endRow - startRow + 1) > 100000) {
      throw sourceError("Диапазон слишком большой: выберите не более 100 000 ячеек.");
    }
    return range;
  }

  function cellText(cell) {
    if (!cell || typeof cell !== "object") return "";
    if (cell.f !== null && cell.f !== undefined) return String(cell.f);
    if (cell.v !== null && cell.v !== undefined) return String(cell.v);
    return "";
  }

  function normalizeResponse(response) {
    if (!response || typeof response !== "object") {
      throw sourceError("Google вернул ответ без данных таблицы.");
    }
    if (response.status === "error") {
      const errors = Array.isArray(response.errors) ? response.errors : [];
      const accessDenied = errors.some((item) => item &&
        (item.reason === "access_denied" || item.reason === "user_not_authenticated"));
      if (accessDenied) {
        throw sourceError("Нет доступа к Google Таблице. В настройках доступа выберите «Все, у кого есть ссылка» → «Читатель».");
      }
      const details = errors.map((item) => item && (item.message || item.reason)).filter(Boolean).map(String).join("; ");
      throw sourceError("Google не смог прочитать таблицу" + (details ? ": " + details : ". Проверьте ссылку и ID листа."));
    }
    if ((response.status !== "ok" && response.status !== "warning") ||
        !response.table || !Array.isArray(response.table.cols) || !Array.isArray(response.table.rows)) {
      throw sourceError("Google вернул неожиданный формат данных таблицы.");
    }
    const columns = response.table.cols.map((column, index) => ({
      id: column && column.id !== undefined ? String(column.id) : String(index),
      label: column && column.label !== null && column.label !== undefined ? String(column.label) : "",
      type: column && column.type ? String(column.type) : "string"
    }));
    const rows = [];
    response.table.rows.forEach((row) => {
      const cells = row && Array.isArray(row.c) ? row.c : [];
      const values = columns.map((_, index) => cellText(cells[index]));
      if (values.some((value) => value.trim() !== "")) rows.push(values);
    });
    return { columns, rows };
  }

  function read(options) {
    return new Promise((resolve, reject) => {
      let source;
      let range;
      let headerRows;
      let timeoutMs;
      let query;
      try {
        options = options || {};
        source = parseSource(options.sheetUrl, options.gid);
        range = normalizeRange(options.range);
        headerRows = options.headerRows === undefined ? 1 : Number(options.headerRows);
        timeoutMs = options.timeoutMs === undefined ? 12000 : Number(options.timeoutMs);
        if (options.query !== undefined && typeof options.query !== "string") {
          throw sourceError("Запрос Google Visualization должен быть строкой.");
        }
        query = options.query === undefined ? "" : options.query.trim();
        if (!Number.isSafeInteger(headerRows) || headerRows < 0) {
          throw sourceError("Число строк заголовка должно быть целым неотрицательным числом.");
        }
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) {
          throw sourceError("Время ожидания должно быть от 1 до 120 000 миллисекунд.");
        }
      } catch (error) {
        reject(error);
        return;
      }

      const requestId = ++sequence;
      const key = "request_" + requestId;
      const script = global.document.createElement("script");
      const url = new URL("https://docs.google.com/spreadsheets/d/" + source.id + "/gviz/tq");
      url.searchParams.set("gid", source.gid);
      url.searchParams.set("range", range);
      url.searchParams.set("headers", String(headerRows));
      if (query) url.searchParams.set("tq", query);
      url.searchParams.set("tqx", "out:json;reqId:" + requestId + ";responseHandler:" + callbackRoot + "." + key);
      // A fresh URL avoids reusing an old response during a live session.
      url.searchParams.set("_", Date.now().toString(36) + "_" + requestId);
      script.src = url.href;
      script.async = true;
      let settled = false;
      let timer;

      function finish(error, data) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        script.onerror = null;
        script.onload = null;
        if (script.parentNode) script.parentNode.removeChild(script);
        // This request owns only its own callback; other requests stay active.
        if (activeCallbacks[key] === handleResponse) delete activeCallbacks[key];
        if (error) reject(error);
        else resolve(data);
      }

      function handleResponse(response) {
        if (settled) return;
        try {
          finish(null, normalizeResponse(response));
        } catch (error) {
          finish(error);
        }
      }

      activeCallbacks[key] = handleResponse;
      script.onerror = () => finish(sourceError("Не удалось загрузить Google Таблицу. Проверьте интернет, ссылку и доступ для чтения."));
      script.onload = () => {
        if (!settled) finish(sourceError("Google не передал данные таблицы. Проверьте ссылку и доступ для чтения."));
      };
      timer = global.setTimeout(() => finish(sourceError("Google Таблица не ответила вовремя. Данные будут запрошены снова при следующем обновлении.")), timeoutMs);
      try {
        const parent = global.document.head || global.document.body || global.document.documentElement;
        parent.appendChild(script);
      } catch (error) {
        finish(sourceError("Не удалось начать загрузку Google Таблицы: " + error.message));
      }
    });
  }

  global.TimingSheets = Object.freeze({ parseSource, read });
})(window);
