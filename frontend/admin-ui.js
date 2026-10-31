/* Shared building blocks for the KINORA admin dashboard. */
import { request, getToken, apiUrl } from "./api.js";
import { t, formatNumber, formatDate } from "./i18n.js";
import { el, icon, toast, openModal, confirmDialog, promptDialog } from "./ui.js";

let authErrorHandler = null;

export function setAuthErrorHandler(fn) {
  authErrorHandler = fn;
}

export async function api(path, options = {}) {
  const fullPath = path.startsWith("/api/") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  try {
    return await request(fullPath, { ...options, auth: true });
  } catch (error) {
    if (error.status === 401 && authErrorHandler) authErrorHandler(error);
    throw error;
  }
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

export function formatDateTime(value) {
  return value ? formatDate(value, true) : "—";
}

export function debounce(fn, wait = 320) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* ---------- Page building ---------- */

export function pageHead({ eyebrow = "KINORA ADMIN", title, subtitle = "", actions = [] }) {
  return el(
    "div",
    { class: "admin-page-head" },
    el(
      "div",
      {},
      el("p", { class: "admin-page-head__eyebrow", text: eyebrow }),
      el("h1", { class: "admin-page-head__title", text: title }),
      subtitle ? el("p", { class: "admin-page-head__sub", text: subtitle }) : null,
    ),
    actions.length ? el("div", { class: "admin-page-head__actions" }, ...actions) : null,
  );
}

export function button(label, { variant = "", iconName = "", onClick, title = "", type = "button", disabled = false } = {}) {
  return el(
    "button",
    { class: `btn ${variant} btn--compact`.trim(), type, title: title || undefined, disabled, onclick: onClick },
    iconName ? icon(iconName) : null,
    label ? el("span", { text: label }) : null,
  );
}

export function iconButton(iconName, { label, onClick, variant = "", disabled = false } = {}) {
  return el(
    "button",
    {
      class: `admin-icon-btn ${variant}`.trim(),
      type: "button",
      attrs: { "aria-label": label, title: label },
      disabled,
      onclick: onClick,
    },
    icon(iconName),
  );
}

export function panel(...children) {
  return el("section", { class: "admin-panel" }, ...children);
}

export function panelHead(title, subtitle = "", actions = []) {
  return el(
    "div",
    { class: "admin-panel__head" },
    el(
      "div",
      {},
      el("h2", { class: "admin-panel__title", text: title }),
      subtitle ? el("p", { class: "admin-panel__sub", text: subtitle }) : null,
    ),
    actions.length ? el("div", { class: "admin-panel__actions" }, ...actions) : null,
  );
}

export function stateBlock({ title, text = "", iconName = "spark", action = null, error = false }) {
  return el(
    "div",
    { class: `state-block admin-state ${error ? "state-block--error" : ""}`.trim() },
    el("div", { class: "state-block__icon" }, icon(iconName)),
    el("h2", { class: "state-block__title", text: title }),
    text ? el("p", { class: "state-block__text", text }) : null,
    action || null,
  );
}

export function loadingBlock(message = "Yuklanmoqda…") {
  return stateBlock({ title: message, iconName: "refresh" });
}

/* ---------- Cards / tables ---------- */

export function statCard({ label, value, meta = "", iconName = "trending", tone = "red" }) {
  return el(
    "article",
    { class: `stat-card stat-card--${tone}` },
    el(
      "div",
      { class: "stat-card__top" },
      el("span", { class: "stat-card__icon" }, icon(iconName)),
      el("span", { class: "stat-card__meta", text: meta }),
    ),
    el("strong", { class: "stat-card__value", text: value }),
    el("span", { class: "stat-card__label", text: label }),
  );
}

export function table(columns, rows, { emptyText = "Ma'lumot yo'q", rowClass = null } = {}) {
  const thead = el("thead", {}, el("tr", {}, ...columns.map((column) =>
    el("th", { class: column.className || "", text: column.label })
  )));
  const tbody = el("tbody");
  if (!rows.length) {
    tbody.append(
      el(
        "tr",
        { class: "admin-table__empty-row" },
        el("td", { attrs: { colspan: String(columns.length) }, text: emptyText }),
      ),
    );
  }
  rows.forEach((row, index) => {
    const tr = el("tr", { class: rowClass ? rowClass(row, index) || "" : "" });
    columns.forEach((column) => {
      const cell = el("td", { class: column.className || "" });
      const content = column.render ? column.render(row, index) : row[column.key];
      if (content instanceof Node) cell.append(content);
      else cell.textContent = content ?? "—";
      tr.append(cell);
    });
    tbody.append(tr);
  });
  return el("div", { class: "admin-table-wrap" }, el("table", { class: "admin-table" }, thead, tbody));
}

export function pagination({ page, pages, total, onPage }) {
  const wrap = el("div", { class: "admin-pagination" });
  wrap.append(el("span", { class: "admin-pagination__info", text: `Jami: ${formatNumber(total)} · ${page}/${pages} sahifa` }));
  const controls = el("div", { class: "admin-pagination__controls" });
  controls.append(
    iconButton("chevronLeft", {
      label: "Oldingi sahifa",
      disabled: page <= 1,
      onClick: () => onPage(page - 1),
    }),
    iconButton("chevronRight", {
      label: "Keyingi sahifa",
      disabled: page >= pages,
      onClick: () => onPage(page + 1),
    }),
  );
  wrap.append(controls);
  return wrap;
}

export function badge(text, variant = "muted") {
  return el("span", { class: `badge badge--${variant}`, text });
}

export function statusBadge(status) {
  const map = {
    active: ["Faol", "success"],
    published: ["Chop etilgan", "success"],
    paid: ["To'langan", "success"],
    scheduled: ["Rejalashtirilgan", "warning"],
    pending: ["Kutilmoqda", "warning"],
    draft: ["Qoralama", "muted"],
    paused: ["To'xtatilgan", "muted"],
    expired: ["Muddati o'tgan", "danger"],
    failed: ["Muvaffaqiyatsiz", "danger"],
  };
  const [label, variant] = map[status] || [status, "muted"];
  return badge(label, variant);
}

/* ---------- Forms ---------- */

export function field(label, control, { hint = "", span = 2, className = "" } = {}) {
  return el(
    "label",
    { class: `admin-field ${className}`.trim(), style: span ? `grid-column: span ${span};` : "" },
    el("span", { class: "admin-field__label", text: label }),
    control,
    hint ? el("span", { class: "admin-field__hint", text: hint }) : null,
  );
}

export function input(props = {}) {
  return el("input", { class: "admin-input", ...props });
}

export function textarea(props = {}, value = "") {
  const node = el("textarea", { class: "admin-input admin-textarea", ...props });
  node.value = value || "";
  return node;
}

export function selectControl(options, value, props = {}) {
  const node = el("select", { class: "admin-input admin-select", ...props });
  for (const option of options) {
    node.append(el("option", { value: String(option.value), text: option.label }));
  }
  node.value = String(value ?? "");
  if (node.value !== String(value ?? "")) {
    node.value = String(options[0]?.value ?? "");
  }
  return node;
}

export function checkbox(label, checked, props = {}) {
  const inputNode = el("input", { type: "checkbox", class: "admin-checkbox", ...props });
  inputNode.checked = Boolean(checked);
  const wrap = el("label", { class: "admin-check" }, inputNode, el("span", { text: label }));
  wrap.checked = () => inputNode.checked;
  wrap.input = inputNode;
  return wrap;
}

export function switchRow(label, checked, hint = "") {
  const inputNode = el("input", { type: "checkbox", class: "admin-switch__input" });
  inputNode.checked = Boolean(checked);
  const node = el(
    "label",
    { class: "admin-switch-row" },
    el(
      "span",
      { class: "admin-switch-row__text" },
      el("strong", { text: label }),
      hint ? el("span", { text: hint }) : null,
    ),
    el("span", { class: "admin-switch" }, inputNode, el("span", { class: "admin-switch__track" })),
  );
  node.input = inputNode;
  return node;
}

export function formGrid(...children) {
  return el("div", { class: "admin-form-grid" }, ...children);
}

export function formActions(...children) {
  return el("div", { class: "admin-form-actions" }, ...children);
}

export function inputValue(node) {
  return node?.value?.trim?.() ?? node?.value ?? "";
}

/* ---------- Uploads ---------- */

export function uploadField({ label, value = "", kind, onChange = null, hint = "" }) {
  let current = value || "";
  const preview = el("div", { class: "upload-field__preview" });
  const text = el("input", {
    class: "admin-input",
    type: "text",
    placeholder: "/uploads/... yoki https://...",
  });
  text.value = current;
  const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true });
  const uploadButton = el(
    "button",
    { class: "btn btn--outline btn--compact", type: "button" },
    icon("upload"),
    el("span", { text: "Rasm yuklash" }),
  );
  const status = el("span", { class: "upload-field__status" });

  function paint() {
    preview.replaceChildren();
    if (current) {
      preview.append(el("img", { src: current, alt: "" }));
      preview.classList.add("has-image");
    } else {
      preview.append(icon("image"));
      preview.classList.remove("has-image");
    }
    text.value = current;
  }

  uploadButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    const maxMb = 8;
    if (file.size > maxMb * 1024 * 1024) {
      toast(`Rasm hajmi ${maxMb} MB dan oshmasligi kerak`, "error");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    uploadButton.disabled = true;
    status.textContent = "Yuklanmoqda…";
    try {
      const result = await api("/admin/upload", { method: "POST", body, form: true });
      current = result.url;
      paint();
      status.textContent = `${result.width}×${result.height} · ${Math.round(result.bytes / 1024)} KB`;
      onChange?.(current);
      toast("Rasm yuklandi", "success");
    } catch (error) {
      status.textContent = "";
      toast(error.message, "error");
    } finally {
      uploadButton.disabled = false;
    }
  });
  text.addEventListener("input", () => {
    current = text.value.trim();
    paintPreviewOnly();
    onChange?.(current);
  });
  function paintPreviewOnly() {
    preview.replaceChildren();
    if (current) {
      preview.append(el("img", { src: current, alt: "" }));
      preview.classList.add("has-image");
    } else {
      preview.append(icon("image"));
      preview.classList.remove("has-image");
    }
  }

  paint();
  const node = el(
    "div",
    { class: "upload-field" },
    el("span", { class: "admin-field__label", text: label }),
    el(
      "div",
      { class: "upload-field__body" },
      preview,
      el(
        "div",
        { class: "upload-field__controls" },
        text,
        el("div", { class: "upload-field__actions" }, uploadButton, status),
      ),
    ),
    hint ? el("span", { class: "admin-field__hint", text: hint }) : null,
  );
  node.getValue = () => current;
  node.setValue = (next) => {
    current = next || "";
    paint();
  };
  return node;
}

