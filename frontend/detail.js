import {
  fetchAdminContent,
  fetchCatalog,
  fetchContent,
  fetchFavoriteIds,
  addFavorite,
  removeFavorite,
  getToken,
  mediaUrl,
  trackView,
} from "./api.js";
import { formatDate, formatNumber, genreLabel, kindLabel, localized, t } from "./i18n.js";
import {
  $,
  el,
  emptyState,
  errorState,
  icon,
  initShell,
  openAuthModal,
  openModal,
  openPlayer,
  resolvePlayback,
  safeImage,
  shelf,
  toast,
} from "./ui.js";

const params = new URLSearchParams(window.location.search);
const previewMode = params.get("preview") === "1";
const rawId = params.get("id") || "";
const identifier = previewMode
  ? /^\d+$/.test(rawId)
    ? rawId
    : ""
  : params.get("slug") || rawId;
const shell = initShell({ active: "detail.html" });

const loadingHost = $("#detail-loading");
const root = $("#detail-root");
const favoriteIds = new Set();
let content = null;
let activeSeasonId = null;
let related = [];
let relatedHost = null;
let viewTracked = false;

function genreHref(genre) {
  const page = content?.kind === "series" ? "series.html" : "movies.html";
  return `${page}?genre=${encodeURIComponent(genre)}`;
}

function playableEpisode(item) {
  for (const season of item.seasons || []) {
    for (const episode of season.episodes || []) {
      if (episode.playback) return { season, episode };
    }
  }
  return null;
}

function openContentPlayer(item) {
  if (!item.playback) return;
  if (!previewMode) trackView(item.id);
  openPlayer({
    title: localized(item),
    subtitle: `${item.year || ""} · ${kindLabel(item.kind)}`,
    url: resolvePlayback(item.playback),
    poster: safeImage(item.backdrop_url || item.poster_url),
  });
}

function openEpisodePlayer(episode, season) {
  if (!episode.playback) return;
  openPlayer({
    title: episode.title || t("episode_n", { n: episode.number }),
    subtitle: `${t("season")} ${season.number} · ${t("episode_n", { n: episode.number })}`,
    url: resolvePlayback(episode.playback),
    poster: safeImage(content.backdrop_url || content.poster_url),
  });
}

function youtubeEmbed(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    return "";
  }
  return "";
}

function openTrailer() {
  if (!content?.trailer_url) return;
  const embed = youtubeEmbed(content.trailer_url);
  if (embed) {
    const frame = el("iframe", {
      class: "trailer-frame",
      src: embed,
      title: `${localized(content)} — ${t("trailer")}`,
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
      allowfullscreen: true,
      loading: "lazy",
    });
    openModal({
      title: "",
      body: el("div", { class: "player" }, el("h3", { class: "player__title", text: localized(content) }), frame),
      size: "lg",
      className: "modal-overlay--player",
    });
    return;
  }
  openPlayer({
    title: localized(content),
    subtitle: t("trailer"),
    url: content.trailer_url,
    poster: safeImage(content.backdrop_url || content.poster_url),
  });
}

function paintFavorite(button) {
  if (!button) return;
  const active = favoriteIds.has(content?.id);
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.replaceChildren(
    icon(active ? "heartFilled" : "heart"),
    el("span", { text: active ? t("remove_favorite") : t("add_favorite") }),
  );
}

async function refreshFavorites() {
  if (!getToken() || !content || previewMode) return;
  try {
    const ids = await fetchFavoriteIds();
    favoriteIds.clear();
    ids.forEach((id) => favoriteIds.add(id));
  } catch {
    /* Session may have expired; the button still prompts on click. */
  }
}

