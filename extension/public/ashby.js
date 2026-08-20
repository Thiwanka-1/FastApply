// public/ashby.js
console.log("[FastApply] Ashby Engine Active.");

// Engine scripts share one isolated world; an IIFE keeps top-level
// declarations from colliding with utils.js or other scripts.
(() => {

const clickAshbyButton = (buttons, targetValue) => {
  if (!buttons || buttons.length === 0 || !targetValue) return false;
  if (buttons.some(button => {
    return window.FastApplyUtils.isProtectedFromDeterministicFill?.(button) ||
      button.getAttribute("aria-pressed") === "true" ||
      button.getAttribute("aria-selected") === "true" ||
      /^(checked|selected|active)$/i.test(button.getAttribute("data-state") || "");
  })) return false;
  const targetLower = targetValue.toLowerCase().trim();
  let clicked = false;
  
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    if (btn.dataset.fa_filled === "true") return false; 

    const btnText = btn.innerText.toLowerCase().trim();
    if (btnText === targetLower) {
      btn.click();
      btn.style.backgroundColor = '#f0fdfa';
      btn.style.border = '2px solid #06b6d4';
      clicked = true;
      break;
    }
  }
  
  if (clicked) {
    buttons.forEach(b => {
      b.dataset.fa_filled = "true";
      window.FastApplyUtils.setValueOwner?.(b, "deterministic");
    });
    return true;
  }
  return false;
};

const ashbyDebug = (...parts) => {
  try {
    console.debug("[FastApply:ashby]", ...parts);
  } catch (_) {}
};

// Ashby's demographic survey renders question text in plain divs — the page
// has ZERO <label> elements ("labels: 0" in the first-pass log), so the
// label/h3/h4/legend question walker sees nothing there. These helpers work
// from the inputs instead: find each choice group, climb to the nearest
// preceding text block for the question, and select from profile data.

const readAshbyOptionText = (input) => {
  const aria = (input.getAttribute?.("aria-label") || "").trim();
  if (aria) return aria;
  const wrapLabel = input.closest?.("label");
  const wrapText = (wrapLabel?.innerText || "").trim();
  if (wrapText) return wrapText;
  const parentText = (input.parentElement?.innerText || "").trim();
  if (parentText && parentText.length < 120) return parentText;
  return String(input.value || "").trim();
};

const getAshbyQuestionText = (element) => {
  let node = element;
  for (let depth = 0; node && depth < 6; depth += 1) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      // The question block is plain text: skip anything holding controls
      // (they are other option rows or unrelated fields).
      if (!sibling.querySelector?.("input, button, select, textarea")) {
        const text = (sibling.innerText || "").trim();
        if (text.length > 5) return text.toLowerCase();
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return "";
};

const clickAshbyChoice = (input) => {
  if (input.checked) return true;
  try { input.click(); } catch (_) {}
  if (input.checked) return true;
  const clickTarget = input.closest?.("label") || input.parentElement;
  try { clickTarget?.click(); } catch (_) {}
  return input.checked;
};

const selectAshbyChoice = (inputs, targetValue, settings = {}) => {
  const U = window.FastApplyUtils;
  if (!targetValue) return false;
  const candidates = inputs.filter(input => !input.disabled);
  const match = U.findBestSemanticMatch?.(
    candidates,
    targetValue,
    readAshbyOptionText
  );
  if (!match) return false;
  if (!clickAshbyChoice(match)) return false;

  try {
    const wrap = match.closest("label") || match.parentElement;
    if (wrap) {
      wrap.style.backgroundColor = "#f0fdfa";
      wrap.style.border = "2px solid #06b6d4";
      wrap.style.borderRadius = "4px";
    }
  } catch (_) {}

  const marked = settings.markWholeGroup === true ? inputs : [match];
  marked.forEach(input => {
    input.dataset.fa_filled = "true";
    U.setValueOwner?.(input, "deterministic");
  });
  return true;
};

// Age surveys use brackets ("Under 30", "30-39", "60 or older") while the
// profile stores a number — pick the bracket that contains it.
const pickAshbyAgeOption = (ageValue, inputs) => {
  const age = parseInt(String(ageValue || "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(age) || age < 14 || age > 120) return "";
  for (const input of inputs) {
    const text = readAshbyOptionText(input);
    const lower = text.toLowerCase();
    const under = lower.match(/under\s+(\d+)/);
    if (under) {
      if (age < Number(under[1])) return text;
      continue;
    }
    const range = lower.match(/(\d+)\s*[-–—]\s*(\d+)/);
    if (range) {
      if (age >= Number(range[1]) && age <= Number(range[2])) return text;
      continue;
    }
    const older = lower.match(/(\d+)\s*(?:\+|or older|and older|or above)/);
    if (older) {
      if (age >= Number(older[1])) return text;
      continue;
    }
  }
  return "";
};

const fillAshbyChoiceGroups = (profile) => {
  const U = window.FastApplyUtils;
  const eeo = profile.eeo || {};
  const optOutAnswer = "I prefer not to answer";
  let filledAnything = false;

  const untouched = input =>
    input.dataset.fa_filled !== "true" &&
    !U.isProtectedFromDeterministicFill?.(input);

  // --- Radio groups (grouped by name, falling back to question text) ---
  const radioGroups = new Map();
  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    const key = radio.name
      ? `name:${radio.name}`
      : `q:${getAshbyQuestionText(radio)}`;
    if (!radioGroups.has(key)) radioGroups.set(key, []);
    radioGroups.get(key).push(radio);
  });

  for (const group of radioGroups.values()) {
    if (group.length < 2) continue;
    if (group.some(radio => radio.checked) || !group.every(untouched)) continue;
    const question = getAshbyQuestionText(group[0]);
    if (!question) continue;

    let target = "";
    if (/\bgender\b|\bsex\b/.test(question)) {
      target = eeo.optOut ? optOutAnswer : eeo.gender;
    } else if (/\bage\b/.test(question)) {
      target = eeo.optOut ? optOutAnswer : pickAshbyAgeOption(eeo.age, group);
    } else if (/veteran/.test(question)) {
      target = eeo.optOut ? optOutAnswer : eeo.veteran;
    } else if (/disabilit/.test(question)) {
      target = eeo.optOut ? optOutAnswer : eeo.disability;
    } else if (/ethnicit|race|hispanic/.test(question)) {
      target = eeo.optOut ? optOutAnswer : (eeo.race || eeo.ethnicity);
    } else if (/sponsor|visa/.test(question)) {
      target = eeo.requireVisaFuture || eeo.requireVisaNow;
    } else if (/authorized to work|right to work|legally authorized/.test(question)) {
      target = eeo.authorizedToWork;
    } else if (/relocat/.test(question)) {
      target = eeo.willingToRelocate;
    }
    if (!target) continue;

    if (selectAshbyChoice(group, target, { markWholeGroup: true })) {
      ashbyDebug(`radio group "${question.slice(0, 60)}" → "${target}"`);
      filledAnything = true;
    } else {
      ashbyDebug(`radio group "${question.slice(0, 60)}": no option matched "${target}"`);
    }
  }

  // --- Checkbox groups (multi-select surveys) ---
  // Group by the nearest ancestor that holds MORE than one checkbox — the
  // question's options container. Grouping by question text broke here:
  // each option's text sits as a preceding sibling of its own input, so the
  // text climber returned the option label ("White") as the "question" and
  // every checkbox landed in a group of one, which was then skipped.
  const getCheckboxGroupRoot = checkbox => {
    let node = checkbox.parentElement;
    for (let depth = 0; node && depth < 6; depth += 1) {
      if (node.querySelectorAll('input[type="checkbox"]').length > 1) return node;
      node = node.parentElement;
    }
    return null;
  };

  const checkboxGroups = new Map();
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    const root = getCheckboxGroupRoot(checkbox);
    if (!root) return;
    if (!checkboxGroups.has(root)) checkboxGroups.set(root, []);
    checkboxGroups.get(root).push(checkbox);
  });

  for (const [groupRoot, group] of checkboxGroups) {
    // The question text precedes the whole options container.
    const question = getAshbyQuestionText(groupRoot);
    if (!question) continue;
    // Single checkboxes are agreements/consents — never auto-ticked here.
    if (group.length < 2) continue;
    if (group.some(checkbox => checkbox.checked) || !group.every(untouched)) continue;

    if (/ethnicit|race|hispanic/.test(question)) {
      const target = eeo.optOut ? optOutAnswer : (eeo.race || eeo.ethnicity);
      if (target && selectAshbyChoice(group, target)) {
        ashbyDebug(`checkbox group "${question.slice(0, 60)}" → "${target}"`);
        filledAnything = true;
      } else if (target) {
        ashbyDebug(`checkbox group "${question.slice(0, 60)}": no option matched "${target}"`);
      }
    } else if (/communit/.test(question)) {
      if (eeo.optOut) {
        if (selectAshbyChoice(group, optOutAnswer)) filledAnything = true;
        continue;
      }
      // Only positively-known memberships are ticked; "None of the above"
      // is never guessed because the profile cannot rule the others out.
      const positives = [];
      if (/^yes/i.test(String(eeo.disability || "").trim())) {
        positives.push("Person with disability");
      }
      if (/\bam a protected veteran\b|^yes/i.test(String(eeo.veteran || "").trim())) {
        positives.push("Veteran");
      }
      positives.forEach(positive => {
        if (selectAshbyChoice(group, positive)) {
          ashbyDebug(`checkbox group "${question.slice(0, 60)}" → "${positive}"`);
          filledAnything = true;
        }
      });
    } else if (/\bgender\b/.test(question)) {
      const target = eeo.optOut ? optOutAnswer : eeo.gender;
      if (target && selectAshbyChoice(group, target)) {
        ashbyDebug(`checkbox group "${question.slice(0, 60)}" → "${target}"`);
        filledAnything = true;
      }
    }
  }

  return filledAnything;
};

