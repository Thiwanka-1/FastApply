// public/workday-experience-work.js
window.WorkdayEngine = window.WorkdayEngine || {};

// Exact working Date logic
window.WorkdayEngine.fillWorkdayDate = (container, rawDate) => {
  if (!container || !rawDate) return;
  const monthInput = container.querySelector('input[data-automation-id="dateSectionMonth-input"]');
  const yearInput = container.querySelector('input[data-automation-id="dateSectionYear-input"]');
  if (!monthInput || !yearInput) return;

  const formatted = window.WorkdayEngine.formatMonthYear(rawDate); 
  const parts = formatted.split("/");
  if (parts.length !== 2) return;
  const [mm, yyyy] = parts;

  if (monthInput.dataset.fa_filled !== "true") {
    window.FastApplyUtils.fillField(monthInput, mm);
    monthInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    monthInput.dataset.fa_filled = "true";
  }
  if (yearInput.dataset.fa_filled !== "true") {
    window.FastApplyUtils.fillField(yearInput, yyyy);
    yearInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    yearInput.dataset.fa_filled = "true";
  }
};

window.WorkdayEngine.expandWorkIfNeeded = async (workArr) => {
  const uiWorkCount = Array.from(document.querySelectorAll("label")).filter(l => l.innerText.toLowerCase().includes("job title")).length;
  if (workArr.length > uiWorkCount) {
    const btns = Array.from(document.querySelectorAll("button")).filter(b => b.innerText.trim().toLowerCase() === "add another");
    for (const btn of btns) {
      const section = btn.closest("section, div[data-automation-id], .css-1qj0f45") || btn.parentElement.parentElement.parentElement.parentElement;
      if (section && section.innerText.toLowerCase().includes("work experience") && btn.dataset.fa_expanded !== "true") {
        btn.dataset.fa_expanded = "true";
        btn.click();
        await window.WorkdayEngine.wait(1500); 
        return true; // Clicked
      }
    }
  }
  return false;
};

window.WorkdayEngine.handleWork = async (workArr) => {
  if (!workArr || workArr.length === 0) return false;

  const isExpanding = await window.WorkdayEngine.expandWorkIfNeeded(workArr);
  if (isExpanding) return true; 

  let workIndex = -1;
  const labels = document.querySelectorAll("label");

  labels.forEach((label) => {
    const questionText = label.innerText.toLowerCase().replace(/\*/g, "").trim();
    if (!questionText) return;

    if (questionText === "job title") workIndex++;
    const currentWork = workArr[workIndex];
    if (!currentWork) return;

    let container = label.parentElement;
    for (let i = 0; i < 4; i++) {
      if (container && container.querySelector("input:not([type='hidden']), select, textarea, [data-automation-id='selectWidget']")) break;
      if (container && container.parentElement) container = container.parentElement;
    }
    if (!container) return;

    let textInput = container.querySelector("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea");

    // Exact working mapping
    if (questionText === "job title") { if (textInput && textInput.dataset.fa_filled !== "true") window.FastApplyUtils.fillField(textInput, currentWork.jobTitle); }
    else if (questionText === "company" || questionText.includes("company name")) { if (textInput && textInput.dataset.fa_filled !== "true") window.FastApplyUtils.fillField(textInput, currentWork.company); }
    else if (questionText === "location") { if (textInput && textInput.dataset.fa_filled !== "true") window.FastApplyUtils.fillField(textInput, currentWork.location); }
    else if (questionText.includes("role description") || questionText.includes("description")) { if (textInput && textInput.dataset.fa_filled !== "true") window.FastApplyUtils.fillField(textInput, currentWork.description); }
    else if (questionText === "from" || questionText === "start date" || questionText.includes("from")) {
      if (currentWork.startDate) window.WorkdayEngine.fillWorkdayDate(container, currentWork.startDate);
    }
    else if (questionText === "to" || questionText === "end date" || questionText.includes("to")) {
      if (currentWork.endDate && !currentWork.currentlyWorkHere) {
        window.WorkdayEngine.fillWorkdayDate(container, currentWork.endDate);
      }
    }
  });

  return false;
};