/* Настройки сайта. После изменения файла загрузите его в репозиторий GitHub. */
window.TIMING_CONFIG = {
  title: "TIME ATTACK",
  description: "Октябрь · Porsche 911 GT3 R · Red Bull Ring GP",
  eventDetails: "RSS GT-M Protech P92 F6 / Red Bull Ring GP",
  sheetUrl: "https://docs.google.com/spreadsheets/d/1jQopfPS_wbyMdQizfZ2hRbngomjSDtJutuNk_Pu9YJ4/edit?gid=0#gid=0",
  gid: "", // Пусто = вкладка из ссылки. Можно указать gid отдельно, например «0».
  range: "A1:J1000", // Читаем блоки месяцев; на сайте показывается только октябрь.
  query: "select A,G,J", // Только ФИО, время и баллы. Другие колонки не загружаются.
  headerRows: 0,
  transform: "october",
  refreshSeconds: 10,
  timeZone: "Europe/Moscow",
  timeZoneLabel: "МСК",
  footerNote: "Позиции и отставание рассчитаны по лучшему времени. Баллы — из протокола организатора.",
  // Названия столбцов, которые содержат имя участника и статус. Необязательно.
  participantHeaders: ["Участник", "ФИО", "Имя", "Спортсмен", "Пилот", "Participant", "Name", "Driver"],
  statusHeaders: ["Статус", "Status"]
};
