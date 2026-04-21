// public/bamboohr.js
console.log("[FastApply] BambooHR Engine Active. (Revised Stable Edition)");

let faBambooIsRunning = false;

// const normalizeText = (text) =>
//   String(text ?? "")
//     .replace(/\s+/g, " ")
//     .trim()
//     .toLowerCase();

const getVisibleText = (el) =>
  String(
    el?.innerText ||
    el?.textContent ||
    el?.getAttribute?.("aria-label") ||
    el?.getAttribute?.("placeholder") ||
    el?.value ||
    ""
  ).trim();

const isDropdownOpen = () => {
  return !!document.querySelector(
    '[role="option"], [role="listbox"], li[role="option"], ul[role="listbox"]'
  );
};

const isActuallyFilled = (el) => {
  if (!el) return false;

  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    return !!String(el.value || "").trim();
  }

  if (el.tagName === "SELECT") {
    return !!String(el.value || "").trim();
  }

  return el.dataset.fa_filled === "true";
};

const containsAny = (text, patterns) => {
  const t = normalizeText(text);
  return patterns.some((p) => t.includes(normalizeText(p)));
};

const getQuestionText = (el) => normalizeText(getVisibleText(el).replace(/\*/g, ""));

const getContainerForBlock = (block) => {
  if (!block) return null;

  let container = block.closest("fieldset");
  if (container) return container;

  container = block.parentElement;
  for (let i = 0; i < 6; i++) {
    if (!container) break;

    const hasUsefulFields = container.querySelector(
      'input, select, textarea, [role="combobox"], button'
    );

    if (hasUsefulFields) return container;
    container = container.parentElement;
  }

  return block.parentElement || null;
};

const getAssociatedField = (labelOrBlock, container) => {
  if (!labelOrBlock) return null;

  const htmlFor = labelOrBlock.getAttribute?.("for");
  if (htmlFor) {
    const direct = document.getElementById(htmlFor);
    if (direct) return direct;
  }

  const inside = labelOrBlock.querySelector?.(
    'input, select, textarea, [role="combobox"], button'
  );
  if (inside) return inside;

  let sibling = labelOrBlock.nextElementSibling;
  while (sibling) {
    const found =
      sibling.matches?.('input, select, textarea, [role="combobox"], button')
        ? sibling
        : sibling.querySelector?.('input, select, textarea, [role="combobox"], button');

    if (found) return found;
    sibling = sibling.nextElementSibling;
  }

  if (container) {
    const fields = Array.from(
      container.querySelectorAll('input, select, textarea, [role="combobox"], button')
    );
    if (fields.length === 1) return fields[0];
  }

  return container?.querySelector('input, select, textarea, [role="combobox"], button') || null;
};

const getTextInputFromContainer = (container, labelOrBlock = null) => {
  const associated = getAssociatedField(labelOrBlock, container);

  if (
    associated &&
    associated.matches?.(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type]), textarea'
    )
  ) {
    return associated;
  }

  return (
    container?.querySelector(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type]), textarea'
    ) || null
  );
};

const getRadioGroup = (container) =>
  Array.from(container?.querySelectorAll('input[type="radio"]') || []);

const getCheckboxGroup = (container) =>
  Array.from(container?.querySelectorAll('input[type="checkbox"]') || []);

const markContainerFilled = (container) => {
  if (!container) return;
  container.dataset.fa_filled = "true";
};

const unmarkDropdownProcessing = (container) => {
  if (!container) return;
  container.dataset.fa_dropdown_processing = "false";
};

const getOptionText = (opt) => normalizeText(getVisibleText(opt));

const chooseBestBambooOption = (options, targetValue) => {
  const target = normalizeText(targetValue);
  if (!target) return null;

  const arr = Array.from(options || []);
  if (!arr.length) return null;

  return (
    arr.find((opt) => window.FastApplyUtils.smartMatch(getVisibleText(opt), targetValue)) ||
    arr.find((opt) => getOptionText(opt) === target) ||
    arr.find((opt) => getOptionText(opt).startsWith(target)) ||
    arr.find((opt) => getOptionText(opt).includes(target))
  );
};

