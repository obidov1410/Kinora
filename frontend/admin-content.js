/* Admin: catalog content, seasons and episodes. */
import { mediaUrl } from "./api.js";
import { formatNumber, formatDate, t } from "./i18n.js";
import {
  api,
  badge,
  button,
  checkbox,
  confirmAction,
  confirmDialog,
  debounce,
  el,
  field,
  formActions,
  formGrid,
  icon,
  iconButton,
  input,
  inputValue,
  loadingBlock,
  openModal,
  pageHead,
  pagination,
  panel,
  panelHead,
  selectControl,
  statusBadge,
  switchRow,
  table,
  textarea,
  toast,
  uploadField,
  stateBlock,
} from "./admin-ui.js";

const state = {
  page: 1,
  pages: 1,
  total: 0,
  search: "",
  kind: "",
  status: "",
  items: [],
  genres: [],
  loaded: false,
  loading: false,
};

let host = null;
let ctx = null;
let listHost = null;
let searchInput = null;
let requestSeq = 0;

export function renderContent(container, context) {
  host = container;
  ctx = context;
  state.genres = context.config?.genres || state.genres;
  state.page = 1;
  state.search = "";
  state.kind = "";
  state.status = "";

  const addButton = button("Yangi kontent", {
    variant: "btn--red",
    iconName: "plus",
    onClick: () => openContentForm(null),
  });

  searchInput = input({ type: "search", placeholder: "Sarlavha bo'yicha qidirish…" });
  searchInput.addEventListener(
    "input",
    debounce(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      loadList();
    }, 350),
  );

  const kindSelect = selectControl(
    [
      { value: "", label: "Barcha turlar" },
      { value: "movie", label: "Filmlar" },
      { value: "series", label: "Seriallar" },
    ],
    "",
  );
  kindSelect.addEventListener("change", () => {
    state.kind = kindSelect.value;
    state.page = 1;
    loadList();
  });

  const statusSelect = selectControl(
    [
      { value: "", label: "Barcha holatlar" },
      { value: "published", label: "Chop etilgan" },
      { value: "draft", label: "Qoralama" },
      { value: "featured", label: "Tanlangan" },
    ],
    "",
  );
  statusSelect.addEventListener("change", () => {
    state.status = statusSelect.value;
    state.page = 1;
    loadList();
  });

  listHost = el("div", { class: "admin-list-host" });

  host.replaceChildren(
    pageHead({
      title: "Kontent",
      subtitle: "Filmlar va seriallar, posterlar, treylerlar, video manbalari.",
      actions: [button("Saytni ko'rish", { iconName: "external", onClick: () => window.open("browse.html", "_blank", "noopener") }), addButton],
    }),
    panel(
      panelHead("Katalog", "Metadata, nashr holati va media manbalari."),
      el("div", { class: "admin-toolbar" }, searchInput, kindSelect, statusSelect),
      listHost,
    ),
  );

  loadList();
}

async function loadList() {
  if (!listHost) return;
  const seq = ++requestSeq;
  state.loading = true;
  listHost.replaceChildren(loadingBlock("Kontent yuklanmoqda…"));
  const query = new URLSearchParams({
    page: String(state.page),
    page_size: "20",
  });
  if (state.search) query.set("search", state.search);
  if (state.kind) query.set("kind", state.kind);
  if (state.status) query.set("status", state.status);
  try {
    const data = await api(`/admin/content?${query.toString()}`);
    if (seq !== requestSeq) return;
    state.items = data.items || [];
    state.total = data.total || 0;
    state.pages = data.pages || 1;
    state.page = data.page || 1;
    state.loaded = true;
    paintList();
  } catch (error) {
    if (seq !== requestSeq) return;
    listHost.replaceChildren(
      stateBlock({
        title: "Kontentni yuklab bo'lmadi",
        text: error.message,
        iconName: "warning",
        error: true,
        action: button("Qayta urinish", { variant: "btn--outline", onClick: loadList }),
      }),
    );
  } finally {
    state.loading = false;
  }
}

