/* Настройки сайта. После изменения файла загрузите его в репозиторий GitHub. */
window.TIMING_CONFIG = {
  title: "TIME ATTACK",
  description: "Ноябрь · Месяц Porsche",
  eventDetails: "",
  sheetUrl: "https://docs.google.com/spreadsheets/d/1jQopfPS_wbyMdQizfZ2hRbngomjSDtJutuNk_Pu9YJ4/edit?gid=0#gid=0",
  gid: "", // Пусто = вкладка из ссылки. Можно указать gid отдельно, например «0».
  range: "A52:L1000", // Ноябрь начинается со строки 52. При переносе блока обновите начало диапазона.
  query: "select A,B,C,D,E,F,G,H,I,J,K,L", // Четыре недельных зачёта: ФИО, время и баллы.
  headerRows: 0,
  transform: "november",
  refreshSeconds: 10,
  timeZone: "Europe/Moscow",
  timeZoneLabel: "МСК",
  footerNote: "Позиции и отставание рассчитаны по лучшему времени. Баллы — из протокола организатора.",
  // Названия столбцов, которые содержат имя участника и статус. Необязательно.
  participantHeaders: ["Участник", "ФИО", "Имя", "Спортсмен", "Пилот", "Participant", "Name", "Driver"],
  statusHeaders: ["Статус", "Status"]
};
