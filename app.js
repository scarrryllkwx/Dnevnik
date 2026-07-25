// ACCOUNTS и DEFAULT_TEACHER_EMAIL объявлены в accounts.js (вне git, с хешами паролей).
// Этот файл их только использует и в открытом виде паролей не содержит.

const AUTH_KEY = "localDiary:isAuthorized";
const USER_NAME_KEY = "localDiary:userName";
const USER_EMAIL_KEY = "localDiary:userEmail";
const USER_ROLE_KEY = "localDiary:userRole";
const ROLE_STATE_KEY = "localDiary:roles";
const ENTRIES_KEY = "localDiary:entries";
const NOTIFIED_KEY = "localDiary:notified";

// Облачная синхронизация (Firebase). Если не настроено — работаем на localStorage.
let cloudEnabled = false;
let firebaseDb = null;
let entriesCache = [];
let teacherEmailCache = null;
let firstEntriesSnapshot = true;

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
const rankingList = document.querySelector("#rankingList");
const rankingRangeButton = document.querySelector("#rankingRangeButton");
const rankingCalendar = document.querySelector("#rankingCalendar");
const rankingPeriodLabel = document.querySelector("#rankingPeriodLabel");
const personalStatusAvatar = document.querySelector("#personalStatusAvatar");
const personalRankValue = document.querySelector("#personalRankValue");
const personalStatusMeta = document.querySelector("#personalStatusMeta");
const personalAverageValue = document.querySelector("#personalAverageValue");
const teacherStatusAvatar = document.querySelector("#teacherStatusAvatar");
const currentTeacherName = document.querySelector("#currentTeacherName");
const currentTeacherMeta = document.querySelector("#currentTeacherMeta");

let editingEntryId = null;
let activeDateInput = null;
let calendarViewDate = new Date();
let rankingViewDate = new Date();
let rankingStartDate = getCurrentMonthStartIso();
let rankingEndDate = getTodayIso();
let rankingDraftStart = "";
let rankingDraftEnd = "";
let lastRankingSignature = "";
const customSelectControls = new Map();
const customTimeControls = new Map();
const VOTING_ROOT = "teacherVotes";
const VOTING_LAUNCH_WEEK_KEY = "2026-07-27";
const VOTING_START_MINUTES = 9 * 60;
const VOTING_END_MINUTES = 11 * 60;
let activeVotingWeekKey = "";
let activeVotingRef = null;
let activeVotingHandler = null;
let weeklyVotingState = null;
let pendingVoteEmail = "";
let votingScheduleTimer = null;

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
  const stored = cloudEnabled ? teacherEmailCache : localStorage.getItem(ROLE_STATE_KEY);
  const storedTeacher = stored && getAccountByEmail(stored);

  if (storedTeacher) {
    return storedTeacher.email;
  }

  if (!cloudEnabled) {
    localStorage.setItem(ROLE_STATE_KEY, DEFAULT_TEACHER_EMAIL);
  }
  return DEFAULT_TEACHER_EMAIL;
}

function setTeacherEmail(email) {
  const account = getAccountByEmail(email);

  if (!account) return;

  if (cloudEnabled) {
    firebaseDb.ref("teacherEmail").set(account.email).catch((error) => console.warn("teacherEmail set failed", error));
  } else {
    localStorage.setItem(ROLE_STATE_KEY, account.email);
  }
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

function normalizeEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    studentEmail: entry.studentEmail || "",
    subject: entry.subject || "",
    homework: entry.homework || "",
    comment: entry.comment || "",
    assignmentDate: entry.assignmentDate || "",
    deadline: entry.deadlineTime || (entry.deadline && entry.deadline.includes(":") ? entry.deadline : ""),
    issuedAt: entry.issuedAt || "",
    grade: entry.grade || "",
  };
}

function loadEntries() {
  let list;

  if (cloudEnabled) {
    list = entriesCache;
  } else {
    try {
      list = JSON.parse(localStorage.getItem(ENTRIES_KEY)) || [];
    } catch {
      list = [];
    }
  }

  const array = Array.isArray(list) ? list : Object.values(list || {});
  return array
    .filter(Boolean)
    .map(normalizeEntry)
    .sort((a, b) => (b.issuedAt || "").localeCompare(a.issuedAt || ""));
}

