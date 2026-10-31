/* Admin: VIP plans, availability and payment transactions. */
import { formatNumber, formatDate } from "./i18n.js";
import {
  api,
  badge,
  button,
  confirmDialog,
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
  statusBadge,
  switchRow,
  table,
  textarea,
  toast,
} from "./admin-ui.js";

let host = null;
let plansHost = null;
let txHost = null;
let settings = null;
let plans = [];
let txState = { page: 1, pages: 1, total: 0, status: "" };
let txSeq = 0;

export function renderVip(container, context) {
  host = container;
  plansHost = el("div", { class: "vip-plans-host" });
  txHost = el("div", { class: "admin-list-host" });
  txState = { page: 1, pages: 1, total: 0, status: "" };
  host.replaceChildren(pageHead({ title: "VIP va to'lovlar", subtitle: "Tariflar, obuna holati va real tranzaksiyalar." }), loadingBlock());
  loadAll();
}

async function loadAll() {
  try {
    const [settingsData, plansData] = await Promise.all([api("/admin/settings"), api("/admin/vip/plans")]);
    settings = settingsData;
    plans = plansData || [];
    paint();
    loadTransactions();
  } catch (error) {
    host.replaceChildren(
      stateBlock({
        title: "VIP bo'limini yuklab bo'lmadi",
        text: error.message,
        iconName: "warning",
        error: true,
        action: button("Qayta urinish", { variant: "btn--outline", onClick: loadAll }),
      }),
    );
  }
}

function paint() {
  const runtime = settings?.runtime || {};
  const providerReady = Boolean(runtime.payment_provider_configured);
  const vipSwitch = switchRow("VIP bo'limi yoqilgan", settings?.vip_enabled, "O'chirilganda saytda VIP tariflar yashiriladi");
  const saveSettings = button("Holatni saqlash", {
    variant: "btn--red",
    onClick: async () => {
      saveSettings.disabled = true;
      try {
        const result = await api("/admin/settings", {
          method: "PATCH",
          body: { vip_enabled: vipSwitch.input.checked },
        });
        settings.vip_enabled = result.vip_enabled;
        toast("VIP holati yangilandi", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        saveSettings.disabled = false;
      }
    },
  });

  const paymentNotice = providerReady
    ? el(
        "div",
        { class: "admin-note admin-note--success" },
        el("strong", { text: "To'lov provayderi ulangan" }),
        el("span", { text: `Provayder: ${runtime.payment_provider}. Checkout server orqali tekshiriladi.` }),
      )
    : el(
        "div",
        { class: "admin-note admin-note--warning" },
        el("strong", { text: "To'lov provayderi sozlanmagan" }),
        el(
          "span",
          {},
          "PAYMENT_PROVIDER muhit o'zgaruvchisi orqali provayder ulanguncha foydalanuvchilarga xarid tugmasi faolsiz ko'rsatiladi va checkout 503 qaytaradi. Kodda yashirin provayder yo'q.",
        ),
      );

  const settingsPanel = panel(
    panelHead("Obuna sozlamalari", "VIP faqat serverdagi tasdiqlangan to'lov yoki audit qilinadigan admin granti bilan beriladi."),
    el("div", { class: "admin-settings-row" }, vipSwitch, saveSettings),
    paymentNotice,
    el(
      "div",
      { class: "admin-runtime-grid" },
      runtimeRow("Provayder", runtime.payment_provider || "none"),
      runtimeRow("Tranzaksiya webhook", runtime.payment_provider_configured ? "Sozlangan" : "Sozlanmagan"),
      runtimeRow("Telegram bot", runtime.telegram_configured ? `@${runtime.bot_username}` : "Sozlanmagan"),
      runtimeRow("Muhit", runtime.environment || "—"),
    ),
  );

  const planCards = el(
    "div",
    { class: "admin-plan-grid" },
    ...plans.map((plan) =>
      el(
        "article",
        { class: `admin-plan ${plan.is_active ? "" : "is-inactive"}`.trim() },
        el(
          "div",
          { class: "admin-plan__head" },
          el("h3", { text: plan.name }),
          plan.is_active ? badge("Faol", "success") : badge("O'chirilgan", "muted"),
        ),
        plan.name_cyrl ? el("p", { class: "admin-muted", text: plan.name_cyrl }) : null,
        el("p", { class: "admin-plan__price", text: `${formatNumber(plan.price)} ${plan.currency}` }),
        el("p", { class: "admin-plan__days", text: `${plan.days} kun · tartib ${plan.sort_order}` }),
        plan.benefits
          ? el(
              "ul",
              { class: "admin-plan__benefits" },
              ...plan.benefits
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => el("li", { text: line })),
            )
          : null,
        el(
          "div",
          { class: "admin-plan__actions" },
          iconButton("edit", { label: "Tahrirlash", onClick: () => openPlanForm(plan) }),
          iconButton("trash", {
            label: "O'chirish",
            variant: "admin-icon-btn--danger",
            onClick: () => removePlan(plan),
          }),
        ),
      ),
    ),
    el(
      "button",
      {
        class: "admin-plan admin-plan--add",
        type: "button",
        onclick: () => openPlanForm(null),
      },
      el("span", { class: "admin-plan__add-icon" }, iconPlus()),
      el("span", { text: "Yangi tarif qo'shish" }),
    ),
  );

  plansHost.replaceChildren(
    el(
      "div",
      { class: "admin-section-stack" },
      settingsPanel,
      panel(
        panelHead("VIP tariflar", "Narxlar UZS yoki tanlangan valyutada. Foydalanuvchi sahifasida real tariflar ko'rsatiladi."),
        planCards,
      ),
    ),
  );

  const statusSelect = selectControl(
    [
      { value: "", label: "Barcha holatlar" },
      { value: "paid", label: "To'langan" },
      { value: "pending", label: "Kutilmoqda" },
      { value: "failed", label: "Muvaffaqiyatsiz" },
    ],
    txState.status,
  );
  statusSelect.addEventListener("change", () => {
    txState.status = statusSelect.value;
    txState.page = 1;
    loadTransactions();
  });

  host.replaceChildren(
    pageHead({
      title: "VIP va to'lovlar",
      subtitle: "Tariflar, obuna holati va real tranzaksiyalar.",
    }),
    plansHost,
    panel(
      panelHead("Tranzaksiyalar", "To'lovlar faqat serverda tasdiqlangan webhook orqali yakunlanadi."),
      el("div", { class: "admin-toolbar" }, statusSelect),
      txHost,
    ),
  );
}