async function toggleFavorite(button) {
  if (!content || previewMode) return;
  if (!getToken()) {
    openAuthModal({
      message: t("favorite_requires_auth"),
      onSuccess: async () => {
        await refreshFavorites();
        paintFavorite(button);
        await toggleFavorite(button);
      },
    });
    return;
  }
  button.disabled = true;
  try {
    if (favoriteIds.has(content.id)) {
      await removeFavorite(content.id);
      favoriteIds.delete(content.id);
      toast(t("favorite_removed"));
    } else {
      await addFavorite(content.id);
      favoriteIds.add(content.id);
      toast(t("favorite_added"), "success");
    }
  } catch (error) {
    if (error.status === 401) {
      openAuthModal({ message: t("session_expired"), onSuccess: async () => refreshFavorites() });
    } else {
      toast(error.message || t("error_generic"), "error");
    }
  } finally {
    button.disabled = false;
    paintFavorite(button);
  }
}

async function shareContent() {
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: localized(content), url });
      return;
    } catch {
      /* Fall back to clipboard. */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t("share_copied"), "success");
  } catch {
    toast(t("share_failed"), "error");
  }
}

function actionButton(label, iconName, { variant = "", disabled = false, title = "", onClick } = {}) {
  return el(
    "button",
    {
      class: `btn ${variant}`.trim(),
      type: "button",
      disabled,
      title: title || undefined,
      onclick: onClick,
    },
    icon(iconName),
    el("span", { text: label }),
  );
}

function buildHero() {
  const backdropSource = safeImage(content.backdrop_url || content.poster_url, "assets/backdrops/nur.webp");
  const hero = el("section", { class: "detail-hero" });
  const backdrop = el(
    "div",
    { class: "detail-backdrop" },
    el("img", { src: backdropSource, alt: "", loading: "eager" }),
  );
  const layout = el("div", { class: "detail-content" });
  const poster = el(
    "div",
    { class: "detail-poster" },
    el("img", { src: safeImage(content.poster_url), alt: "", loading: "eager" }),
  );
  const info = el("div", { class: "detail-info" });

  const back = el(
    "button",
    {
      class: "detail-back",
      type: "button",
      onclick: () => {
        if (window.history.length > 1) window.history.back();
        else window.location.href = content.kind === "series" ? "series.html" : "movies.html";
      },
    },
    icon("arrowLeft", "icon icon--sm"),
    el("span", { text: t("detail_back") }),
  );

  const kicker = el("div", { class: "detail-kicker" });
  if (previewMode) kicker.append(el("span", { class: "badge badge--warning", text: t("preview_badge") }));
  if (content.is_demo) kicker.append(el("span", { class: "badge badge--danger", text: t("demo_badge") }));
  kicker.append(el("span", { class: "badge badge--muted", text: kindLabel(content.kind) }));
  if (content.age_rating) kicker.append(el("span", { class: "badge badge--muted", text: content.age_rating }));

  const meta = el("div", { class: "detail-meta" });
  meta.append(el("span", { text: String(content.year || "—") }));
  if (content.country) {
    meta.append(el("span", { class: "dot" }));
    meta.append(el("span", { text: content.country }));
  }
  if (content.duration_minutes) {
    meta.append(el("span", { class: "dot" }));
    meta.append(el("span", { text: `${content.duration_minutes} ${t("minutes")}` }));
  }
  meta.append(el("span", { class: "dot" }));
  meta.append(el("span", { text: t("content_views") + ": " + formatNumber(content.views_count || 0), attrs: { id: "detail-views-value" } }));

  const genres = el("div", { class: "detail-genres" });
  for (const genre of content.genres || []) {
    genres.append(el("a", { href: genreHref(genre), text: genreLabel(genre) }));
  }

  const target = playableEpisode(content);
  const playable = Boolean(content.playback || target);
  const actions = el("div", { class: "detail-actions" });
  if (playable) {
    actions.append(
      actionButton(t("watch_now"), "play", {
        variant: "btn--red",
        onClick: () => {
          if (content.playback) openContentPlayer(content);
          else if (target) openEpisodePlayer(target.episode, target.season);
        },
      }),
    );
  } else {
    actions.append(
      actionButton(t("play_unavailable"), "play", {
        variant: "btn--red",
        disabled: true,
        title: t("playback_unavailable_hint"),
      }),
    );
  }

  if (content.trailer_url) {
    actions.append(actionButton(t("trailer"), "play", { variant: "btn--outline", onClick: openTrailer }));
  } else {
    actions.append(
      actionButton(t("trailer_unavailable"), "play", {
        variant: "btn--outline",
        disabled: true,
        title: t("trailer_unavailable"),
      }),
    );
  }

  if (!previewMode) {
    const favoriteButton = actionButton(t("add_favorite"), "heart", {
      variant: "btn--outline",
      onClick: () => toggleFavorite(favoriteButton),
    });
    paintFavorite(favoriteButton);
    actions.append(favoriteButton);
  }
  actions.append(
    actionButton(t("share"), "share", { variant: "btn--ghost", onClick: shareContent }),
  );

  info.append(
    back,
    kicker,
    el("h1", { class: "detail-title", text: localized(content) }),
    content.original_title && content.original_title !== content.title
      ? el("p", { class: "detail-original", text: content.original_title })
      : null,
    meta,
    content.genres?.length ? genres : null,
    el("p", { class: "detail-desc", text: localized(content, "description") || t("playback_unavailable_hint") }),
    actions,
    !playable
      ? el(
          "p",
          { class: "playback-hint" },
          icon("info", "icon icon--sm"),
          el("span", { text: t("playback_unavailable_hint") }),
        )
      : null,
  );

  layout.append(poster, info);
  hero.append(backdrop, layout);
  return hero;
}

