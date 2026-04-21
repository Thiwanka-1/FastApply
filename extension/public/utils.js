// public/utils.js
console.log("[FastApply] Utils Loaded.");

const normalizeValue = (value) => String(value ?? "").trim();

const setNativeValue = (element, value) => {
  if (!element) return;

  const normalized = String(value ?? "");

  try {
    const tag = (element.tagName || "").toUpperCase();

    if (tag === "TEXTAREA") {
      const proto = window.HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) nativeSetter.call(element, normalized);
      else element.value = normalized;
      return;
    }

    if (tag === "INPUT") {
      const proto = window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) nativeSetter.call(element, normalized);
      else element.value = normalized;
      return;
    }

    if (tag === "SELECT") {
      element.value = normalized;
      return;
    }

    element.value = normalized;
  } catch (error) {
    try {
      element.value = normalized;
    } catch (_) {}
  }
};

const triggerEvents = (element, options = {}) => {
  if (!element) return;

  const {
    withFocus = true,
    withInput = true,
    withChange = true,
    withBlur = false,
    withKeyboard = false,
  } = options;

  try {
    if (withFocus) {
      element.focus();
      element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    }
  } catch (_) {}

  try {
    if (withKeyboard) {
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
    }
  } catch (_) {}

  try {
    if (withInput) {
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: "",
          inputType: "insertText",
        })
      );
    }
  } catch (_) {
    try {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (_) {}
  }

  try {
    if (withChange) {
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } catch (_) {}

  try {
    if (withBlur) {
      element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      element.blur?.();
    }
  } catch (_) {}
};

const markFilled = (element, type = "field") => {
  if (!element) return;

  element.dataset.fa_filled = "true";
  element.dataset.fa_fill_type = type;

  try {
    if (type === "dropdown") {
      element.style.border = "2px solid #8b5cf6";
      element.style.backgroundColor = "#f5f3ff";
    } else {
      element.style.border = "2px solid #06b6d4";
      element.style.backgroundColor = "#f0fdfa";
    }
  } catch (_) {}
};

const isAlreadyFilled = (element) => {
  if (!element) return true;
  return element.dataset.fa_filled === "true";
};

const escapeRegex = (string) => {
  return String(string ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const normalizeText = (text) => {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s/@.+-]/g, " ")
    .toLowerCase()
    .trim();
};

const hasWholeWord = (text, word) => {
  try {
    return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);
  } catch (_) {
    return false;
  }
};

const tokensOf = (text) => {
  return normalizeText(text)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
};

const includesAnyWholeWord = (text, words) => {
  return words.some((word) => hasWholeWord(text, word));
};

const classifyPronouns = (text) => {
  const t = normalizeText(text);

  const hasHe = includesAnyWholeWord(t, ["he", "him", "his"]);
  const hasShe = includesAnyWholeWord(t, ["she", "her", "hers"]);
  const hasThey = includesAnyWholeWord(t, ["they", "them", "theirs"]);
  const hasZe = includesAnyWholeWord(t, ["ze", "zir", "zie", "hir", "xe", "xem", "xyr"]);

  if (hasHe && !hasShe && !hasThey && !hasZe) return "he";
  if (hasShe && !hasHe && !hasThey && !hasZe) return "she";
  if (hasThey && !hasHe && !hasShe && !hasZe) return "they";
  if (hasZe && !hasHe && !hasShe && !hasThey) return "other";
  return "";
};

const classifyGender = (text) => {
  const t = normalizeText(text);

  if (hasWholeWord(t, "male") || hasWholeWord(t, "man")) {
    if (!hasWholeWord(t, "female") && !hasWholeWord(t, "woman")) return "male";
  }

  if (hasWholeWord(t, "female") || hasWholeWord(t, "woman")) return "female";

  if (
    t.includes("non binary") ||
    t.includes("nonbinary") ||
    t.includes("genderqueer") ||
    t.includes("gender non conforming") ||
    t.includes("gender nonconforming")
  ) {
    return "nonbinary";
  }

  if (t.includes("prefer not") || t.includes("decline") || t.includes("choose not")) {
    return "optout";
  }

  return "";
};

const classifyYesNo = (text) => {
  const t = normalizeText(text);
  if (t.startsWith("yes") || hasWholeWord(t, "yes")) return "yes";
  if (t.startsWith("no") || hasWholeWord(t, "no")) return "no";
  return "";
};

