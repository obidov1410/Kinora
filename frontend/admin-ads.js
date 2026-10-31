/* Admin: advertisement inventory and performance. */
import { mediaUrl } from "./api.js";
import { formatNumber, formatDate } from "./i18n.js";
import {
  api,
  badge,
  button,
  confirmAction,
  debounce,
  el,
  field,
  formActions,
  formGrid,
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
  timestampFromInput,
  timestampInputValue,
  toast,
  uploadField,
  stateBlock,
} from "./admin-ui.js";

const PLACEMENT_LABELS = {
  landing: "Landing sahifa",
  home_hero: "Bosh sahifa hero",
  catalog_banner: "Katalog banneri",
  between_rows: "Qatorlar orasida",
};

const state = { page: 1, pages: 1, total: 0, search: "", placement: "", status: "", items: [] };
let host = null;
let listHost = null;
let requestSeq = 0;

export function renderAds(container, context) {
  host = container;
  state.page = 1;
  state.search = "";
  state.placement = "";
  state.status = "";

  const searchInput = input({ type: "search", placeholder: "Reklama yoki reklama beruvchi…" });
  searchInput.addEventListener(
    "input",
    debounce(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      loadList();
    }, 350),
  );
  const placementSelect = selectControl(
    [{ value: "", label: "Barcha joylashuvlar" }, ...Object.entries(PLACEMENT_LABELS).map(([value, label]) => ({ value, label }))],
    "",
  );
  placementSelect.addEventListener("change", () => {
    state.placement = placementSelect.value;
    state.page = 1;
    loadList();
  });
  const statusSelect = selectControl(
    [
      { value: "", label: "Barcha holatlar" },
      { value: "active", label: "Faol" },
      { value: "paused", label: "To'xtatilgan" },
      { value: "scheduled", label: "Rejalashtirilgan" },
      { value: "expired", label: "Muddati o'tgan" },
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
      title: "Reklamalar",
      subtitle: "Banner joylashuvlari, muddatlar va haqiqiy ko'rsatkichlar.",
      actions: [button("Yangi reklama", { variant: "btn--red", iconName: "plus", onClick: () => openAdForm(null) })],
    }),
    panel(
      panelHead("Reklama inventari", "Landing, hero, katalog va qatorlar orasidagi bannerlar."),
      el("div", { class: "admin-toolbar" }, searchInput, placementSelect, statusSelect),
      listHost,
    ),
  );
  loadList();
}

async function loadList() {
  if (!listHost) return;
  const seq = ++requestSeq;
  listHost.replaceChildren(loadingBlock("Reklamalar yuklanmoqda…"));
  const query = new URLSearchParams({ page: String(state.page), page_size: "20" });
  if (state.search) query.set("search", state.search);
  if (state.placement) query.set("placement", state.placement);
  if (state.status) query.set("status", state.status);
  try {
    const data = await api(`/admin/ads?${query.toString()}`);
    if (seq !== requestSeq) return;
    state.items = data.items || [];
    state.total = data.total || 0;
    state.pages = data.pages || 1;
    state.page = data.page || 1;
    paintList();
  } catch (error) {
    if (seq !== requestSeq) return;
    listHost.replaceChildren(
      stateBlock({
        title: "Reklamalarni yuklab bo'lmadi",
        text: error.message,
        iconName: "warning",
        error: true,
        action: button("Qayta urinish", { variant: "btn--outline", onClick: loadList }),
      }),
    );
  }
}