// Yes/No segmented BUTTONS (e.g. the sponsorship question on the main form)
// live in containers the label sibling-walk never reaches — group them by
// parent and resolve the question from the surrounding text instead.
const fillAshbyYesNoButtonGroups = (profile) => {
  const eeo = profile.eeo || {};
  let filledAnything = false;

  const groups = new Map();
  Array.from(document.querySelectorAll("button"))
    .filter(button => /^(yes|no)$/i.test((button.innerText || "").trim()))
    .forEach(button => {
      const container = button.parentElement;
      if (!container) return;
      if (!groups.has(container)) groups.set(container, []);
      groups.get(container).push(button);
    });

  for (const [container, group] of groups) {
    if (group.length < 2) continue;
    if (group.some(button => button.dataset.fa_filled === "true")) continue;
    const question = getAshbyQuestionText(container);
    if (!question) continue;

    let target = "";
    if (/sponsor|visa/.test(question)) {
      target = eeo.requireVisaFuture || eeo.requireVisaNow;
    } else if (/authorized to work|right to work|legally authorized|legally entitled/.test(question)) {
      target = eeo.authorizedToWork;
    } else if (/relocat/.test(question)) {
      target = eeo.willingToRelocate;
    }
    if (!target) continue;

    if (clickAshbyButton(group, target)) {
      ashbyDebug(`yes/no buttons "${question.slice(0, 60)}" → "${target}"`);
      filledAnything = true;
    } else {
      ashbyDebug(`yes/no buttons "${question.slice(0, 60)}": could not click "${target}"`);
    }
  }

  return filledAnything;
};

