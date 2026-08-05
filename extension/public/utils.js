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
      const queryRoot = input.getRootNode?.() || document;
      const el = queryRoot.querySelector?.(
        `label[for="${CSS.escape(input.id)}"]`
      );
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
      options.find((opt) => normalizeText(opt.text) === normalizeText(normalizedTarget)) ||
      options.find((opt) => normalizeText(opt.value) === normalizeText(normalizedTarget));

    if (!matchedOption) {
      const semanticMatches = options.filter(opt => {
        return smartMatch(opt.text, normalizedTarget) ||
          smartMatch(opt.value, normalizedTarget);
      });

      if (semanticMatches.length === 1) {
        matchedOption = semanticMatches[0];
      }
    }

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

    const exactRadio = radios.find(radio => {
      return radio &&
        !radio.disabled &&
        normalizeText(getLabelText(radio)) === normalizeText(normalizedTarget);
    });

    const semanticRadios = exactRadio
      ? [exactRadio]
      : radios.filter(radio => {
          return radio &&
            !radio.disabled &&
            smartMatch(getLabelText(radio), normalizedTarget);
        });

    if (semanticRadios.length !== 1) return false;

    for (const radio of semanticRadios) {
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

    const exactCheckbox = checkboxes.find(checkbox => {
      return checkbox &&
        !checkbox.disabled &&
        normalizeText(getLabelText(checkbox)) === normalizeText(normalizedTarget);
    });

    const semanticCheckboxes = exactCheckbox
      ? [exactCheckbox]
      : checkboxes.filter(checkbox => {
          return checkbox &&
            !checkbox.disabled &&
            smartMatch(getLabelText(checkbox), normalizedTarget);
        });

    if (semanticCheckboxes.length !== 1) return false;

    for (const cb of semanticCheckboxes) {
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

const agentFieldRegistry = new Map();

const hashAgentText = value => {
  const text = String(value ?? "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
};

const isElementVisible = element => {
  if (!element?.isConnected) return false;

  const style = window.getComputedStyle(element);

  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
};

const getAgentQueryRoots = (root = document) => {
  const roots = [];
  const pending = [root];
  const seen = new Set();

  while (pending.length > 0) {
    const current = pending.shift();

    if (!current || seen.has(current)) continue;

    seen.add(current);
    roots.push(current);

    current.querySelectorAll?.("*").forEach(element => {
      if (element.shadowRoot) {
        pending.push(element.shadowRoot);
      }
    });
  }

  return roots;
};

const queryAgentElements = (root, selector) => {
  const elements = new Set();

  getAgentQueryRoots(root).forEach(queryRoot => {
    queryRoot.querySelectorAll?.(selector).forEach(element => {
      elements.add(element);
    });
  });

  return [...elements];
};

const isAgentChoiceVisible = element => {
  if (isElementVisible(element)) return true;

  if (!element?.id) return false;

  try {
    const queryRoot = element.getRootNode?.() || document;
    const label = queryRoot.querySelector?.(
      `label[for="${CSS.escape(element.id)}"]`
    );

    return isElementVisible(label);
  } catch (_) {
    return false;
  }
};

const getOptionLabel = element => {
  if (!element) return "";

  if (element.id) {
    try {
      const label = document.querySelector(
        `label[for="${CSS.escape(element.id)}"]`
      );

      if (label) return getElementText(label);
    } catch (_) {}
  }

  const wrappingLabel = element.closest("label");

  return (
    getElementText(wrappingLabel) ||
    normalizeValue(element.getAttribute?.("aria-label")) ||
    normalizeValue(element.value)
  );
};

const getGroupQuestionText = elements => {
  const first = Array.from(elements || [])[0];

  if (!first) return "";

  const fieldset = first.closest("fieldset");
  const legend = fieldset?.querySelector("legend");

  if (legend) {
    return getElementText(legend);
  }

  const group = first.closest(
    '[role="group"], [role="radiogroup"], [class*="question"], [class*="form-group"], [class*="field"]'
  );

  if (group) {
    const heading = group.querySelector(
      'legend, label, [class*="label"], [class*="question"], h1, h2, h3, h4'
    );

    if (heading && !heading.contains(first)) {
      return getElementText(heading);
    }
  }

  return getLabelText(first);
};

const createAgentFieldId = (type, elements, label) => {
  const first = Array.from(elements || [])[0];

  const identity = [
    window.location.pathname,
    type,
    first?.id || "",
    first?.name || "",
    label
  ].join("|");

  let fieldId = `fa_${type}_${hashAgentText(identity)}`;
  let suffix = 1;

  while (
    agentFieldRegistry.has(fieldId) &&
    agentFieldRegistry.get(fieldId)?.elements?.[0] !== first
  ) {
    fieldId = `fa_${type}_${hashAgentText(identity)}_${suffix}`;
    suffix += 1;
  }

  return fieldId;
};

const registerAgentField = ({
  type,
  elements,
  label,
  options = [],
  required = false,
  maxLength = null
}) => {
  const normalizedElements = Array.from(elements || [])
    .filter(Boolean);

  if (normalizedElements.length === 0) return null;

  const fieldId = createAgentFieldId(
    type,
    normalizedElements,
    label
  );

  normalizedElements.forEach(element => {
    element.dataset.fa_agent_field_id = fieldId;
  });

  agentFieldRegistry.set(fieldId, {
    type,
    elements: normalizedElements,
    label,
    options,
    required,
    maxLength
  });

  return {
    fieldId,
    label,
    type,
    required,
    options,
    currentValue: "",
    maxLength
  };
};

const isStandardFieldEmpty = element => {
  if (!element) return false;

  if (element.matches('[contenteditable="true"]')) {
    return !normalizeValue(element.innerText);
  }

  if (element.tagName === "SELECT") {
    const selected = element.options?.[element.selectedIndex];

    return (
      !selected ||
      !normalizeValue(selected.value) ||
      selected.disabled
    );
  }

  return !normalizeValue(element.value);
};

const shouldCollectAgentField = element => {
  if (!element || !isElementVisible(element)) return false;

  if (
    element.disabled ||
    element.readOnly ||
    element.dataset.fa_filled === "true" ||
    element.dataset.fa_agent_processed === "true"
  ) {
    return false;
  }

  return isStandardFieldEmpty(element);
};

const collectUnresolvedFields = (root = document) => {
  const fields = [];

  const standardSelector = [
    'input:not([type="hidden"])',
    'input:not([type="radio"])',
    'input:not([type="checkbox"])',
    "select",
    "textarea",
    '[contenteditable="true"]'
  ].join(",");

  const excludedInputTypes = new Set([
    "hidden",
    "radio",
    "checkbox",
    "file",
    "password",
    "submit",
    "button",
    "reset",
    "image"
  ]);

  queryAgentElements(root, standardSelector).forEach(element => {
    const inputType = normalizeText(
      element.getAttribute?.("type") || ""
    );

    if (
      element.tagName === "INPUT" &&
      excludedInputTypes.has(inputType)
    ) {
      return;
    }

    if (!shouldCollectAgentField(element)) return;

    const label = normalizeValue(getLabelText(element));

    if (!label) return;

    const type = element.matches('[contenteditable="true"]')
      ? "textarea"
      : element.tagName === "SELECT"
        ? "select"
        : element.tagName === "TEXTAREA"
          ? "textarea"
          : inputType || "text";

    const options = element.tagName === "SELECT"
      ? Array.from(element.options || [])
          .filter(option => {
            return (
              !option.disabled &&
              normalizeValue(option.value) &&
              normalizeValue(option.text)
            );
          })
          .map(option => normalizeValue(option.text))
      : [];

    const maxLengthValue = Number(element.maxLength);
    const maxLength =
      Number.isFinite(maxLengthValue) &&
      maxLengthValue > 0
        ? maxLengthValue
        : null;

    const field = registerAgentField({
      type,
      elements: [element],
      label,
      options,
      required:
        element.required ||
        element.getAttribute("aria-required") === "true",
      maxLength
    });

    if (field) fields.push(field);
  });

  const radioGroups = new Map();

  queryAgentElements(root, 'input[type="radio"]').forEach(radio => {
    if (
      !isAgentChoiceVisible(radio) ||
      radio.disabled ||
      radio.dataset.fa_filled === "true" ||
      radio.dataset.fa_agent_processed === "true"
    ) {
      return;
    }

    const key =
      radio.name ||
      radio.closest("fieldset")?.id ||
      `radio_${hashAgentText(getGroupQuestionText([radio]))}`;

    if (!radioGroups.has(key)) {
      radioGroups.set(key, []);
    }

    radioGroups.get(key).push(radio);
  });

  radioGroups.forEach(radios => {
    if (radios.some(radio => radio.checked)) return;

    const label = normalizeValue(
      getGroupQuestionText(radios)
    );

    const options = radios
      .map(getOptionLabel)
      .filter(Boolean);

    if (!label || options.length === 0) return;

    const field = registerAgentField({
      type: "radio",
      elements: radios,
      label,
      options,
      required: radios.some(radio => radio.required)
    });

    if (field) fields.push(field);
  });

  const checkboxGroups = new Map();

  queryAgentElements(root, 'input[type="checkbox"]')
    .forEach(checkbox => {
      if (
        !isAgentChoiceVisible(checkbox) ||
        checkbox.disabled ||
        checkbox.dataset.fa_filled === "true" ||
        checkbox.dataset.fa_agent_processed === "true"
      ) {
        return;
      }

      const key = checkbox.name
        ? `checkbox_name_${checkbox.name}`
        : `checkbox_id_${checkbox.id || hashAgentText(getLabelText(checkbox))}`;

      if (!checkboxGroups.has(key)) {
        checkboxGroups.set(key, []);
      }

      checkboxGroups.get(key).push(checkbox);
    });

  checkboxGroups.forEach(checkboxes => {
    if (checkboxes.some(checkbox => checkbox.checked)) return;

    const label = normalizeValue(
      checkboxes.length === 1
        ? getLabelText(checkboxes[0])
        : getGroupQuestionText(checkboxes)
    );

    const options = checkboxes.length === 1
      ? ["Yes", "No"]
      : checkboxes.map(getOptionLabel).filter(Boolean);

    if (!label) return;

    const field = registerAgentField({
      type: "checkbox",
      elements: checkboxes,
      label,
      options,
      required: checkboxes.some(checkbox => checkbox.required)
    });

    if (field) fields.push(field);
  });

  return fields;
};

const markAgentState = (
  elements,
  state,
  reason = ""
) => {
  Array.from(elements || []).forEach(element => {
    element.dataset.fa_agent_processed = "true";
    element.dataset.fa_agent_state = state;
    element.dataset.fa_agent_reason = reason;

    try {
      if (state === "review") {
        element.style.border = "2px solid #f59e0b";
        element.style.backgroundColor = "#fffbeb";
      } else if (state === "unresolved") {
        element.style.border = "2px dashed #ef4444";
        element.style.backgroundColor = "#fef2f2";
      }
    } catch (_) {}
  });
};

const fillContentEditable = (element, value) => {
  const normalized = normalizeValue(value);

  if (!element || !normalized) return false;

  try {
    element.focus();
    element.textContent = normalized;
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: normalized,
        inputType: "insertText"
      })
    );
    element.dispatchEvent(
      new Event("change", { bubbles: true })
    );
    element.blur();

    markFilled(element, "contenteditable");
    return true;
  } catch (error) {
    console.warn(
      "[FastApply] fillContentEditable failed:",
      error
    );

    return false;
  }
};

