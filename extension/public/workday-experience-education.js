// public/workday-experience-education.js
window.WorkdayEngine = window.WorkdayEngine || {};

const safeTypeNativeEdu = (element, value) => {
  if (!element) return;
  element.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

// --- NEW FIX: Strict Matcher ---
// Prevents "SIIT" from overriding "SLIIT", and "Master of Education" from overriding "Master of Arts"
const findBestEduOption = (options, targetValue) => {
  const t = String(targetValue).toLowerCase().trim();
  if (!t) return null;

  // 1. Exact match (Finds the exact "SLIIT" option)
  let match = options.find(o => (o.innerText || o.textContent || "").toLowerCase().trim() === t);
  if (match) return match;

  // 2. Substring Match (Safely finds variations if exact match fails)
  match = options.find(o => {
      const text = (o.innerText || o.textContent || "").toLowerCase().trim();
      return text.includes(t);
  });
  if (match) return match;

  // 3. Fallback to fuzzy match ONLY if strict matching fails completely
  return options.find(o => window.WorkdayEngine.workdaySmartMatch(o.innerText, targetValue));
};

window.WorkdayEngine.fillLookupInputAsync = async (input, value) => {
  if (!input || !value || input.dataset.fa_filled === "true") return false;
  
  input.dataset.fa_filled = "true"; // Lock immediately

  input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  input.click();
  input.focus();
  await window.WorkdayEngine.wait(300);

  safeTypeNativeEdu(input, value);
  await window.WorkdayEngine.wait(500);

  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));
  
  // Smart Polling to wait for Workday's search results
  let matchedOption = null;
  for (let attempt = 0; attempt < 5; attempt++) {
      await window.WorkdayEngine.wait(800);
      const options = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);
      
      matchedOption = findBestEduOption(options, value);
      if (matchedOption) break;
  }

  // --- NEW FIX: Advanced Clicker for Education Radio Buttons ---
  if (matchedOption) {
    const optionContainer = matchedOption.closest('li') || matchedOption.closest('[role="option"]') || matchedOption;
    
    // Safely target the circular radio button or SVG container
    const radioBtn = optionContainer.querySelector('input[type="radio"], [role="radio"], .wd-icon-container') || optionContainer;
    
    radioBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    radioBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    if (typeof radioBtn.click === 'function') {
      radioBtn.click();
    } else {
      radioBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
    
    await window.WorkdayEngine.wait(400);
  } else {
    document.body.click(); 
  }
  
  return true;
};

window.WorkdayEngine.safeFillEduDropdown = async (container, targetValue) => {
  if (!container || !targetValue || container.dataset.fa_filled === "true") return false;
  container.dataset.fa_filled = "true";

  const trigger = container.querySelector('[data-automation-id="selectWidget"], button, [role="combobox"]');
  if (!trigger) return false;

  trigger.focus();
  trigger.click();
  await window.WorkdayEngine.wait(500);

  let options = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);
  let matchedOption = findBestEduOption(options, targetValue);

  if (!matchedOption) {
    const searchInputs = Array.from(document.querySelectorAll('[data-automation-id="searchBox"]'));
    const safeSearchInput = searchInputs.find(input => !input.closest('[data-automation-id="formField-skills"]'));

    if (safeSearchInput) {
      safeTypeNativeEdu(safeSearchInput, targetValue);
      for (let attempt = 0; attempt < 4; attempt++) {
          await window.WorkdayEngine.wait(800);
          options = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);
          matchedOption = findBestEduOption(options, targetValue);
          if (matchedOption) break;
      }
    }
  }

  // Use the advanced clicker here as well
  if (matchedOption) {
    const optionContainer = matchedOption.closest('li') || matchedOption.closest('[role="option"]') || matchedOption;
    const radioBtn = optionContainer.querySelector('input[type="radio"], [role="radio"], .wd-icon-container') || optionContainer;
    
    radioBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    radioBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    if (typeof radioBtn.click === 'function') {
      radioBtn.click();
    } else {
      radioBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
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

  // CONCURRENCY LOCK
  if (window.WorkdayEngine.isEducating) return true;
  window.WorkdayEngine.isEducating = true;

  try {
      const isExpanding = await window.WorkdayEngine.expandEduIfNeeded(eduArr);
      if (isExpanding) return true;

      let eduIndex = -1;
      const labels = Array.from(document.querySelectorAll("label"));

      // Sequential loop ensures no race conditions with the Skills script
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
          if (textInput && textInput.dataset.fa_filled !== "true") {
            await window.WorkdayEngine.fillLookupInputAsync(textInput, currentEdu.school);
          }
        }
        else if (questionText.includes("degree")) {
          await window.WorkdayEngine.safeFillEduDropdown(container, currentEdu.degree);
        }
        else if (questionText.includes("field of study") || questionText.includes("major")) {
          if (textInput && textInput.dataset.fa_filled !== "true") {
            await window.WorkdayEngine.fillLookupInputAsync(textInput, currentEdu.major);
          }
        }
      }
  } finally {
      window.WorkdayEngine.isEducating = false;
  }
  return false;
};