function paintList() {
  const columns = [
    {
      label: "Reklama",
      render: (ad) =>
        el(
          "div",
          { class: "admin-content-cell" },
          el(
            "div",
            { class: "admin-content-cell__poster admin-content-cell__poster--wide" },
            el("img", { src: mediaUrl(ad.image_url) || "assets/backdrops/nur.webp", alt: "" }),
          ),
          el(
            "div",
            { class: "admin-content-cell__text" },
            el("strong", { text: ad.title }),
            el("span", { class: "admin-content-cell__slug", text: ad.advertiser }),
            ad.is_demo ? badge("Demo", "danger") : null,
          ),
        ),
    },
    { label: "Joylashuv", render: (ad) => PLACEMENT_LABELS[ad.placement] || ad.placement },
    { label: "Holat", render: (ad) => statusBadge(ad.status) },
    { label: "Ko'rsatish", className: "admin-table__num", render: (ad) => formatNumber(ad.impressions) },
    { label: "Bosish", className: "admin-table__num", render: (ad) => formatNumber(ad.clicks) },
    { label: "CTR", className: "admin-table__num", render: (ad) => `${ad.ctr}%` },
    {
      label: "Muddat",
      render: (ad) =>
        el(
          "span",
          { class: "admin-date-range" },
          el("span", { text: ad.starts_at ? formatDate(ad.starts_at) : "Darhol" }),
          el("span", { text: ad.ends_at ? formatDate(ad.ends_at) : "Cheksiz" }),
        ),
    },
    {
      label: "",
      className: "admin-table__actions",
      render: (ad) =>
        el(
          "div",
          { class: "admin-row-actions" },
          iconButton("eye", { label: "Ko'rish", onClick: () => previewAd(ad) }),
          iconButton("edit", { label: "Tahrirlash", onClick: () => openAdForm(ad) }),
          iconButton("trash", {
            label: "O'chirish",
            variant: "admin-icon-btn--danger",
            onClick: () => removeAd(ad),
          }),
        ),
    },
  ];
  listHost.replaceChildren(
    table(columns, state.items, { emptyText: "Reklamalar topilmadi" }),
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

function previewAd(ad) {
  openModal({
    title: "Reklama ko'rinishi",
    size: "md",
    body: el(
      "div",
      { class: "ad-preview" },
      el("div", { class: "ad-preview__frame" }, el("img", { src: mediaUrl(ad.image_url), alt: "" })),
      el(
        "div",
        { class: "ad-preview__meta" },
        badge("Reklama", "muted"),
        ad.is_demo ? badge("Demo", "danger") : null,
        badge(PLACEMENT_LABELS[ad.placement] || ad.placement, "muted"),
      ),
      el("h3", { class: "ad-preview__title", text: ad.title }),
      el("p", { class: "ad-preview__advertiser", text: ad.advertiser }),
      ad.description ? el("p", { class: "ad-preview__text", text: ad.description }) : null,
      el(
        "div",
        { class: "ad-preview__stats" },
        el("span", { text: `Ko'rsatish: ${formatNumber(ad.impressions)}` }),
        el("span", { text: `Bosish: ${formatNumber(ad.clicks)}` }),
        el("span", { text: `CTR: ${ad.ctr}%` }),
      ),
      el(
        "p",
        { class: "ad-preview__note" },
        "Maqsad manzil: ",
        el("code", { text: ad.destination_url }),
      ),
      el("p", { class: "ad-preview__note", text: "Ko'rinish rejimida bosish hisoblanmaydi. Jonli reklama bosilganda /api/ads/{id}/click orqali yo'naltiriladi." }),
    ),
  });
}

async function removeAd(ad) {
  const ok = await confirmAction({
    title: "Reklamani o'chirish",
    body: `"${ad.title}" reklamasi va uning statistikasi o'chiriladi.`,
    confirmText: "O'chirish",
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/admin/ads/${ad.id}?confirm=true`, { method: "DELETE" });
    toast("Reklama o'chirildi", "success");
    loadList();
  } catch (error) {
    toast(error.message, "error");
  }
}

function openAdForm(ad) {
  const isEdit = Boolean(ad);
  const source = ad || {};
  const advertiser = input({ type: "text", maxlength: "160", placeholder: "Kompaniya nomi" });
  advertiser.value = source.advertiser || "";
  const title = input({ type: "text", maxlength: "200", placeholder: "Reklama sarlavhasi" });
  title.value = source.title || "";
  const description = textarea({ rows: 3, maxlength: "2000", placeholder: "Qisqa tavsif" }, source.description || "");
  const destination = input({ type: "url", placeholder: "https://example.com" });
  destination.value = source.destination_url || "";
  const placement = selectControl(
    Object.entries(PLACEMENT_LABELS).map(([value, label]) => ({ value, label })),
    source.placement || "landing",
  );
  const startsAt = input({ type: "datetime-local" });
  startsAt.value = timestampInputValue(source.starts_at);
  const endsAt = input({ type: "datetime-local" });
  endsAt.value = timestampInputValue(source.ends_at);
  const image = uploadField({
    label: "Banner rasmi",
    value: source.image_url || "",
    kind: "ad",
    hint: "Landing va hero uchun keng rasm; katalog banneri uchun 3:1 tavsiya etiladi.",
  });
  const active = switchRow("Faol", source.is_active !== false, "O'chirilganda saytda ko'rinmaydi");
  const demo = switchRow("Demo reklama", source.is_demo || false, "Demo belgisi bilan ko'rsatiladi");

  const saveButton = button(isEdit ? "Saqlash" : "Yaratish", { variant: "btn--red" });
  const cancelButton = button("Bekor qilish", { variant: "btn--ghost" });
  const modal = openModal({
    title: isEdit ? `Tahrirlash — ${source.title}` : "Yangi reklama",
    size: "lg",
    body: el(
      "div",
      { class: "admin-form" },
      formGrid(
        field("Reklama beruvchi", advertiser),
        field("Joylashuv", placement),
        field("Sarlavha", title, { span: 2 }),
        field("Tavsif", description, { span: 2 }),
        field("Maqsad URL", destination, { span: 2, hint: "Faqat http(s). Bosishlar server orqali hisoblanadi." }),
        field("Boshlanish", startsAt),
        field("Tugash", endsAt),
        field("Rasm", image, { span: 2 }),
        el("div", { class: "admin-form-grid__full admin-switch-grid" }, active, demo),
      ),
      formActions(cancelButton, saveButton),
    ),
  });
  cancelButton.addEventListener("click", () => modal.close());
  saveButton.addEventListener("click", async () => {
    const payload = {
      advertiser: advertiser.value.trim(),
      title: title.value.trim(),
      description: description.value.trim() || null,
      image_url: image.getValue(),
      destination_url: inputValue(destination),
      placement: placement.value,
      starts_at: timestampFromInput(startsAt.value),
      ends_at: timestampFromInput(endsAt.value),
      is_active: active.input.checked,
      is_demo: demo.input.checked,
    };
    if (!payload.advertiser || !payload.title) {
      toast("Reklama beruvchi va sarlavhani kiriting", "error");
      return;
    }
    if (!payload.image_url) {
      toast("Banner rasmini yuklang yoki URL kiriting", "error");
      return;
    }
    if (!payload.destination_url) {
      toast("Maqsad URL kiriting", "error");
      return;
    }
    if (payload.starts_at && payload.ends_at && new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      toast("Tugash vaqti boshlanishdan keyin bo'lishi kerak", "error");
      return;
    }
    saveButton.disabled = true;
    try {
      await api(isEdit ? `/admin/ads/${source.id}` : "/admin/ads", {
        method: isEdit ? "PATCH" : "POST",
        body: payload,
      });
      toast(isEdit ? "Reklama yangilandi" : "Reklama yaratildi", "success");
      modal.close();
      loadList();
    } catch (error) {
      toast(error.message, "error");
      saveButton.disabled = false;
    }
  });
}
