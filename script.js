const STORAGE_KEY = "myexam_v1";
const $ = (id) => document.getElementById(id);
let data = loadData();
let currentExamId = null;
let editingExamId = null;
let editingQuestionId = null;
let activeAttempt = null;
let activeQuestionIndex = 0;
let timerInterval = null;
let secondsLeft = 0;
let currentResultId = null;
let toastTimeout = null;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.exams) && Array.isArray(saved.results)) return saved;
  } catch (error) {}
  return { exams: [], results: [] };
}
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    showToast("مساحة التخزين ممتلئة. صدّر بياناتك أو احذف بعض المحاولات.");
    return false;
  }
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2600);
}
function showView(view) {
  document.querySelectorAll(".view").forEach(el => el.classList.add("hidden"));
  const target = $(view + "-view");
  if (target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.view === view || (view === "manage" && el.dataset.view === "exams") || (view === "result" && el.dataset.view === "results")));
  const titles = { dashboard:"أهلًا بك في MyExam", exams:"امتحاناتي", results:"سجل النتائج", manage:"إدارة الامتحان", quiz:"وقت الامتحان", result:"نتيجة الامتحان" };
  $("page-title").textContent = titles[view] || "MyExam";
  if (view === "dashboard") renderDashboard();
  if (view === "exams") renderExams();
  if (view === "results") renderResults();
}
function goto(view) { showView(view); }
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => goto(button.dataset.view)));
document.querySelectorAll("[data-goto]").forEach(button => button.addEventListener("click", () => goto(button.dataset.goto)));
["quick-add","hero-add","new-exam"].forEach(id => $(id).addEventListener("click", () => openExamModal()));
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.classList.add("hidden"); }));

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }
function openExamModal(examId = null) {
  editingExamId = examId;
  $("exam-form").reset();
  $("exam-modal-title").textContent = examId ? "تعديل بيانات الامتحان" : "إنشاء امتحان";
  if (examId) {
    const exam = data.exams.find(item => item.id === examId);
    if (!exam) return;
    $("exam-name").value = exam.name;
    $("exam-subject").value = exam.subject;
    $("exam-duration").value = exam.duration || "";
  }
  openModal("exam-modal");
  $("exam-name").focus();
}
$("exam-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("exam-name").value.trim();
  const subject = $("exam-subject").value.trim();
  const duration = Number($("exam-duration").value) || 0;
  if (!name || !subject) return showToast("اكتب اسم الامتحان والمادة.");
  if (editingExamId) {
    const exam = data.exams.find(item => item.id === editingExamId);
    if (exam) Object.assign(exam, { name, subject, duration });
    showToast("تم تعديل الامتحان.");
  } else {
    const exam = { id: uid(), name, subject, duration, createdAt: new Date().toISOString(), questions: [] };
    data.exams.unshift(exam);
    currentExamId = exam.id;
    saveData();
    closeModal("exam-modal");
    renderManage();
    showView("manage");
    showToast("تم إنشاء الامتحان. أضف أسئلتك الآن.");
    return;
  }
  saveData();
  closeModal("exam-modal");
  renderManage();
  renderDashboard();
  renderExams();
});