const handleAshbyCustoms = (profile) => {
  let filledAnything = false;
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const eeo = profile.eeo || {};
  const links = profile.websitesAndSkills || {};

  // Added 'legend' to ensure we catch wrapped EEO sections
  const questionBlocks = document.querySelectorAll('label, h3, h4, legend');

  questionBlocks.forEach(block => {
    const questionText = block.innerText.toLowerCase().replace('*', '').trim();
    if(!questionText) return;
    
    let textInput = null;
    let radios = [];
    let yesNoButtons = [];
    let selects = [];

    if (block.htmlFor) textInput = document.getElementById(block.htmlFor);

    // Look-ahead traversal (Safely skips lists and descriptions to find inputs)
    let sibling = block.nextElementSibling;
    while (sibling && !['LABEL', 'H3', 'H4', 'H2', 'HR', 'LEGEND'].includes(sibling.tagName)) {
        if (!textInput) {
            if (sibling.tagName.match(/INPUT|TEXTAREA/)) textInput = sibling;
            else {
                const foundTextInput = sibling.querySelector('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea');
                if (foundTextInput) textInput = foundTextInput;
            }
        }

        const foundRadios = sibling.querySelectorAll('input[type="radio"]');
        if (foundRadios.length > 0) radios = [...radios, ...Array.from(foundRadios)];

        const foundButtons = Array.from(sibling.querySelectorAll('button')).filter(b => b.innerText.match(/^(yes|no)$/i));
        if (foundButtons.length > 0) yesNoButtons = [...yesNoButtons, ...foundButtons];

        // Future-proofing: Catch standard dropdowns if Ashby uses them!
        const foundSelects = sibling.querySelectorAll('select');
        if (foundSelects.length > 0) selects = [...selects, ...Array.from(foundSelects)];

        sibling = sibling.nextElementSibling;
    }

    // Fallbacks
    if (!textInput) textInput = block.querySelector('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea');
    if (radios.length === 0) radios = Array.from(block.querySelectorAll('input[type="radio"]'));
    if (selects.length === 0) selects = Array.from(block.querySelectorAll('select'));

    // The Universal Fill Adapter (Handles Radios, Dropdowns, and Buttons seamlessly)
    const attemptFill = (targetVal) => {
        if (!targetVal) return false;
        if (radios.length > 0 && window.FastApplyUtils.fillRadio(radios, targetVal)) return true;
        if (selects.length > 0 && window.FastApplyUtils.fillDropdown(selects[0], targetVal)) return true;
        if (yesNoButtons.length > 0 && clickAshbyButton(yesNoButtons, targetVal)) return true;
        return false;
    };

    // --- 1. BASIC INFO & TEXT FIELDS ---
    if (questionText === 'name' || questionText === 'full name' || questionText === 'legal name') {
        if (textInput && window.FastApplyUtils.fillField(textInput, `${pInfo.firstName} ${pInfo.lastName || ''}`.trim())) filledAnything = true;
    }
    else if (questionText === 'first name') {
        if (textInput && window.FastApplyUtils.fillField(textInput, pInfo.firstName)) filledAnything = true;
    }
    else if (questionText === 'last name') {
        if (textInput && window.FastApplyUtils.fillField(textInput, pInfo.lastName)) filledAnything = true;
    }
    else if (questionText.includes('email')) {
        if (textInput && window.FastApplyUtils.fillField(textInput, cInfo.email)) filledAnything = true;
    }
    else if (questionText.includes('phone')) {
        if (textInput && window.FastApplyUtils.fillField(textInput, cInfo.phone)) filledAnything = true;
    }
    else if (questionText.includes('linkedin')) {
        if (textInput && window.FastApplyUtils.fillField(textInput, links.linkedin)) filledAnything = true;
    }
    else if (questionText.includes('github')) {
        if (textInput && window.FastApplyUtils.fillField(textInput, links.github)) filledAnything = true;
    }
    else if (questionText.includes('portfolio') || questionText === 'website') {
        if (textInput && window.FastApplyUtils.fillField(textInput, links.portfolio)) filledAnything = true;
    }
    else if (
      questionText.includes('country') &&
      /work from|intend to work|working from|work out of|plan to work|be working/.test(questionText)
    ) {
      // "What country do you intend to work from?" ("Please list your city
      // and country") — answer from the contact location.
      if (textInput && cInfo.country && textInput.dataset.fa_filled !== "true") {
        const locString = [cInfo.city, cInfo.state, cInfo.country]
          .filter(Boolean)
          .join(", ");
        if (window.FastApplyUtils.fillAutocomplete(textInput, null, locString)) {
          ashbyDebug(`country question "${questionText.slice(0, 60)}" → "${locString}"`);
          filledAnything = true;
        }
      } else if (attemptFill(cInfo.country)) {
        ashbyDebug(`country question "${questionText.slice(0, 60)}" → "${cInfo.country}"`);
        filledAnything = true;
      }
    }
    else if (questionText.includes('location') || questionText.includes('city')) {
      if (textInput && cInfo.city && textInput.dataset.fa_filled !== "true") {
            const locString = [cInfo.city, cInfo.state, cInfo.country]
              .filter(Boolean)
              .join(", ");
            if (window.FastApplyUtils.fillAutocomplete(textInput, null, locString)) {
              filledAnything = true;
            }
        }
    }
    
    // --- 2. YES/NO & EEO DEMOGRAPHICS ---
    else if (questionText.includes('authorized to work') || questionText.includes('right to work') || questionText.includes('legally authorized')) {
        if (attemptFill(eeo.authorizedToWork)) filledAnything = true;
    }
    else if (questionText.includes('sponsorship') || questionText.includes('visa status')) {
        if (attemptFill(eeo.requireVisaFuture)) filledAnything = true;
    }
    else if ((questionText.includes('gender') || questionText.includes('sex') || questionText.includes('identify as')) && !questionText.includes('transgender') && !questionText.includes('sexual orientation') && !questionText.includes('ethnicity') && !questionText.includes('race') && !questionText.includes('hispanic')) {
        const target = eeo.optOut ? "decline" : eeo.gender;
        if (attemptFill(target)) filledAnything = true;
    }
    else if (questionText.includes('race')) {
        const target = eeo.optOut ? "decline" : eeo.race;
        if (attemptFill(target)) filledAnything = true;
    }
    else if (questionText.includes('ethnic') || questionText.includes('hispanic')) {
        const target = eeo.optOut ? "decline" : eeo.ethnicity;
        if (attemptFill(target)) filledAnything = true;
    }
    else if (questionText.includes('veteran')) {
        const target = eeo.optOut ? "decline" : eeo.veteran;
        if (attemptFill(target)) filledAnything = true;
    }
    else if (questionText.includes('disability')) {
        const target = eeo.optOut ? "decline" : eeo.disability;
        if (attemptFill(target)) filledAnything = true;
    }
  });

  return filledAnything;
};