const classifyVeteran = (text) => {
  const t = normalizeText(text);
  if (!t.includes("veteran")) return "";

  if (
    t.includes("prefer not") ||
    t.includes("decline") ||
    t.includes("choose not")
  ) {
    return "optout";
  }

  if (
    t.includes("not a protected veteran") ||
    t.includes("not protected veteran") ||
    t.includes("not a veteran")
  ) {
    return "not_protected";
  }

  if (t.includes("disabled veteran")) return "disabled";
  if (t.includes("recently separated veteran")) return "recently_separated";
  if (t.includes("active wartime") || t.includes("campaign badge veteran")) return "active_wartime";
  if (t.includes("armed forces service medal veteran")) return "armed_forces_medal";

  return "veteran_other";
};

const classifyEthnicity = (text) => {
  const t = normalizeText(text);

  if (
    t.includes("prefer not") ||
    t.includes("decline") ||
    t.includes("choose not")
  ) {
    return "optout";
  }

  if (t.includes("hispanic") || t.includes("latino") || t.includes("latinx")) return "hispanic";
  if (t.includes("asian")) return "asian";
  if (t.includes("black") || t.includes("african")) return "black";
  if (t.includes("white") && !t.includes("not white")) return "white";
  if (t.includes("american indian") || t.includes("alaska native")) return "native";
  if (t.includes("native hawaiian") || t.includes("pacific islander")) return "pacific";
  if (t.includes("two or more races") || t.includes("multiracial")) return "multi";

  return "";
};

// Global smart matcher (strict for sensitive dropdowns)
const smartMatch = (optText, targetValue) => {
  const o = normalizeText(optText);
  const t = normalizeText(targetValue);

  if (!o || !t) return false;
  if (o === t) return true;

  // 1. Opt-out matching
  const targetLooksOptOut =
    t.includes("decline") ||
    t.includes("prefer not") ||
    t.includes("choose not") ||
    t.includes("do not wish") ||
    t.includes("do not want");

  if (targetLooksOptOut) {
    if (
      o.includes("decline") ||
      o.includes("prefer not") ||
      o.includes("wish to answer") ||
      o.includes("not wish") ||
      o.includes("choose not") ||
      o.includes("do not wish") ||
      o.includes("do not want") ||
      o.includes("self identify later")
    ) {
      return true;
    }
    return false;
  }

  // 2. Strict pronoun matching
  const targetPronoun = classifyPronouns(t);
  const optionPronoun = classifyPronouns(o);
  if (targetPronoun || optionPronoun) {
    return !!targetPronoun && targetPronoun === optionPronoun;
  }

  // 3. Strict gender matching
  const targetGender = classifyGender(t);
  const optionGender = classifyGender(o);
  if (targetGender || optionGender) {
    return !!targetGender && targetGender === optionGender;
  }

  // 4. Strict yes/no matching
  const targetYesNo = classifyYesNo(t);
  const optionYesNo = classifyYesNo(o);
  if (targetYesNo || optionYesNo) {
    return !!targetYesNo && targetYesNo === optionYesNo;
  }

  // 5. Strict veteran matching
  const targetVeteran = classifyVeteran(t);
  const optionVeteran = classifyVeteran(o);
  if (targetVeteran || optionVeteran) {
    return !!targetVeteran && targetVeteran === optionVeteran;
  }

  // 6. Strict ethnicity/race matching
  const targetEthnicity = classifyEthnicity(t);
  const optionEthnicity = classifyEthnicity(o);
  if (targetEthnicity || optionEthnicity) {
    return !!targetEthnicity && targetEthnicity === optionEthnicity;
  }

  // 7. Safe regex exact-word match
  try {
    const escapedT = escapeRegex(t);
    const escapedO = escapeRegex(o);

    if (new RegExp(`\\b${escapedT}\\b`, "i").test(o)) return true;
    if (new RegExp(`\\b${escapedO}\\b`, "i").test(t)) return true;
  } catch (_) {}

  // 8. Token overlap fallback
  const tTokens = tokensOf(t);
  const oTokens = tokensOf(o);

  if (tTokens.length && oTokens.length) {
    const overlap = tTokens.filter((token) => token.length > 3 && oTokens.includes(token));
    if (overlap.length >= 1) return true;
  }

  // 9. Final cautious substring fallback
  if (t.length > 3 && o.length > 3) {
    if (o.includes(t) || t.includes(o)) return true;
  }

  return false;
};