/* ---------- Charts (inline SVG) ---------- */

function niceMax(value) {
  if (!value || value <= 4) return 4;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const ratio = value / power;
  const step = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10;
  return step * power;
}

function shortLabel(label) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label.slice(5);
  if (/^\d{4}-\d{2}$/.test(label)) return `${label.slice(5)}.${label.slice(2, 4)}`;
  return label;
}

function chartShell(svg, series) {
  const legend = el(
    "div",
    { class: "admin-chart__legend" },
    ...series.map((item) =>
      el(
        "span",
        { class: "admin-chart__legend-item" },
        el("span", { class: "admin-chart__dot", style: `background:${item.color}` }),
        el("span", { text: item.name }),
      ),
    ),
  );
  return el("div", { class: "admin-chart" }, el("div", { class: "admin-chart__plot", html: svg }), legend);
}

export function lineChart({ labels, series, height = 210 }) {
  const width = 680;
  const padding = { left: 40, right: 14, top: 14, bottom: 26 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((item) => item.values)));
  const xFor = (index) => padding.left + (labels.length <= 1 ? plotW / 2 : (index * plotW) / (labels.length - 1));
  const yFor = (value) => padding.top + plotH * (1 - value / max);
  const parts = [];
  for (let step = 0; step <= 4; step += 1) {
    const value = (max / 4) * step;
    const y = yFor(value);
    parts.push(
      `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`,
      `<text x="${padding.left - 8}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="#74747f">${Math.round(value)}</text>`,
    );
  }
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  labels.forEach((label, index) => {
    if (index % labelStep !== 0 && index !== labels.length - 1) return;
    parts.push(
      `<text x="${xFor(index)}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#74747f">${escapeHtml(shortLabel(label))}</text>`,
    );
  });
  series.forEach((item, seriesIndex) => {
    const points = item.values.map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`);
    if (!points.length) return;
    if (seriesIndex === 0) {
      const area = `${padding.left},${padding.top + plotH} ${points.join(" ")} ${xFor(item.values.length - 1)},${padding.top + plotH}`;
      parts.push(`<polygon points="${area}" fill="${item.color}" opacity="0.09"/>`);
    }
    parts.push(
      `<polyline points="${points.join(" ")}" fill="none" stroke="${item.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
    item.values.forEach((value, index) => {
      if (labels.length > 16 && index % 2 !== 0) return;
      parts.push(`<circle cx="${xFor(index)}" cy="${yFor(value)}" r="2.4" fill="${item.color}"/>`);
    });
  });
  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik" preserveAspectRatio="none">${parts.join("")}</svg>`;
  return chartShell(svg, series);
}