function paintList() {
  const columns = [
    {
      label: "Kontent",
      render: (item) =>
        el(
          "div",
          { class: "admin-content-cell" },
          el(
            "div",
            { class: "admin-content-cell__poster" },
            el("img", { src: mediaUrl(item.poster_url) || "assets/posters/kinora-namuna.webp", alt: "" }),
          ),
          el(
            "div",
            { class: "admin-content-cell__text" },
            el("strong", { text: item.title }),
            el("span", { class: "admin-content-cell__slug", text: `/${item.slug}` }),
            el(
              "span",
              { class: "admin-content-cell__badges" },
              item.is_demo ? badge("Demo", "danger") : null,
              item.is_featured ? badge("Tanlangan", "warning") : null,
            ),
          ),
        ),
    },
    {
      label: "Turi",
      render: (item) => badge(item.kind === "series" ? "Serial" : "Film", "muted"),
    },
    { label: "Yil", render: (item) => item.year || "—" },
    {
      label: "Holat",
      render: (item) => statusBadge(item.is_published ? "published" : "draft"),
    },
    {
      label: "Ko'rishlar",
      render: (item) => formatNumber(item.views_count || 0),
      className: "admin-table__num",
    },
    {
      label: "Yangilangan",
      render: (item) => formatDate(item.updated_at),
    },
    {
      label: "",
      className: "admin-table__actions",
      render: (item) =>
        el(
          "div",
          { class: "admin-row-actions" },
          iconButton("eye", {
            label: "Saytda ko'rish",
            onClick: () => window.open(`detail.html?id=${item.id}&preview=1`, "_blank", "noopener"),
          }),
          item.kind === "series"
            ? iconButton("list", { label: "Mavsum va qismlar", onClick: () => openSeasonsModal(item) })
            : null,
          iconButton("edit", { label: "Tahrirlash", onClick: () => openContentForm(item) }),
          iconButton("trash", {
            label: "O'chirish",
            variant: "admin-icon-btn--danger",
            onClick: () => removeContent(item),
          }),
        ),
    },
  ];

  listHost.replaceChildren(
    table(columns, state.items, { emptyText: state.search ? "Qidiruv bo'yicha natija topilmadi" : "Katalogda hali kontent yo'q" }),
    pagination({
      page: state.page,
      pages: state.pages,
      total: state.total,
      onPage: (page) => {
        if (page < 1 || page > state.pages) return;
        state.page = page;
        loadList();
      },
    }),
  );
}