const getElementText = (el) => {
  if (!el) return "";
  return normalizeValue(
    el.innerText ||
      el.textContent ||
      el.getAttribute?.("aria-label") ||
      el.getAttribute?.("placeholder") ||
      el.value ||
      ""
  );
};

const getLabelText = (input) => {
  if (!input) return "";

  let text = "";

  if (!text && input.id) {
    try {
      const el = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (el) text = getElementText(el);
    } catch (_) {}
  }

  if (!text) {
    text = normalizeValue(input.getAttribute?.("aria-label") || "");
  }

  if (!text) {
    const labelledBy = input.getAttribute?.("aria-labelledby");
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/).filter(Boolean);
      const ariaTexts = ids
        .map((id) => {
          try {
            return getElementText(document.getElementById(id));
          } catch (_) {
            return "";
          }
        })
        .filter(Boolean)
        .join(" ");
      if (ariaTexts) text = ariaTexts;
    }
  }

  if (!text) {
    text = normalizeValue(input.getAttribute?.("placeholder") || "");
  }

  if (!text && input.closest) {
    const wrapper = input.closest(
      'label, [role="group"], fieldset, [class*="field"], [class*="input"], [class*="form"], [class*="question"], [class*="option"], [class*="radio"], [class*="checkbox"]'
    );
    if (wrapper && wrapper !== input) {
      text = getElementText(wrapper);
    }
  }

  if (!text) {
    const prev = input.previousElementSibling;
    const next = input.nextElementSibling;
    const parent = input.parentElement;

    text =
      getElementText(prev) ||
      getElementText(next) ||
      getElementText(parent);
  }

  if (!text) {
    text = normalizeValue(input.name || "");
  }

  return text;
};

const fillField = (element, value) => {
  const normalizedValue = normalizeValue(value);

  if (!element || !normalizedValue || isAlreadyFilled(element) || element.disabled || element.readOnly) {
    return false;
  }

  try {
    triggerEvents(element, { withFocus: true, withInput: false, withChange: false, withBlur: false });
    setNativeValue(element, normalizedValue);
    triggerEvents(element, { withFocus: false, withInput: true, withChange: true, withBlur: false, withKeyboard: true });

    const elementName = normalizeText(element.name || element.id || getLabelText(element));
    const shouldBlurImmediately =
      !elementName.includes("location") &&
      !elementName.includes("address") &&
      !elementName.includes("city");

    if (shouldBlurImmediately) {
      triggerEvents(element, { withFocus: false, withInput: false, withChange: false, withBlur: true });
    }

    markFilled(element, "field");
    return true;
  } catch (error) {
    console.warn("[FastApply] fillField failed:", error);
    return false;
  }
};

const tryClickSuggestion = (root, value) => {
  const normalized = normalizeText(value);
  if (!root || !normalized) return false;

  const selectors = [
    '[role="option"]',
    '[role="listbox"] [role="option"]',
    "li",
    ".dropdown-item",
    ".dropdown-option",
    ".dropdown-container li",
    ".pac-item",
    "a",
    "div"
  ];

  for (const selector of selectors) {
    const items = Array.from(root.querySelectorAll(selector));
    const match =
      items.find((item) => smartMatch(getElementText(item), normalized)) ||
      items.find((item) => normalizeText(getElementText(item)).includes(normalized)) ||
      items[0];

    if (match) {
      try {
        match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        match.click();
        return true;
      } catch (_) {}
    }
  }

  return false;
};

const fillAutocomplete = (visibleInput, hiddenInput, value) => {
  const normalizedValue = normalizeValue(value);

  if (!visibleInput || !normalizedValue || isAlreadyFilled(visibleInput) || visibleInput.disabled || visibleInput.readOnly) {
    return false;
  }

  try {
    triggerEvents(visibleInput, { withFocus: true, withInput: false, withChange: false, withBlur: false });
    setNativeValue(visibleInput, normalizedValue);
    triggerEvents(visibleInput, { withFocus: false, withInput: true, withChange: true, withBlur: false, withKeyboard: true });

    if (hiddenInput && !hiddenInput.disabled && !hiddenInput.readOnly) {
      setNativeValue(hiddenInput, normalizedValue);
      triggerEvents(hiddenInput, { withFocus: false, withInput: true, withChange: true, withBlur: false });
      markFilled(hiddenInput, "hidden-autocomplete");
    }

    markFilled(visibleInput, "autocomplete");

    setTimeout(() => {
      const candidates = [
        visibleInput.parentElement,
        document,
        document.querySelector(".dropdown-container"),
        document.querySelector(".pac-container"),
        document.querySelector('[role="listbox"]'),
      ].filter(Boolean);

      for (const root of candidates) {
        if (tryClickSuggestion(root, normalizedValue)) break;
      }

      triggerEvents(visibleInput, { withFocus: false, withInput: false, withChange: false, withBlur: true });
    }, 800);

    return true;
  } catch (error) {
    console.warn("[FastApply] fillAutocomplete failed:", error);
    return false;
  }
};

