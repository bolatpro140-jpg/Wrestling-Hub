const dataFiles = {
  wrestlers: "data/wrestlers.json",
  championships: "data/championships.json",
  factions: "data/factions.json",
  events: "data/events.json",
  videos: "data/videos.json"
};

async function fetchJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`Ожидался JSON-массив в ${path}`);
  }

  return data;
}

async function fetchSourceStatus() {
  const response = await fetch("data/source-status.json");
  if (!response.ok) {
    throw new Error(`Не удалось загрузить статус источников: ${response.status}`);
  }

  const sourceStatus = await response.json();
  if (!sourceStatus || !Array.isArray(sourceStatus.sources)) {
    throw new Error("Некорректный файл статуса источников");
  }

  return sourceStatus;
}

function validateSource(record, label) {
  if (!record || typeof record.sourceUrl !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.verifiedAt ?? "")) {
    throw new Error(`${label}: добавь sourceUrl и дату verifiedAt в формате YYYY-MM-DD`);
  }

  try {
    if (new URL(record.sourceUrl).protocol !== "https:") {
      throw new Error("Источник должен использовать HTTPS");
    }
  } catch {
    throw new Error(`${label}: sourceUrl должен быть действительной HTTPS-ссылкой`);
  }
}

function validateRecords(data) {
  Object.entries(data).forEach(([name, records]) => {
    records.forEach((record, index) => {
      const label = `${name}[${index}]`;
      validateSource(record, label);

      if (name === "championships") {
        record.reigns.forEach((reign, reignIndex) => {
          validateSource(reign, `${label}.reigns[${reignIndex}]`);
        });
      }

      if (name === "events") {
        record.matches.forEach((match, matchIndex) => {
          const matchLabel = `${label}.matches[${matchIndex}]`;
          validateSource(match, matchLabel);
          if (record.status === "upcoming" && !["confirmed", "rumor"].includes(match.confirmationStatus)) {
            throw new Error(`${matchLabel}: у будущего матча укажи confirmed или rumor`);
          }
        });
      }
    });
  });
}

export async function loadSiteData() {
  const [entries, sourceStatus] = await Promise.all([
    Promise.all(
      Object.entries(dataFiles).map(async ([name, path]) => [name, await fetchJson(path)])
    ),
    fetchSourceStatus()
  ]);

  const data = Object.fromEntries(entries);
  validateRecords(data);
  return { ...data, sourceStatus };
}
