// ACCOUNTS и DEFAULT_TEACHER_EMAIL объявлены в accounts.js (вне git, с хешами паролей).
// Этот файл их только использует и в открытом виде паролей не содержит.

const AUTH_KEY = "localDiary:isAuthorized";
const USER_NAME_KEY = "localDiary:userName";
const USER_EMAIL_KEY = "localDiary:userEmail";
const USER_ROLE_KEY = "localDiary:userRole";
const ROLE_STATE_KEY = "localDiary:roles";
const ENTRIES_KEY = "localDiary:entries";
const NOTIFIED_KEY = "localDiary:notified";

const loginForm = document.querySelector("#loginForm");
const entryForm = document.querySelector("#entryForm");
const entriesBody = document.querySelector("#entriesBody");
const emptyState = document.querySelector("#emptyState");
const logoutButton = document.querySelector("#logoutButton");
const submitEntryButton = document.querySelector("#submitEntryButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const studentSelect = document.querySelector("#studentSelect");
const assignmentDateInput = document.querySelector("#assignmentDateInput");
const deadlineInput = document.querySelector("#deadlineInput");
const assignmentDateButton = document.querySelector("#assignmentDateButton");
const commentInput = document.querySelector("#commentInput");
const teacherTools = document.querySelector("#teacherTools");
const transferTeacherSelect = document.querySelector("#transferTeacherSelect");
const transferTeacherButton = document.querySelector("#transferTeacherButton");

let editingEntryId = null;
let activeDateInput = null;
let calendarViewDate = new Date();

const ALL_STUDENTS_VALUE = "__all_students__";
const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function normalize(value) {
  return value.trim().toLowerCase();
}

function getCurrentEmail() {
  return sessionStorage.getItem(USER_EMAIL_KEY) || "";
}

function getAccountByEmail(email) {
  return ACCOUNTS.find((account) => normalize(account.email) === normalize(email));
}

function getTeacherEmail() {
  const stored = localStorage.getItem(ROLE_STATE_KEY);
  const storedTeacher = stored && getAccountByEmail(stored);

  if (storedTeacher) {
    return storedTeacher.email;
  }

  localStorage.setItem(ROLE_STATE_KEY, DEFAULT_TEACHER_EMAIL);
  return DEFAULT_TEACHER_EMAIL;
}

function setTeacherEmail(email) {
  const account = getAccountByEmail(email);

  if (!account) return;

  localStorage.setItem(ROLE_STATE_KEY, account.email);
  syncSessionRole();
}

function getRoleForEmail(email) {
  return normalize(email) === normalize(getTeacherEmail()) ? "teacher" : "student";
}

function syncSessionRole() {
  const email = getCurrentEmail();

  if (!email) return;

  sessionStorage.setItem(USER_ROLE_KEY, getRoleForEmail(email));
}

function isTeacher() {
  syncSessionRole();
  return sessionStorage.getItem(USER_ROLE_KEY) === "teacher";
}

function getStudents() {
  const teacherEmail = getTeacherEmail();
  return ACCOUNTS.filter((account) => normalize(account.email) !== normalize(teacherEmail));
}

function loadEntries() {
  try {
    const entries = JSON.parse(localStorage.getItem(ENTRIES_KEY)) || [];
    return entries.map((entry) => ({
      id: entry.id || crypto.randomUUID(),
      studentEmail: entry.studentEmail || "",
      subject: entry.subject || "",
      homework: entry.homework || "",
      comment: entry.comment || "",
      assignmentDate: entry.assignmentDate || "",
      deadline: entry.deadlineTime || (entry.deadline && entry.deadline.includes(":") ? entry.deadline : ""),
      issuedAt: entry.issuedAt || "",
      grade: entry.grade || "",
    }));
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

function requireAuth() {
  if (isDiaryPage() && sessionStorage.getItem(AUTH_KEY) !== "true") {
    window.location.href = "login.html";
  }
}

function redirectAuthorizedUser() {
  if (isLoginPage() && sessionStorage.getItem(AUTH_KEY) === "true") {
    syncSessionRole();
    window.location.href = "diary.html";
  }
}

function isDiaryPage() {
  return Boolean(entryForm);
}

function isLoginPage() {
  return Boolean(loginForm);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isoToLocalDate(value) {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function localDateToIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "-";

  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function formatDeadline(date, time) {
  if (!date && !time) return "-";
  if (!date) return time;
  if (!time) return formatDate(date);

  return `${formatDate(date)} ${time}`;
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncDeadlineMin() {
  if (!assignmentDateInput || !deadlineInput) return;

  syncDateButtons();
}

function getDateButton(input) {
  if (input === assignmentDateInput) return assignmentDateButton;
  return null;
}

function syncDateButtons() {
  if (assignmentDateButton) {
    assignmentDateButton.textContent = assignmentDateInput.value ? formatDate(assignmentDateInput.value) : "Выберите дату";
  }

}

function ensureCalendar() {
  let calendar = document.querySelector("#datePicker");

  if (calendar) return calendar;

  calendar = document.createElement("div");
  calendar.id = "datePicker";
  calendar.className = "date-picker-popover";
  calendar.hidden = true;
  calendar.innerHTML = `
    <div class="date-picker-head">
      <button class="date-nav" type="button" data-calendar-action="prev" aria-label="Предыдущий месяц">‹</button>
      <strong class="date-picker-title"></strong>
      <button class="date-nav" type="button" data-calendar-action="next" aria-label="Следующий месяц">›</button>
    </div>
    <div class="date-weekdays"></div>
    <div class="date-days"></div>
    <div class="date-picker-actions">
      <button type="button" data-calendar-action="clear">Очистить</button>
      <button type="button" data-calendar-action="today">Сегодня</button>
    </div>
  `;
  document.body.append(calendar);

  calendar.querySelector(".date-weekdays").innerHTML = WEEKDAY_NAMES.map((day) => `<span>${day}</span>`).join("");
  calendar.addEventListener("click", handleCalendarClick);
  document.addEventListener("click", closeCalendarOnOutsideClick);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideCalendar();
  });

  return calendar;
}

function openCalendar(input) {
  const calendar = ensureCalendar();
  const button = getDateButton(input);
  const current = isoToLocalDate(input.value) || isoToLocalDate(assignmentDateInput.value) || new Date();

  activeDateInput = input;
  calendarViewDate = new Date(current.getFullYear(), current.getMonth(), 1);
  renderCalendar();

  const rect = button.getBoundingClientRect();
  calendar.style.left = `${Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 318)}px`;
  calendar.style.top = `${rect.bottom + window.scrollY + 8}px`;
  calendar.hidden = false;
}

function hideCalendar() {
  const calendar = document.querySelector("#datePicker");
  if (calendar) calendar.hidden = true;
  activeDateInput = null;
}

function renderCalendar() {
  const calendar = ensureCalendar();
  const title = calendar.querySelector(".date-picker-title");
  const days = calendar.querySelector(".date-days");
  const selected = activeDateInput ? activeDateInput.value : "";
  const today = getTodayIso();
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);

  title.textContent = `${MONTH_NAMES[month]} ${year}`;
  days.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    const iso = localDateToIso(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-day";
    button.textContent = date.getDate();
    button.dataset.date = iso;
    button.classList.toggle("is-muted", date.getMonth() !== month);
    button.classList.toggle("is-today", iso === today);
    button.classList.toggle("is-selected", iso === selected);

    days.append(button);
  }
}

function handleCalendarClick(event) {
  const action = event.target.closest("[data-calendar-action]")?.dataset.calendarAction;
  const dayButton = event.target.closest("[data-date]");

  if (action === "prev") {
    calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
    renderCalendar();
    return;
  }

  if (action === "next") {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
    renderCalendar();
    return;
  }

  if (action === "today" && activeDateInput) {
    activeDateInput.value = getTodayIso();
    syncDeadlineMin();
    hideCalendar();
    return;
  }

  if (action === "clear" && activeDateInput) {
    if (activeDateInput !== assignmentDateInput) {
      activeDateInput.value = "";
      syncDeadlineMin();
      hideCalendar();
    }
    return;
  }

  if (dayButton && activeDateInput) {
    activeDateInput.value = dayButton.dataset.date;
    syncDeadlineMin();
    hideCalendar();
  }
}

function closeCalendarOnOutsideClick(event) {
  const calendar = document.querySelector("#datePicker");
  if (!calendar || calendar.hidden) return;

  if (calendar.contains(event.target) || event.target.closest("[data-date-target]")) return;

  hideCalendar();
}

function getVisibleEntries() {
  const entries = loadEntries();

  if (isTeacher()) {
    return entries.filter((entry) => {
      const student = getAccountByEmail(entry.studentEmail);
      return student && getRoleForEmail(student.email) === "student";
    });
  }

  const currentEmail = getCurrentEmail();
  return entries.filter((entry) => normalize(entry.studentEmail) === normalize(currentEmail));
}

function getStudentName(email) {
  return getAccountByEmail(email)?.name || "Ученик";
}

function renderEntries() {
  const entries = getVisibleEntries();
  const tableWrap = document.querySelector(".diary-table-wrap");
  const teacher = isTeacher();

  if (!entriesBody || !tableWrap) return;

  document.body.classList.toggle("teacher-mode", teacher);
  document.body.classList.toggle("student-mode", !teacher);
  tableWrap.classList.toggle("is-empty", entries.length === 0);
  emptyState.hidden = entries.length !== 0;

  const emptyTitle = emptyState.querySelector("strong");
  const emptyText = emptyState.querySelector("span");

  if (emptyTitle && emptyText) {
    emptyTitle.textContent = teacher ? "Пока пусто" : "Пока нет заданий";
    emptyText.textContent = teacher
      ? "Выберите ученика и выдайте первое домашнее задание."
      : "Учитель пока не выдал домашнее задание.";
  }

  entriesBody.innerHTML = entries
    .map((entry) => {
      const grade = entry.grade ? escapeHtml(entry.grade) : "";
      const gradeClass = grade ? "grade-pill" : "grade-pill empty";
      const isEditing = teacher && editingEntryId === entry.id;
      const studentCell = teacher ? `<td class="student-cell">${escapeHtml(getStudentName(entry.studentEmail))}</td>` : "";
      const issuedCell = teacher ? `<td class="date-cell issued-cell">${escapeHtml(formatDateTime(entry.issuedAt))}</td>` : "";
      const deadlineCell = isEditing
        ? `
            <td class="date-cell deadline-cell">
              <div class="inline-deadline">
                <input class="inline-date-input" type="date" value="${escapeHtml(entry.assignmentDate || getTodayIso())}" data-edit-field="assignmentDate">
                <input class="inline-time-input" type="time" step="60" value="${escapeHtml(entry.deadline)}" data-edit-field="deadline">
              </div>
            </td>
          `
        : `<td class="date-cell deadline-cell">${escapeHtml(formatDeadline(entry.assignmentDate, entry.deadline))}</td>`;
      const comment = escapeHtml(entry.comment);
      const homeworkCell = isEditing
        ? `
            <td>
              <input class="inline-homework-input" type="text" value="${escapeHtml(entry.homework)}" data-edit-field="homework">
              <input class="inline-comment-input" type="text" value="${comment}" placeholder="Комментарий" data-edit-field="comment">
            </td>
          `
        : teacher
        ? `
            <td>
              <div class="homework-text">${escapeHtml(entry.homework)}</div>
              ${comment ? `<textarea class="comment-editor" data-action="comment" data-id="${entry.id}" aria-label="Комментарий">${comment}</textarea>` : ""}
            </td>
          `
        : `
            <td>
              <div class="homework-text">${escapeHtml(entry.homework)}</div>
              ${comment ? `<div class="comment-note">${comment}</div>` : ""}
            </td>
          `;
      const gradeCell = teacher
        ? `<input class="grade-editor" type="text" inputmode="numeric" maxlength="3" value="${grade}" data-action="grade" data-id="${entry.id}" aria-label="Оценка">`
        : `<span class="${gradeClass}">${grade || "-"}</span>`;
      const editButton = isEditing
        ? `
                <button class="edit-button is-confirm" type="button" data-action="edit" data-id="${entry.id}" aria-label="Подтвердить редактирование">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.2 4.2L19 6.9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </button>
          `
        : `
                <button class="edit-button" type="button" data-action="edit" data-id="${entry.id}" aria-label="Редактировать запись">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 16.8V20h3.2L17.7 9.5l-3.2-3.2L4 16.8Z"></path>
                    <path d="M16.1 4.7l1.1-1.1c.6-.6 1.6-.6 2.2 0l1 1c.6.6.6 1.6 0 2.2l-1.1 1.1-3.2-3.2Z"></path>
                  </svg>
                </button>
          `;
      const actionsCell = teacher
        ? `
            <td>
              <div class="action-buttons">
                ${editButton}
                <button class="delete-button" type="button" data-action="delete" data-id="${entry.id}" aria-label="Удалить запись">&times;</button>
              </div>
            </td>
          `
        : "";

      return `
        <tr data-entry-id="${entry.id}">
          ${studentCell}
          ${issuedCell}
          ${homeworkCell}
          ${deadlineCell}
          <td class="grade-cell">${gradeCell}</td>
          ${actionsCell}
        </tr>
      `;
    })
    .join("");
}

function renderUserName() {
  const label = document.querySelector("#userLabel");
  const userName = sessionStorage.getItem(USER_NAME_KEY);

  if (label && userName) {
    label.textContent = isTeacher() ? `Панель учителя: ${userName}` : `Дневник: ${userName}`;
  }
}

function fillSelect(select, accounts, placeholder) {
  if (!select) return;

  select.innerHTML = `<option value="">${placeholder}</option>`;
  accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.email;
    option.textContent = account.name;
    select.append(option);
  });
}

function fillStudentSelect() {
  if (!studentSelect) return;

  studentSelect.innerHTML = `<option value="">Выберите ученика</option>`;
  const allOption = document.createElement("option");
  allOption.value = ALL_STUDENTS_VALUE;
  allOption.textContent = "Все ученики";
  studentSelect.append(allOption);

  getStudents().forEach((account) => {
    const option = document.createElement("option");
    option.value = account.email;
    option.textContent = account.name;
    studentSelect.append(option);
  });
}

function renderDiaryMode() {
  const teacher = isTeacher();
  const composer = document.querySelector(".entry-composer");
  const actionHeading = document.querySelector(".action-heading");
  const studentHeading = document.querySelector(".student-heading");
  const issuedHeading = document.querySelector(".issued-heading");

  document.body.classList.toggle("teacher-mode", teacher);
  document.body.classList.toggle("student-mode", !teacher);

  if (composer) composer.hidden = !teacher;
  if (teacherTools) teacherTools.hidden = !teacher;
  if (actionHeading) actionHeading.hidden = !teacher;
  if (studentHeading) studentHeading.hidden = !teacher;
  if (issuedHeading) issuedHeading.hidden = !teacher;

  if (teacher) {
    fillStudentSelect();
    fillSelect(transferTeacherSelect, getStudents(), "Передать роль...");
    if (assignmentDateInput && !assignmentDateInput.value) {
      assignmentDateInput.value = getTodayIso();
    }
    syncDeadlineMin();
    syncDateButtons();
  }
}

function setEditMode(entry) {
  editingEntryId = entry ? entry.id : null;
  submitEntryButton.textContent = entry ? "Сохранить" : "Выдать задание";
  cancelEditButton.hidden = !entry;
}

function resetEntryForm() {
  entryForm.reset();
  studentSelect.disabled = false;
  assignmentDateInput.value = getTodayIso();
  deadlineInput.value = "";
  commentInput.value = "";
  syncDateButtons();
  setEditMode(null);
  document.querySelector("#homeworkInput").focus();
}

/* ---------- Системные уведомления ---------- */
function notificationsSupported() {
  return typeof Notification !== "undefined";
}

function canNotify() {
  return notificationsSupported() && Notification.permission === "granted";
}

async function ensureNotificationPermission() {
  if (!notificationsSupported() || Notification.permission === "denied") return false;
  if (Notification.permission === "granted") return true;

  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

function showNotification(title, body, tag) {
  if (!canNotify()) return;

  try {
    new Notification(title, { body, tag, icon: "assets/logo.svg", badge: "assets/favicon.svg" });
  } catch {
    /* уведомления могут быть недоступны (например, при открытии через file://) */
  }
}

function notifiedKeyFor(email) {
  return `${NOTIFIED_KEY}:${normalize(email)}`;
}

function getNotifiedIds(email) {
  try {
    return new Set(JSON.parse(localStorage.getItem(notifiedKeyFor(email))) || []);
  } catch {
    return new Set();
  }
}

function setNotifiedIds(email, ids) {
  localStorage.setItem(notifiedKeyFor(email), JSON.stringify([...ids]));
}

function describeAssignment(entry) {
  const when = formatDeadline(entry.assignmentDate, entry.deadline);
  return when && when !== "-" ? `${entry.homework}\nСрок: ${when}` : entry.homework;
}

// Доставка ученику: уведомляем о заданиях, которые ему ещё не показывали.
function syncStudentNotifications() {
  const email = getCurrentEmail();
  if (!email || isTeacher() || !canNotify()) return;

  const seen = getNotifiedIds(email);
  const mine = loadEntries().filter((entry) => normalize(entry.studentEmail) === normalize(email));
  const fresh = mine.filter((entry) => entry.id && !seen.has(entry.id));

  fresh.forEach((entry) => {
    showNotification("Новое задание", describeAssignment(entry), entry.id);
    seen.add(entry.id);
  });

  if (fresh.length) setNotifiedIds(email, seen);
}

// При первом заходе ученика помечаем уже существующие задания «показанными», чтобы не спамить старыми.
function initStudentNotifications() {
  const email = getCurrentEmail();
  if (!email || isTeacher()) return;

  if (localStorage.getItem(notifiedKeyFor(email)) === null) {
    const ids = loadEntries()
      .filter((entry) => normalize(entry.studentEmail) === normalize(email))
      .map((entry) => entry.id);
    setNotifiedIds(email, new Set(ids));
    return;
  }

  syncStudentNotifications();
}

function updateNotifyButton() {
  const button = document.querySelector("#notifyButton");
  if (!button) return;

  const needsPermission = notificationsSupported() && Notification.permission === "default";
  button.hidden = !needsPermission;
}

function saveEntry(event) {
  event.preventDefault();

  if (!isTeacher()) return;
  editingEntryId = null;

  const homework = document.querySelector("#homeworkInput").value.trim();
  const comment = commentInput.value.trim();
  const assignmentDate = assignmentDateInput.value;
  const deadline = deadlineInput.value;
  const selectedStudentEmail = studentSelect.value;

  if (!homework || !assignmentDate || (!editingEntryId && !selectedStudentEmail)) return;

  const entries = loadEntries();

  if (editingEntryId) {
    const updatedEntries = entries.map((entry) =>
      entry.id === editingEntryId ? { ...entry, homework, comment, assignmentDate, deadline } : entry
    );
    saveEntries(updatedEntries);
  } else {
    const recipients =
      selectedStudentEmail === ALL_STUDENTS_VALUE ? getStudents().map((student) => student.email) : [selectedStudentEmail];
    const issuedAt = new Date().toISOString();

    recipients.forEach((studentEmail) => {
      entries.unshift({
        id: crypto.randomUUID(),
        studentEmail,
        homework,
        comment,
        assignmentDate,
        deadline,
        issuedAt,
        grade: "",
      });
    });
    saveEntries(entries);

    const names = recipients.map(getStudentName);
    const target = names.length === 1 ? names[0] : `${names.length} ученикам`;
    // Запрос разрешения (это пользовательский клик) + уведомление-подтверждение учителю.
    ensureNotificationPermission().then((granted) => {
      if (granted) showNotification("Задание отправлено", `${target} · ${homework}`, "assignment-sent");
    });
  }

  resetEntryForm();
  renderEntries();
}

function editEntry(entry) {
  if (!isTeacher()) return;

  editingEntryId = editingEntryId === entry.id ? null : entry.id;
  renderEntries();

  if (editingEntryId) {
    entriesBody.querySelector(`[data-entry-id="${entry.id}"] [data-edit-field="homework"]`)?.focus();
  }
}

function saveGrade(input) {
  if (!isTeacher()) return;

  const entries = loadEntries().map((entry) =>
    entry.id === input.dataset.id ? { ...entry, grade: input.value.trim() } : entry
  );

  saveEntries(entries);
}

function saveComment(input) {
  if (!isTeacher()) return;

  const entries = loadEntries().map((entry) =>
    entry.id === input.dataset.id ? { ...entry, comment: input.value.trim() } : entry
  );

  saveEntries(entries);
}

function saveInlineEdit(input) {
  if (!isTeacher()) return;

  const row = input.closest("tr");
  const id = row?.dataset.entryId;
  if (!id) return;

  const fields = row.querySelectorAll("[data-edit-field]");
  const patch = {};

  fields.forEach((field) => {
    patch[field.dataset.editField] = field.value.trim();
  });

  const entries = loadEntries().map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
  saveEntries(entries);
}

function handleEntryAction(event) {
  const button = event.target.closest("button[data-id]");
  if (!button || !isTeacher()) return;

  const entries = loadEntries();
  const entry = entries.find((item) => item.id === button.dataset.id);
  if (!entry) return;

  if (button.dataset.action === "edit") {
    editEntry(entry);
    return;
  }

  const updatedEntries = entries.filter((item) => item.id !== button.dataset.id);
  if (editingEntryId === button.dataset.id) {
    resetEntryForm();
  }

  saveEntries(updatedEntries);
  renderEntries();
}

function handleGradeChange(event) {
  const input = event.target.closest('[data-action="grade"]');
  if (!input || !isTeacher()) return;

  saveGrade(input);
}

function handleCommentChange(event) {
  const input = event.target.closest('[data-action="comment"]');
  if (!input || !isTeacher()) return;

  saveComment(input);
}

function handleInlineEditChange(event) {
  const input = event.target.closest("[data-edit-field]");
  if (!input || !isTeacher()) return;

  saveInlineEdit(input);
}

function transferTeacherRole() {
  if (!isTeacher() || !transferTeacherSelect.value) return;

  setTeacherEmail(transferTeacherSelect.value);
  resetEntryForm();
  renderDiaryMode();
  renderUserName();
  renderEntries();
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function login(event) {
  event.preventDefault();

  const email = normalize(document.querySelector("#email").value);
  const password = document.querySelector("#password").value;
  const error = document.querySelector("#errorMessage");
  const candidate = ACCOUNTS.find((item) => normalize(item.email) === email);
  const passwordHash = await sha256Hex(password);
  const account = candidate && candidate.passwordHash === passwordHash ? candidate : null;

  if (account) {
    sessionStorage.setItem(AUTH_KEY, "true");
    sessionStorage.setItem(USER_NAME_KEY, account.name);
    sessionStorage.setItem(USER_EMAIL_KEY, account.email);
    sessionStorage.setItem(USER_ROLE_KEY, getRoleForEmail(account.email));
    window.location.href = "diary.html";
    return;
  }

  error.textContent = "Неверный email или пароль.";
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(USER_NAME_KEY);
  sessionStorage.removeItem(USER_EMAIL_KEY);
  sessionStorage.removeItem(USER_ROLE_KEY);
  window.location.href = "login.html";
}

redirectAuthorizedUser();
requireAuth();

if (loginForm) {
  loginForm.addEventListener("submit", login);
}

if (entryForm) {
  renderDiaryMode();
  renderUserName();
  entryForm.addEventListener("submit", saveEntry);
  assignmentDateButton.addEventListener("click", () => openCalendar(assignmentDateInput));
  entriesBody.addEventListener("click", handleEntryAction);
  entriesBody.addEventListener("input", handleGradeChange);
  entriesBody.addEventListener("input", handleCommentChange);
  entriesBody.addEventListener("input", handleInlineEditChange);
  entriesBody.addEventListener("change", handleGradeChange);
  entriesBody.addEventListener("change", handleCommentChange);
  entriesBody.addEventListener("change", handleInlineEditChange);
  cancelEditButton.addEventListener("click", () => {
    resetEntryForm();
  });
  transferTeacherButton.addEventListener("click", transferTeacherRole);
  renderEntries();

  // Уведомления
  initStudentNotifications();
  updateNotifyButton();

  const notifyButton = document.querySelector("#notifyButton");
  if (notifyButton) {
    notifyButton.addEventListener("click", async () => {
      await ensureNotificationPermission();
      updateNotifyButton();
      syncStudentNotifications();
    });
  }

  // Если задание добавлено в другой вкладке того же браузера — узнаём сразу.
  window.addEventListener("storage", (event) => {
    if (event.key !== ENTRIES_KEY) return;
    renderEntries();
    syncStudentNotifications();
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}