function saveEntries(entries) {
  if (cloudEnabled) {
    const map = {};
    entries.forEach((entry) => {
      if (entry && entry.id) map[entry.id] = entry;
    });
    firebaseDb.ref("entries").set(map).catch((error) => console.warn("entries set failed", error));
    return;
  }

  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

// ---------- Firebase ----------
function initCloud() {
  if (typeof firebase === "undefined" || typeof FIREBASE_CONFIG === "undefined") return false;

  const config = FIREBASE_CONFIG;
  const notConfigured = !config || !config.databaseURL || String(config.apiKey || "").startsWith("ВСТАВЬТЕ");
  if (notConfigured) return false;

  try {
    firebase.initializeApp(config);
    firebaseDb = firebase.database();
    cloudEnabled = true;
    return true;
  } catch (error) {
    console.warn("Firebase init failed — работаем локально", error);
    return false;
  }
}

function subscribeCloud() {
  firebaseDb.ref("entries").on("value", (snapshot) => {
    const value = snapshot.val() || {};
    entriesCache = Array.isArray(value) ? value.filter(Boolean) : Object.values(value);

    const active = document.activeElement;
    const isEditingField =
      entriesBody && active && entriesBody.contains(active) && /INPUT|TEXTAREA/.test(active.tagName);

    if (!isEditingField) renderEntries();

    if (firstEntriesSnapshot) {
      firstEntriesSnapshot = false;
      initStudentNotifications();
    } else {
      syncStudentNotifications();
    }
  });

  firebaseDb.ref("teacherEmail").on("value", (snapshot) => {
    teacherEmailCache = snapshot.val() || null;
    renderDiaryMode();
    renderUserName();
    renderEntries();
  });
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
  return Boolean(entryForm || rankingList);
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
  return localDateToIso(new Date());
}

function getCurrentMonthStartIso() {
  const today = new Date();
  return localDateToIso(new Date(today.getFullYear(), today.getMonth(), 1));
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

function closeCustomMenus(except = null) {
  document.querySelectorAll(".custom-control.is-open").forEach((control) => {
    if (control === except) return;
    control.classList.remove("is-open");
    control.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "false");
  });
}

function refreshCustomSelect(select) {
  const control = customSelectControls.get(select);
  if (!control) return;

  const button = control.querySelector(".custom-select__button");
  const valueLabel = button.querySelector("span");
  const menu = control.querySelector(".custom-select__menu");
  const selectedOption = select.options[select.selectedIndex];

  valueLabel.textContent = selectedOption?.textContent || "Выберите значение";
  button.classList.toggle("is-placeholder", !select.value);
  button.disabled = select.disabled;
  menu.innerHTML = Array.from(select.options)
    .map((option) => `
      <button class="custom-option${option.value === select.value ? " is-selected" : ""}${!option.value ? " is-placeholder" : ""}"
        type="button" role="option" aria-selected="${option.value === select.value}" data-custom-value="${escapeHtml(option.value)}">
        <span>${escapeHtml(option.textContent)}</span>
        ${option.value === select.value ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>' : ""}
      </button>`)
    .join("");
}

function enhanceCustomSelect(select) {
  if (!select || customSelectControls.has(select)) return;

  select.classList.add("native-control-hidden");
  const control = document.createElement("div");
  control.className = "custom-control custom-select";
  control.innerHTML = `
    <button class="custom-select__button" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span></span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>
    </button>
    <div class="custom-select__menu" role="listbox"></div>`;
  select.insertAdjacentElement("afterend", control);
  customSelectControls.set(select, control);

  control.querySelector(".custom-select__button").addEventListener("click", () => {
    if (select.disabled) return;
    const willOpen = !control.classList.contains("is-open");
    closeCustomMenus(control);
    control.classList.toggle("is-open", willOpen);
    control.querySelector(".custom-select__button").setAttribute("aria-expanded", String(willOpen));
  });

  control.querySelector(".custom-select__menu").addEventListener("click", (event) => {
    const option = event.target.closest("[data-custom-value]");
    if (!option) return;
    select.value = option.dataset.customValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    refreshCustomSelect(select);
    closeCustomMenus();
  });

  select.addEventListener("change", () => refreshCustomSelect(select));
  refreshCustomSelect(select);
}

function syncCustomTimePicker(input) {
  const control = customTimeControls.get(input);
  if (!control) return;

  const [hour = "", minute = ""] = input.value ? input.value.split(":") : [];
  control.dataset.hour = hour;
  control.dataset.minute = minute;
  const label = control.querySelector(".custom-time__value");
  label.textContent = input.value || "Без времени";
  label.classList.toggle("is-placeholder", !input.value);
  control.querySelectorAll("[data-time-hour]").forEach((button) => button.classList.toggle("is-selected", button.dataset.timeHour === hour));
  control.querySelectorAll("[data-time-minute]").forEach((button) => button.classList.toggle("is-selected", button.dataset.timeMinute === minute));
}

function enhanceCustomTimePicker(input) {
  if (!input || customTimeControls.has(input)) return;

  input.classList.add("native-control-hidden");
  const control = document.createElement("div");
  control.className = "custom-control custom-time";
  const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
  control.innerHTML = `
    <button class="custom-select__button custom-time__button" type="button" aria-haspopup="dialog" aria-expanded="false">
      <span class="custom-time__value"></span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
    </button>
    <div class="custom-time__menu" role="dialog" aria-label="Выбор времени">
      <div class="custom-time__heading"><span>Часы</span><span>Минуты</span></div>
      <div class="custom-time__columns">
        <div class="custom-time__column">${hours.map((hour) => `<button type="button" data-time-hour="${hour}">${hour}</button>`).join("")}</div>
        <div class="custom-time__column">${minutes.map((minute) => `<button type="button" data-time-minute="${minute}">${minute}</button>`).join("")}</div>
      </div>
      <div class="custom-time__actions">
        <button type="button" data-time-action="clear">Без времени</button>
        <button type="button" data-time-action="apply">Готово</button>
      </div>
    </div>`;
  input.insertAdjacentElement("afterend", control);
  customTimeControls.set(input, control);

  control.querySelector(".custom-time__button").addEventListener("click", () => {
    const willOpen = !control.classList.contains("is-open");
    closeCustomMenus(control);
    control.classList.toggle("is-open", willOpen);
    control.querySelector(".custom-time__button").setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      control.querySelectorAll(".custom-time__column").forEach((column) => {
        const selected = column.querySelector(".is-selected");
        if (selected) column.scrollTop = Math.max(0, selected.offsetTop - column.clientHeight / 2 + selected.offsetHeight / 2);
      });
    }
  });

  control.querySelector(".custom-time__menu").addEventListener("click", (event) => {
    const hourButton = event.target.closest("[data-time-hour]");
    const minuteButton = event.target.closest("[data-time-minute]");
    const action = event.target.closest("[data-time-action]")?.dataset.timeAction;
    if (hourButton) control.dataset.hour = hourButton.dataset.timeHour;
    if (minuteButton) control.dataset.minute = minuteButton.dataset.timeMinute;

    if (hourButton || minuteButton) {
      const hour = control.dataset.hour || "00";
      const minute = control.dataset.minute || "00";
      input.value = `${hour}:${minute}`;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      syncCustomTimePicker(input);
    }
    if (action === "clear") {
      input.value = "";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      syncCustomTimePicker(input);
      closeCustomMenus();
    }
    if (action === "apply") closeCustomMenus();
  });

  syncCustomTimePicker(input);
}