function examCard(exam) {
  const count = exam.questions.length;
  const attempts = data.results.filter(result => result.examId === exam.id).length;
  return `<article class="exam-card"><div class="exam-card-top"><div class="subject-icon">▤</div><button class="more-btn" title="تعديل" data-edit-exam="${exam.id}">⋯</button></div><h3>${escapeHTML(exam.name)}</h3><p class="subject">${escapeHTML(exam.subject)}</p><div class="exam-stats"><span>▣ ${count} سؤال</span><span>◷ ${exam.duration ? exam.duration + " دقيقة" : "بدون مؤقت"}</span><span>✓ ${attempts} محاولة</span></div><div class="exam-card-actions"><button class="btn btn-secondary" data-manage-exam="${exam.id}">إدارة</button><button class="btn btn-primary" data-start-exam="${exam.id}" ${count ? "" : "disabled title='أضف أسئلة أولًا'"}>ابدأ ←</button></div></article>`;
}
function emptyBlock(title, message, buttonText = "إنشاء امتحان") {
  return `<div class="empty"><strong>${title}</strong>${message}<br><button class="btn btn-primary" id="empty-create">${buttonText}</button></div>`;
}
function bindExamCards(container) {
  container.querySelectorAll("[data-manage-exam]").forEach(button => button.addEventListener("click", () => { currentExamId = button.dataset.manageExam; renderManage(); showView("manage"); }));
  container.querySelectorAll("[data-start-exam]").forEach(button => button.addEventListener("click", () => startQuiz(button.dataset.startExam)));
  container.querySelectorAll("[data-edit-exam]").forEach(button => button.addEventListener("click", () => openExamModal(button.dataset.editExam)));
  const emptyCreate = container.querySelector("#empty-create");
  if (emptyCreate) emptyCreate.addEventListener("click", () => openExamModal());
}
function renderDashboard() {
  $("stat-exams").textContent = data.exams.length;
  $("stat-attempts").textContent = data.results.length;
  const graded = data.results.filter(result => result.maxScore > 0);
  $("stat-average").textContent = graded.length ? Math.round(graded.reduce((sum, result) => sum + result.score / result.maxScore * 100, 0) / graded.length) + "%" : "—";
  const recent = $("recent-exams");
  recent.innerHTML = data.exams.length ? data.exams.slice(0,3).map(examCard).join("") : emptyBlock("لسه مفيش امتحانات", "أنشئ أول امتحان وابدأ في إضافة أسئلتك.");
  bindExamCards(recent);
}
function renderExams() {
  const container = $("all-exams");
  container.innerHTML = data.exams.length ? data.exams.map(examCard).join("") : emptyBlock("مكتبة الامتحانات فارغة", "اضغط على إنشاء امتحان عشان تبدأ.");
  bindExamCards(container);
}
function renderResults() {
  const container = $("results-list");
  const sorted = [...data.results].sort((a,b) => new Date(b.date) - new Date(a.date));
  if (!sorted.length) {
    container.innerHTML = `<div class="empty"><strong>لا توجد نتائج حتى الآن</strong>بعد حل أول امتحان هتظهر نتيجتك هنا.</div>`;
    return;
  }
  container.innerHTML = sorted.map(result => `<article class="result-row"><div><h3>${escapeHTML(result.examName)}</h3><p>${new Date(result.date).toLocaleString("ar-EG")} · ${result.correct} إجابة صحيحة · ${result.essayCount} سؤال مقالي</p></div><div style="display:flex;align-items:center;gap:9px"><span class="score-chip">${result.score} / ${result.maxScore} (${result.maxScore ? Math.round(result.score/result.maxScore*100) : 0}%)</span><button class="mini-btn" data-open-result="${result.id}">مراجعة</button><button class="mini-btn delete" data-delete-result="${result.id}">حذف</button></div></article>`).join("");
  container.querySelectorAll("[data-open-result]").forEach(button => button.addEventListener("click", () => showResult(button.dataset.openResult)));
  container.querySelectorAll("[data-delete-result]").forEach(button => button.addEventListener("click", () => {
    if (!confirm("هل تريد حذف هذه النتيجة نهائيًا؟")) return;
    data.results = data.results.filter(item => item.id !== button.dataset.deleteResult);
    saveData(); renderResults(); renderDashboard(); showToast("تم حذف النتيجة.");
  }));
}
function renderManage() {
  const exam = data.exams.find(item => item.id === currentExamId);
  if (!exam) return goto("exams");
  $("manage-title").textContent = exam.name;
  $("manage-meta").textContent = `${exam.subject} · ${exam.questions.length} سؤال · ${exam.duration ? exam.duration + " دقيقة" : "بدون مؤقت"}`;
  const container = $("question-list");
  if (!exam.questions.length) {
    container.innerHTML = `<div class="empty"><strong>الامتحان جاهز لاستقبال الأسئلة</strong>أضف أول سؤال من الزر الموجود بالأعلى.</div>`;
    return;
  }
  container.innerHTML = exam.questions.map((q,index) => `<article class="question-item"><div class="question-index">${index+1}</div><div class="question-body"><h3>${escapeHTML(q.text)}</h3><p>${typeLabel(q.type)} · ${q.points} درجة${q.type === "mcq" ? " · " + q.options.filter(Boolean).length + " اختيارات" : ""}</p></div><div class="question-actions"><button class="mini-btn" data-edit-question="${q.id}">تعديل</button><button class="mini-btn delete" data-delete-question="${q.id}">حذف</button></div></article>`).join("");
  container.querySelectorAll("[data-edit-question]").forEach(button => button.addEventListener("click", () => openQuestionModal(button.dataset.editQuestion)));
  container.querySelectorAll("[data-delete-question]").forEach(button => button.addEventListener("click", () => {
    if (!confirm("هل تريد حذف السؤال؟")) return;
    exam.questions = exam.questions.filter(q => q.id !== button.dataset.deleteQuestion);
    saveData(); renderManage(); showToast("تم حذف السؤال.");
  }));
}
function typeLabel(type) { return ({ mcq:"اختيار من متعدد", essay:"مقالي" })[type] || "سؤال"; }
$("edit-exam-btn").addEventListener("click", () => openExamModal(currentExamId));
$("delete-exam-btn").addEventListener("click", () => {
  const exam = data.exams.find(item => item.id === currentExamId);
  if (!exam || !confirm(`هل تريد حذف امتحان "${exam.name}" وكل أسئلته؟ النتائج القديمة ستظل في السجل.`)) return;
  data.exams = data.exams.filter(item => item.id !== currentExamId);
  saveData(); showView("exams"); showToast("تم حذف الامتحان.");
});
$("add-question-btn").addEventListener("click", () => openQuestionModal());
$("start-exam-btn").addEventListener("click", () => startQuiz(currentExamId));

