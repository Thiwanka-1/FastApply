// public/workday-experience-skills.js
window.WorkdayEngine = window.WorkdayEngine || {};

const safeTypeNative = (element, value) => {
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

const getSkillsInput = () => {
  let input = document.querySelector('div[data-automation-id="formField-skills"] input[data-automation-id="searchBox"]');
  if (!input) {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
      input = inputs.find(i => window.FastApplyUtils.getLabelText(i).toLowerCase().includes("skills"));
  }
  return input;
};

window.WorkdayEngine.handleSkills = async (skills) => {
  if (!skills) return;
  const skillList = Array.isArray(skills) ? skills.filter(Boolean) : String(skills).split(",").map((s) => s.trim()).filter(Boolean);
  if (!skillList.length) return;

  let skillsInput = getSkillsInput();
  if (!skillsInput) return;

  let formWrapper = skillsInput.closest('div[data-automation-id="formField-skills"]') || skillsInput.parentElement.parentElement;
  if (formWrapper && formWrapper.dataset.fa_skills_done === "true") return;
  if (formWrapper) formWrapper.dataset.fa_skills_done = "true";

  for (const skill of skillList) {
    if (!skill) continue;

    let currentInput = getSkillsInput();
    if (!currentInput) break;

    const alreadySelected = document.querySelector(`[data-automation-id="selectedItem"][title="${skill}" i]`);
    if (alreadySelected) continue;

    // --- START CLEAN TRANSACTION ---
    currentInput.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    currentInput.click();
    currentInput.focus();
    await window.WorkdayEngine.wait(300);

    safeTypeNative(currentInput, skill);
    await window.WorkdayEngine.wait(500);

    currentInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
    currentInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));
    
    await window.WorkdayEngine.wait(1500); 

    const listItems = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);
    
    let matchedItem = listItems.find(item => {
        const text = (item.innerText || item.textContent || "").trim().toLowerCase();
        return text === skill.toLowerCase();
    });

    if (!matchedItem) {
        matchedItem = listItems.find(item => window.WorkdayEngine.workdaySmartMatch(item.innerText, skill));
    }

    if (matchedItem) {
      const optionContainer = matchedItem.closest('li') || matchedItem.closest('[role="option"]') || matchedItem;
      const checkbox = optionContainer.querySelector('.wd-icon-container, [type="checkbox"], [role="checkbox"]') || optionContainer;
      
      checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      checkbox.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      
      if (typeof checkbox.click === 'function') {
        checkbox.click();
      } else {
        checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      
      await window.WorkdayEngine.wait(800); 
    }

    // CLOSE DROPDOWN TO LOCK IN PILL
    document.body.click();
    await window.WorkdayEngine.wait(400);

    // SAFELY CLEAR TEXT FOR NEXT LOOP USING WORKDAY'S NATIVE "X" BUTTON
    const clearBtn = document.querySelector('div[data-automation-id="formField-skills"] [data-automation-id="clearSearchButton"]');
    if (clearBtn && window.WorkdayEngine.isVisible(clearBtn)) {
        clearBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        if (typeof clearBtn.click === 'function') clearBtn.click();
    } else {
        let freshInput = getSkillsInput();
        if (freshInput) safeTypeNative(freshInput, "");
    }
    
    await window.WorkdayEngine.wait(600);
    // --- END CLEAN TRANSACTION ---
  }
};