function initCustomControls() {
  enhanceCustomSelect(studentSelect);
  enhanceCustomTimePicker(deadlineInput);

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".custom-control")) closeCustomMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCustomMenus();
  });
}

function getMoscowDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function getVotingSchedule(date = new Date()) {
  const moscow = getMoscowDateParts(date);
  const moscowDate = new Date(Date.UTC(moscow.year, moscow.month - 1, moscow.day));
  const mondayOffset = (moscowDate.getUTCDay() + 6) % 7;
  const monday = new Date(moscowDate);
  monday.setUTCDate(moscowDate.getUTCDate() - mondayOffset);
  const weekKey = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
  const currentMinutes = moscow.hour * 60 + moscow.minute;
  const isMonday = mondayOffset === 0;
  return {
    weekKey,
    isOpen: isMonday && currentMinutes >= VOTING_START_MINUTES && currentMinutes < VOTING_END_MINUTES,
    isEnded: mondayOffset > 0 || (isMonday && currentMinutes >= VOTING_END_MINUTES),
    startsAt: `${weekKey}T09:00:00+03:00`,
    endsAt: `${weekKey}T11:00:00+03:00`,
  };
}

function isVotingWeekEnabled(schedule) {
  return Boolean(schedule?.weekKey && schedule.weekKey >= VOTING_LAUNCH_WEEK_KEY);
}