function runtimeRow(label, value) {
  return el("div", { class: "admin-runtime-row" }, el("span", { text: label }), el("strong", { text: String(value) }));
}

function iconPlus() {
  const span = el("span", { class: "icon" });
  span.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
  return span;
}

async function loadTransactions() {
  if (!txHost) return;
  const seq = ++txSeq;
  txHost.replaceChildren(loadingBlock("Tranzaksiyalar yuklanmoqda…"));
  const query = new URLSearchParams({ page: String(txState.page), page_size: "20" });
  if (txState.status) query.set("status", txState.status);
  try {
    const data = await api(`/admin/transactions?${query.toString()}`);
    if (seq !== txSeq) return;
    const columns = [
      { label: "ID", key: "id" },
      {
        label: "Foydalanuvchi",
        render: (tx) =>
          el(
            "div",
            { class: "admin-tx-user" },
            el("strong", { text: tx.user.first_name || "Nomsiz" }),
            el("span", { text: tx.user.username ? `@${tx.user.username}` : `ID: ${tx.user.telegram_id || "—"}` }),
          ),
      },
      { label: "Provayder", key: "provider" },
      { label: "Summa", render: (tx) => `${formatNumber(tx.amount)} ${tx.currency}` },
      { label: "Holat", render: (tx) => statusBadge(tx.status) },
      { label: "Yaratilgan", render: (tx) => formatDate(tx.created_at, true) },
      { label: "To'langan", render: (tx) => (tx.paid_at ? formatDate(tx.paid_at, true) : "—") },
    ];
    const summary = el(
      "div",
      { class: "admin-tx-summary" },
      el("span", { text: `Jami tranzaksiya: ${formatNumber(data.total)}` }),
      el("span", { text: `To'langan summa: ${formatNumber(data.paid_total)}` }),
      el("span", {
        class: data.payment_configured ? "admin-positive" : "admin-warning-text",
        text: data.payment_configured ? "To'lov provayderi faol" : "To'lov provayderi sozlanmagan",
      }),
    );
    const pager =
      data.pages > 1
        ? pagination({
            page: data.page,
            pages: data.pages,
            total: data.total,
            onPage: (page) => {
              if (page < 1 || page > data.pages) return;
              txState.page = page;
              loadTransactions();
            },
          })
        : null;
    txHost.replaceChildren(
      ...[
        summary,
        table(columns, data.items || [], { emptyText: "Tranzaksiyalar yo'q. VIP sotib olish hali sozlanmagan." }),
        pager,
      ].filter(Boolean),
    );
  } catch (error) {
    if (seq !== txSeq) return;
    txHost.replaceChildren(
      stateBlock({
        title: "Tranzaksiyalarni yuklab bo'lmadi",
        text: error.message,
        iconName: "warning",
        error: true,
        action: button("Qayta urinish", { variant: "btn--outline", onClick: loadTransactions }),
      }),
    );
  }
}