// --- REVISED BAMBOOHR DROPDOWN FILLER ---
const fillBambooDropdown = (container, targetValue) => {
  if (!container || !targetValue) return false;
  if (container.dataset.fa_dropdown_processing === "true") return false;
  if (container.dataset.fa_filled === "true") return false;
  if (isDropdownOpen()) return false;

  // 1. Native select
  const nativeSelect = container.querySelector("select");
  if (nativeSelect && !isActuallyFilled(nativeSelect)) {
    if (window.FastApplyUtils.fillDropdown(nativeSelect, targetValue)) {
      markContainerFilled(container);
      return true;
    }
  }

  // 2. Combobox / searchable input
  const input =
    container.querySelector('input[role="combobox"]') ||
    container.querySelector('input[type="text"]') ||
    container.querySelector('input[class*="search"]');

  // 3. Button trigger fallback
  const triggerButton =
    container.querySelector('[role="combobox"]') ||
    container.querySelector("button");

  const trigger = input || triggerButton;
  if (!trigger) return false;

  container.dataset.fa_dropdown_processing = "true";

  try {
    trigger.focus?.();
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    trigger.click?.();

    if (input && !input.readOnly && !input.disabled) {
      window.FastApplyUtils.fillField(input, targetValue);
    }

    setTimeout(() => {
      let options = Array.from(
        document.querySelectorAll('[role="option"], li[role="option"], ul[role="listbox"] li, li')
      ).filter((opt) => getVisibleText(opt));

      let matchedOption = chooseBestBambooOption(options, targetValue);

      if (!matchedOption && input) {
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown", keyCode: 40 }));

        setTimeout(() => {
          options = Array.from(
            document.querySelectorAll('[role="option"], li[role="option"], ul[role="listbox"] li, li')
          ).filter((opt) => getVisibleText(opt));

          matchedOption = chooseBestBambooOption(options, targetValue);

          if (matchedOption) {
            matchedOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
            matchedOption.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
            matchedOption.click();
            markContainerFilled(container);
            try {
              trigger.style.border = "2px solid #8b5cf6";
              trigger.style.backgroundColor = "#f5f3ff";
            } catch (_) {}
          } else {
            input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
            input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));
          }

          unmarkDropdownProcessing(container);
        }, 250);

        return;
      }

      if (matchedOption) {
        matchedOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        matchedOption.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        matchedOption.click();
        markContainerFilled(container);
        try {
          trigger.style.border = "2px solid #8b5cf6";
          trigger.style.backgroundColor = "#f5f3ff";
        } catch (_) {}
      } else if (input) {
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown", keyCode: 40 }));
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));
      }

      unmarkDropdownProcessing(container);
    }, 700);

    return true;
  } catch (error) {
    console.warn("[FastApply] BambooHR dropdown fill failed:", error);
    unmarkDropdownProcessing(container);
    return false;
  }
};

const mapCitizenshipAnswer = (authorizedToWork, requireVisaFuture, country) => {
  const auth = normalizeText(authorizedToWork);
  const visa = normalizeText(requireVisaFuture);
  const c = normalizeText(country);

  const isUS = c === "united states" || c === "usa" || c === "us";

  if (auth === "yes" && visa === "no") {
    if (isUS) return "i am a u.s. citizen/permanent resident";
    return "non-citizen authorized to work for any u.s. employer";
  }

  if (auth === "yes" && visa === "yes") {
    return "non-citizen seeking work authorization";
  }

  if (auth === "no") {
    return "non-citizen seeking work authorization";
  }

  return "";
};

const fillSpecificYesNoRadios = (radios, answer) => {
  if (!radios.length || !answer) return false;
  return window.FastApplyUtils.fillRadio(radios, answer);
};

