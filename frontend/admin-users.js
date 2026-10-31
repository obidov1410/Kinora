/* Admin: users, roles, blocking and VIP grants. */
import { formatNumber, formatDate } from "./i18n.js";
import { avatar } from "./ui.js";
import {
  api,
  badge,
  button,
  confirmDialog,
  debounce,
  el,
  field,
  formActions,
  formGrid,
  iconButton,
  input,
  loadingBlock,
  openModal,
  pageHead,
  pagination,
  panel,
  panelHead,
  selectControl,
  stateBlock,
  table,
  toast,
} from "./admin-ui.js";

const FILTERS = [
  { value: "all", label: "Barcha foydalanuvchilar" },
  { value: "vip", label: "VIP faol" },
  { value: "blocked", label: "Bloklangan" },
  { value: "admins", label: "Adminlar" },
];

const state = { page: 1, pages: 1, total: 0, search: "", filter: "all", items: [] };
let host = null;
let listHost = null;
let me = null;
let requestSeq = 0;

export function renderUsers(container, context) {
  host = container;
  me = context.me;
  state.page = 1;
  state.search = "";
  state.filter = "all";

  const searchInput = input({ type: "search", placeholder: "Ism, username yoki Telegram ID…" });
  searchInput.addEventListener(
    "input",
    debounce(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      loadList();
    }, 350),
  );
  const filterSelect = selectControl(FILTERS, "all");
  filterSelect.addEventListener("change", () => {
    state.filter = filterSelect.value;
    state.page = 1;
    loadList();
  });

  listHost = el("div", { class: "admin-list-host" });
  host.replaceChildren(
    pageHead({
      title: "Foydalanuvchilar",
      subtitle: "Telegram hisoblari, rollar, bloklash va VIP muddatlari.",
    }),
    panel(
      panelHead("Foydalanuvchilar bazasi", "Faqat serverda tekshirilgan Telegram identifikatorlari."),
      el("div", { class: "admin-toolbar" }, searchInput, filterSelect),
      listHost,
    ),
  );
  loadList();
}

async function loadList() {
  if (!listHost) return;
  const seq = ++requestSeq;
  listHost.replaceChildren(loadingBlock("Foydalanuvchilar yuklanmoqda…"));
  const query = new URLSearchParams({
    page: String(state.page),
    page_size: "20",
    filter: state.filter,
  });
  if (state.search) query.set("search", state.search);
  try {
    const data = await api(`/admin/users?${query.toString()}`);
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
        title: "Foydalanuvchilarni yuklab bo'lmadi",
        text: error.message,
        iconName: "warning",
        error: true,
        action: button("Qayta urinish", { variant: "btn--outline", onClick: loadList }),
      }),
    );
  }
}

function roleBadge(role) {
  return badge(
    role === "owner" ? "Egasi" : role === "admin" ? "Admin" : "Foydalanuvchi",
    role === "owner" ? "danger" : role === "admin" ? "warning" : "muted",
  );
}