function openPlanForm(plan) {
  const isEdit = Boolean(plan);
  const source = plan || {};
  const nameInput = input({ type: "text", maxlength: "120", placeholder: "1 oylik" });
  nameInput.value = source.name || "";
  const nameCyrl = input({ type: "text", maxlength: "120", placeholder: "1 ойлик" });
  nameCyrl.value = source.name_cyrl || "";
  const daysInput = input({ type: "number", min: "1", max: "3650", value: String(source.days || 30) });
  const priceInput = input({ type: "number", min: "0", max: "100000000", value: String(source.price ?? 29000) });
  const currencyInput = input({ type: "text", maxlength: "3", value: source.currency || "UZS" });
  const benefits = textarea({ rows: 4, maxlength: "1000", placeholder: "Har bir imtiyoz yangi qatorda…" }, source.benefits || "");
  const sortInput = input({ type: "number", min: "0", max: "9999", value: String(source.sort_order || 0) });
  const active = switchRow("Faol", source.is_active !== false, "Saytda ko'rsatiladi");

  const saveButton = button(isEdit ? "Saqlash" : "Yaratish", { variant: "btn--red" });
  const modal = openModal({
    title: isEdit ? `Tarif — ${source.name}` : "Yangi VIP tarif",
    size: "md",
    body: el(
      "div",
      { class: "admin-form" },
      formGrid(
        field("Nomi (lotin)", nameInput),
        field("Nomi (kirill)", nameCyrl),
        field("Kunlar", daysInput),
        field("Narx", priceInput),
        field("Valyuta", currencyInput, { hint: "3 harfli kod, masalan UZS yoki USD." }),
        field("Tartib", sortInput),
        field("Imtiyozlar", benefits, { span: 2 }),
        el("div", { class: "admin-form-grid__full admin-switch-grid" }, active),
      ),
      formActions(button("Bekor qilish", { variant: "btn--ghost", onClick: () => modal.close() }), saveButton),
    ),
  });
  saveButton.addEventListener("click", async () => {
    const payload = {
      name: nameInput.value.trim(),
      name_cyrl: nameCyrl.value.trim() || null,
      days: Number(daysInput.value),
      price: Number(priceInput.value),
      currency: (currencyInput.value.trim() || "UZS").toUpperCase(),
      benefits: benefits.value.trim() || null,
      is_active: active.input.checked,
      sort_order: Number(sortInput.value) || 0,
    };
    if (!payload.name || !payload.days) {
      toast("Nom va kunlar sonini kiriting", "error");
      return;
    }
    if (!/^[A-Z]{3}$/.test(payload.currency)) {
      toast("Valyuta 3 ta harfdan iborat bo'lishi kerak", "error");
      return;
    }
    saveButton.disabled = true;
    try {
      await api(isEdit ? `/admin/vip/plans/${source.id}` : "/admin/vip/plans", {
        method: isEdit ? "PATCH" : "POST",
        body: payload,
      });
      toast(isEdit ? "Tarif yangilandi" : "Tarif yaratildi", "success");
      modal.close();
      plans = await api("/admin/vip/plans");
      paint();
    } catch (error) {
      toast(error.message, "error");
      saveButton.disabled = false;
    }
  });
}

async function removePlan(plan) {
  const ok = await confirmDialog({
    title: "Tarifni o'chirish",
    body: `"${plan.name}" tarifi o'chiriladi. Mavjud VIP foydalanuvchilarga ta'sir qilmaydi.`,
    confirmText: "O'chirish",
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/admin/vip/plans/${plan.id}?confirm=true`, { method: "DELETE" });
    toast("Tarif o'chirildi", "success");
    plans = await api("/admin/vip/plans");
    paint();
  } catch (error) {
    toast(error.message, "error");
  }
}