function seasonLabel(season) {
  return season.title || `${t("season")} ${season.number}`;
}

function buildEpisodes(season) {
  const wrap = el("div", { class: "episode-list" });
  if (!season || !season.episodes?.length) {
    wrap.append(
      el(
        "div",
        { class: "detail-panel", style: "text-align:center; color: var(--muted); font-size: .84rem;" },
        el("p", { style: "margin: 0 0 4px; color: var(--text); font-weight: 600;", text: t("no_episodes") }),
        el("p", { style: "margin: 0;", text: t("no_episodes_hint") }),
      ),
    );
    return wrap;
  }
  for (const episode of season.episodes) {
    const playButton = el(
      "button",
      {
        class: "episode-row__play",
        type: "button",
        disabled: !episode.playback,
        title: episode.playback ? t("play_episode") : t("play_unavailable"),
        attrs: { "aria-label": t("play_episode") },
        onclick: () => openEpisodePlayer(episode, season),
      },
      icon("play"),
    );
    wrap.append(
      el(
        "div",
        { class: "episode-row" },
        el("span", { class: "episode-row__num", text: String(episode.number).padStart(2, "0") }),
        el(
          "div",
          { class: "episode-row__info" },
          el("h3", {
            class: "episode-row__title",
            text: episode.title || t("episode_n", { n: episode.number }),
          }),
          el(
            "p",
            { class: "episode-row__meta" },
            episode.duration_minutes ? `${episode.duration_minutes} ${t("minutes")}` : t("episode_duration") + ": —",
            episode.description ? ` · ${episode.description}` : "",
          ),
        ),
        playButton,
      ),
    );
  }
  return wrap;
}