let ashbyLoggedFirstPass = false;

const attemptAutofill = (profile) => {
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  let filledAnything = false;

  // Ashby's current application form identifies its standard fields with
  // _systemfield_* ids (name/email/phone/location); the old name-attribute
  // selectors stopped matching anything after their form update.
  const byId = id => document.getElementById(id);

  const fullNameInput = byId('_systemfield_name') ||
    document.querySelector('input[name="name"], input[name="fullName"], input[autocomplete="name"]');
  if (fullNameInput && pInfo.firstName) {
    if (window.FastApplyUtils.fillField(fullNameInput, `${pInfo.firstName} ${pInfo.lastName || ''}`.trim())) filledAnything = true;
  }

  const fNameInput = document.querySelector('input[name*="first"], input[autocomplete="given-name"]');
  const lNameInput = document.querySelector('input[name*="last"], input[autocomplete="family-name"]');
  if (fNameInput && pInfo.firstName) if (window.FastApplyUtils.fillField(fNameInput, pInfo.firstName)) filledAnything = true;
  if (lNameInput && pInfo.lastName) if (window.FastApplyUtils.fillField(lNameInput, pInfo.lastName)) filledAnything = true;

  const emailInput = byId('_systemfield_email') ||
    document.querySelector('input[type="email"], input[name="email"], input[autocomplete="email"]');
  const phoneInput = byId('_systemfield_phone') ||
    document.querySelector('input[type="tel"], input[name*="phone"], input[autocomplete="tel"]');
  if (emailInput && cInfo.email) if (window.FastApplyUtils.fillField(emailInput, cInfo.email)) filledAnything = true;
  if (phoneInput && cInfo.phone) if (window.FastApplyUtils.fillField(phoneInput, cInfo.phone)) filledAnything = true;

  const locationInput = byId('_systemfield_location') ||
    document.querySelector('input[name="location"], input[placeholder*="typing" i], input[placeholder*="location" i]');
  if (locationInput && cInfo.city && locationInput.dataset.fa_filled !== "true") {
    const locString = [cInfo.city, cInfo.state, cInfo.country]
      .filter(Boolean)
      .join(", ");
    if (window.FastApplyUtils.fillAutocomplete(locationInput, null, locString)) {
      filledAnything = true;
    }
  }

  if (handleAshbyCustoms(profile)) filledAnything = true;
  if (fillAshbyChoiceGroups(profile)) filledAnything = true;
  if (fillAshbyYesNoButtonGroups(profile)) filledAnything = true;

  if (!ashbyLoggedFirstPass) {
    ashbyLoggedFirstPass = true;
    console.debug(
      "[FastApply:ashby] first pass:",
      "name:", Boolean(fullNameInput),
      "email:", Boolean(emailInput),
      "phone:", Boolean(phoneInput),
      "location:", Boolean(locationInput),
      "labels:", document.querySelectorAll("label").length,
      "filledAnything:", filledAnything
    );
  }

  return filledAnything;
};

const startEngine = () => {
  window.FastApplyUtils.loadProfileData((profileData, autofillEnabled) => {
    if (!autofillEnabled || !profileData) return;
    const res = { profileData };
    
    console.log("[FastApply] ⚡ Initiating Ashby form lock...");
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attemptAutofill(res.profileData)) console.log(`[FastApply] ✅ Ashby Autofill successful on attempt ${attempts}!`);
      
      if (attempts >= 20) {
        clearInterval(interval);
        console.log("[FastApply] 🏁 Ashby Autofill sequence completed.");
      }
    }, 500);
  });
};

window.FastApplyAgent2Controller?.register({
  atsPlatform: "ashby",
  runDeterministic: attemptAutofill
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEngine);
else startEngine();
})();
