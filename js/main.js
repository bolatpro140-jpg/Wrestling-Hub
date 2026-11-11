import { loadSiteData } from "./data.js";

const promotionNames = {
  wwe: "WWE",
  aew: "AEW",
  njpw: "NJPW"
};

const statusNames = {
  active: "Активен",
  "part-time": "Выступает время от времени",
  inactive: "Не выступает",
  retired: "Завершил карьеру"
};

const favoritesStorageKey = "wrestlingHubFavorites";
const recentStorageKey = "wrestlingHubRecentlyViewed";
const themeStorageKey = "wrestlingHubTheme";
let favoriteIds = new Set(readStoredIds(favoritesStorageKey));
let siteData;

function readStoredValue(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function readStoredIds(key) {
  try {
    const storedIds = JSON.parse(readStoredValue(key, "[]"));
    return Array.isArray(storedIds)
      ? storedIds.filter((id) => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function updateThemeButton(theme) {
  const button = document.getElementById("theme-toggle");
  if (!button) return;

  button.textContent = theme === "dark" ? "Тёмная тема" : "Светлая тема";
  button.setAttribute("aria-pressed", String(theme === "dark"));
}

function initializeTheme() {
  const storedTheme = readStoredValue(themeStorageKey, "");
  const savedTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : null;
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;

  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  updateThemeButton(savedTheme ?? systemTheme);

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme || systemTheme;
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    writeStoredValue(themeStorageKey, nextTheme);
    updateThemeButton(nextTheme);
  });
}

function createElement(tagName, text, className) {
  const element = document.createElement(tagName);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderSourceStatus(sourceStatus) {
  const main = document.querySelector("main");
  if (!main || !sourceStatus) return;

  const notice = createElement("aside", undefined, "source-status");
  notice.setAttribute("role", "status");
  const heading = createElement("strong", "Актуальные данные не подтверждены");
  const message = createElement("p", sourceStatus.message);
  const checkedAt = createElement("p", `Последняя проверка: ${formatDate(sourceStatus.checkedAt)}`);
  const sourceList = createElement("ul");

  sourceStatus.sources.forEach((source) => {
    const item = createElement("li");
    const link = createElement("a", source.label);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    item.append(link);
    sourceList.append(item);
  });

  notice.append(heading, message, checkedAt, sourceList);
  main.prepend(notice);
}

function replaceList(list, items, renderItem, emptyMessage) {
  if (!list) return;

  list.replaceChildren();
  if (items.length === 0) {
    list.append(createElement("li", emptyMessage));
    return;
  }

  items.forEach((item) => list.append(renderItem(item)));
}

function promotionLabel(promotion) {
  return promotionNames[promotion] ?? promotion.toUpperCase();
}

function formatDate(value) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function findWrestler(data, wrestlerId) {
  return data.wrestlers.find((wrestler) => wrestler.id === wrestlerId);
}

function createWrestlerLink(wrestler) {
  const link = createElement("a", wrestler.name);
  link.href = `wrestler.html?id=${encodeURIComponent(wrestler.id)}`;
  return link;
}

function createSourceLink(record, label = "Официальный источник") {
  if (!record?.sourceUrl) return null;

  const link = createElement("a", label, "source-link");
  link.href = record.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function createWrestlerCard(wrestler) {
  const item = createElement("li", undefined, "wrestler-card");
  const heading = createElement("h2");
  heading.append(createWrestlerLink(wrestler));
  const details = createElement(
    "p",
    `${promotionLabel(wrestler.promotion)} · ${wrestler.brands.join(", ")} · ${statusNames[wrestler.status]}`
  );
  const favoriteButton = createElement(
    "button",
    favoriteIds.has(wrestler.id) ? "Убрать из избранного" : "В избранное",
    "favorite-toggle"
  );
  favoriteButton.type = "button";
  favoriteButton.dataset.favoriteId = wrestler.id;
  favoriteButton.setAttribute("aria-pressed", String(favoriteIds.has(wrestler.id)));
  item.append(heading, details, favoriteButton);
  const sourceLink = createSourceLink(wrestler);
  if (sourceLink) item.append(sourceLink);
  return item;
}

function renderWrestlerCatalog(data) {
  const list = document.getElementById("wrestler-list");
  const form = document.querySelector(".wrestlers-page__filters");
  if (!list || !form) return;

  const search = document.getElementById("wrestler-search");
  const promotionFilter = document.getElementById("promotion-filter");
  const brandFilter = document.getElementById("brand-filter");
  const statusFilter = document.getElementById("status-filter");
  const resultCount = document.getElementById("wrestler-results-count");

  const promotions = [...new Set(data.wrestlers.map((wrestler) => wrestler.promotion))]
    .sort((first, second) => promotionLabel(first).localeCompare(promotionLabel(second), "ru"));
  promotionFilter.replaceChildren(new Option("Все промоушены", ""));
  promotions.forEach((promotion) => {
    promotionFilter.add(new Option(promotionLabel(promotion), promotion));
  });

  function updateBrandOptions() {
    const previousBrand = brandFilter.value;
    const promotion = promotionFilter.value;
    const brands = [...new Set(data.wrestlers
      .filter((wrestler) => !promotion || wrestler.promotion === promotion)
      .flatMap((wrestler) => wrestler.brands))]
      .sort((first, second) => first.localeCompare(second, "ru"));

    brandFilter.replaceChildren(new Option("Все бренды", ""));
    brands.forEach((brand) => brandFilter.add(new Option(brand, brand)));
    brandFilter.value = brands.includes(previousBrand) ? previousBrand : "";
  }

  function renderResults() {
    const query = search.value.trim().toLocaleLowerCase("ru");
    const filteredWrestlers = data.wrestlers
      .filter((wrestler) => wrestler.name.toLocaleLowerCase("ru").includes(query))
      .filter((wrestler) => !promotionFilter.value || wrestler.promotion === promotionFilter.value)
      .filter((wrestler) => !brandFilter.value || wrestler.brands.includes(brandFilter.value))
      .filter((wrestler) => !statusFilter.value || wrestler.status === statusFilter.value)
      .sort((first, second) => first.name.localeCompare(second.name, "ru"));

    replaceList(list, filteredWrestlers, createWrestlerCard, "По вашему запросу ничего не найдено.");
    resultCount.textContent = `Показано: ${filteredWrestlers.length} из ${data.wrestlers.length}`;
  }

  updateBrandOptions();
  renderResults();
  search.addEventListener("input", renderResults);
  brandFilter.addEventListener("change", renderResults);
  statusFilter.addEventListener("change", renderResults);
  promotionFilter.addEventListener("change", () => {
    updateBrandOptions();
    renderResults();
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("reset", () => {
    requestAnimationFrame(() => {
      updateBrandOptions();
      renderResults();
    });
  });
}

function renderWrestlerProfile(data) {
  const profile = document.getElementById("wrestler-profile");
  if (!profile) return;

  const wrestlerId = new URLSearchParams(window.location.search).get("id");
  const wrestler = findWrestler(data, wrestlerId);
  profile.replaceChildren();

  if (!wrestler) {
    profile.append(
      createElement("h1", "Рестлер не найден"),
      createElement("p", "Проверь ссылку или вернись в каталог.")
    );
    return;
  }

  document.title = `${wrestler.name} — Wrestling Hub`;
  const heading = createElement("h1", wrestler.name);
  const details = createElement(
    "p",
    `${promotionLabel(wrestler.promotion)} · ${wrestler.brands.join(", ")} · ${statusNames[wrestler.status]}`
  );
  const favoriteButton = createElement(
    "button",
    favoriteIds.has(wrestler.id) ? "Убрать из избранного" : "В избранное",
    "favorite-toggle"
  );
  favoriteButton.type = "button";
  favoriteButton.dataset.favoriteId = wrestler.id;
  favoriteButton.setAttribute("aria-pressed", String(favoriteIds.has(wrestler.id)));
  profile.append(heading, details, favoriteButton);
  const sourceLink = createSourceLink(wrestler);
  if (sourceLink) profile.append(sourceLink);
  addRecentlyViewed(wrestler.id);
  renderRecentlyViewed(data);

  const titleHistory = data.championships.flatMap((championship) => championship.reigns
    .filter((reign) => reign.championIds.includes(wrestler.id))
    .map((reign) => ({ championship, reign })));
  replaceList(
    document.getElementById("wrestler-championships"),
    titleHistory,
    ({ championship, reign }) => createElement(
      "li",
      `${championship.name}: ${formatDate(reign.startedAt)}${reign.endedAt ? ` – ${formatDate(reign.endedAt)}` : " – по настоящее время"}`
    ),
    "Титульных периодов пока нет."
  );

  const factionHistory = data.factions.flatMap((faction) => faction.memberships
    .filter((membership) => membership.wrestlerId === wrestler.id)
    .map((membership) => ({ faction, membership })));
  replaceList(
    document.getElementById("wrestler-factions"),
    factionHistory,
    ({ faction, membership }) => createElement(
      "li",
      `${faction.name} · ${membership.role}${membership.leftAt ? ` · покинул ${formatDate(membership.leftAt)}` : " · состоит сейчас"}`
    ),
    "В группировках не состоял."
  );
}

function createChampionshipCard(championship, data) {
  const item = createElement("li", undefined, "championship-card");
  const heading = createElement("h2", championship.name);
  const reign = championship.reigns.find((entry) => entry.endedAt === null);
  const championNames = reign?.championIds
    .map((id) => findWrestler(data, id)?.name)
    .filter(Boolean)
    .join(" и ") ?? "Чемпион не указан";
  item.append(heading, createElement("p", championNames));
  item.append(createElement("p", `${promotionLabel(championship.promotion)} · ${championship.brand}`));
  const sourceLink = createSourceLink(championship);
  if (sourceLink) item.append(sourceLink);
  return item;
}

function renderChampionships(data) {
  const activeTitles = data.championships.filter((championship) => championship.status === "active");
  replaceList(
    document.getElementById("current-title-list"),
    activeTitles,
    (championship) => createChampionshipCard(championship, data),
    "Активных титулов пока нет."
  );

  const history = data.championships.flatMap((championship) => championship.reigns
    .filter((reign) => reign.endedAt)
    .map((reign) => ({ championship, reign })));
  replaceList(
    document.getElementById("title-history-list"),
    history,
    ({ championship, reign }) => {
      const champions = reign.championIds
        .map((id) => findWrestler(data, id)?.name)
        .filter(Boolean)
        .join(" и ");
      const item = createElement(
        "li",
        `${championship.name}: ${champions}, ${formatDate(reign.startedAt)} – ${formatDate(reign.endedAt)}`
      );
      const sourceLink = createSourceLink(reign);
      if (sourceLink) item.append(sourceLink);
      return item;
    },
    "Завершенных периодов чемпионства пока нет."
  );
}

function renderFactions(data) {
  replaceList(
    document.getElementById("faction-list"),
    data.factions,
    (faction) => {
      const item = createElement("li", undefined, "faction-card");
      item.append(createElement("h2", faction.name));
      item.append(createElement("p", promotionLabel(faction.promotion)));
      const members = createElement("ul");
      faction.memberships
        .filter((membership) => membership.leftAt === null)
        .forEach((membership) => {
          const wrestler = findWrestler(data, membership.wrestlerId);
          if (!wrestler) return;
          const member = createElement("li");
          member.append(createWrestlerLink(wrestler), document.createTextNode(` · ${membership.role}`));
          members.append(member);
        });
      item.append(members);
      const sourceLink = createSourceLink(faction);
      if (sourceLink) item.append(sourceLink);
      return item;
    },
    "Группировок пока нет."
  );
}

function createEventCard(event) {
  const item = createElement("li", undefined, "event-card");
  const link = createElement("a", event.name);
  link.href = `event.html?id=${encodeURIComponent(event.id)}`;
  item.append(link);
  item.append(createElement("p", `${formatDate(event.startsAt)} · ${event.venue.city}, ${event.venue.country}`));
  item.append(createElement("p", promotionLabel(event.promotion)));
  const sourceLink = createSourceLink(event);
  if (sourceLink) item.append(sourceLink);
  return item;
}

function createVideoCard(video) {
  const item = createElement("li", undefined, "video-card");
  item.append(createElement("h2", video.title));
  item.append(createElement("p", `${promotionLabel(video.promotion)} · официальный канал ${video.channelName}`));
  const link = createElement("a", "Открыть видеоленту на YouTube");
  link.href = video.channelUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  item.append(link);
  return item;
}

function renderVideos(data) {
  replaceList(
    document.getElementById("video-list"),
    data.videos,
    createVideoCard,
    "Официальные видеоленты пока не добавлены."
  );
}

function renderEvents(data) {
  const events = [...data.events].sort((first, second) => first.startsAt.localeCompare(second.startsAt));
  replaceList(
    document.getElementById("upcoming-event-list"),
    events.filter((event) => event.status === "upcoming"),
    createEventCard,
    "Предстоящих событий пока нет."
  );
  replaceList(
    document.getElementById("past-event-list"),
    events.filter((event) => event.status === "completed").reverse(),
    createEventCard,
    "Прошедших событий пока нет."
  );
}

function renderEventDetails(data) {
  const details = document.getElementById("event-details");
  if (!details) return;

  const eventId = new URLSearchParams(window.location.search).get("id");
  const event = data.events.find((entry) => entry.id === eventId);
  details.replaceChildren();

  if (!event) {
    details.append(createElement("h1", "Событие не найдено"));
    return;
  }

  document.title = `${event.name} — Wrestling Hub`;
  details.append(
    createElement("h1", event.name),
    createElement("p", `${promotionLabel(event.promotion)} · ${event.brand}`),
    createElement("p", `${formatDate(event.startsAt)} · ${event.venue.name}, ${event.venue.city}, ${event.venue.country}`)
  );
  const eventSource = createSourceLink(event);
  if (eventSource) details.append(eventSource);

  const matches = event.matches.map((match) => ({ match, event }));
  replaceList(
    document.getElementById("event-matches"),
    matches,
    ({ match, event: currentEvent }) => {
      const item = createElement("li", undefined, "match-card");
      const participants = match.participantIds
        .map((id) => findWrestler(data, id)?.name)
        .filter(Boolean);
      item.append(createElement("p", `Участники: ${participants.join(", ")}`));

      if (currentEvent.status === "upcoming") {
        const isRumor = match.confirmationStatus === "rumor";
        item.append(createElement(
          "p",
          isRumor ? "Слух, не подтверждено WWE" : "Подтверждённый матч",
          `match-card__status${isRumor ? " match-card__status--rumor" : " match-card__status--confirmed"}`
        ));
      } else {
        const winners = match.winnerIds
          .map((id) => findWrestler(data, id)?.name)
          .filter(Boolean);
        item.append(createElement("p", match.result || `Победители: ${winners.join(", ")}`));
      }

      const title = data.championships.find((championship) => championship.id === match.titleId);
      if (title) item.append(createElement("p", `Титул: ${title.name}`));
      const sourceLink = createSourceLink(match);
      if (sourceLink) item.append(sourceLink);
      return item;
    },
    event.status === "upcoming" ? "Матчи еще не объявлены." : "Результаты матчей не добавлены."
  );
}

function renderHome(data) {
  const upcoming = [...data.events]
    .filter((event) => event.status === "upcoming")
    .sort((first, second) => first.startsAt.localeCompare(second.startsAt))
    .slice(0, 3);
  replaceList(document.getElementById("upcoming-events"), upcoming, createEventCard, "Предстоящих событий пока нет.");

  const currentTitles = data.championships.filter((championship) => championship.status === "active");
  replaceList(
    document.getElementById("current-champions"),
    currentTitles,
    (championship) => createChampionshipCard(championship, data),
    "Текущих чемпионов пока нет."
  );

  replaceList(
    document.getElementById("recent-videos"),
    data.videos.slice(0, 3),
    createVideoCard,
    "Официальные видеоленты пока не добавлены."
  );
  renderFavorites(data);
  renderRecentlyViewed(data);
}

function renderFavorites(data) {
  const favorites = [...favoriteIds]
    .map((id) => findWrestler(data, id))
    .filter(Boolean);
  replaceList(
    document.getElementById("favorite-wrestlers"),
    favorites,
    createWrestlerCard,
    "В избранном пока пусто. Добавь рестлера из каталога."
  );
}

function addRecentlyViewed(wrestlerId) {
  const recentlyViewed = readStoredIds(recentStorageKey)
    .filter((id) => id !== wrestlerId);
  recentlyViewed.unshift(wrestlerId);
  writeStoredValue(recentStorageKey, JSON.stringify(recentlyViewed.slice(0, 5)));
}

function renderRecentlyViewed(data) {
  const recentlyViewed = readStoredIds(recentStorageKey)
    .map((id) => findWrestler(data, id))
    .filter(Boolean);
  replaceList(
    document.getElementById("recent-wrestlers"),
    recentlyViewed,
    createWrestlerCard,
    "Просмотренные профили появятся здесь."
  );
}

function initializeFavoriteControls() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-favorite-id]");
    if (!button) return;

    const wrestlerId = button.dataset.favoriteId;
    if (favoriteIds.has(wrestlerId)) {
      favoriteIds.delete(wrestlerId);
    } else {
      favoriteIds.add(wrestlerId);
    }
    writeStoredValue(favoritesStorageKey, JSON.stringify([...favoriteIds]));

    document.querySelectorAll("[data-favorite-id]").forEach((favoriteButton) => {
      const isFavorite = favoriteIds.has(favoriteButton.dataset.favoriteId);
      favoriteButton.textContent = isFavorite ? "Убрать из избранного" : "В избранное";
      favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    });
    if (siteData) renderFavorites(siteData);
  });
}

function showLoadError(error) {
  console.error(error);
  const message = createElement(
    "p",
    "Не удалось загрузить данные. Запусти сайт через локальный веб-сервер и обнови страницу.",
    "data-error"
  );
  message.setAttribute("role", "alert");
  document.querySelector("main")?.prepend(message);
}

loadSiteData()
  .then((data) => {
    siteData = data;
    renderSourceStatus(data.sourceStatus);
    renderHome(data);
    renderWrestlerCatalog(data);
    renderWrestlerProfile(data);
    renderChampionships(data);
    renderFactions(data);
    renderEvents(data);
    renderEventDetails(data);
    renderVideos(data);
  })
  .catch(showLoadError);

initializeTheme();
initializeFavoriteControls();