// --- BAMBOOHR CUSTOM FIELD MAPPER ---
const handleBambooCustoms = (profile) => {
  if (faBambooIsRunning) return false;
  if (isDropdownOpen()) return false;

  faBambooIsRunning = true;

  let filledAnything = false;

  try {
    const pInfo = profile.personalInfo || {};
    const cInfo = profile.contactInfo || {};
    const eeo = profile.eeo || {};
    const links = profile.websitesAndSkills || {};

    const questionBlocks = document.querySelectorAll("label, legend, h3, h4");

    questionBlocks.forEach((block) => {
      const questionText = getQuestionText(block);
      if (!questionText) return;

      const container = getContainerForBlock(block);
      if (!container) return;

      const textInput = getTextInputFromContainer(container, block);
      const radios = getRadioGroup(container);
      const checkboxes = getCheckboxGroup(container);

      // --- 1. BASIC INFORMATION ---
      if (questionText === "first name") {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, pInfo.firstName)) filledAnything = true;
      }
      else if (questionText === "last name") {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, pInfo.lastName)) filledAnything = true;
      }
      else if (questionText === "email") {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, cInfo.email)) filledAnything = true;
      }
      else if (questionText === "phone") {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, cInfo.phone)) filledAnything = true;
      }

      // --- 2. ADDRESS FIELDS ---
      else if (questionText === "address" || questionText === "street address") {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, cInfo.addressLine1)) filledAnything = true;
      }
      else if (questionText === "city") {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, cInfo.city)) filledAnything = true;
      }
      else if (questionText === "zip" || questionText === "postal code" || questionText === "zip/postal code") {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, cInfo.postalCode)) filledAnything = true;
      }
      else if (
        questionText === "state" ||
        questionText === "province" ||
        questionText.includes("state/") ||
        questionText.includes("state *") ||
        questionText.includes("province *")
      ) {
        if (fillBambooDropdown(container, cInfo.state)) filledAnything = true;
      }
      else if (questionText === "country") {
        if (fillBambooDropdown(container, cInfo.country)) filledAnything = true;
      }

      // --- 3. LINKS & SOCIALS ---
      else if (questionText.includes("linkedin")) {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, links.linkedin)) filledAnything = true;
      }
      else if (questionText.includes("twitter")) {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, links.twitter)) filledAnything = true;
      }
      else if (questionText.includes("website") || questionText.includes("portfolio") || questionText.includes("blog")) {
        if (textInput && !isActuallyFilled(textInput) && window.FastApplyUtils.fillField(textInput, links.portfolio || links.github)) filledAnything = true;
      }

      // --- 4. CUSTOM RADIO QUESTIONS ---
      else if (questionText.includes("citizenship") || questionText.includes("employment eligibility")) {
        if (radios.length > 0) {
          const target = mapCitizenshipAnswer(
            eeo.authorizedToWork,
            eeo.requireVisaFuture,
            cInfo.country
          );
          if (target && window.FastApplyUtils.fillRadio(radios, target)) filledAnything = true;
        }
      }
      else if (
        questionText.includes("legally authorized to work in the united states") ||
        questionText.includes("authorized to work in the united states")
      ) {
        if (radios.length > 0) {
          const answer = normalizeText(eeo.authorizedToWork) === "yes" ? "yes" : "no";
          if (fillSpecificYesNoRadios(radios, answer)) filledAnything = true;
        }
      }
      else if (
        questionText.includes("require visa sponsorship") ||
        questionText.includes("future require visa") ||
        questionText.includes("will you now or in the future require")
      ) {
        if (radios.length > 0) {
          const answer = normalizeText(eeo.requireVisaFuture || eeo.requireVisaNow) === "yes" ? "yes" : "no";
          if (fillSpecificYesNoRadios(radios, answer)) filledAnything = true;
        }
      }
      else if (questionText.includes("based in")) {
        const country = normalizeText(cInfo.country || "");
        const isTargetCountry =
          questionText.includes(country) ||
          (country === "united states" && (questionText.includes("usa") || questionText.includes("united states")));

        if (radios.length > 0 && window.FastApplyUtils.fillRadio(radios, isTargetCountry ? "yes" : "no")) {
          filledAnything = true;
        }
      }
      else if (questionText.includes("authorized") && radios.length > 0) {
        const answer = normalizeText(eeo.authorizedToWork) === "yes" ? "yes" : "no";
        if (fillSpecificYesNoRadios(radios, answer)) filledAnything = true;
      }
      else if ((questionText.includes("visa") || questionText.includes("sponsorship")) && radios.length > 0) {
        const answer = normalizeText(eeo.requireVisaFuture || eeo.requireVisaNow) === "yes" ? "yes" : "no";
        if (fillSpecificYesNoRadios(radios, answer)) filledAnything = true;
      }

      // --- 5. CHECKBOX QUESTIONS IF ANY ---
      else if (checkboxes.length > 0 && questionText.includes("agree")) {
        if (window.FastApplyUtils.fillCheckbox(checkboxes, "yes")) filledAnything = true;
      }
    });

    return filledAnything;
  } finally {
    setTimeout(() => {
      faBambooIsRunning = false;
    }, 900);
  }
};

// --- CORE POLLING ENGINE ---
const attemptAutofill = (profile) => {
  let filledAnything = false;
  if (handleBambooCustoms(profile)) filledAnything = true;
  return filledAnything;
};

const startEngine = () => {
  chrome.storage.local.get(["autofillEnabled", "profileData"], (res) => {
    if (res.autofillEnabled === false || !res.profileData) return;

    console.log("[FastApply] ⚡ Initiating BambooHR form lock...");
    let attempts = 0;

    const interval = setInterval(() => {
      attempts++;

      if (!faBambooIsRunning && !isDropdownOpen()) {
        if (attemptAutofill(res.profileData)) {
          console.log(`[FastApply] ✅ BambooHR Autofill successful on attempt ${attempts}!`);
        }
      }

      if (attempts >= 28) {
        clearInterval(interval);
        console.log("[FastApply] 🏁 BambooHR Autofill sequence completed.");
      }
    }, 700);
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startEngine);
} else {
  startEngine();
}