function buildSeasonsSection() {
  const seasons = (content.seasons || []).slice().sort((a, b) => a.number - b.number);
  if (!seasons.length) {
    return el(
      "section",
      { class: "detail-section" },
      el("h2", { class: "detail-section__title", text: t("episodes") }),
      el(
        "div",
        { class: "detail-panel" },
        el("p", { style: "margin: 0 0 4px; color: var(--text); font-weight: 600;", text: t("no_episodes") }),
        el("p", { style: "margin: 0; color: var(--muted); font-size: .82rem;", text: t("no_episodes_hint") }),
      ),
    );
  }
  if (!seasons.some((season) => season.id === activeSeasonId)) {
    activeSeasonId = seasons[0].id;
  }
  const active = seasons.find((season) => season.id === activeSeasonId) || seasons[0];
  const tabs = el(
    "div",
    { class: "season-tabs", attrs: { role: "tablist" } },
    ...seasons.map((season) =>
      el("button", {
        class: `season-tab ${season.id === active.id ? "is-active" : ""}`,
        type: "button",
        role: "tab",
        attrs: { "aria-selected": season.id === active.id ? "true" : "false" },
        text: seasonLabel(season),
        onclick: () => {
          activeSeasonId = season.id;
          renderContent();
        },
      }),
    ),
  );
  return el(
    "section",
    { class: "detail-section" },
    el(
      "div",
      { class: "detail-section__head" },
      el("h2", { class: "detail-section__title", text: t("episodes") }),
      el("span", { class: "badge badge--muted", text: t("seasons") + ": " + seasons.length }),
    ),
    tabs,
    buildEpisodes(active),
  );
}

function buildOverview() {
  const description = localized(content, "description");
  return el(
    "section",
    { class: "detail-section" },
    el("h2", { class: "detail-section__title", text: t("detail_overview") }),
    el(
      "div",
      { class: "detail-panel" },
      el("p", { style: "margin: 0; color: var(--muted); line-height: 1.7; font-size: .9rem;", text: description || t("playback_unavailable_hint") }),
      content.license_note
        ? el(
            "div",
            { class: "license-box" },
            el("strong", { text: t("license_note") }),
            el("span", { text: content.license_note }),
          )
        : null,
    ),
  );
}

function buildSide() {
  const meta = el("dl", { class: "meta-list" });
  const rows = [
    [t("year"), content.year || "—"],
    [t("country"), content.country || "—"],
    [t("type"), kindLabel(content.kind)],
    [t("genres"), (content.genres || []).map((genre) => genreLabel(genre)).join(", ") || "—"],
    [t("age"), content.age_rating || "—"],
    [t("duration_label"), content.duration_minutes ? `${content.duration_minutes} ${t("minutes")}` : "—"],
    [t("content_added"), formatDate(content.created_at)],
    [t("content_views"), formatNumber(content.views_count || 0)],
  ];
  for (const [label, value] of rows) {
    meta.append(el("div", {}, el("dt", { text: label }), el("dd", { text: String(value) })));
  }
  const side = el("aside", { class: "detail-side" });
  side.append(
    el(
      "div",
      { class: "detail-panel" },
      el("h2", { class: "detail-side-title", text: t("detail_meta") }),
      meta,
    ),
  );
  const notes = el("div", { class: "detail-panel" });
  notes.append(el("h2", { class: "detail-side-title", text: t("footer_rights") }));
  if (content.is_demo) {
    notes.append(el("p", { class: "detail-side-text", style: "margin-bottom: 10px;", text: t("demo_notice_detail") }));
  }
  notes.append(el("p", { class: "detail-side-text", text: t("video_rights_notice") }));
  if (content.license_note) {
    notes.append(
      el(
        "div",
        { class: "license-box" },
        el("strong", { text: t("license_note") }),
        el("span", { text: content.license_note }),
      ),
    );
  }
  side.append(notes);
  return side;
}

function renderRelated() {
  if (!relatedHost) return;
  if (!related.length) {
    relatedHost.replaceChildren();
    return;
  }
  const node = shelf({
    title: t("similar_title"),
    items: related,
    viewAllHref: content.genres?.length ? genreHref(content.genres[0]) : "browse.html",
  });
  relatedHost.replaceChildren(node);
}