function safeFirebaseKey(value) {
  return String(value || "").replace(/[.#$\[\]/]/g, "_");
}

function getVotingCounts(state = weeklyVotingState) {
  const counts = new Map(ACCOUNTS.map((account) => [normalize(account.email), 0]));
  Object.values(state?.votes || {}).forEach((vote) => {
    const candidateEmail = normalize(vote?.candidateEmail || "");
    if (counts.has(candidateEmail)) counts.set(candidateEmail, counts.get(candidateEmail) + 1);
  });
  return counts;
}

function getValidVoterCount(state = weeklyVotingState) {
  const voters = new Set();
  Object.values(state?.votes || {}).forEach((vote) => {
    const voterEmail = normalize(vote?.voterEmail || "");
    if (getAccountByEmail(voterEmail)) voters.add(voterEmail);
  });
  return voters.size;
}

function ensureVotingModal() {
  let modal = document.querySelector("#weeklyVotingModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "weeklyVotingModal";
  modal.className = "voting-overlay";
  modal.hidden = true;
  modal.innerHTML = `
    <section class="voting-modal" role="dialog" aria-modal="true" aria-labelledby="votingTitle">
      <div class="voting-modal__glow" aria-hidden="true"></div>
      <header class="voting-modal__head">
        <div>
          <p class="section-index">ПОНЕДЕЛЬНИК · 09:00–11:00 МСК</p>
          <h2 id="votingTitle">Кто сегодня у доски?</h2>
          <p>Выберите нового учителя недели.</p>
        </div>
        <button class="calendar-close" type="button" data-voting-action="close" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="voting-progress"><div class="voting-progress__bar"><span></span></div><strong class="voting-progress__label">0 из 0 проголосовали</strong></div>
      <div class="voting-candidates"></div>
      <footer class="voting-modal__footer">
        <span class="voting-selection-note">Выберите кандидата</span>
        <button class="primary-button" type="button" data-voting-action="submit" disabled><span>Отдать голос</span><svg viewBox="0 0 24 24"><path d="M5 12h14M14 7l5 5-5 5"/></svg></button>
      </footer>
    </section>`;
  document.body.append(modal);

  modal.addEventListener("click", handleVotingModalClick);
  return modal;
}

function getVotingResultSeenKey(weekKey) {
  return `votingResultSeen:${weekKey}:${safeFirebaseKey(getCurrentEmail())}`;
}

function hasSeenVotingResult(weekKey) {
  try {
    return localStorage.getItem(getVotingResultSeenKey(weekKey)) === "true";
  } catch {
    return false;
  }
}

function markVotingResultSeen(weekKey) {
  try {
    localStorage.setItem(getVotingResultSeenKey(weekKey), "true");
  } catch {
    // The announcement can still be closed when browser storage is unavailable.
  }
}

function ensureVotingResultModal() {
  let modal = document.querySelector("#weeklyVotingResultModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "weeklyVotingResultModal";
  modal.className = "voting-overlay voting-result-overlay";
  modal.hidden = true;
  modal.innerHTML = `
    <section class="voting-result-modal" role="dialog" aria-modal="true" aria-labelledby="votingResultTitle">
      <div class="voting-result-modal__glow" aria-hidden="true"></div>
      <div class="voting-result-modal__icon"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="m11 8 6 12 7-12 7 12 6-12 2 25H9L11 8Z"/><path d="M10 38h28"/></svg></div>
      <p class="section-index">ГОЛОСОВАНИЕ ЗАВЕРШЕНО</p>
      <h2 id="votingResultTitle"></h2>
      <p class="voting-result-modal__message"></p>
      <button class="primary-button" type="button" data-voting-result-action="close"><span>Понятно</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg></button>
    </section>`;
  document.body.append(modal);
  modal.addEventListener("click", (event) => {
    if (event.target.closest('[data-voting-result-action="close"]')) closeVotingResultModal(true);
  });
  return modal;
}

function showVotingResultModal(schedule) {
  const winner = getAccountByEmail(weeklyVotingState?.winnerEmail || "");
  if (!isVotingWeekEnabled(schedule) || !winner || hasSeenVotingResult(schedule.weekKey)) return;

  const modal = ensureVotingResultModal();
  const isWinner = normalize(winner.email) === normalize(getCurrentEmail());
  modal.classList.toggle("is-personal-winner", isWinner);
  modal.querySelector("#votingResultTitle").textContent = isWinner
    ? "Поздравляем!"
    : `${winner.name} — новый учитель`;
  modal.querySelector(".voting-result-modal__message").innerHTML = isWinner
    ? "Тебя выбрали <strong>УЧИТЕЛЕМ!</strong><br>На этой неделе дневник теперь ведёшь ты."
    : `Следующий учитель недели — <strong>${escapeHtml(winner.name)}</strong>.<br>Права переданы автоматически.`;
  modal.hidden = false;
  document.body.classList.add("has-modal");
  if (typeof gsap !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.fromTo(modal.querySelector(".voting-result-modal"), { autoAlpha: 0, y: 24, scale: .97 }, { autoAlpha: 1, y: 0, scale: 1, duration: .5, ease: "power3.out" });
  }
}

function closeVotingResultModal(markSeen = false) {
  const modal = document.querySelector("#weeklyVotingResultModal");
  if (markSeen) markVotingResultSeen(getVotingSchedule().weekKey);
  if (modal) modal.hidden = true;
  document.body.classList.remove("has-modal");
}

function renderVotingModal() {
  const modal = ensureVotingModal();
  const counts = getVotingCounts();
  const votes = weeklyVotingState?.votes || {};
  const currentVote = votes[safeFirebaseKey(getCurrentEmail())]?.candidateEmail || "";
  if (!pendingVoteEmail) pendingVoteEmail = currentVote;
  const votedCount = Object.keys(votes).length;
  const totalVoters = ACCOUNTS.length;

  modal.querySelector(".voting-candidates").innerHTML = ACCOUNTS.map((candidate) => {
    const selected = normalize(candidate.email) === normalize(pendingVoteEmail || "");
    const votesForCandidate = counts.get(normalize(candidate.email)) || 0;
    return `
      <button class="voting-candidate${selected ? " is-selected" : ""}" type="button" data-voting-candidate="${escapeHtml(candidate.email)}">
        <span class="voting-candidate__avatar">${escapeHtml(getStudentInitials(candidate.name))}</span>
        <span class="voting-candidate__copy"><strong>${escapeHtml(candidate.name)}</strong><small>${votesForCandidate} ${votesForCandidate === 1 ? "голос" : votesForCandidate >= 2 && votesForCandidate <= 4 ? "голоса" : "голосов"}</small></span>
        <span class="voting-candidate__check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg></span>
      </button>`;
  }).join("");

  modal.querySelector(".voting-progress__bar span").style.width = `${totalVoters ? Math.min(100, (votedCount / totalVoters) * 100) : 0}%`;
  modal.querySelector(".voting-progress__label").textContent = `${votedCount} из ${totalVoters} проголосовали`;
  const selectedAccount = getAccountByEmail(pendingVoteEmail);
  modal.querySelector(".voting-selection-note").textContent = selectedAccount ? `Ваш выбор: ${selectedAccount.name}` : "Выберите кандидата";
  modal.querySelector('[data-voting-action="submit"]').disabled = !selectedAccount;
}

function openVotingModal() {
  const modal = ensureVotingModal();
  renderVotingModal();
  modal.hidden = false;
  document.body.classList.add("has-modal");
  if (typeof gsap !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.fromTo(modal.querySelector(".voting-modal"), { autoAlpha: 0, y: 26, scale: .97 }, { autoAlpha: 1, y: 0, scale: 1, duration: .48, ease: "power3.out" });
    gsap.fromTo(modal.querySelectorAll(".voting-candidate"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: .4, stagger: .045, delay: .12, ease: "power2.out" });
  }
}

function closeVotingModal() {
  const modal = document.querySelector("#weeklyVotingModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("has-modal");
}

async function submitWeeklyVote(candidateEmail) {
  if (!cloudEnabled || !activeVotingRef || !getVotingSchedule().isOpen) return;
  const currentEmail = getCurrentEmail();
  if (!currentEmail || !getAccountByEmail(candidateEmail)) return;
  await activeVotingRef.child("votes").child(safeFirebaseKey(currentEmail)).set({
    voterEmail: currentEmail,
    candidateEmail,
    votedAt: firebase.database.ServerValue.TIMESTAMP,
  });
  sessionStorage.setItem(`votingDismissed:${getVotingSchedule().weekKey}`, "true");
  closeVotingModal();
}

function handleVotingModalClick(event) {
  const candidateButton = event.target.closest("[data-voting-candidate]");
  const action = event.target.closest("[data-voting-action]")?.dataset.votingAction;
  if (candidateButton) {
    pendingVoteEmail = candidateButton.dataset.votingCandidate;
    renderVotingModal();
    return;
  }
  if (action === "close") {
    sessionStorage.setItem(`votingDismissed:${getVotingSchedule().weekKey}`, "true");
    closeVotingModal();
  }
  if (action === "submit" && pendingVoteEmail) submitWeeklyVote(pendingVoteEmail).catch((error) => console.warn("Vote submit failed", error));
}

function chooseRandomWinner(state) {
  const counts = getVotingCounts(state);
  const highest = Math.max(0, ...counts.values());
  const leaders = highest === 0
    ? [...ACCOUNTS]
    : ACCOUNTS.filter((account) => counts.get(normalize(account.email)) === highest);
  if (!leaders.length) return "";
  const randomIndex = typeof crypto !== "undefined" && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0] % leaders.length
    : Math.floor(Math.random() * leaders.length);
  return leaders[randomIndex].email;
}

async function finalizeWeeklyVoting(schedule) {
  if (!isVotingWeekEnabled(schedule)) return;
  const allVotesReceived = getValidVoterCount(weeklyVotingState) >= ACCOUNTS.length;
  const finalizedEarly = schedule.isOpen && allVotesReceived;
  if (!cloudEnabled || !activeVotingRef || (!schedule.isEnded && !finalizedEarly) || weeklyVotingState?.winnerEmail) return;
  const proposedWinner = chooseRandomWinner(weeklyVotingState);
  if (!proposedWinner) return;

  const result = await activeVotingRef.transaction((state) => {
    if (!state) state = {};
    if (state.winnerEmail) return state;
    state.winnerEmail = proposedWinner;
    state.finalizedAt = firebase.database.ServerValue.TIMESTAMP;
    state.finalizedReason = finalizedEarly ? "all-voted" : "deadline";
    return state;
  });
  const winnerEmail = result.snapshot.val()?.winnerEmail;
  if (winnerEmail && getAccountByEmail(winnerEmail)) {
    await firebaseDb.ref("teacherEmail").set(winnerEmail);
  }
}

function handleVotingSnapshot(snapshot) {
  weeklyVotingState = snapshot.val() || {};
  const schedule = getVotingSchedule();
  if (!isVotingWeekEnabled(schedule)) {
    closeVotingModal();
    closeVotingResultModal(false);
    return;
  }
  const modal = document.querySelector("#weeklyVotingModal");
  if (modal && !modal.hidden) renderVotingModal();
  if (weeklyVotingState.winnerEmail) {
    closeVotingModal();
    showVotingResultModal(schedule);
    return;
  }
  if (schedule.isOpen) {
    const currentVote = weeklyVotingState.votes?.[safeFirebaseKey(getCurrentEmail())]?.candidateEmail || "";
    pendingVoteEmail = currentVote;
    if (!sessionStorage.getItem(`votingDismissed:${schedule.weekKey}`)) openVotingModal();
  } else {
    closeVotingModal();
  }
  finalizeWeeklyVoting(schedule).catch((error) => console.warn("Vote finalization failed", error));
}

function bindWeeklyVoting() {
  if (!cloudEnabled) return;
  const schedule = getVotingSchedule();
  if (!isVotingWeekEnabled(schedule)) {
    if (activeVotingRef && activeVotingHandler) activeVotingRef.off("value", activeVotingHandler);
    activeVotingWeekKey = "";
    activeVotingRef = null;
    activeVotingHandler = null;
    weeklyVotingState = null;
    closeVotingModal();
    closeVotingResultModal(false);
    return;
  }
  if (schedule.weekKey === activeVotingWeekKey && activeVotingRef) {
    if (schedule.isOpen && !weeklyVotingState?.winnerEmail && !sessionStorage.getItem(`votingDismissed:${schedule.weekKey}`)) openVotingModal();
    finalizeWeeklyVoting(schedule).catch((error) => console.warn("Vote finalization failed", error));
    return;
  }

  if (activeVotingRef && activeVotingHandler) activeVotingRef.off("value", activeVotingHandler);
  activeVotingWeekKey = schedule.weekKey;
  activeVotingRef = firebaseDb.ref(`${VOTING_ROOT}/${schedule.weekKey}`);
  activeVotingHandler = handleVotingSnapshot;
  activeVotingRef.on("value", activeVotingHandler);
  activeVotingRef.update({ startsAt: schedule.startsAt, endsAt: schedule.endsAt }).catch((error) => console.warn("Vote schedule init failed", error));
}

function initWeeklyVoting() {
  if (!cloudEnabled || !getCurrentEmail()) return;
  ensureVotingModal();
  ensureVotingResultModal();
  bindWeeklyVoting();
  if (votingScheduleTimer) clearInterval(votingScheduleTimer);
  votingScheduleTimer = setInterval(bindWeeklyVoting, 30_000);
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

function parseFivePointGrade(value) {
  const match = String(value || "").trim().match(/^([1-5])\s*[+-]?$/);
  return match ? Number(match[1]) : 0;
}

function getRankingEntries() {
  return loadEntries().filter((entry) => {
    if (!rankingStartDate && !rankingEndDate) return true;
    if (!entry.assignmentDate) return false;
    if (rankingStartDate && entry.assignmentDate < rankingStartDate) return false;
    if (rankingEndDate && entry.assignmentDate > rankingEndDate) return false;
    return true;
  });
}

function getStudentInitials(name) {
  return String(name || "У")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getRanking() {
  const entries = getRankingEntries();

  // Роль учителя меняется каждую неделю, поэтому рейтинг строим по всем аккаунтам.
  // Текущий учитель сохраняет свою историю заданий и оценок как ученик.
  return ACCOUNTS
    .map((student) => {
      const assignments = entries.filter((entry) => normalize(entry.studentEmail) === normalize(student.email));
      const points = assignments.reduce((sum, entry) => sum + parseFivePointGrade(entry.grade), 0);
      return {
        ...student,
        assignmentCount: assignments.length,
        gradedCount: assignments.filter((entry) => parseFivePointGrade(entry.grade) > 0).length,
        average: assignments.length ? points / assignments.length : 0,
      };
    })
    .sort((a, b) => b.average - a.average || b.gradedCount - a.gradedCount || a.name.localeCompare(b.name, "ru"));
}

function getAssignmentWord(count) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return "заданий";
  if (remainder10 === 1) return "задание";
  if (remainder10 >= 2 && remainder10 <= 4) return "задания";
  return "заданий";
}

function renderDiaryStatus() {
  if (!personalRankValue || !currentTeacherName) return;

  const currentEmail = getCurrentEmail();
  const currentAccount = getAccountByEmail(currentEmail);
  const ranking = getRanking();
  const position = ranking.findIndex((student) => normalize(student.email) === normalize(currentEmail));
  const personal = position >= 0 ? ranking[position] : null;
  const teacher = getAccountByEmail(getTeacherEmail());

  if (currentAccount && personal) {
    personalStatusAvatar.textContent = getStudentInitials(currentAccount.name);
    personalRankValue.textContent = `#${position + 1} в рейтинге`;
    personalStatusMeta.textContent = `${personal.assignmentCount} ${getAssignmentWord(personal.assignmentCount)} · ${personal.gradedCount} с оценкой`;
    personalAverageValue.textContent = personal.average.toFixed(2);
  } else {
    personalStatusAvatar.textContent = "—";
    personalRankValue.textContent = "Нет данных";
    personalStatusMeta.textContent = "Оценки пока не выставлены";
    personalAverageValue.textContent = "0.00";
  }

  if (teacher) {
    teacherStatusAvatar.textContent = getStudentInitials(teacher.name);
    currentTeacherName.textContent = teacher.name;
    currentTeacherMeta.textContent = normalize(teacher.email) === normalize(currentEmail)
      ? "Сейчас вы ведёте дневник"
      : "Сейчас выдаёт задания и оценки";
  } else {
    teacherStatusAvatar.textContent = "—";
    currentTeacherName.textContent = "Не назначен";
    currentTeacherMeta.textContent = "Роль обновляется автоматически";
  }
}

function rankMedalSvg(position) {
  if (position > 3) return "";
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8 3 4 6 4-6h4l-4.5 8.5"></path>
      <path d="M8.5 11.5 4 3h4"></path>
      <circle cx="12" cy="16" r="5"></circle>
      <path d="m10 16 1.3 1.3L14 14.7"></path>
    </svg>`;
}

function renderRanking() {
  if (!rankingList) return;

  const ranking = getRanking();
  const currentEmail = getCurrentEmail();

  if (!ranking.length) {
    rankingList.innerHTML = '<div class="ranking-empty">Добавьте учеников, чтобы сформировать рейтинг.</div>';
    return;
  }

  rankingList.innerHTML = ranking
    .map((student, index) => {
      const position = index + 1;
      const currentClass = normalize(student.email) === normalize(currentEmail) ? " is-current" : "";
      const taskWord = getAssignmentWord(student.assignmentCount);
      const score = student.average.toFixed(2);

      if (position <= 3) {
        return `
          <article class="rank-card${position === 1 ? " is-first" : ""}${currentClass}" data-rank-item data-rank-position="${position}">
            <div class="rank-card__top">
              <span class="rank-position">${rankMedalSvg(position)} #0${position}</span>
              <div class="rank-average">${score}<sup>/ 5</sup></div>
            </div>
            <div class="rank-card__person">
              <span class="rank-avatar">${escapeHtml(getStudentInitials(student.name))}</span>
              <div><strong>${escapeHtml(student.name)}</strong><span>${student.assignmentCount} ${taskWord} · ${student.gradedCount} с оценкой</span></div>
            </div>
          </article>`;
      }

      return `
        <article class="rank-row${currentClass}" data-rank-item>
          <span class="rank-row__position">#${String(position).padStart(2, "0")}</span>
          <div class="rank-row__person"><span class="rank-avatar">${escapeHtml(getStudentInitials(student.name))}</span>${escapeHtml(student.name)}</div>
          <span class="rank-row__tasks">${student.assignmentCount} ${taskWord}</span>
          <strong class="rank-row__score">${score}</strong>
        </article>`;
    })
    .join("");

  const signature = ranking.map((student) => `${student.email}:${student.average}:${student.assignmentCount}`).join("|") + rankingStartDate + rankingEndDate;
  if (signature !== lastRankingSignature && typeof gsap !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.fromTo("[data-rank-item]", { autoAlpha: 0, y: 18, scale: .985 }, { autoAlpha: 1, y: 0, scale: 1, duration: .55, stagger: .065, ease: "power3.out", clearProps: "transform,opacity,visibility" });
  }
  lastRankingSignature = signature;
}

function renderEntries() {
  const entries = getVisibleEntries();
  const tableWrap = document.querySelector(".diary-table-wrap");
  const teacher = isTeacher();

  renderDiaryStatus();

  if (!entriesBody || !tableWrap) {
    renderRanking();
    return;
  }

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

  renderRanking();
}

function renderUserName() {
  const label = document.querySelector("#userLabel");
  const userName = sessionStorage.getItem(USER_NAME_KEY);

  if (label && userName) {
    label.textContent = isTeacher() ? `Панель учителя: ${userName}` : `Дневник: ${userName}`;
  }
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
  refreshCustomSelect(studentSelect);
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
  if (actionHeading) actionHeading.hidden = !teacher;
  if (studentHeading) studentHeading.hidden = !teacher;
  if (issuedHeading) issuedHeading.hidden = !teacher;

  if (teacher) {
    fillStudentSelect();
    if (assignmentDateInput && !assignmentDateInput.value) {
      assignmentDateInput.value = getTodayIso();
    }
    syncDeadlineMin();
    syncDateButtons();
  }
}

function setEditMode(entry) {
  editingEntryId = entry ? entry.id : null;
  const submitLabel = submitEntryButton.querySelector("span");
  if (submitLabel) submitLabel.textContent = entry ? "Сохранить" : "Выдать задание";
  else submitEntryButton.textContent = entry ? "Сохранить" : "Выдать задание";
  cancelEditButton.hidden = !entry;
}

function resetEntryForm() {
  entryForm.reset();
  studentSelect.disabled = false;
  assignmentDateInput.value = getTodayIso();
  deadlineInput.value = "";
  commentInput.value = "";
  syncDateButtons();
  refreshCustomSelect(studentSelect);
  syncCustomTimePicker(deadlineInput);
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

function formatRankingPeriod() {
  if (!rankingStartDate || !rankingEndDate) return "Средний балл за всё время";
  if (rankingStartDate === rankingEndDate) return `Средний балл за ${formatDate(rankingStartDate)}`;
  return `Средний балл с ${formatDate(rankingStartDate)} по ${formatDate(rankingEndDate)}`;
}

function syncRankingPeriodUi() {
  if (rankingPeriodLabel) rankingPeriodLabel.textContent = formatRankingPeriod();
  const label = rankingRangeButton?.querySelector("span");
  if (label) {
    label.textContent = rankingStartDate && rankingEndDate
      ? rankingStartDate === rankingEndDate
        ? formatDate(rankingStartDate)
        : `${formatDate(rankingStartDate)} — ${formatDate(rankingEndDate)}`
      : "Выбрать период";
  }
}

function syncRangeDraftLabel() {
  const label = document.querySelector("#rangeDraftLabel");
  if (!label) return;

  if (!rankingDraftStart) label.textContent = "Выберите начало";
  else if (!rankingDraftEnd) label.textContent = `${formatDate(rankingDraftStart)} — выберите конец`;
  else label.textContent = `${formatDate(rankingDraftStart)} — ${formatDate(rankingDraftEnd)}`;
}

function renderRangeCalendar() {
  if (!rankingCalendar) return;

  const title = rankingCalendar.querySelector(".range-month-title");
  const days = rankingCalendar.querySelector("#rangeDays");
  const year = rankingViewDate.getFullYear();
  const month = rankingViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const today = getTodayIso();

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
    button.dataset.rangeDate = iso;
    button.classList.toggle("is-muted", date.getMonth() !== month);
    button.classList.toggle("is-today", iso === today);
    button.classList.toggle("is-in-range", Boolean(rankingDraftStart && rankingDraftEnd && iso > rankingDraftStart && iso < rankingDraftEnd));
    button.classList.toggle("is-range-start", iso === rankingDraftStart);
    button.classList.toggle("is-range-end", iso === rankingDraftEnd);
    days.append(button);
  }

  syncRangeDraftLabel();
}

function positionRankingCalendar() {
  if (!rankingCalendar || !rankingRangeButton) return;
  const rect = rankingRangeButton.getBoundingClientRect();
  const width = rankingCalendar.offsetWidth || 350;
  const left = Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10));
  const fitsBelow = rect.bottom + 12 + rankingCalendar.offsetHeight < window.innerHeight;
  rankingCalendar.style.left = `${left}px`;
  rankingCalendar.style.top = fitsBelow ? `${rect.bottom + 12}px` : `${Math.max(10, rect.top - rankingCalendar.offsetHeight - 12)}px`;
}

function openRankingCalendar() {
  if (!rankingCalendar || !rankingRangeButton) return;
  rankingDraftStart = rankingStartDate;
  rankingDraftEnd = rankingEndDate;
  const anchorDate = isoToLocalDate(rankingStartDate) || new Date();
  rankingViewDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  rankingCalendar.hidden = false;
  rankingRangeButton.setAttribute("aria-expanded", "true");
  renderRangeCalendar();
  positionRankingCalendar();

  if (typeof gsap !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.fromTo(rankingCalendar, { autoAlpha: 0, y: -10, scale: .97 }, { autoAlpha: 1, y: 0, scale: 1, duration: .3, ease: "power3.out", clearProps: "transform,opacity,visibility" });
  }
}

function closeRankingCalendar() {
  if (!rankingCalendar || rankingCalendar.hidden) return;
  rankingCalendar.hidden = true;
  rankingRangeButton?.setAttribute("aria-expanded", "false");
}

function handleRangeCalendarClick(event) {
  event.stopPropagation();
  const action = event.target.closest("[data-range-action]")?.dataset.rangeAction;
  const dateButton = event.target.closest("[data-range-date]");

  if (action === "prev" || action === "next") {
    rankingViewDate.setMonth(rankingViewDate.getMonth() + (action === "prev" ? -1 : 1));
    renderRangeCalendar();
    return;
  }

  if (action === "close") {
    closeRankingCalendar();
    return;
  }

  if (action === "reset") {
    rankingStartDate = getCurrentMonthStartIso();
    rankingEndDate = getTodayIso();
    rankingDraftStart = rankingStartDate;
    rankingDraftEnd = rankingEndDate;
    syncRankingPeriodUi();
    renderRanking();
    closeRankingCalendar();
    return;
  }

  if (action === "apply") {
    if (rankingDraftStart) {
      rankingStartDate = rankingDraftStart;
      rankingEndDate = rankingDraftEnd || rankingDraftStart;
    }
    syncRankingPeriodUi();
    renderRanking();
    closeRankingCalendar();
    return;
  }

  if (!dateButton) return;
  const selected = dateButton.dataset.rangeDate;
  if (!rankingDraftStart || rankingDraftEnd) {
    rankingDraftStart = selected;
    rankingDraftEnd = "";
  } else if (selected < rankingDraftStart) {
    rankingDraftEnd = rankingDraftStart;
    rankingDraftStart = selected;
  } else {
    rankingDraftEnd = selected;
  }
  renderRangeCalendar();
}

function initMotion() {
  if (typeof gsap === "undefined") return;

  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.to(".ambient__beam--one", { xPercent: -12, yPercent: 17, scale: 1.2, duration: 13, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(".ambient__beam--two", { xPercent: 18, yPercent: -12, scale: 1.25, duration: 17, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(".ambient__orb", { y: -30, rotation: 18, scale: 1.08, duration: 8, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(".ambient__grid", { y: 25, duration: 9, repeat: -1, yoyo: true, ease: "sine.inOut" });

    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (document.querySelector("[data-animate='header']")) {
      intro.from("[data-animate='header']", { autoAlpha: 0, y: -18, duration: .65 });
      if (document.querySelector("[data-animate='hero']")) {
        intro
          .from("[data-animate='hero'] .eyebrow", { autoAlpha: 0, x: -20, duration: .45 }, "<.15")
          .from("[data-animate='hero'] h1", { autoAlpha: 0, y: 34, duration: .85 }, "<");
      }
      intro.from("[data-animate='panel']", { autoAlpha: 0, y: 36, scale: .985, duration: .75, stagger: .11 }, "<.1");
    } else {
      intro.from("[data-animate='auth-story'] > *", { autoAlpha: 0, y: 24, duration: .75, stagger: .12 })
        .from("[data-animate='auth-panel']", { autoAlpha: 0, x: 38, scale: .98, duration: .85 }, "<.15");
    }

    const glow = document.querySelector(".cursor-glow");
    if (glow && window.matchMedia("(pointer: fine)").matches) {
      const xTo = gsap.quickTo(glow, "x", { duration: 1.1, ease: "power3.out" });
      const yTo = gsap.quickTo(glow, "y", { duration: 1.1, ease: "power3.out" });
      const move = (event) => {
        xTo(event.clientX - window.innerWidth / 2);
        yTo(event.clientY - window.innerHeight * .4);
      };
      window.addEventListener("pointermove", move, { passive: true });
      return () => window.removeEventListener("pointermove", move);
    }
    return undefined;
  });
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
  renderRanking();
  renderDiaryStatus();
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
  const usingCloud = initCloud();
  if (usingCloud) {
    subscribeCloud();
    initWeeklyVoting();
  }

  renderDiaryMode();
  renderUserName();
  initCustomControls();
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
  renderEntries();

  // Уведомления. В облачном режиме базовую отметку делает первый снимок данных (subscribeCloud).
  if (!usingCloud) initStudentNotifications();
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

if (rankingList && !entryForm) {
  const rankingUsingCloud = initCloud();
  if (rankingUsingCloud) {
    subscribeCloud();
    initWeeklyVoting();
  }
  renderUserName();
  renderRanking();
}

if (rankingRangeButton && rankingCalendar) {
  const weekdays = document.querySelector("#rangeWeekdays");
  if (weekdays) weekdays.innerHTML = WEEKDAY_NAMES.map((day) => `<span>${day}</span>`).join("");
  rankingRangeButton.addEventListener("click", () => {
    if (rankingCalendar.hidden) openRankingCalendar();
    else closeRankingCalendar();
  });
  rankingCalendar.addEventListener("click", handleRangeCalendarClick);
  document.addEventListener("click", (event) => {
    if (rankingCalendar.hidden || rankingCalendar.contains(event.target) || rankingRangeButton.contains(event.target)) return;
    closeRankingCalendar();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRankingCalendar();
  });
  window.addEventListener("resize", () => {
    if (!rankingCalendar.hidden) positionRankingCalendar();
  });
  syncRankingPeriodUi();
}

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}

initMotion();