async function removeContent(item) {
  const ok = await confirmAction({
    title: "Kontentni o'chirish",
    body: `"${item.title}" va unga tegishli barcha mavsum/qismlar butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.`,
    confirmText: "O'chirish",
    danger: true,
    requireText: "O'CHIRISH",
    requireHint: "Tasdiqlash uchun O'CHIRISH deb yozing",
  });
  if (!ok) return;
  try {
    await api(`/admin/content/${item.id}?confirm=true`, { method: "DELETE" });
    toast("Kontent o'chirildi", "success");
    loadList();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ---------- Content form ---------- */

function genrePicker(selected) {
  const wrap = el("div", { class: "genre-picker" });
  const boxes = [];
  for (const genre of state.genres) {
    const box = checkbox(t("genre_" + genre), selected.includes(genre));
    box.input.value = genre;
    box.input.addEventListener("change", () => {
      const checked = boxes.filter((boxItem) => boxItem.input.checked);
      if (checked.length > 6) {
        box.input.checked = false;
        toast("Ko'pi bilan 6 ta janr tanlash mumkin", "error");
      }
    });
    boxes.push(box);
    wrap.append(box);
  }
  return { node: wrap, get selected() {
      return boxes.filter((box) => box.input.checked).map((box) => box.input.value);
    } };
}

function openContentForm(item) {
  const isEdit = Boolean(item);
  const source = item || {};
  const kindSelect = selectControl(
    [
      { value: "movie", label: "Film" },
      { value: "series", label: "Serial" },
    ],
    source.kind || "movie",
  );
  const titleInput = input({ type: "text", placeholder: "Kinora filmi", maxlength: "200" });
  titleInput.value = source.title || "";
  const titleCyrl = input({ type: "text", placeholder: "Кинора фильми", maxlength: "200" });
  titleCyrl.value = source.title_cyrl || "";
  const originalTitle = input({ type: "text", placeholder: "Original nomi", maxlength: "200" });
  originalTitle.value = source.original_title || "";
  const yearInput = input({ type: "number", min: "1888", max: "2100", value: String(source.year || new Date().getFullYear()) });
  const durationInput = input({ type: "number", min: "1", max: "1200", placeholder: "120", value: source.duration_minutes || "" });
  const countryInput = input({ type: "text", placeholder: "AQSh, O'zbekiston…", maxlength: "80" });
  countryInput.value = source.country || "";
  const ageInput = input({ type: "text", placeholder: "13+, 16+, 18+", maxlength: "16" });
  ageInput.value = source.age_rating || "";
  const description = textarea({ rows: 5, maxlength: "6000", placeholder: "Qisqa syujet…" }, source.description || "");
  const descriptionCyrl = textarea({ rows: 4, maxlength: "6000", placeholder: "Кирилл ёзувидаги тавсиф…" }, source.description_cyrl || "");
  const trailerInput = input({ type: "url", placeholder: "https://youtube.com/watch?v=…" });
  trailerInput.value = source.trailer_url || "";
  const licenseInput = input({ type: "text", placeholder: "Litsenziya / huquq izohi", maxlength: "512" });
  licenseInput.value = source.license_note || "";

  const poster = uploadField({
    label: "Poster (2:3)",
    value: source.poster_url || "",
    kind: "poster",
    hint: "JPEG, PNG yoki WebP. Server WebP formatiga o'giradi.",
  });
  const backdrop = uploadField({
    label: "Backdrop (16:9)",
    value: source.backdrop_url || "",
    kind: "backdrop",
    hint: "Hero va karta fonlari uchun keng rasm.",
  });

  const genres = genrePicker(source.genres || []);

  const sourceSelect = selectControl(
    [
      { value: "", label: "Video yo'q (faqat katalog)" },
      { value: "url", label: "To'g'ridan-to'g'ri URL (MP4 / HLS)" },
      { value: "telegram", label: "Telegram file_id (server proxy)" },
    ],
    source.video_source || "",
  );
  const videoUrl = input({ type: "url", placeholder: "https://cdn.example.com/film.mp4" });
  videoUrl.value = source.video_url || "";
  const telegramFile = input({ type: "text", placeholder: "BOT_TOKEN orqali olinadigan file_id" });
  telegramFile.value = source.telegram_file_id || "";
  const videoUrlField = field("Video URL", videoUrl, { hint: "HLS (m3u8) yoki MP4. Litsenziyasi toza manba bo'lishi shart." });
  const telegramField = field("Telegram file_id", telegramFile, {
    hint: "Bot 20 MB gacha faylni yuklab bera oladi. Kattaroq fayllar uchun tashqi CDN ishlating.",
  });
  function syncVideoFields() {
    videoUrlField.hidden = sourceSelect.value !== "url";
    telegramField.hidden = sourceSelect.value !== "telegram";
  }
  sourceSelect.addEventListener("change", syncVideoFields);
  syncVideoFields();

  const published = switchRow("Chop etish", source.is_published, "Saytda ko'rinadi");
  const featured = switchRow("Tanlangan", source.is_featured, "Hero va tanlov bo'limida chiqadi");
  const demo = switchRow("Demo yozuv", source.is_demo, "Demo belgisi ko'rsatiladi");
  if (!isEdit) demo.input.checked = true;

  const form = formGrid(
    field("Turi", kindSelect),
    field("Yil", yearInput),
    field("Sarlavha (lotin)", titleInput),
    field("Sarlavha (kirill)", titleCyrl),
    field("Original nomi", originalTitle),
    field("Davomiyligi (daqiqa)", durationInput),
    field("Davlat", countryInput),
    field("Yosh chegarasi", ageInput),
    field("Janrlar (maks. 6)", genres.node, { hint: "Kamida bitta janr tanlash tavsiya etiladi." }),
    field("Trailer URL", trailerInput, { hint: "YouTube/Vimeo havolasi modal oynada ochiladi." }),
    field("Litsenziya izohi", licenseInput),
    field("Video manbasi", sourceSelect),
    videoUrlField,
    telegramField,
    field("Poster", poster),
    field("Backdrop", backdrop),
    field("Tavsif (lotin)", description, { span: 2 }),
    field("Tavsif (kirill)", descriptionCyrl, { span: 2 }),
    el("div", { class: "admin-form-grid__full admin-switch-grid" }, published, featured, demo),
  );

  const saveButton = button(isEdit ? "Saqlash" : "Yaratish", {
    variant: "btn--red",
    onClick: () => submit(),
  });
  const cancelButton = button("Bekor qilish", { variant: "btn--ghost", onClick: () => modal.close() });
  const body = el("div", { class: "admin-form" }, form, formActions(cancelButton, saveButton));

  const modal = openModal({
    title: isEdit ? `Tahrirlash — ${source.title}` : "Yangi kontent",
    body,
    size: "lg",
  });

  async function submit() {
    const payload = {
      kind: kindSelect.value,
      title: titleInput.value.trim(),
      title_cyrl: inputValue(titleCyrl) || null,
      original_title: inputValue(originalTitle) || null,
      year: Number(yearInput.value),
      genres: genres.selected,
      country: inputValue(countryInput) || null,
      age_rating: inputValue(ageInput) || null,
      description: description.value.trim(),
      description_cyrl: descriptionCyrl.value.trim() || null,
      poster_url: poster.getValue() || null,
      backdrop_url: backdrop.getValue() || null,
      trailer_url: inputValue(trailerInput) || null,
      duration_minutes: durationInput.value ? Number(durationInput.value) : null,
      video_source: sourceSelect.value || null,
      video_url: sourceSelect.value === "url" ? inputValue(videoUrl) : null,
      telegram_file_id: sourceSelect.value === "telegram" ? inputValue(telegramFile) || null : null,
      is_featured: featured.input.checked,
      is_published: published.input.checked,
      is_demo: demo.input.checked,
      license_note: inputValue(licenseInput) || null,
    };
    if (!payload.title) {
      toast("Sarlavhani kiriting", "error");
      titleInput.focus();
      return;
    }
    if (!payload.year || payload.year < 1888 || payload.year > 2100) {
      toast("Yilni to'g'ri kiriting", "error");
      yearInput.focus();
      return;
    }
    if (payload.video_source === "url" && !payload.video_url) {
      toast("Video URL manzilini kiriting", "error");
      videoUrl.focus();
      return;
    }
    if (payload.video_source === "telegram" && !payload.telegram_file_id) {
      toast("Telegram file_id kiriting", "error");
      telegramFile.focus();
      return;
    }
    saveButton.disabled = true;
    cancelButton.disabled = true;
    saveButton.replaceChildren(icon("refresh"), el("span", { text: "Saqlanmoqda…" }));
    try {
      const result = await api(isEdit ? `/admin/content/${source.id}` : "/admin/content", {
        method: isEdit ? "PATCH" : "POST",
        body: payload,
      });
      toast(isEdit ? "Kontent yangilandi" : "Kontent yaratildi", "success");
      modal.close();
      loadList();
      return result;
    } catch (error) {
      toast(error.message, "error");
      saveButton.disabled = false;
      cancelButton.disabled = false;
      saveButton.replaceChildren(icon(isEdit ? "check" : "plus"), el("span", { text: isEdit ? "Saqlash" : "Yaratish" }));
    }
  }
}

/* ---------- Seasons & episodes ---------- */

function openSeasonsModal(item) {
  const modal = openModal({ title: `Mavsumlar — ${item.title}`, body: el("div", { class: "seasons-editor" }), size: "lg" });
  const root = modal.body.firstElementChild;
  let detail = null;
  let activeSeasonId = null;
  let busy = false;

  async function reload(keepSeason = true) {
    root.replaceChildren(loadingBlock("Mavsumlar yuklanmoqda…"));
    try {
      detail = await api(`/admin/content/${item.id}`);
      const seasons = detail.seasons || [];
      if (!keepSeason || !seasons.some((season) => season.id === activeSeasonId)) {
        activeSeasonId = seasons[0]?.id || null;
      }
      paint();
    } catch (error) {
      root.replaceChildren(
        stateBlock({
          title: "Mavsumlarni yuklab bo'lmadi",
          text: error.message,
          iconName: "warning",
          error: true,
          action: button("Qayta urinish", { variant: "btn--outline", onClick: () => reload() }),
        }),
      );
    }
  }

  function paint() {
    const seasons = (detail.seasons || []).slice().sort((a, b) => a.number - b.number);
    const season = seasons.find((entry) => entry.id === activeSeasonId) || null;
    const sidebar = el("aside", { class: "seasons-sidebar" });
    sidebar.append(
      el("h3", { class: "seasons-sidebar__title", text: "Mavsumlar" }),
      el(
        "div",
        { class: "season-list" },
        ...seasons.map((entry) =>
          el(
            "div",
            { class: `season-item ${entry.id === activeSeasonId ? "is-active" : ""}` },
            el(
              "button",
              {
                class: "season-item__main",
                type: "button",
                onclick: () => {
                  activeSeasonId = entry.id;
                  paint();
                },
              },
              el("strong", { text: entry.title || `Mavsum ${entry.number}` }),
              el("span", { text: `${entry.episodes?.length || 0} qism` }),
            ),
            el(
              "div",
              { class: "season-item__actions" },
              iconButton("edit", { label: "Mavsum nomini o'zgartirish", onClick: () => seasonForm(entry) }),
              iconButton("trash", {
                label: "Mavsumni o'chirish",
                variant: "admin-icon-btn--danger",
                onClick: () => removeSeason(entry),
              }),
            ),
          ),
        ),
      ),
      button("Mavsum qo'shish", { variant: "btn--outline", iconName: "plus", onClick: () => seasonForm(null) }),
    );

    const main = el("div", { class: "seasons-main" });
    if (!season) {
      main.append(
        stateBlock({
          title: "Mavsum yo'q",
          text: "Serial uchun birinchi mavsumni qo'shing.",
          iconName: "list",
          action: button("Mavsum qo'shish", { variant: "btn--red", iconName: "plus", onClick: () => seasonForm(null) }),
        }),
      );
    } else {
      const episodes = (season.episodes || []).slice().sort((a, b) => a.number - b.number);
      main.append(
        el(
          "div",
          { class: "seasons-main__head" },
          el(
            "div",
            {},
            el("h3", { text: season.title || `Mavsum ${season.number}` }),
            el("p", { text: `${episodes.length} qism · ${detail.title}` }),
          ),
          button("Qism qo'shish", { variant: "btn--red", iconName: "plus", onClick: () => episodeForm(season, null) }),
        ),
      );
      if (!episodes.length) {
        main.append(
          stateBlock({
            title: "Qismlar yo'q",
            text: "Bu mavsumga hali qism qo'shilmagan.",
            iconName: "film",
          }),
        );
      } else {
        const rows = el("div", { class: "episode-admin-list" });
        episodes.forEach((episode, index) => {
          rows.append(
            el(
              "div",
              { class: "episode-admin-row" },
              el("span", { class: "episode-admin-row__num", text: String(episode.number).padStart(2, "0") }),
              el(
                "div",
                { class: "episode-admin-row__info" },
                el("strong", { text: episode.title }),
                el(
                  "span",
                  { class: "episode-admin-row__meta" },
                  episode.duration_minutes ? `${episode.duration_minutes} daqiqa · ` : "",
                  episode.video_source === "url"
                    ? "URL video"
                    : episode.video_source === "telegram"
                      ? "Telegram video"
                      : "Video yo'q",
                ),
              ),
              el(
                "div",
                { class: "admin-row-actions" },
                iconButton("arrowUp", {
                  label: "Yuqoriga",
                  disabled: index === 0 || busy,
                  onClick: () => reorder(season, episodes, index, -1),
                }),
                iconButton("arrowDown", {
                  label: "Pastga",
                  disabled: index === episodes.length - 1 || busy,
                  onClick: () => reorder(season, episodes, index, 1),
                }),
                iconButton("edit", { label: "Tahrirlash", onClick: () => episodeForm(season, episode) }),
                iconButton("trash", {
                  label: "O'chirish",
                  variant: "admin-icon-btn--danger",
                  onClick: () => removeEpisode(episode),
                }),
              ),
            ),
          );
        });
        main.append(rows);
      }
    }
    root.replaceChildren(sidebar, main);
  }

  async function reorder(season, episodes, index, direction) {
    if (busy) return;
    const ids = episodes.map((episode) => episode.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    busy = true;
    try {
      const updated = await api(`/admin/seasons/${season.id}/episodes/reorder`, {
        method: "POST",
        body: { episode_ids: ids },
      });
      const targetSeason = (detail.seasons || []).find((entry) => entry.id === season.id);
      if (targetSeason) targetSeason.episodes = updated.episodes || [];
      paint();
      loadList();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      busy = false;
    }
  }

  async function removeSeason(season) {
    const ok = await confirmDialog({
      title: "Mavsumni o'chirish",
      body: `"${season.title || `Mavsum ${season.number}`}" va uning barcha qismlari o'chiriladi.`,
      confirmText: "O'chirish",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/seasons/${season.id}?confirm=true`, { method: "DELETE" });
      toast("Mavsum o'chirildi", "success");
      activeSeasonId = null;
      reload(false);
      loadList();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function removeEpisode(episode) {
    const ok = await confirmDialog({
      title: "Qismni o'chirish",
      body: `"${episode.title}" qismi o'chiriladi.`,
      confirmText: "O'chirish",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/episodes/${episode.id}?confirm=true`, { method: "DELETE" });
      toast("Qism o'chirildi", "success");
      reload();
      loadList();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function seasonForm(season) {
    const current = season || null;
    const maxNumber = Math.max(0, ...(detail.seasons || []).map((entry) => entry.number));
    const numberInput = input({ type: "number", min: "1", max: "100", value: String(current?.number || maxNumber + 1) });
    const titleInput = input({ type: "text", maxlength: "200", placeholder: "Ixtiyoriy nom" });
    titleInput.value = current?.title || "";
    const saveButton = button(current ? "Saqlash" : "Qo'shish", { variant: "btn--red" });
    const formModal = openModal({
      title: current ? "Mavsumni tahrirlash" : "Yangi mavsum",
      body: el(
        "div",
        { class: "admin-form" },
        formGrid(field("Mavsum raqami", numberInput), field("Nomi", titleInput)),
        formActions(
          button("Bekor qilish", { variant: "btn--ghost", onClick: () => formModal.close() }),
          saveButton,
        ),
      ),
      size: "sm",
    });
    saveButton.addEventListener("click", async () => {
      const payload = {
        number: Number(numberInput.value),
        title: titleInput.value.trim() || null,
      };
      if (!payload.number || payload.number < 1) {
        toast("Mavsum raqamini kiriting", "error");
        return;
      }
      saveButton.disabled = true;
      try {
        if (current) {
          await api(`/admin/seasons/${current.id}`, { method: "PATCH", body: payload });
        } else {
          const created = await api(`/admin/content/${item.id}/seasons`, { method: "POST", body: payload });
          activeSeasonId = created.id;
        }
        formModal.close();
        toast(current ? "Mavsum yangilandi" : "Mavsum qo'shildi", "success");
        reload();
      } catch (error) {
        toast(error.message, "error");
        saveButton.disabled = false;
      }
    });
  }

  function episodeForm(season, episode) {
    const current = episode || null;
    const nextNumber = Math.max(0, ...(season.episodes || []).map((entry) => entry.number)) + 1;
    const numberInput = input({ type: "number", min: "1", max: "1000", value: String(current?.number || nextNumber) });
    const titleInput = input({ type: "text", maxlength: "200", placeholder: "Qism nomi" });
    titleInput.value = current?.title || "";
    const durationInput = input({ type: "number", min: "1", max: "1200", placeholder: "45" });
    durationInput.value = current?.duration_minutes || "";
    const description = textarea({ rows: 3, maxlength: "4000", placeholder: "Qism tavsifi…" }, current?.description || "");
    const sourceSelect = selectControl(
      [
        { value: "", label: "Video yo'q" },
        { value: "url", label: "URL video" },
        { value: "telegram", label: "Telegram file_id" },
      ],
      current?.video_source || "",
    );
    const videoUrl = input({ type: "url", placeholder: "https://cdn.example.com/episode.mp4" });
    videoUrl.value = current?.video_url || "";
    const telegramFile = input({ type: "text", placeholder: "Telegram file_id" });
    telegramFile.value = current?.telegram_file_id || "";
    const urlField = field("Video URL", videoUrl);
    const fileField = field("Telegram file_id", telegramFile);
    function sync() {
      urlField.hidden = sourceSelect.value !== "url";
      fileField.hidden = sourceSelect.value !== "telegram";
    }
    sourceSelect.addEventListener("change", sync);
    sync();

    const saveButton = button(current ? "Saqlash" : "Qo'shish", { variant: "btn--red" });
    const formModal = openModal({
      title: current ? `Tahrirlash — ${current.title}` : `Yangi qism · ${season.title || `Mavsum ${season.number}`}`,
      body: el(
        "div",
        { class: "admin-form" },
        formGrid(
          field("Qism raqami", numberInput),
          field("Davomiyligi (daqiqa)", durationInput),
          field("Nomi", titleInput, { span: 2 }),
          field("Tavsif", description, { span: 2 }),
          field("Video manbasi", sourceSelect),
          el("div"),
          urlField,
          fileField,
        ),
        formActions(
          button("Bekor qilish", { variant: "btn--ghost", onClick: () => formModal.close() }),
          saveButton,
        ),
      ),
      size: "lg",
    });
    saveButton.addEventListener("click", async () => {
      const payload = {
        number: Number(numberInput.value),
        title: titleInput.value.trim(),
        description: description.value.trim() || null,
        duration_minutes: durationInput.value ? Number(durationInput.value) : null,
        video_source: sourceSelect.value || null,
        video_url: sourceSelect.value === "url" ? inputValue(videoUrl) : null,
        telegram_file_id: sourceSelect.value === "telegram" ? inputValue(telegramFile) : null,
      };
      if (!payload.number || !payload.title) {
        toast("Qism raqami va nomini kiriting", "error");
        return;
      }
      if (payload.video_source === "url" && !payload.video_url) {
        toast("Video URL kiriting", "error");
        return;
      }
      if (payload.video_source === "telegram" && !payload.telegram_file_id) {
        toast("Telegram file_id kiriting", "error");
        return;
      }
      saveButton.disabled = true;
      try {
        if (current) {
          await api(`/admin/episodes/${current.id}`, { method: "PATCH", body: payload });
        } else {
          await api(`/admin/seasons/${season.id}/episodes`, { method: "POST", body: payload });
        }
        formModal.close();
        toast(current ? "Qism yangilandi" : "Qism qo'shildi", "success");
        reload();
        loadList();
      } catch (error) {
        toast(error.message, "error");
        saveButton.disabled = false;
      }
    });
  }

  reload();
}