function openQuestionModal(questionId = null) {
  const exam = data.exams.find(item => item.id === currentExamId);
  if (!exam) return;
  editingQuestionId = questionId;
  $("question-form").reset();
  $("question-points").value = 1;
  $("question-modal-title").textContent = questionId ? "تعديل السؤال" : "إضافة سؤال";
  const q = questionId ? exam.questions.find(item => item.id === questionId) : null;
  if (q) {
    $("question-type").value = q.type;
    $("question-text").value = q.text;
    $("question-points").value = q.points;
    $("question-explanation").value = q.explanation || "";
    if (q.type === "mcq") {
      q.options.forEach((option,index) => $("option-" + index).value = option);
      $("correct-option").value = String(q.correct);
    } else $("model-answer").value = q.modelAnswer || "";
  }
  updateQuestionFields();
  openModal("question-modal");
}
function updateQuestionFields() {
  const type = $("question-type").value;
  $("mcq-fields").classList.toggle("hidden", type !== "mcq");
  $("tf-fields").classList.add("hidden");
  $("essay-fields").classList.toggle("hidden", type !== "essay");
  $("option-0").required = type === "mcq";
  $("option-1").required = type === "mcq";
  $("correct-option").required = type === "mcq";
}
$("question-type").addEventListener("change", updateQuestionFields);
$("question-form").addEventListener("submit", event => {
  event.preventDefault();
  const exam = data.exams.find(item => item.id === currentExamId);
  if (!exam) return;
  const type = $("question-type").value;
  const text = $("question-text").value.trim();
  const points = Number($("question-points").value);
  if (!text || !Number.isFinite(points) || points < 1) return showToast("تأكد من نص السؤال والدرجة.");
  const q = { id: editingQuestionId || uid(), type, text, points, explanation: $("question-explanation").value.trim() };
  if (type === "mcq") {
    q.options = [0,1,2,3].map(index => $("option-" + index).value.trim()).filter(Boolean);
    const selected = Number($("correct-option").value);
    const selectedText = $("option-" + selected).value.trim();
    if (q.options.length < 2) return showToast("أدخل اختيارين على الأقل.");
    if (!selectedText) return showToast("الاختيار المحدد كإجابة صحيحة فارغ.");
    q.correct = q.options.indexOf(selectedText);
  } else {
    q.modelAnswer = $("model-answer").value.trim();
  }
  if (editingQuestionId) {
    const index = exam.questions.findIndex(item => item.id === editingQuestionId);
    if (index >= 0) exam.questions[index] = q;
  } else exam.questions.push(q);
  saveData(); closeModal("question-modal"); renderManage(); renderDashboard();
  showToast(editingQuestionId ? "تم تحديث السؤال." : "تم حفظ السؤال.");
  editingQuestionId = null;
});