const fillDropdown = (selectElement, targetValue) => {
  const normalizedTarget = normalizeValue(targetValue);

  if (
    !selectElement ||
    !normalizedTarget ||
    isAlreadyFilled(selectElement) ||
    selectElement.disabled
  ) {
    return false;
  }

  let matchedOption = null;

  try {
    const options = Array.from(selectElement.options || []);

    matchedOption =
      options.find((opt) => smartMatch(opt.text, normalizedTarget)) ||
      options.find((opt) => smartMatch(opt.value, normalizedTarget)) ||
      options.find((opt) => normalizeText(opt.text) === normalizeText(normalizedTarget)) ||
      options.find((opt) => normalizeText(opt.value) === normalizeText(normalizedTarget)) ||
      options.find((opt) => normalizeText(opt.text).includes(normalizeText(normalizedTarget))) ||
      options.find((opt) => normalizeText(opt.value).includes(normalizeText(normalizedTarget)));

    if (!matchedOption) return false;

    triggerEvents(selectElement, { withFocus: true, withInput: false, withChange: false, withBlur: false });
    selectElement.value = matchedOption.value;
    selectElement.selectedIndex = matchedOption.index;
    triggerEvents(selectElement, { withFocus: false, withInput: true, withChange: true, withBlur: true });

    markFilled(selectElement, "dropdown");
    return true;
  } catch (error) {
    console.warn("[FastApply] fillDropdown failed:", error);
    return false;
  }
};

const fillRadio = (radioNodeList, targetText) => {
  const normalizedTarget = normalizeValue(targetText);

  if (!radioNodeList || radioNodeList.length === 0 || !normalizedTarget) return false;

  try {
    const radios = Array.from(radioNodeList);

    for (const radio of radios) {
      if (!radio || radio.disabled) continue;
      if (radio.dataset.fa_filled === "true") continue;

      const label = getLabelText(radio);

      if (smartMatch(label, normalizedTarget)) {
        if (!radio.checked) {
          radio.focus?.();
          radio.click();
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const wrap = radio.closest("label, [role='radio'], div, span") || radio.parentElement;
        if (wrap) {
          try {
            wrap.style.backgroundColor = "#f0fdfa";
            wrap.style.border = "1px solid #06b6d4";
            wrap.style.borderRadius = "4px";
          } catch (_) {}
        }

        radios.forEach((r) => {
          r.dataset.fa_filled = "true";
          r.dataset.fa_fill_type = "radio";
        });

        return true;
      }
    }
  } catch (error) {
    console.warn("[FastApply] fillRadio failed:", error);
  }

  return false;
};

const fillCheckbox = (checkboxNodeList, targetText) => {
  const normalizedTarget = normalizeValue(targetText);

  if (!checkboxNodeList || checkboxNodeList.length === 0 || !normalizedTarget) return false;

  let clickedAnything = false;

  try {
    const checkboxes = Array.from(checkboxNodeList);

    for (const cb of checkboxes) {
      if (!cb || cb.disabled) continue;
      if (cb.dataset.fa_filled === "true") continue;

      const label = getLabelText(cb);

      if (smartMatch(label, normalizedTarget)) {
        if (!cb.checked) {
          cb.focus?.();
          cb.click();
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const wrap = cb.closest("label, [role='checkbox'], div, span") || cb.parentElement;
        if (wrap) {
          try {
            wrap.style.backgroundColor = "#f0fdfa";
            wrap.style.border = "1px solid #06b6d4";
            wrap.style.borderRadius = "4px";
          } catch (_) {}
        }

        cb.dataset.fa_filled = "true";
        cb.dataset.fa_fill_type = "checkbox";
        clickedAnything = true;
      }
    }
  } catch (error) {
    console.warn("[FastApply] fillCheckbox failed:", error);
  }

  return clickedAnything;
};

window.FastApplyUtils = {
  normalizeValue,
  escapeRegex,
  smartMatch,
  getLabelText,
  fillField,
  fillAutocomplete,
  fillDropdown,
  fillRadio,
  fillCheckbox,
};