function renderContent() {
  if (!content) return;
  relatedHost = el("div", { class: "browse-content", style: "padding-top: 14px;" });
  const body = el("div", { class: "detail-body" });
  const mainColumn = el("div", {});
  if (previewMode) {
    mainColumn.append(
      el(
        "div",
        { class: "notice-bar" },
        icon("warning", "icon"),
        el("span", {}, el("strong", { text: t("preview_badge") }), " — ", t("preview_hint")),
      ),
    );
  }
  mainColumn.append(buildOverview());
  if (content.kind === "series") mainColumn.append(buildSeasonsSection());
  body.append(mainColumn, buildSide());
  root.replaceChildren(buildHero(), body, relatedHost);
  relatedHost = root.querySelector(".browse-content:last-child");
  renderRelated();
  document.title = `KINORA — ${localized(content)}`;
  const desc = localized(content, "description");
  if (desc) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.append(meta);
    }
    meta.content = desc.slice(0, 160);
  }
}

function renderUnavailable({ title, message, actionLabel, onAction, actionHref } = {}) {
  loadingHost.hidden = true;
  root.hidden = false;
  const holder = el("div", { class: "browse-content", style: "padding-top: 40px;" });
  root.replaceChildren(holder);
  document.title = `KINORA — ${title || t("not_found_title")}`;
  emptyState(holder, {
    title: title || t("not_found_title"),
    text: message || t("not_found_body"),
    actionLabel: actionLabel || t("go_home"),
    actionHref: onAction ? undefined : actionHref || "index.html",
    onAction,
    iconName: "warning",
  });
}

async function loadFavorites() {
  if (!getToken() || previewMode) return;
  try {
    const ids = await fetchFavoriteIds();
    ids.forEach((id) => favoriteIds.add(id));
    if (content) renderContent();
  } catch {
    /* Ignore: the user may not have a valid session. */
  }
}

async function loadRelated() {
  try {
    const genre = content.genres?.[0];
    const data = await fetchCatalog({
      genre,
      sort: "popular",
      page_size: 9,
    });
    related = (data.items || []).filter((item) => item.id !== content.id).slice(0, 7);
    renderRelated();
  } catch {
    related = [];
    renderRelated();
  }
}

async function loadContent() {
  if (!identifier) {
    renderUnavailable();
    return;
  }
  try {
    if (previewMode) {
      if (!getToken()) {
        loadingHost.hidden = true;
        renderUnavailable({
          title: t("admin_login_title"),
          message: t("admin_login_body"),
          actionLabel: t("sign_in"),
          onAction: () => openAuthModal({ onSuccess: () => window.location.reload() }),
        });
        return;
      }
      content = await fetchAdminContent(identifier);
    } else {
      content = await fetchContent(identifier);
    }
    loadingHost.hidden = true;
    root.hidden = false;
    await loadFavorites();
    renderContent();
    if (!previewMode) {
      loadRelated();
      if (!viewTracked && content.is_published) {
        viewTracked = true;
        trackView(content.id).then((result) => {
          if (result?.counted) {
            content.views_count = result.views_count;
            const value = $("#detail-views-value");
            if (value) value.textContent = `${t("content_views")}: ${formatNumber(result.views_count)}`;
          }
        });
      }
    }
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      renderUnavailable({
        title: t("admin_no_access"),
        message: t("admin_no_access_body"),
        actionLabel: t("sign_in"),
        onAction: () => openAuthModal({ onSuccess: () => window.location.reload() }),
      });
      return;
    }
    if (error.status === 404) {
      renderUnavailable();
      return;
    }
    loadingHost.hidden = true;
    root.hidden = false;
    root.replaceChildren(el("div", { class: "browse-content", style: "padding-top: 40px;" }));
    errorState(root.firstElementChild, error.message, () => window.location.reload());
  }
}

window.addEventListener("kinora:auth-changed", async (event) => {
  if (!content) return;
  if (event.detail) {
    await loadFavorites();
    renderContent();
  } else {
    favoriteIds.clear();
    renderContent();
  }
});

window.addEventListener("kinora:lang", () => {
  if (content) renderContent();
  renderRelated();
  if (!content) {
    /* Static empty state text is re-applied by i18n; no action needed. */
  }
});

loadContent();