function startQuiz(examId) {
  const exam = data.exams.find(item => item.id === examId);
  if (!exam || !exam.questions.length) return showToast("أضف سؤالًا واحدًا على الأقل قبل البدء.");
  if (activeAttempt && !confirm("بدء امتحان جديد سيُنهي المحاولة الحالية. هل تريد المتابعة؟")) return;
  clearInterval(timerInterval);
  currentExamId = examId;
  activeAttempt = { examId, examName: exam.name, subject: exam.subject, startedAt: new Date().toISOString(), answers: {} };
  activeQuestionIndex = 0;
  secondsLeft = exam.duration ? exam.duration * 60 : 0;
  renderQuiz();
  showView("quiz");
  renderQuiz();
  if (secondsLeft > 0) {
    updateTimer();
    timerInterval = setInterval(() => {
      secondsLeft--;
      updateTimer();
      if (secondsLeft <= 0) {
        clearInterval(timerInterval);
        finishQuiz(true);
      }
    }, 1000);
  } else $("quiz-timer").textContent = "∞ بدون مؤقت";
}
function currentQuizExam() { return data.exams.find(item => item.id === activeAttempt?.examId); }
function hasAnswer(q) {
  const answer = activeAttempt?.answers[q.id];
  return answer !== undefined && answer !== null && String(answer).trim() !== "";
}
function renderQuiz() {
  const exam = currentQuizExam();
  if (!exam || !activeAttempt) return;
  const q = exam.questions[activeQuestionIndex];
  if (!q) return;
  $("question-number").textContent = `السؤال ${activeQuestionIndex+1} من ${exam.questions.length}`;
  $("quiz-type").textContent = `${typeLabel(q.type)} · ${q.points} درجة`;
  $("quiz-question").textContent = q.text;
  $("quiz-progress").style.width = `${((activeQuestionIndex+1)/exam.questions.length)*100}%`;
  $("prev-question").disabled = activeQuestionIndex === 0;
  $("prev-question").style.opacity = activeQuestionIndex === 0 ? ".45" : "1";
  $("next-question").textContent = activeQuestionIndex === exam.questions.length-1 ? "وصلت لآخر سؤال" : "التالي ←";
  const area = $("quiz-answer-area");
  const answer = activeAttempt.answers[q.id];
  if (q.type === "mcq") {
    const options = q.options;
    area.innerHTML = `<div class="answer-options">${options.map((option,index) => `<button class="answer-option ${String(answer) === String(index) ? "selected" : ""}" data-answer="${index}"><span class="option-letter">${["أ","ب","ج","د"][index] || index+1}</span><span>${escapeHTML(option)}</span></button>`).join("")}</div>`;
    area.querySelectorAll("[data-answer]").forEach(button => button.addEventListener("click", () => {
      activeAttempt.answers[q.id] = Number(button.dataset.answer);
      renderQuiz();
    }));
  } else {
    area.innerHTML = `<label class="muted" for="essay-response">اكتب إجابتك</label><textarea id="essay-response" class="essay-answer" placeholder="اكتب إجابتك هنا...">${escapeHTML(answer || "")}</textarea>`;
    $("essay-response").addEventListener("input", event => { activeAttempt.answers[q.id] = event.target.value; updateJumpButtons(); });
  }
  updateJumpButtons();
}
function updateJumpButtons() {
  const exam = currentQuizExam();
  if (!exam) return;
  $("question-jump").innerHTML = exam.questions.map((q,index) => `<button class="jump-btn ${index === activeQuestionIndex ? "current" : ""} ${hasAnswer(q) ? "answered" : ""}" data-jump="${index}" title="السؤال ${index+1}">${index+1}</button>`).join("");
  $("question-jump").querySelectorAll("[data-jump]").forEach(button => button.addEventListener("click", () => { activeQuestionIndex = Number(button.dataset.jump); renderQuiz(); }));
}
function updateTimer() {
  const min = Math.floor(Math.max(0,secondsLeft)/60).toString().padStart(2,"0");
  const sec = (Math.max(0,secondsLeft)%60).toString().padStart(2,"0");
  $("quiz-timer").textContent = `◷ ${min}:${sec}`;
  $("quiz-timer").classList.toggle("warning", secondsLeft <= 60);
}
$("prev-question").addEventListener("click", () => { if (activeQuestionIndex > 0) { activeQuestionIndex--; renderQuiz(); } });
$("next-question").addEventListener("click", () => {
  const exam = currentQuizExam();
  if (activeQuestionIndex < exam.questions.length-1) { activeQuestionIndex++; renderQuiz(); }
  else showToast("أنت في آخر سؤال. اضغط تسليم الامتحان عند الانتهاء.");
});
$("submit-quiz").addEventListener("click", () => {
  const exam = currentQuizExam();
  const unanswered = exam.questions.filter(q => !hasAnswer(q)).length;
  if (unanswered && !confirm(`هناك ${unanswered} سؤال بدون إجابة. هل تريد تسليم الامتحان؟`)) return;
  finishQuiz(false);
});
$("quit-quiz").addEventListener("click", () => {
  if (!confirm("هل تريد الخروج؟ لن تُحفظ هذه المحاولة في سجل النتائج.")) return;
  clearInterval(timerInterval); activeAttempt = null; showView("manage");
});
function finishQuiz(timeEnded) {
  clearInterval(timerInterval);
  const exam = currentQuizExam();
  if (!exam || !activeAttempt) return;
  let score = 0, maxScore = 0, correct = 0, essayCount = 0;
  const answers = exam.questions.map(q => {
    maxScore += q.points;
    const userAnswer = activeAttempt.answers[q.id];
    let isCorrect = null, awarded = 0;
    if (q.type === "essay") essayCount++;
    else {
      isCorrect = userAnswer !== undefined && userAnswer !== null && Number(userAnswer) === Number(q.correct);
      if (isCorrect) { awarded = q.points; correct++; score += q.points; }
    }
    return { questionId:q.id, type:q.type, text:q.text, options:q.options || [], correct:q.correct, modelAnswer:q.modelAnswer || "", explanation:q.explanation || "", points:q.points, userAnswer:userAnswer ?? null, isCorrect, awarded };
  });
  const result = { id:uid(), examId:exam.id, examName:exam.name, subject:exam.subject, date:new Date().toISOString(), score, maxScore, correct, essayCount, timeEnded, answers };
  data.results.push(result);
  saveData();
  currentResultId = result.id;
  activeAttempt = null;
  renderDashboard();
  showResult(result.id);
}
function showResult(resultId) {
  const result = data.results.find(item => item.id === resultId);
  if (!result) return;
  currentResultId = resultId;
  const percentage = result.maxScore ? Math.round(result.score / result.maxScore * 100) : 0;
  $("result-summary").innerHTML = `<div class="score-ring"><div><strong>${percentage}%</strong><br><span>النتيجة</span></div></div><div><p class="eyebrow">${result.timeEnded ? "انتهى الوقت" : "اكتملت المحاولة"}</p><h2>${escapeHTML(result.examName)}</h2><p>${escapeHTML(result.subject)} · ${new Date(result.date).toLocaleString("ar-EG")}</p><div class="result-mini-stats"><span>الدرجة <strong>${result.score} / ${result.maxScore}</strong></span><span>صحيحة <strong>${result.correct}</strong></span><span>مقالي <strong>${result.essayCount}</strong></span></div></div>`;
  renderReview(result);
  showView("result");
}
function answerText(answer, item) {
  if (answer === null || answer === undefined || String(answer).trim() === "") return "لم تتم الإجابة";
  if (item.type === "essay") return answer;
  return item.options[Number(answer)] ?? "لم تتم الإجابة";
}
function renderReview(result) {
  const container = $("review-list");
  container.innerHTML = result.answers.map((item,index) => {
    const status = item.type === "essay" ? `<span class="status manual">تحتاج تقييمًا يدويًا</span>` : item.isCorrect ? `<span class="status correct">✓ إجابة صحيحة</span>` : `<span class="status wrong">✕ إجابة خاطئة</span>`;
    const correctAnswer = item.type === "essay" ? item.modelAnswer : answerText(item.correct,item);
    const currentAward = Number(item.awarded) || 0;
    return `<article class="review-card"><div class="review-head"><h3>${index+1}. ${escapeHTML(item.text)}</h3>${status}</div><p class="review-answer"><strong>إجابتك:</strong> ${escapeHTML(answerText(item.userAnswer,item))}</p><p class="review-answer"><strong>${item.type === "essay" ? "الإجابة النموذجية:" : "الإجابة الصحيحة:"}</strong> ${escapeHTML(correctAnswer || "لم تُضف إجابة نموذجية")}</p>${item.explanation ? `<p class="review-answer"><strong>توضيح:</strong> ${escapeHTML(item.explanation)}</p>` : ""}<p class="review-answer"><strong>الدرجة:</strong> <span data-awarded-label="${index}">${currentAward}</span> / ${item.points}</p>${item.type === "essay" ? `<label class="review-answer" for="essay-grade-${index}">ملاحظات التصحيح (اختياري)</label><textarea id="essay-note-${index}" placeholder="اكتب ملاحظاتك على الإجابة...">${escapeHTML(item.teacherNote || "")}</textarea><div class="manual-grade"><label for="essay-grade-${index}">الدرجة المستحقة:</label><input id="essay-grade-${index}" type="number" min="0" max="${item.points}" step="0.5" value="${currentAward}"><button class="mini-btn" data-grade="${index}">حفظ التقييم</button></div>` : ""}</article>`;
  }).join("");
  container.querySelectorAll("[data-grade]").forEach(button => button.addEventListener("click", () => {
    const index = Number(button.dataset.grade);
    const gradeInput = $("essay-grade-" + index);
    const noteInput = $("essay-note-" + index);
    const item = result.answers[index];
    const grade = Number(gradeInput.value);
    if (!Number.isFinite(grade) || grade < 0 || grade > item.points) return showToast(`الدرجة يجب أن تكون من 0 إلى ${item.points}.`);
    item.awarded = grade;
    item.teacherNote = noteInput.value.trim();
    result.score = result.answers.reduce((sum, answer) => sum + (Number(answer.awarded) || 0), 0);
    result.correct = result.answers.filter(answer => answer.type !== "essay" && answer.isCorrect).length;
    saveData();
    showResult(result.id);
    showToast("تم حفظ التقييم وتحديث النتيجة.");
  }));
}
$("back-to-exam").addEventListener("click", () => {
  if (data.exams.some(exam => exam.id === currentExamId)) { renderManage(); showView("manage"); }
  else showView("exams");
});

// Initial page
renderDashboard();
showView("dashboard");