export function barChart({ labels, series, height = 210 }) {
  const width = 680;
  const padding = { left: 40, right: 14, top: 14, bottom: 26 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((item) => item.values)));
  const groupW = plotW / Math.max(1, labels.length);
  const barW = Math.max(2, (groupW * 0.62) / Math.max(1, series.length));
  const yFor = (value) => padding.top + plotH * (1 - value / max);
  const parts = [];
  for (let step = 0; step <= 4; step += 1) {
    const value = (max / 4) * step;
    const y = yFor(value);
    parts.push(
      `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`,
      `<text x="${padding.left - 8}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="#74747f">${Math.round(value)}</text>`,
    );
  }
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  labels.forEach((label, index) => {
    if (index % labelStep !== 0 && index !== labels.length - 1) return;
    parts.push(
      `<text x="${padding.left + groupW * index + groupW / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#74747f">${escapeHtml(shortLabel(label))}</text>`,
    );
  });
  labels.forEach((_, index) => {
    const groupCenter = padding.left + groupW * index + groupW / 2;
    series.forEach((item, seriesIndex) => {
      const value = item.values[index] || 0;
      const x = groupCenter - (barW * series.length) / 2 + seriesIndex * barW;
      const y = yFor(value);
      const barHeight = Math.max(value > 0 ? 1.5 : 0, padding.top + plotH - y);
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${(padding.top + plotH - barHeight).toFixed(1)}" width="${(barW - 1.5).toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2" fill="${item.color}"/>`,
      );
    });
  });
  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik" preserveAspectRatio="none">${parts.join("")}</svg>`;
  return chartShell(svg, series);
}

/* ---------- Dialogs / downloads ---------- */

export function confirmAction(options) {
  return confirmDialog(options);
}

export function askNumber(options) {
  return promptDialog(options);
}

export async function downloadBackupFile(name) {
  const response = await fetch(apiUrl(`/api/admin/backups/${encodeURIComponent(name)}/download`), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) {
    let message = "Zaxira nusxasini yuklab bo'lmadi";
    try {
      const data = await response.json();
      if (data?.detail) message = data.detail;
    } catch {
      /* Plain-text error. */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function timestampInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function timestampFromInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export { t, formatNumber, formatDate, openModal, confirmDialog, promptDialog, toast, icon, el, apiUrl };