const fillSingleCheckboxAnswer = (
  checkbox,
  value
) => {
  const yesNo = classifyYesNo(value);

  if (!checkbox || !yesNo) return false;

  try {
    if (yesNo === "yes" && !checkbox.checked) {
      checkbox.click();
      checkbox.dispatchEvent(
        new Event("change", { bubbles: true })
      );
    }

    if (yesNo === "no" && checkbox.checked) {
      checkbox.click();
      checkbox.dispatchEvent(
        new Event("change", { bubbles: true })
      );
    }

    markFilled(checkbox, "checkbox");
    return true;
  } catch (_) {
    return false;
  }
};

const fillAgentAnswer = answer => {
  const field = agentFieldRegistry.get(answer?.fieldId);

  if (!field) {
    return {
      filled: false,
      unresolved: true
    };
  }

  const value = answer?.value;
  const hasValue =
    Array.isArray(value)
      ? value.length > 0
      : normalizeValue(value).length > 0;

  if (!hasValue) {
    markAgentState(
      field.elements,
      "unresolved",
      answer?.reviewReason ||
        "No supported answer was available."
    );

    return {
      filled: false,
      unresolved: true
    };
  }

  let filled = false;

  if (field.type === "select") {
    filled = fillDropdown(field.elements[0], value);
  } else if (field.type === "radio") {
    filled = fillRadio(field.elements, value);
  } else if (field.type === "checkbox") {
    if (field.elements.length === 1) {
      filled = fillSingleCheckboxAnswer(
        field.elements[0],
        value
      );
    } else {
      const targetValues = Array.isArray(value)
        ? value
        : String(value)
            .split(/[;,|]/)
            .map(item => item.trim())
            .filter(Boolean);

      filled = targetValues.some(target => {
        return fillCheckbox(field.elements, target);
      });
    }
  } else if (
    field.elements[0]?.matches('[contenteditable="true"]')
  ) {
    filled = fillContentEditable(
      field.elements[0],
      value
    );
  } else {
    filled = fillField(field.elements[0], value);
  }

  if (!filled) {
    answer.value = "";
    answer.requiresReview = true;
    answer.reviewReason =
      answer.reviewReason ||
      "The answer could not be applied to this field.";

    markAgentState(
      field.elements,
      "unresolved",
      answer.reviewReason
    );

    return {
      filled: false,
      unresolved: true
    };
  }

  field.elements.forEach(element => {
    element.dataset.fa_agent_filled = "true";
    element.dataset.fa_agent_source =
      answer.source || "unknown";
  });

  if (answer.requiresReview) {
    markAgentState(
      field.elements,
      "review",
      answer.reviewReason || "Review required."
    );
  } else {
    markAgentState(field.elements, "filled");
  }

  return {
    filled: true,
    unresolved: false
  };
};

const applyAgentAnswers = answers => {
  const summary = {
    answered: 0,
    reviewRequired: 0,
    unresolved: 0
  };

  (answers || []).forEach(answer => {
    const result = fillAgentAnswer(answer);

    if (result.filled) {
      summary.answered += 1;
    }

    if (answer?.requiresReview) {
      summary.reviewRequired += 1;
    }

    if (result.unresolved) {
      summary.unresolved += 1;
    }
  });

  return summary;
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
  getAgentQueryRoots,
  queryAgentElements,
  collectUnresolvedFields,
  applyAgentAnswers
};