function paintList() {
  const columns = [
    {
      label: "Foydalanuvchi",
      render: (user) =>
        el(
          "div",
          { class: "admin-user-cell" },
          avatar(user, "sm"),
          el(
            "div",
            { class: "admin-user-cell__text" },
            el("strong", { text: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Nomsiz" }),
            el("span", {
              text: user.username ? `@${user.username}` : `ID: ${user.telegram_id || "—"}`,
            }),
          ),
        ),
    },
    { label: "Rol", render: (user) => roleBadge(user.role) },
    {
      label: "VIP",
      render: (user) => (user.is_vip ? badge(formatDate(user.vip_until), "success") : "—"),
    },
    { label: "Tashriflar", className: "admin-table__num", render: (user) => formatNumber(user.visit_count) },
    {
      label: "Holat",
      render: (user) => (user.is_blocked ? badge("Bloklangan", "danger") : badge("Faol", "success")),
    },
    { label: "Oxirgi faollik", render: (user) => formatDate(user.last_seen_at, true) },
    {
      label: "",
      className: "admin-table__actions",
      render: (user) => {
        const protectedUser = user.role === "owner" || user.id === me?.id;
        return el(
          "div",
          { class: "admin-row-actions" },
          iconButton("eye", { label: "Batafsil", onClick: () => openUserDetail(user) }),
          protectedUser
            ? null
            : iconButton("crown", { label: "VIP berish", onClick: () => grantVip(user) }),
          protectedUser
            ? null
            : iconButton("shield", {
                label: user.is_blocked ? "Blokdan chiqarish" : "Bloklash",
                variant: user.is_blocked ? "" : "admin-icon-btn--danger",
                onClick: () => toggleBlock(user),
              }),
          canChangeRole(user) ? iconButton("user", { label: "Rolni o'zgartirish", onClick: () => changeRole(user) }) : null,
        );
      },
    },
  ];
  listHost.replaceChildren(
    table(columns, state.items, { emptyText: "Foydalanuvchilar topilmadi" }),
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

function canChangeRole(user) {
  return me?.role === "owner" && user.role !== "owner" && user.id !== me.id;
}

async function toggleBlock(user) {
  const blocking = !user.is_blocked;
  const ok = await confirmDialog({
    title: blocking ? "Foydalanuvchini bloklash" : "Blokdan chiqarish",
    body: blocking
      ? `"${user.first_name || user.telegram_id}" bloklanadi va saytga kira olmaydi.`
      : `"${user.first_name || user.telegram_id}" yana saytga kira oladi.`,
    confirmText: blocking ? "Bloklash" : "Blokdan chiqarish",
    danger: blocking,
  });
  if (!ok) return;
  try {
    await api(`/admin/users/${user.id}`, { method: "PATCH", body: { is_blocked: blocking } });
    toast(blocking ? "Foydalanuvchi bloklandi" : "Blokdan chiqarildi", "success");
    loadList();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function grantVip(user) {
  const daysInput = input({ type: "number", min: "-3650", max: "3650", value: "30" });
  const saveButton = button("Qo'llash", { variant: "btn--red" });
  const modal = openModal({
    title: `VIP — ${user.first_name || user.telegram_id}`,
    size: "sm",
    body: el(
      "div",
      { class: "admin-form" },
      el("p", { class: "admin-muted", text: `Hozirgi VIP: ${user.is_vip ? formatDate(user.vip_until) : "yo'q"}` }),
      formGrid(
        field("Kunlar soni", daysInput, {
          span: 2,
          hint: "Musbat son joriy muddatga qo'shiladi. Manfiy son VIP muddatini qisqartiradi.",
        }),
      ),
      formActions(button("Bekor qilish", { variant: "btn--ghost", onClick: () => modal.close() }), saveButton),
    ),
  });
  saveButton.addEventListener("click", async () => {
    const days = Number(daysInput.value);
    if (!Number.isFinite(days) || days === 0) {
      toast("Nolga teng bo'lmagan kunlar sonini kiriting", "error");
      return;
    }
    saveButton.disabled = true;
    try {
      await api(`/admin/users/${user.id}`, { method: "PATCH", body: { vip_days: days } });
      toast("VIP muddati yangilandi", "success");
      modal.close();
      loadList();
    } catch (error) {
      toast(error.message, "error");
      saveButton.disabled = false;
    }
  });
}

function changeRole(user) {
  const roleSelect = selectControl(
    [
      { value: "user", label: "Foydalanuvchi" },
      { value: "admin", label: "Admin" },
    ],
    user.role === "admin" ? "admin" : "user",
  );
  const saveButton = button("Qo'llash", { variant: "btn--red" });
  const modal = openModal({
    title: `Rolni o'zgartirish — ${user.first_name || user.telegram_id}`,
    size: "sm",
    body: el(
      "div",
      { class: "admin-form" },
      el("p", { class: "admin-muted", text: "Rol faqat egasi tomonidan o'zgartiriladi. Adminlar kontent, reklama va foydalanuvchilarni boshqara oladi, lekin egasi rolini o'zgartira olmaydi." }),
      formGrid(field("Yangi rol", roleSelect, { span: 2 })),
      formActions(button("Bekor qilish", { variant: "btn--ghost", onClick: () => modal.close() }), saveButton),
    ),
  });
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    try {
      await api(`/admin/users/${user.id}/role`, { method: "POST", body: { role: roleSelect.value } });
      toast("Rol yangilandi", "success");
      modal.close();
      loadList();
    } catch (error) {
      toast(error.message, "error");
      saveButton.disabled = false;
    }
  });
}

async function openUserDetail(user) {
  const modal = openModal({
    title: `Foydalanuvchi — ${user.first_name || user.telegram_id}`,
    size: "lg",
    body: el("div", { class: "admin-user-detail" }, loadingBlock("Ma'lumot olinmoqda…")),
  });
  const root = modal.body.firstElementChild;
  try {
    const detail = await api(`/admin/users/${user.id}`);
    const stats = el(
      "div",
      { class: "admin-detail-stats" },
      el("div", {}, el("span", { text: "Tashriflar" }), el("strong", { text: formatNumber(detail.visit_count) })),
      el("div", {}, el("span", { text: "Sevimlilar" }), el("strong", { text: formatNumber(detail.favorites_count) })),
      el("div", {}, el("span", { text: "VIP" }), el("strong", { text: detail.is_vip ? formatDate(detail.vip_until) : "Yo'q" })),
      el("div", {}, el("span", { text: "Rol" }), el("strong", { text: detail.role })),
    );
    const profile = el(
      "div",
      { class: "admin-user-profile" },
      avatar(detail, "lg"),
      el(
        "div",
        {},
        el("h3", { text: [detail.first_name, detail.last_name].filter(Boolean).join(" ") || "Nomsiz" }),
        el("p", { text: detail.username ? `@${detail.username}` : "Username yo'q" }),
        el("p", { class: "admin-muted", text: `Telegram ID: ${detail.telegram_id || "—"}` }),
      ),
    );
    const transactions = el(
      "div",
      { class: "admin-detail-section" },
      el("h4", { text: "So'nggi to'lovlar" }),
      detail.transactions?.length
        ? table(
            [
              { label: "ID", key: "id" },
              { label: "Provayder", key: "provider" },
              { label: "Summa", render: (tx) => `${formatNumber(tx.amount)} ${tx.currency}` },
              { label: "Holat", key: "status" },
              { label: "Sana", render: (tx) => formatDate(tx.created_at) },
            ],
            detail.transactions,
            { emptyText: "To'lovlar yo'q" },
          )
        : el("p", { class: "admin-muted", text: "To'lovlar yo'q" }),
    );
    const audit = el(
      "div",
      { class: "admin-detail-section" },
      el("h4", { text: "Audit harakatlari" }),
      detail.audit?.length
        ? el(
            "ul",
            { class: "admin-audit-list" },
            ...detail.audit.map((entry) =>
              el(
                "li",
                {},
                el("span", { class: "admin-audit-list__action", text: entry.action }),
                el("span", { text: formatDate(entry.created_at, true) }),
              ),
            ),
          )
        : el("p", { class: "admin-muted", text: "Harakatlar yo'q" }),
    );
    root.replaceChildren(
      profile,
      stats,
      el(
        "div",
        { class: "admin-detail-meta" },
        el("span", { text: `Yaratilgan: ${formatDate(detail.created_at)}` }),
        el("span", { text: `Oxirgi faollik: ${formatDate(detail.last_seen_at, true)}` }),
        el("span", { text: `Til: ${detail.language === "uzc" ? "Kirill" : "Lotin"}` }),
        el("span", { text: `Holat: ${detail.is_blocked ? "Bloklangan" : "Faol"}` }),
      ),
      transactions,
      audit,
    );
  } catch (error) {
    root.replaceChildren(
      stateBlock({
        title: "Ma'lumotni yuklab bo'lmadi",
        text: error.message,
        iconName: "warning",
        error: true,
      }),
    );
  }
}
