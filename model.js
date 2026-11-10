/* The October competition is a section of the source sheet, not a whole tab. */
(function (global) {
  "use strict";

  const MONTH_BANNER = /^(?:ЯНВАРЬ|ФЕВРАЛЬ|МАРТ|АПРЕЛЬ|МАЙ|ИЮНЬ|ИЮЛЬ|АВГУСТ|СЕНТЯБРЬ|ОКТЯБРЬ|НОЯБРЬ|ДЕКАБРЬ)\s*[-–—]/iu;
  const OCTOBER_BANNER = /^ОКТЯБРЬ(?:\s|[-–—]|$)/iu;
  const MARKER = /^(?:ПРОВОДИМ\s+СЕЙЧАС|ЗАВЕРШЕНО|СКОРО|СОБЫТИЕ|ФИО)(?:\s|$)/iu;
  const text = (value) => value === null || value === undefined ? "" : String(value);
  const normalized = (value) => text(value).trim().replace(/\s+/g, " ").toUpperCase();

  // Return integer milliseconds so both ranking and displayed gaps use the
  // same precision. A source cell may contain seconds or a formatted lap.
  function parseTime(value) {
    const input = text(value).trim().replace(",", ".");
    if (!input) return null;
    let seconds;
    if (/^\d+(?:\.\d+)?$/.test(input)) {
      seconds = Number(input);
    } else {
      const match = input.match(/^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/);
      if (!match) return null;
      const hours = Number(match[1] || 0);
      const minutes = Number(match[2]);
      const lapSeconds = Number(match[3]);
      if (lapSeconds >= 60 || (match[1] !== undefined && minutes >= 60)) return null;
      seconds = hours * 3600 + minutes * 60 + lapSeconds;
    }
    const milliseconds = Math.round(seconds * 1000);
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : null;
  }

  function october(data) {
    if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) {
      throw new Error("Нет данных Google Таблицы для октябрьского этапа.");
    }
    const indices = ["A", "G", "J"].map((id) =>
      data.columns.findIndex((column) => column && normalized(column.id) === id));
    if (indices.some((index) => index < 0)) {
      throw new Error("В данных таблицы не найдены столбцы A (ФИО), G (Время) и J (Баллы).");
    }
    const [nameIndex, timeIndex, pointsIndex] = indices;
    // Google drops minority text values from a typed column, including the
    // header itself. Known column IDs and types let us recognize that case.
    const typedTimeColumn = ["number", "timeofday", "date", "datetime"].includes(data.columns[timeIndex].type);
    const typedPointsColumn = data.columns[pointsIndex].type === "number";
    const cell = (row, index) => Array.isArray(row) ? text(row[index]) : "";
    const nameAt = (index) => cell(data.rows[index], nameIndex).trim();
    const start = data.rows.findIndex((_, index) => OCTOBER_BANNER.test(nameAt(index)));
    if (start < 0) {
      throw new Error("В таблице не найден раздел «ОКТЯБРЬ». Проверьте лист и диапазон.");
    }
    let end = data.rows.length;
    for (let index = start + 1; index < data.rows.length; index += 1) {
      if (MONTH_BANNER.test(nameAt(index))) {
        end = index;
        break;
      }
    }

    let header = -1;
    for (let index = start + 1; index < end; index += 1) {
      const row = data.rows[index];
      const timeHeader = normalized(cell(row, timeIndex));
      const pointsHeader = normalized(cell(row, pointsIndex));
      if (normalized(cell(row, nameIndex)) === "ФИО" &&
          (timeHeader === "ВРЕМЯ" || (timeHeader === "" && typedTimeColumn)) &&
          (pointsHeader === "БАЛЛЫ" || (pointsHeader === "" && typedPointsColumn))) {
        header = index;
        break;
      }
    }
    if (header < 0) {
      throw new Error("В разделе «ОКТЯБРЬ» не найдены заголовки «ФИО», «Время», «Баллы» в столбцах A, G, J.");
    }

    const metadata = [];
    for (let index = start + 1; index < header; index += 1) {
      const name = nameAt(index);
      if (name && !MARKER.test(name)) metadata.push(name);
    }
    const car = metadata.length >= 2 ? metadata[metadata.length - 2] : "";
    const track = metadata.length >= 1 ? metadata[metadata.length - 1] : "";
    const participants = [];
    for (let index = header + 1; index < end; index += 1) {
      const row = data.rows[index];
      const name = nameAt(index);
      if (!name || MARKER.test(name)) continue;
      const time = cell(row, timeIndex).trim();
      participants.push({
        name,
        time: time || "—",
        milliseconds: parseTime(time),
        points: cell(row, pointsIndex),
        order: index
      });
    }
    return rankParticipants(participants, car, track);
  }

  function rankParticipants(participants, car, track) {
    participants.sort((left, right) => {
      if (left.milliseconds === null && right.milliseconds === null) return left.order - right.order;
      if (left.milliseconds === null) return 1;
      if (right.milliseconds === null) return -1;
      return left.milliseconds - right.milliseconds || left.order - right.order;
    });

    const leader = participants.find((participant) => participant.milliseconds !== null);
    let previousMilliseconds = null;
    let previousRank = "—";
    const rows = participants.map((participant, index) => {
      let rank = "—";
      let gap = "—";
      if (participant.milliseconds !== null) {
        rank = participant.milliseconds === previousMilliseconds ? previousRank : String(index + 1);
        if (index > 0) {
          gap = "+" + ((participant.milliseconds - leader.milliseconds) / 1000).toFixed(3);
        }
        previousMilliseconds = participant.milliseconds;
        previousRank = rank;
      }
      return [rank, participant.name, participant.time, gap, participant.points];
    });

    return {
      columns: [
        { id: "place", label: "Место", type: "string" },
        { id: "participant", label: "Участник", type: "string" },
        { id: "best-time", label: "Лучшее время", type: "string" },
        { id: "gap", label: "От лидера", type: "string" },
        { id: "points", label: "Баллы", type: "string" }
      ],
      rows,
      car,
      track,
      participants: participants.length,
      bestTime: leader ? leader.time : "—"
    };
  }


  function november(data) {
    const col = id => data.columns.findIndex(c => c.id === id);
    const a = col("A");
    const value = (r, c) => text(data.rows[r]?.[c]).trim();
    const start = data.rows.findIndex((r, i) => /^НОЯБРЬ(?:\s|[-–—]|$)/iu.test(value(i, a)));
    if (start < 0) throw new Error("В диапазоне таблицы не найден раздел «НОЯБРЬ».");
    let end = data.rows.length;
    for (let r = start + 1; r < end; r++) {
      if (MONTH_BANNER.test(value(r, a))) { end = r; break; }
    }
    const weeks = [];
    for (const [number, ids] of [[1,["A","B","C"]],[2,["D","E","F"]],[3,["G","H","I"]],[4,["J","K","L"]]]) {
      const [n,t,p] = ids.map(col);
      if ([n,t,p].some(i => i < 0)) throw new Error("Не найдены колонки недели " + number);
      let weekRow = -1, header = -1;
      for (let r = start + 1; r < end; r++) {
        if (normalized(value(r,n)) === "НЕДЕЛЯ " + number) weekRow = r;
        if (weekRow >= 0 && normalized(value(r,n)) === "ФИО") { header = r; break; }
      }
      if (header < 0) throw new Error("Не найден заголовок недели " + number);
      for (const [index,label,types] of [[t,"ВРЕМЯ",["number","timeofday","datetime","date"]],[p,"БАЛЛЫ",["number"]]]) {
        const h = normalized(value(header,index));
        if (h !== label && !(h === "" && types.includes(data.columns[index].type))) throw new Error("Не распознаны заголовки недели " + number);
      }
      const metadata = [];
      for(let r = weekRow + 1; r < header; r++) if(value(r,n)) metadata.push(value(r,n));
      const participants = [];
      let status = "";
      for(let r = header + 1; r < end; r++) {
        const name = value(r,n);
        if (/^(ПРОВОДИМ\s+СЕЙЧАС|ЗАВЕРШЕНО|СКОРО)$/iu.test(name)) { status = normalized(name); break; }
        if (!name || MARKER.test(name)) continue;
        const time = value(r,t);
        participants.push({name,time:time || "—",milliseconds:parseTime(time),points:value(r,p),order:r});
      }
      weeks.push(Object.assign(rankParticipants(participants, metadata[0] || "", metadata[1] || ""), {number,status}));
    }
    return {weeks};
  }

  global.TimingModel = Object.freeze({ october, november, parseTime });
})(window);
