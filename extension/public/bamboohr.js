// public/bamboohr.js
console.log("[FastApply] BambooHR Engine Active. (Revised Stable Edition)");

// Engine scripts share one isolated world; an IIFE keeps top-level
// declarations from colliding with utils.js or other scripts.
(() => {

let faBambooIsRunning = false;

const normalizeText = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

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

const markContainerFilled = (container) => {
  if (!container) return;
  container.dataset.fa_filled = "true";
};

// --- REVISED BAMBOOHR DROPDOWN FILLER ---
const fillBambooDropdown = (container, targetValue) => {
  if (!container || !targetValue) return false;
  if (container.dataset.fa_dropdown_processing === "true") return false;
  if (container.dataset.fa_filled === "true") return false;

  // 1. Native select
  const nativeSelect = container.querySelector("select");
  if (nativeSelect && !isActuallyFilled(nativeSelect)) {
    if (window.FastApplyUtils.fillDropdown(nativeSelect, targetValue, { exact: true })) {
      markContainerFilled(container);
      return true;
    }
  }

  // 2. Combobox / searchable input
  const input =
    container.querySelector('input[role="combobox"]') ||
    container.querySelector('input[type="text"]') ||
    container.querySelector('input[class*="search"]');

  if (!input || input.readOnly || input.disabled) return false;

  // Searchable dropdowns are accepted only after the shared autocomplete
  // adapter finds and clicks one exact or uniquely matching visible option.
  // Button-only custom controls are left unresolved for the Agent/manual audit
  // instead of guessing with Enter.
  return window.FastApplyUtils.fillAutocomplete(input, null, targetValue);
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
      else if (
        questionText.includes("legally authorized to work in the united states") ||
        questionText.includes("authorized to work in the united states")
      ) {
        if (radios.length > 0 && normalizeText(eeo.authorizedToWork)) {
          const answer = normalizeText(eeo.authorizedToWork) === "yes" ? "yes" : "no";
          if (fillSpecificYesNoRadios(radios, answer)) filledAnything = true;
        }
      }
      else if (
        questionText.includes("require visa sponsorship") ||
        questionText.includes("future require visa") ||
        questionText.includes("will you now or in the future require")
      ) {
        const visaAnswer = normalizeText(eeo.requireVisaFuture || eeo.requireVisaNow);
        if (radios.length > 0 && visaAnswer) {
          const answer = visaAnswer === "yes" ? "yes" : "no";
          if (fillSpecificYesNoRadios(radios, answer)) filledAnything = true;
        }
      }
      else if (questionText.includes("based in")) {
        const country = normalizeText(cInfo.country || "");
        if (!country) return;
        const isUnitedStates = [
          "us",
          "usa",
          "united states",
          "united states of america"
        ].includes(country);
        const asksUnitedStates = /\b(usa|u s|united states|united states of america)\b/.test(questionText);
        const isTargetCountry =
          questionText.includes(country) ||
          (isUnitedStates && asksUnitedStates);

        if (radios.length > 0 && window.FastApplyUtils.fillRadio(radios, isTargetCountry ? "yes" : "no")) {
          filledAnything = true;
        }
      }
      else if (
        questionText.includes("authorized") &&
        radios.length > 0 &&
        normalizeText(eeo.authorizedToWork)
      ) {
        const answer = normalizeText(eeo.authorizedToWork) === "yes" ? "yes" : "no";
        if (fillSpecificYesNoRadios(radios, answer)) filledAnything = true;
      }
      else if (
        (questionText.includes("visa") || questionText.includes("sponsorship")) &&
        radios.length > 0 &&
        normalizeText(eeo.requireVisaFuture || eeo.requireVisaNow)
      ) {
        const answer = normalizeText(eeo.requireVisaFuture || eeo.requireVisaNow) === "yes" ? "yes" : "no";
        if (fillSpecificYesNoRadios(radios, answer)) filledAnything = true;
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
  window.FastApplyUtils.loadProfileData((profileData, autofillEnabled) => {
    if (!autofillEnabled || !profileData) return;
    const res = { profileData };

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

window.FastApplyAgent2Controller?.register({
  atsPlatform: "bamboohr",
  runDeterministic: attemptAutofill
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startEngine);
} else {
  startEngine();
}
})();
