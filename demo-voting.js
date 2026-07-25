const demoCounts = new Map(ACCOUNTS.map((account) => [account.email, 0]));
let demoSelectedEmail = "";
let demoCurrentVoteEmail = "";
let demoToastTimer = null;

function demoInitials(name) {
  return String(name || "У").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function demoTotalVotes() {
  return [...demoCounts.values()].reduce((sum, value) => sum + value, 0);
}

function demoVoteWord(count) {
  const last100 = count % 100;
  const last10 = count % 10;
  if (last100 >= 11 && last100 <= 14) return "голосов";
  if (last10 === 1) return "голос";
  if (last10 >= 2 && last10 <= 4) return "голоса";
  return "голосов";
}

function getDemoAccount(email) {
  return ACCOUNTS.find((account) => account.email === email);
}

function renderDemoVoting() {
  const total = demoTotalVotes();
  const candidates = document.querySelector("#demoCandidates");
  candidates.innerHTML = ACCOUNTS.map((candidate) => {
    const count = demoCounts.get(candidate.email) || 0;
    const selected = demoSelectedEmail === candidate.email;
    return `<button class="voting-candidate${selected ? " is-selected" : ""}" type="button" data-demo-candidate="${candidate.email}">
      <span class="voting-candidate__avatar">${demoInitials(candidate.name)}</span>
      <span class="voting-candidate__copy"><strong>${candidate.name}</strong><small>${count} ${demoVoteWord(count)}</small></span>
      <span class="voting-candidate__check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg></span>
    </button>`;
  }).join("");
  document.querySelector("#demoProgressBar").style.width = `${Math.min(100, total / ACCOUNTS.length * 100)}%`;
  document.querySelector("#demoProgressLabel").textContent = `${total} из ${ACCOUNTS.length} проголосовали`;
  const selected = getDemoAccount(demoSelectedEmail);
  document.querySelector("#demoSelectionNote").textContent = selected ? `Ваш выбор: ${selected.name}` : "Выберите кандидата";
  document.querySelector("#demoSubmitButton").disabled = !selected;
}

function showDemoOverlay() {
  document.querySelector("#demoVoteView").hidden = false;
  document.querySelector("#demoResultView").hidden = true;
  const overlay = document.querySelector("#demoVotingOverlay");
  overlay.hidden = false;
  document.body.classList.add("has-modal");
  renderDemoVoting();
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
}

function hideDemoOverlay() {
  const overlay = document.querySelector("#demoVotingOverlay");
  overlay.classList.remove("is-visible");
  document.body.classList.remove("has-modal");
  window.setTimeout(() => { overlay.hidden = true; }, 260);
}

function showDemoToast() {
  const toast = document.querySelector("#demoToast");
  window.clearTimeout(demoToastTimer);
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  demoToastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => { toast.hidden = true; }, 240);
  }, 3200);
}

function submitDemoVote() {
  if (!demoSelectedEmail) return;
  if (demoCurrentVoteEmail) demoCounts.set(demoCurrentVoteEmail, Math.max(0, (demoCounts.get(demoCurrentVoteEmail) || 0) - 1));
  demoCounts.set(demoSelectedEmail, (demoCounts.get(demoSelectedEmail) || 0) + 1);
  demoCurrentVoteEmail = demoSelectedEmail;
  renderDemoVoting();
  hideDemoOverlay();
  window.setTimeout(showDemoToast, 280);
}

function setDemoTie() {
  demoCounts.forEach((_, email) => demoCounts.set(email, 0));
  demoCounts.set(ACCOUNTS[0].email, 3);
  demoCounts.set(ACCOUNTS[1].email, 3);
  demoSelectedEmail = "";
  demoCurrentVoteEmail = "";
  renderDemoVoting();
}

function setNobodyVoted() {
  demoCounts.forEach((_, email) => demoCounts.set(email, 0));
  demoSelectedEmail = "";
  demoCurrentVoteEmail = "";
  renderDemoVoting();
}

function randomDemoWinner(candidates) {
  const randomValue = crypto.getRandomValues(new Uint32Array(1))[0];
  return candidates[randomValue % candidates.length];
}

function finishDemoVoting() {
  const highest = Math.max(0, ...demoCounts.values());
  const leaders = highest === 0
    ? [...ACCOUNTS]
    : ACCOUNTS.filter((account) => (demoCounts.get(account.email) || 0) === highest);
  const winner = randomDemoWinner(leaders);
  const total = demoTotalVotes();

  document.querySelector("#demoWinnerName").textContent = `${winner.name} — новый учитель`;
  if (total === 0) {
    document.querySelector("#demoWinnerNote").textContent = "Никто не проголосовал. Система случайно выбрала учителя среди всех шести кандидатов и автоматически передала ему права.";
  } else if (leaders.length > 1) {
    document.querySelector("#demoWinnerNote").textContent = `Ничья между ${leaders.map((account) => account.name).join(" и ")}. Система случайно определила победителя и автоматически передала ему права.`;
  } else {
    document.querySelector("#demoWinnerNote").textContent = `${highest} ${demoVoteWord(highest)} из ${total}. Права учителя переданы автоматически.`;
  }
  document.querySelector("#demoVoteView").hidden = true;
  document.querySelector("#demoResultView").hidden = false;
}

function restartDemo() {
  setNobodyVoted();
  document.querySelector("#demoVoteView").hidden = false;
  document.querySelector("#demoResultView").hidden = true;
}

document.querySelector("#demoCandidates").addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo-candidate]");
  if (!button) return;
  demoSelectedEmail = button.dataset.demoCandidate;
  renderDemoVoting();
});
document.querySelector("#demoSubmitButton").addEventListener("click", submitDemoVote);
document.querySelector("#demoFinishButton").addEventListener("click", finishDemoVoting);
document.querySelector("#demoRestartButton").addEventListener("click", restartDemo);
document.querySelector("#demoCloseButton").addEventListener("click", hideDemoOverlay);
document.querySelector("#demoOpenButton").addEventListener("click", showDemoOverlay);

renderDemoVoting();
window.addEventListener("load", () => window.setTimeout(showDemoOverlay, 380));
