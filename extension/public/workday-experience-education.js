// public/workday-experience-education.js
window.WorkdayEngine = window.WorkdayEngine || {};

window.WorkdayEngine.fillLookupInputAsync = async (input, value) => {
  if (!input || !value || input.dataset.fa_filled === "true") return false;
  
  // CRITICAL: Mark as filled IMMEDIATELY so it never retries and loops
  input.dataset.fa_filled = "true";

  window.FastApplyUtils.fillField(input, value);
  await window.WorkdayEngine.wait(600);

  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));
  await window.WorkdayEngine.wait(1500);

  const options = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);
  let matchedOption = options.find(o => window.WorkdayEngine.workdaySmartMatch(o.innerText, value));

  if (matchedOption) {
    matchedOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    matchedOption.click();
    await window.WorkdayEngine.wait(400);
  } else {
    document.body.click();
  }
  return true;
};

window.WorkdayEngine.safeFillEduDropdown = async (container, targetValue) => {
  if (!container || !targetValue || container.dataset.fa_filled === "true") return false;
  
  // CRITICAL: Mark as filled IMMEDIATELY so it never retries and loops
  container.dataset.fa_filled = "true";

  const trigger = container.querySelector('[data-automation-id="selectWidget"], button, [role="combobox"]');
  if (!trigger) return false;

  trigger.focus();
  trigger.click();
  await window.WorkdayEngine.wait(500);

  let options = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);
  let matchedOption = options.find(o => window.WorkdayEngine.workdaySmartMatch(o.innerText, targetValue));

  if (!matchedOption) {
    const searchInputs = Array.from(document.querySelectorAll('[data-automation-id="searchBox"]'));
    // Make sure we DO NOT accidentally type into the Skills box
    const safeSearchInput = searchInputs.find(input => !input.closest('[data-automation-id="formField-skills"]'));

    if (safeSearchInput) {
      window.FastApplyUtils.fillField(safeSearchInput, targetValue);
      await window.WorkdayEngine.wait(800);
      options = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);
      matchedOption = options.find(o => window.WorkdayEngine.workdaySmartMatch(o.innerText, targetValue));
    }
  }

  if (matchedOption) {
    matchedOption.click();
  } else {
    document.body.click();
  }
  await window.WorkdayEngine.wait(500);
  return true;
};

window.WorkdayEngine.expandEduIfNeeded = async (eduArr) => {
  const uiEduCount = Array.from(document.querySelectorAll("label")).filter(l => l.innerText.toLowerCase().includes("school") || l.innerText.toLowerCase().includes("university")).length;
  if (eduArr.length > uiEduCount) {
    const btns = Array.from(document.querySelectorAll("button")).filter(b => b.innerText.trim().toLowerCase() === "add another");
    for (const btn of btns) {
      const section = btn.closest('[role="group"]') || btn.parentElement.parentElement.parentElement;
      if (section && section.innerText.toLowerCase().includes("education") && btn.dataset.fa_expanded !== "true") {
        btn.dataset.fa_expanded = "true";
        btn.click();
        await window.WorkdayEngine.wait(1500);
        return true;
      }
    }
  }
  return false;
};

window.WorkdayEngine.handleEducation = async (eduArr) => {
  if (!eduArr || eduArr.length === 0) return false;

  const isExpanding = await window.WorkdayEngine.expandEduIfNeeded(eduArr);
  if (isExpanding) return true;

  let eduIndex = -1;
  const labels = Array.from(document.querySelectorAll("label"));

  // Using for...of so the async fields execute safely in order
  for (const label of labels) {
    const questionText = label.innerText.toLowerCase().replace(/\*/g, "").trim();
    if (!questionText) continue;

    if (questionText.includes("school or university") || questionText === "school") eduIndex++;
    const currentEdu = eduArr[eduIndex];
    if (!currentEdu) continue;

    let container = label.parentElement;
    for (let i = 0; i < 4; i++) {
      if (container && container.querySelector("input:not([type='hidden']), select, textarea, [data-automation-id='selectWidget']")) break;
      if (container && container.parentElement) container = container.parentElement;
    }
    if (!container) continue;

    let textInput = container.querySelector("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea");

    if (questionText.includes("school or university") || questionText === "school") {
      if (textInput && textInput.dataset.fa_filled !== "true") await window.WorkdayEngine.fillLookupInputAsync(textInput, currentEdu.school);
    }
    else if (questionText.includes("degree")) {
      await window.WorkdayEngine.safeFillEduDropdown(container, currentEdu.degree);
    }
    else if (questionText.includes("field of study") || questionText.includes("major")) {
      if (textInput && textInput.dataset.fa_filled !== "true") await window.WorkdayEngine.fillLookupInputAsync(textInput, currentEdu.major);
    }
  }

  return false;
};