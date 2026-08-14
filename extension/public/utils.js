// public/utils.js
// Bump this stamp on every build: it prints in the console banner so a stale
// extension load (Chrome runs the old copy until "Reload" is clicked in
// chrome://extensions) is immediately visible.
const FASTAPPLY_BUILD = "2026-08-14.2";
console.log(`[FastApply] Utils Loaded. (build ${FASTAPPLY_BUILD})`);

const normalizeValue = (value) => String(value ?? "").trim();

const fieldOwnership = new Map();

const getFieldOwnershipKey = element => {
  if (!element) return "";

  const stableParts = [
    element.id || "",
    element.getAttribute?.("name") || "",
    element.getAttribute?.("data-automation-id") || "",
    element.getAttribute?.("aria-label") || "",
    element.getAttribute?.("aria-labelledby") || "",
    getLabelText(element)
  ];

  // Without a single stable attribute a shared key would collide with every
  // other unnamed control — and a DOM-position key (the previous approach)
  // shifts whenever a row is added, silently marking unrelated empty fields
  // as user-owned. Such elements are tracked per-node via dataset only.
  if (!stableParts.some(Boolean)) return "";

  return [
    window.location.pathname,
    element.tagName || "",
    element.getAttribute?.("type") || "",
    ...stableParts
  ].join("|");
};

const getValueOwner = element => {
  if (!element) return "";
  return element.dataset?.fa_owner ||
    fieldOwnership.get(getFieldOwnershipKey(element)) ||
    "";
};

const setValueOwner = (element, owner) => {
  if (!element || !owner) return;
  const key = getFieldOwnershipKey(element);
  if (key) fieldOwnership.set(key, owner);
  element.dataset.fa_owner = owner;

  if (owner === "agent") {
    element.dataset.fa_agent_filled = "true";
    delete element.dataset.fa_user_owned;
  } else if (owner === "user") {
    element.dataset.fa_user_owned = "true";
    delete element.dataset.fa_agent_filled;
    delete element.dataset.fa_filled;
  }
};

const isProtectedFromDeterministicFill = element => {
  const owner = getValueOwner(element);
  return owner === "user" || owner === "agent";
};

const getEditableEventTarget = target => {
  if (!target?.closest) return null;
  return target.closest([
    "input",
    "select",
    "textarea",
    '[contenteditable="true"]',
    '[role="combobox"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="switch"]',
    '[data-automation-id="selectWidget"]'
  ].join(","));
};

const trackTrustedUserEdit = event => {
  if (!event.isTrusted) return;

  if (event.type === "click") {
    const choice = event.target?.closest?.([
      'input[type="radio"]',
      'input[type="checkbox"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[role="switch"]'
    ].join(","));
    if (choice) {
      setValueOwner(choice, "user");
      return;
    }

    const option = event.target?.closest?.([
      '[role="option"]',
      '[data-automation-id="promptOption"]',
      '[data-automation-id="multiSelectOption"]',
      '[data-automation-id="menuItem"]'
    ].join(","));
    if (option) {
      const expandedControls = queryAgentElements(
        document,
        '[aria-expanded="true"][role="combobox"], [aria-expanded="true"][aria-haspopup="listbox"]'
      ).filter(isElementVisible);
      const control = expandedControls[expandedControls.length - 1];
      if (control) setValueOwner(control, "user");
      return;
    }

    const answerButton = event.target?.closest?.("button");
    const answerText = normalizeText(getElementText(answerButton));
    if (
      answerButton &&
      (answerButton.hasAttribute("aria-pressed") || /^(yes|no)$/.test(answerText))
    ) {
      setValueOwner(answerButton, "user");
    }
    return;
  }

  const element = getEditableEventTarget(event.target);
  if (element) setValueOwner(element, "user");
};

document.addEventListener("input", trackTrustedUserEdit, true);
document.addEventListener("change", trackTrustedUserEdit, true);
document.addEventListener("click", trackTrustedUserEdit, true);

const ensureHttpUrl = value => {
  const raw = normalizeValue(value);
  if (!raw) return "";
  if (/^(mailto|javascript|data):/i.test(raw)) return "";

  const candidate = /^https?:\/\//i.test(raw)
    ? raw
    : `https://${raw.replace(/^\/+/, "")}`;

  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.href
      : "";
  } catch (_) {
    return "";
  }
};

const formatPhoneNumber = (value, options = {}) => {
  const raw = normalizeValue(value);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const national = options.national === true;
  const country = normalizeValue(
    options.country || options.countryCode || ""
  ).toLowerCase();
  const isUnitedStates = options.us === true ||
    /^(us|usa|united states|united states of america|\+?1)$/.test(country);
  const usDigits = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;

  if (isUnitedStates && usDigits.length === 10) {
    return `(${usDigits.slice(0, 3)}) ${usDigits.slice(3, 6)}-${usDigits.slice(6)}`;
  }

  if (national) return digits;
  return raw.startsWith("+") ? `+${digits}` : raw;
};

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

const markFilled = (element, type = "field", source = "deterministic") => {
  if (!element) return;

  element.dataset.fa_filled = "true";
  element.dataset.fa_fill_type = type;
  setValueOwner(element, source);

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
  if (t === "true" || t.startsWith("yes") || hasWholeWord(t, "yes")) return "yes";
  if (t === "false" || t.startsWith("no") || hasWholeWord(t, "no")) return "no";
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

  // Specific races first: combined labels like "White (Not Hispanic or
  // Latino) (United States of America)" must classify by their race, not by
  // the ethnicity qualifier — otherwise every option in a US race list
  // collapses into "not_hispanic" and nothing can ever match uniquely.
  if (t.includes("american indian") || t.includes("alaska native")) return "native";
  if (t.includes("native hawaiian") || t.includes("pacific islander")) return "pacific";
  if (t.includes("two or more races") || t.includes("multiracial")) return "multi";
  if (t.includes("asian")) return "asian";
  if (t.includes("black") || t.includes("african")) return "black";
  if (t.includes("white") && !t.includes("not white")) return "white";

  if (
    /\b(not|non)\s+(hispanic|latino|latina|latinx)\b/.test(t) ||
    /\bno\b.*\b(hispanic|latino|latina|latinx)\b/.test(t)
  ) return "not_hispanic";

  if (t.includes("hispanic") || t.includes("latino") || t.includes("latinx")) return "hispanic";

  return "";
};

const SEMANTIC_STOP_WORDS = new Set([
  "a", "an", "and", "for", "of", "or", "the", "to"
]);

const normalizeSemanticText = value => {
  let normalized = String(value ?? "")
    .toLowerCase()
    .replace(/\.net\b/g, " dotnet ")
    .replace(/\bc\s*#/g, " csharp ")
    .replace(/\bf\s*#/g, " fsharp ");

  normalized = normalizeText(normalized)
    .replace(/\bnode\s*\.?\s*js\b/g, "nodejs")
    .replace(/\breact\s*\.?\s*js\b/g, "react")
    .replace(/\bvue\s*\.?\s*js\b/g, "vue")
    .replace(/\bangular\s*\.?\s*js\b/g, "angular")
    .replace(/\bnext\s*\.?\s*js\b/g, "nextjs")
    .replace(/\bms sql server\b/g, "microsoft sql server")
    .replace(/\bamazon web services\b/g, "aws")
    .replace(/\bgoogle cloud platform\b/g, "gcp")
    .replace(/\bk8s\b/g, "kubernetes")
    .replace(/\bstructured query language\b/g, "sql")
    .replace(/\bservice organization controls?\s*2\b/g, "soc2")
    .replace(/\bsoc\s*2\b/g, "soc2")
    .replace(/\bunited states of america\b/g, "united states")
    .replace(/\brequest for quotation\b/g, "request quotation")
    .replace(/\brfq\b/g, "request quotation")
    .replace(/\brequest for proposal\b/g, "request proposal")
    .replace(/\brfp\b/g, "request proposal")
    .replace(/\brequest for information\b/g, "request information")
    .replace(/\brfi\b/g, "request information")
    .replace(/\b(programming|query|markup|scripting) language\b/g, " ")
    .replace(/\b(software skill|framework|library|platform|technology|methodology|standard|protocol|tool)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const wholeAliases = new Map([
    ["js", "javascript"],
    ["ts", "typescript"],
    ["us", "united states"],
    ["u s", "united states"],
    ["usa", "united states"],
    ["uk", "united kingdom"],
    ["u k", "united kingdom"],
    ["b e", "bachelor engineering"],
    ["be", "bachelor engineering"],
    ["beng", "bachelor engineering"],
    ["b sc", "bachelor science"],
    ["bs", "bachelor science"],
    ["bsc", "bachelor science"],
    ["b a", "bachelor arts"],
    ["ba", "bachelor arts"],
    ["m sc", "master science"],
    ["ms", "master science"],
    ["msc", "master science"],
    ["m a", "master arts"],
    ["ma", "master arts"],
    ["mba", "master business administration"],
    ["ph d", "doctor philosophy"],
    ["phd", "doctor philosophy"]
  ]);

  return wholeAliases.get(normalized) || normalized;
};

const semanticTokensOf = value => normalizeSemanticText(value)
  .split(/\s+/)
  .filter(token => token && !SEMANTIC_STOP_WORDS.has(token));

const classifySemanticPolarity = text => {
  const value = normalizeText(text);
  if (!value) return "";
  // normalizeText turns "don't" into "don t", so contracted opt-out phrasings
  // need their own patterns — "I don't wish to answer" previously failed to
  // classify and scored 0 against "decline"-style targets.
  if (
    value.includes("prefer not") ||
    value.includes("decline") ||
    value.includes("choose not") ||
    value.includes("do not wish") ||
    value.includes("don t wish") ||
    value.includes("dont wish") ||
    value.includes("do not want") ||
    value.includes("don t want") ||
    value.includes("dont want") ||
    value.includes("rather not") ||
    value.includes("not to answer") ||
    value.includes("not to disclose") ||
    value.includes("not to self identify")
  ) return "optout";
  if (/\b(do not|does not|did not|will not|not agree|not acknowledge|not authorized|not willing)\b/.test(value)) {
    return "no";
  }
  if (/^(false|no)(\b|$)/.test(value) && !/^no preference\b/.test(value)) return "no";
  if (/^(true|yes)(\b|$)/.test(value)) return "yes";
  if (/\b(agree|agreed|accept|acknowledge|acknowledged|certify|consent)\b/.test(value)) {
    return "yes";
  }
  return "";
};

const getDegreeLevel = value => {
  const normalized = normalizeSemanticText(value);
  if (/\b(high school|secondary school|ged)\b/.test(normalized)) return "high-school";
  if (/\b(associate|associates)\b/.test(normalized)) return "associate";
  if (/\b(bachelor|bachelors|baccalaureate)\b/.test(normalized)) return "bachelor";
  if (/\b(master|masters)\b/.test(normalized)) return "master";
  if (/\b(doctor|doctorate|doctoral|juris doctor)\b/.test(normalized)) return "doctorate";
  if (/\b(certificate|certification)\b/.test(normalized)) return "certificate";
  if (/\bdiploma\b/.test(normalized)) return "diploma";
  return "";
};

const getSemanticCategory = value => {
  const polarity = classifySemanticPolarity(value);
  if (polarity) return `polarity:${polarity}`;

  const pronoun = classifyPronouns(value);
  if (pronoun) return `pronoun:${pronoun}`;
  const gender = classifyGender(value);
  if (gender) return `gender:${gender}`;
  const veteran = classifyVeteran(value);
  if (veteran) return `veteran:${veteran}`;
  const ethnicity = classifyEthnicity(value);
  if (ethnicity) return `ethnicity:${ethnicity}`;
  return "";
};

const getSemanticMatchScore = (optionText, targetValue) => {
  const option = normalizeSemanticText(optionText);
  const target = normalizeSemanticText(targetValue);
  if (!option || !target) return 0;
  if (normalizeText(optionText) === normalizeText(targetValue)) return 1;
  if (option === target) return 0.99;

  const optionCategory = getSemanticCategory(optionText);
  const targetCategory = getSemanticCategory(targetValue);
  if (optionCategory || targetCategory) {
    return optionCategory && optionCategory === targetCategory ? 0.98 : 0;
  }

  const parentheticalAliases = value => Array.from(
    String(value ?? "").matchAll(/\(([^)]+)\)/g),
    match => normalizeSemanticText(match[1])
  ).filter(Boolean);
  const optionAliases = parentheticalAliases(optionText);
  const targetAliases = parentheticalAliases(targetValue);
  if (
    optionAliases.includes(target) ||
    targetAliases.includes(option) ||
    optionAliases.some(alias => targetAliases.includes(alias))
  ) return 0.98;

  const optionDegree = getDegreeLevel(option);
  const targetDegree = getDegreeLevel(target);
  if (optionDegree || targetDegree) {
    if (!optionDegree || optionDegree !== targetDegree) return 0;
    const genericDegree = value => {
      const tokens = semanticTokensOf(value).filter(token => {
        // Tokens of one or two characters are abbreviation debris from
        // labels like "Bachelor's Degree (B.A., B.S., etc.)" — without this
        // such options counted as "specific" and a target like "Bachelor of
        // Engineering" matched nothing at all.
        if (token.length <= 2) return false;
        return ![
          "degree", "degrees", "bachelor", "bachelors", "master", "masters",
          "doctor", "doctorate", "doctoral", "associate", "associates",
          "certificate", "certification", "diploma", "etc", "hons",
          "honours", "honors", "level"
        ].includes(token);
      });
      return tokens.length === 0;
    };
    if (genericDegree(option) || genericDegree(target)) return 0.86;
  }

  const optionTokens = [...new Set(semanticTokensOf(option))];
  const targetTokens = [...new Set(semanticTokensOf(target))];
  if (!optionTokens.length || !targetTokens.length) return 0;

  if (targetTokens.length === 1 && optionTokens.length > 1) {
    const acronym = optionTokens.map(token => token[0]).join("");
    if (targetTokens[0].length >= 2 && targetTokens[0] === acronym) return 0.96;
  }
  if (optionTokens.length === 1 && targetTokens.length > 1) {
    const acronym = targetTokens.map(token => token[0]).join("");
    if (optionTokens[0].length >= 2 && optionTokens[0] === acronym) return 0.96;
  }

  const intersection = targetTokens.filter(token => optionTokens.includes(token)).length;
  if (!intersection) return 0;
  const targetCoverage = intersection / targetTokens.length;
  const optionCoverage = intersection / optionTokens.length;
  const dice = (2 * intersection) / (targetTokens.length + optionTokens.length);

  if (
    intersection === targetTokens.length &&
    intersection === optionTokens.length
  ) return 0.98;
  if (intersection >= 2 && (targetCoverage === 1 || optionCoverage === 1)) {
    return 0.88;
  }

  // A single generic shared word is not enough. A one-word target is accepted
  // only when the option is essentially the same skill/name plus one qualifier.
  if (
    intersection === 1 &&
    Math.max(targetTokens.length, optionTokens.length) > 2
  ) return 0;

  return (0.55 * Math.min(targetCoverage, optionCoverage)) +
    (0.3 * Math.max(targetCoverage, optionCoverage)) +
    (0.15 * dice);
};

const findBestSemanticMatch = (
  items,
  targetValue,
  getText = item => item,
  settings = {}
) => {
  const candidates = Array.from(items || []).filter(Boolean);
  const exact = candidates.filter(item => {
    return normalizeText(getText(item)) === normalizeText(targetValue);
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const minimumScore = Number.isFinite(settings.minimumScore)
    ? settings.minimumScore
    : 0.74;
  const minimumGap = Number.isFinite(settings.minimumGap)
    ? settings.minimumGap
    : 0.06;
  const ranked = candidates
    .map(item => ({ item, score: getSemanticMatchScore(getText(item), targetValue) }))
    .filter(candidate => candidate.score >= minimumScore)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  if (
    ranked.length > 1 &&
    ranked[0].score - ranked[1].score < minimumGap
  ) return null;
  return ranked[0].item;
};

// Global meaning matcher. Callers still require a unique winning option.
const smartMatch = (optText, targetValue) => {
  return getSemanticMatchScore(optText, targetValue) >= 0.74;
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

const fillField = (element, value, options = {}) => {
  const source = options.source === "agent" ? "agent" : "deterministic";
  const force = options.force === true;
  const normalizedValue = prepareValueForElement(element, value);

  if (
    !element ||
    !normalizedValue ||
    element.disabled ||
    element.readOnly ||
    (!force && (
      isAlreadyFilled(element) ||
      isProtectedFromDeterministicFill(element) ||
      getElementCurrentValue(element)
    ))
  ) {
    return false;
  }

  try {
    triggerEvents(element, { withFocus: true, withInput: false, withChange: false, withBlur: false });
    setNativeValue(element, normalizedValue);
    triggerEvents(element, { withFocus: false, withInput: true, withChange: true, withBlur: false, withKeyboard: true });

    // Some React-controlled form libraries (Ashby's current application form
    // among them) revert programmatic value writes because their state never
    // saw the change. When the value did not stick, push the text through
    // the browser's native editing pipeline — indistinguishable from real
    // typing, which controlled inputs always accept.
    if (
      getElementCurrentValue(element) !== normalizeValue(normalizedValue) &&
      (element.tagName === "INPUT" || element.tagName === "TEXTAREA")
    ) {
      try {
        element.focus();
        element.select?.();
        document.execCommand("insertText", false, normalizedValue);
        triggerEvents(element, { withFocus: false, withInput: false, withChange: true, withBlur: false });
      } catch (_) {}
    }

    const elementName = normalizeText(element.name || element.id || getLabelText(element));
    const shouldBlurImmediately =
      !elementName.includes("location") &&
      !elementName.includes("address") &&
      !elementName.includes("city");

    if (shouldBlurImmediately) {
      triggerEvents(element, { withFocus: false, withInput: false, withChange: false, withBlur: true });
    }

    const retainedValue = getElementCurrentValue(element);
    if (!retainedValue) return false;

    markFilled(element, "field", source);
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
    '[role="listbox"] li',
    '[aria-selected]',
    ".dropdown-item",
    ".dropdown-option",
    ".dropdown-container li",
    ".pac-item"
  ];

  for (const selector of selectors) {
    const items = Array.from(root.querySelectorAll(selector))
      .filter(isElementVisible)
      .filter(item => item.getAttribute?.("aria-disabled") !== "true");
    const exact = items.find(item => {
      return normalizeText(getElementText(item)) === normalized;
    });
    const semanticMatches = exact ? [] : items.filter(item => {
      const itemText = normalizeText(getElementText(item));
      return smartMatch(itemText, normalized) ||
        itemText.includes(normalized) ||
        normalized.includes(itemText);
    });
    const match = exact || (semanticMatches.length === 1 ? semanticMatches[0] : null);

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

const fillAutocomplete = (visibleInput, hiddenInput, value, options = {}) => {
  const source = options.source === "agent" ? "agent" : "deterministic";
  const force = options.force === true;
  const normalizedValue = normalizeValue(value);

  if (
    !visibleInput ||
    !normalizedValue ||
    visibleInput.disabled ||
    visibleInput.readOnly ||
    visibleInput.dataset.fa_autocomplete_processing === "true" ||
    (!force && (
      isAlreadyFilled(visibleInput) ||
      isProtectedFromDeterministicFill(visibleInput) ||
      getElementCurrentValue(visibleInput)
    ))
  ) {
    return false;
  }

  try {
    visibleInput.dataset.fa_autocomplete_processing = "true";
    triggerEvents(visibleInput, { withFocus: true, withInput: false, withChange: false, withBlur: false });
    setNativeValue(visibleInput, normalizedValue);
    triggerEvents(visibleInput, { withFocus: false, withInput: true, withChange: true, withBlur: false, withKeyboard: true });

    // Same native-typing fallback as fillField: React-controlled inputs can
    // revert programmatic writes, leaving the suggestion list never opening.
    if (getElementCurrentValue(visibleInput) !== normalizeValue(normalizedValue)) {
      try {
        visibleInput.focus();
        visibleInput.select?.();
        document.execCommand("insertText", false, normalizedValue);
      } catch (_) {}
    }

    setTimeout(() => {
      const candidates = [
        visibleInput.parentElement,
        document,
        document.querySelector(".dropdown-container"),
        document.querySelector(".pac-container"),
        document.querySelector('[role="listbox"]'),
      ].filter(Boolean);

      let suggestionSelected = false;
      for (const root of candidates) {
        if (tryClickSuggestion(root, normalizedValue)) {
          suggestionSelected = true;
          break;
        }
      }

      setTimeout(() => {
        // Slow-rendering suggestion lists get one more chance before the
        // attempt is judged.
        if (!suggestionSelected) {
          for (const root of candidates) {
            if (tryClickSuggestion(root, normalizedValue)) {
              suggestionSelected = true;
              break;
            }
          }
        }

        const resolveLiveElement = element => {
          if (!element) return null;
          if (element.isConnected) return element;
          if (element.id) {
            const byId = document.getElementById(element.id);
            if (byId) return byId;
          }
          const name = element.getAttribute?.("name");
          if (name) {
            try {
              return document.querySelector(`[name="${CSS.escape(name)}"]`);
            } catch (_) {}
          }
          return null;
        };

        const liveVisible = resolveLiveElement(visibleInput) || visibleInput;
        const liveHidden = resolveLiveElement(hiddenInput);
        const visibleRetained = Boolean(getElementCurrentValue(liveVisible));
        const hiddenRetained = !hiddenInput || Boolean(getElementCurrentValue(liveHidden));
        const valid = liveVisible.getAttribute?.("aria-invalid") !== "true" &&
          (typeof liveVisible.checkValidity !== "function" || liveVisible.checkValidity());

        if (suggestionSelected && visibleRetained && hiddenRetained && valid) {
          markFilled(liveVisible, "autocomplete", source);
          if (liveHidden) markFilled(liveHidden, "hidden-autocomplete", source);
        }
        // When no suggestion was committed, keep the typed text visible so
        // the user can pick from the list themselves — erasing it here made
        // location fields visibly fill and then go blank. The field stays
        // unmarked, so agent passes still treat it as unresolved.

        delete visibleInput.dataset.fa_autocomplete_processing;
        if (liveVisible !== visibleInput) {
          delete liveVisible.dataset.fa_autocomplete_processing;
        }
        triggerEvents(liveVisible, { withFocus: false, withInput: false, withChange: false, withBlur: true });
      }, 250);
    }, 800);

    return true;
  } catch (error) {
    delete visibleInput?.dataset?.fa_autocomplete_processing;
    console.warn("[FastApply] fillAutocomplete failed:", error);
    return false;
  }
};

const isPlaceholderOption = option => {
  if (!option) return true;
  const value = normalizeValue(option.value);
  const text = normalizeText(option.text);
  return option.disabled ||
    !value ||
    /^(select|select one|choose|choose one|please select)$/.test(text);
};

const fillDropdown = (selectElement, targetValue, options = {}) => {
  const source = options.source === "agent" ? "agent" : "deterministic";
  const force = options.force === true;
  const exactOnly = options.exact === true || source === "agent";
  const normalizedTarget = normalizeValue(targetValue);
  const selectedBefore = selectElement?.options?.[selectElement.selectedIndex];

  if (
    !selectElement ||
    !normalizedTarget ||
    selectElement.disabled ||
    (!force && (
      isAlreadyFilled(selectElement) ||
      isProtectedFromDeterministicFill(selectElement) ||
      !isPlaceholderOption(selectedBefore)
    ))
  ) {
    return false;
  }

  let matchedOption = null;

  try {
    const options = Array.from(selectElement.options || []);

    matchedOption =
      options.find((opt) => normalizeText(opt.text) === normalizeText(normalizedTarget)) ||
      options.find((opt) => normalizeText(opt.value) === normalizeText(normalizedTarget));

    if (!matchedOption && !exactOnly) {
      matchedOption = findBestSemanticMatch(
        options.filter(opt => !isPlaceholderOption(opt)),
        normalizedTarget,
        opt => opt.text || opt.value || ""
      );
    }

    if (!matchedOption) return false;

    triggerEvents(selectElement, { withFocus: true, withInput: false, withChange: false, withBlur: false });
    selectElement.value = matchedOption.value;
    selectElement.selectedIndex = matchedOption.index;
    triggerEvents(selectElement, { withFocus: false, withInput: true, withChange: true, withBlur: true });

    const selectedAfter = selectElement.options?.[selectElement.selectedIndex];
    if (!selectedAfter || selectedAfter.index !== matchedOption.index) return false;

    markFilled(selectElement, "dropdown", source);
    return true;
  } catch (error) {
    console.warn("[FastApply] fillDropdown failed:", error);
    return false;
  }
};

const fillRadio = (radioNodeList, targetText, options = {}) => {
  const source = options.source === "agent" ? "agent" : "deterministic";
  const force = options.force === true;
  const exactOnly = options.exact === true || source === "agent";
  const normalizedTarget = normalizeValue(targetText);

  if (!radioNodeList || radioNodeList.length === 0 || !normalizedTarget) return false;

  try {
    const radios = Array.from(radioNodeList);

    if (!force && radios.some(radio => {
      return isChoiceChecked(radio) || isProtectedFromDeterministicFill(radio);
    })) {
      return false;
    }

    const exactRadio = radios.find(radio => {
      return radio &&
        !radio.disabled &&
        radio.getAttribute?.("aria-disabled") !== "true" &&
        normalizeText(getOptionLabel(radio)) === normalizeText(normalizedTarget);
    });

    const semanticRadio = exactRadio || (exactOnly ? null : findBestSemanticMatch(
      radios.filter(radio => {
        return radio &&
          !radio.disabled &&
          radio.getAttribute?.("aria-disabled") !== "true";
      }),
      normalizedTarget,
      getOptionLabel
    ));
    const semanticRadios = semanticRadio ? [semanticRadio] : [];

    if (semanticRadios.length !== 1) return false;

    for (const radio of semanticRadios) {
      if (
        !radio ||
        radio.disabled ||
        radio.getAttribute?.("aria-disabled") === "true"
      ) continue;
      if (!force && radio.dataset.fa_filled === "true") continue;

      const label = getOptionLabel(radio);

      if (
        normalizeText(label) === normalizeText(normalizedTarget) ||
        (!exactOnly && smartMatch(label, normalizedTarget))
      ) {
        if (!isChoiceChecked(radio)) {
          clickChoiceInput(radio);
        }

        if (!isChoiceChecked(radio)) continue;

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
          setValueOwner(r, source);
        });

        return true;
      }
    }
  } catch (error) {
    console.warn("[FastApply] fillRadio failed:", error);
  }

  return false;
};

// Radio/checkbox activation robust enough for styled inputs: the bare
// input.click() is tried first, then the associated <label> (which usually
// carries the real click handler when the input is visually replaced), then a
// full pointer-event sequence on the input itself.
const clickChoiceInput = input => {
  const fireSequence = target => {
    try {
      if (typeof PointerEvent === "function") {
        target.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true
        }));
      }
      target.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      if (typeof PointerEvent === "function") {
        target.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true
        }));
      }
      target.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      target.click?.();
    } catch (_) {}
  };

  try {
    input.focus?.();
    input.click();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (_) {}
  if (isChoiceChecked(input)) return true;

  const queryRoot = input.getRootNode?.() || document;
  let labelTarget = null;
  if (input.id) {
    try {
      labelTarget = queryRoot.querySelector?.(`label[for="${CSS.escape(input.id)}"]`);
    } catch (_) {}
  }
  labelTarget = labelTarget || input.closest?.("label");
  if (labelTarget) {
    fireSequence(labelTarget);
    if (isChoiceChecked(input)) return true;
  }

  fireSequence(input);
  return isChoiceChecked(input);
};

const fillCheckbox = (checkboxNodeList, targetText, options = {}) => {
  const source = options.source === "agent" ? "agent" : "deterministic";
  const force = options.force === true;
  const exactOnly = options.exact === true || source === "agent";
  const normalizedTarget = normalizeValue(targetText);

  if (!checkboxNodeList || checkboxNodeList.length === 0 || !normalizedTarget) return false;

  let clickedAnything = false;

  try {
    const checkboxes = Array.from(checkboxNodeList);

    if (!force && checkboxes.some(checkbox => {
      return isChoiceChecked(checkbox) || isProtectedFromDeterministicFill(checkbox);
    })) {
      return false;
    }

    const exactCheckbox = checkboxes.find(checkbox => {
      return checkbox &&
        !checkbox.disabled &&
        checkbox.getAttribute?.("aria-disabled") !== "true" &&
        normalizeText(getOptionLabel(checkbox)) === normalizeText(normalizedTarget);
    });

    const semanticCheckbox = exactCheckbox || (exactOnly ? null : findBestSemanticMatch(
      checkboxes.filter(checkbox => {
        return checkbox &&
          !checkbox.disabled &&
          checkbox.getAttribute?.("aria-disabled") !== "true";
      }),
      normalizedTarget,
      getOptionLabel
    ));
    const semanticCheckboxes = semanticCheckbox ? [semanticCheckbox] : [];

    if (semanticCheckboxes.length !== 1) return false;

    for (const cb of semanticCheckboxes) {
      if (
        !cb ||
        cb.disabled ||
        cb.getAttribute?.("aria-disabled") === "true"
      ) continue;
      if (!force && cb.dataset.fa_filled === "true") continue;

      const label = getOptionLabel(cb);

      if (
        normalizeText(label) === normalizeText(normalizedTarget) ||
        (!exactOnly && smartMatch(label, normalizedTarget))
      ) {
        if (!isChoiceChecked(cb)) {
          clickChoiceInput(cb);
        }

        if (!isChoiceChecked(cb)) continue;

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
        setValueOwner(cb, source);
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

const getElementCurrentValue = element => {
  if (!element) return "";
  if (element.matches?.('[contenteditable="true"]')) {
    return normalizeValue(element.innerText);
  }
  return normalizeValue(element.value);
};

const prepareValueForElement = (element, value) => {
  const label = normalizeText(
    `${element?.getAttribute?.("type") || ""} ${getLabelText(element)}`
  );

  if (
    element?.getAttribute?.("type") === "url" ||
    /\b(url|website|portfolio|linkedin|github|twitter)\b/.test(label)
  ) {
    return ensureHttpUrl(value);
  }

  if (
    element?.getAttribute?.("type") === "tel" ||
    /\b(phone|telephone|mobile)\b/.test(label)
  ) {
    const workdayPhoneFormatter =
      window.WorkdayEngine?.formatWorkdayNationalPhone;
    if (typeof workdayPhoneFormatter === "function") {
      const country =
        window.WorkdayEngine?.lastProfile?.contactInfo?.country || "";
      const formatted = workdayPhoneFormatter(value, country);
      if (formatted) return formatted;
    }

    return formatPhoneNumber(value);
  }

  return normalizeValue(value);
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
      const queryRoot = element.getRootNode?.() || document;
      const label = queryRoot.querySelector?.(
        `label[for="${CSS.escape(element.id)}"]`
      );

      if (label) return getElementText(label);
    } catch (_) {}
  }

  const wrappingLabel = element.closest("label");

  return (
    getElementText(wrappingLabel) ||
    normalizeValue(element.getAttribute?.("aria-label")) ||
    getElementText(element) ||
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
  const pageKey = window.WorkdayEngine?.getPageKey?.() ||
    window.location.pathname;

  const identity = [
    pageKey,
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
  maxLength = null,
  currentValue = ""
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

  const owners = [...new Set(
    normalizedElements.map(getValueOwner).filter(Boolean)
  )];
  const valueOwner = owners.includes("user")
    ? "user"
    : owners.includes("agent")
      ? "agent"
      : owners.length === 1
        ? owners[0]
        : "";
  const primary = normalizedElements[0];
  const nativeValid = typeof primary?.checkValidity === "function"
    ? primary.checkValidity()
    : true;
  const ariaInvalid = primary?.getAttribute?.("aria-invalid") === "true";

  agentFieldRegistry.set(fieldId, {
    type,
    elements: normalizedElements,
    label,
    options,
    required,
    maxLength,
    currentValue,
    valueOwner,
    validity: {
      valid: nativeValid && !ariaInvalid,
      ariaInvalid,
      message: normalizeValue(primary?.validationMessage || "")
    }
  });

  return {
    fieldId,
    label,
    type,
    required,
    options,
    currentValue,
    maxLength,
    valueOwner,
    validity: {
      valid: nativeValid && !ariaInvalid,
      ariaInvalid,
      message: normalizeValue(primary?.validationMessage || "")
    }
  };
};

const getStandardCurrentValue = element => {
  if (!element) return "";
  if (element.matches('[contenteditable="true"]')) {
    return normalizeValue(element.innerText);
  }
  if (element.tagName === "SELECT") {
    const selected = element.options?.[element.selectedIndex];
    return isPlaceholderOption(selected) ? "" : normalizeValue(selected.text);
  }
  return normalizeValue(element.value);
};

const isChoiceChecked = element => {
  return element?.checked === true ||
    element?.getAttribute?.("aria-checked") === "true";
};

const collectApplicationFields = (root = document, includeFilled = false) => {
  agentFieldRegistry.clear();
  const fields = [];

  const excludedInputTypes = new Set([
    "hidden", "radio", "checkbox", "file", "password",
    "submit", "button", "reset", "image"
  ]);

  queryAgentElements(
    root,
    'input, select, textarea, [contenteditable="true"]'
  ).forEach(element => {
    const inputType = normalizeText(element.getAttribute?.("type") || "");
    if (element.tagName === "INPUT" && excludedInputTypes.has(inputType)) return;
    if (
      element.matches?.(
        '[role="combobox"], [aria-haspopup="listbox"]'
      )
    ) return;
    if (!isElementVisible(element) || element.disabled || element.readOnly) return;

    const currentValue = getStandardCurrentValue(element);
    if (!includeFilled && (
      currentValue ||
      element.dataset.fa_filled === "true" ||
      element.dataset.fa_agent_processed === "true"
    )) return;

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
          .filter(option => !isPlaceholderOption(option))
          .map(option => normalizeValue(option.text))
          .filter(Boolean)
      : [];
    const maxLengthValue = Number(element.maxLength);
    const maxLength = Number.isFinite(maxLengthValue) && maxLengthValue > 0
      ? maxLengthValue
      : null;

    const field = registerAgentField({
      type,
      elements: [element],
      label,
      options,
      required: element.required || element.getAttribute("aria-required") === "true",
      maxLength,
      currentValue
    });
    if (field) fields.push(field);
  });

  const collectChoiceGroups = (selector, type) => {
    const groups = new Map();

    queryAgentElements(root, selector).forEach(choice => {
      if (
        !isAgentChoiceVisible(choice) ||
        choice.disabled ||
        choice.getAttribute?.("aria-disabled") === "true"
      ) return;

      const groupElement = choice.closest(
        '[role="radiogroup"], fieldset, [role="group"], [class*="question"], [class*="form-group"]'
      );
      const key = choice.name
        ? `${type}_name_${choice.name}`
        : groupElement || `${type}_${choice.id || getGroupQuestionText([choice])}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(choice);
    });

    groups.forEach(choices => {
      if (!includeFilled && choices.some(choice => {
        return isChoiceChecked(choice) ||
          choice.dataset.fa_filled === "true" ||
          choice.dataset.fa_agent_processed === "true";
      })) return;

      const label = normalizeValue(
        choices.length === 1 && type === "checkbox"
          ? getLabelText(choices[0])
          : getGroupQuestionText(choices)
      );
      const options = choices.length === 1 && type === "checkbox"
        ? ["Yes", "No"]
        : choices.map(getOptionLabel).filter(Boolean);
      if (!label || options.length === 0) return;

      const selectedOptions = choices
        .filter(isChoiceChecked)
        .map(getOptionLabel)
        .filter(Boolean);
      const currentValue = type === "checkbox" && choices.length === 1
        ? isChoiceChecked(choices[0])
        : type === "radio"
          ? (selectedOptions[0] || "")
          : selectedOptions;

      const field = registerAgentField({
        type,
        elements: choices,
        label,
        options,
        required: choices.some(choice => {
          return choice.required || choice.getAttribute("aria-required") === "true";
        }),
        currentValue
      });
      if (field) fields.push(field);
    });
  };

  collectChoiceGroups('input[type="radio"], [role="radio"]', "radio");
  collectChoiceGroups(
    'input[type="checkbox"], [role="checkbox"], [role="switch"]',
    "checkbox"
  );

  return fields;
};

const collectAuditableFields = (root = document) => {
  return collectApplicationFields(root, true);
};

const collectUnresolvedFields = (root = document) => {
  return collectApplicationFields(root, false);
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

const fillContentEditable = (element, value, options = {}) => {
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

    markFilled(
      element,
      "contenteditable",
      options.source === "agent" ? "agent" : "deterministic"
    );
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
  value,
  options = {}
) => {
  const yesNo = classifyYesNo(value);

  if (
    !checkbox ||
    !yesNo ||
    checkbox.disabled ||
    checkbox.getAttribute?.("aria-disabled") === "true"
  ) return false;

  try {
    const shouldBeChecked = yesNo === "yes";
    if (isChoiceChecked(checkbox) !== shouldBeChecked) {
      checkbox.click();
      checkbox.dispatchEvent(
        new Event("change", { bubbles: true })
      );
    }

    if (isChoiceChecked(checkbox) !== shouldBeChecked) return false;

    markFilled(
      checkbox,
      "checkbox",
      options.source === "agent" ? "agent" : "deterministic"
    );
    return true;
  } catch (_) {
    return false;
  }
};

const readRegisteredFieldValue = field => {
  if (!field?.elements?.length) return "";
  if (field.type === "select") {
    return getStandardCurrentValue(field.elements[0]);
  }
  if (field.type === "radio") {
    return field.elements
      .filter(isChoiceChecked)
      .map(getOptionLabel)[0] || "";
  }
  if (field.type === "checkbox") {
    if (field.elements.length === 1) {
      return isChoiceChecked(field.elements[0]);
    }
    return field.elements.filter(isChoiceChecked).map(getOptionLabel).filter(Boolean);
  }
  return getElementCurrentValue(field.elements[0]);
};

const releaseFailedAgentOwnership = elements => {
  Array.from(elements || []).forEach(element => {
    setValueOwner(element, "page");
    delete element.dataset.fa_agent_filled;
    delete element.dataset.fa_agent_source;
    delete element.dataset.fa_agent_validated;
    delete element.dataset.fa_filled;
    delete element.dataset.fa_fill_type;
  });
};

const comparableFieldValue = value => {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(comparableFieldValue).sort());
  }
  if (typeof value === "boolean") return String(value);
  return normalizeValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
};

const expectedRegisteredFieldValue = (field, value) => {
  if (field?.type === "checkbox" && field.elements?.length === 1) {
    const yesNo = classifyYesNo(value);
    if (yesNo === "yes") return true;
    if (yesNo === "no") return false;
  }

  if (
    !["select", "radio", "checkbox"].includes(field?.type) &&
    field?.elements?.[0]
  ) {
    return prepareValueForElement(field.elements[0], value) || value;
  }

  return value;
};

const refreshRegisteredFieldElements = field => {
  if (!field?.elements?.length) return false;
  if (field.elements.every(element => element?.isConnected)) return true;

  const originalElements = [...field.elements];
  const first = originalElements[0];
  const name = first?.getAttribute?.("name");

  if (["radio", "checkbox"].includes(field.type) && name) {
    try {
      const choices = queryAgentElements(
        document,
        `input[name="${CSS.escape(name)}"]`
      ).filter(element => {
        return element.type === field.type && isElementVisible(element);
      });
      if (choices.length === originalElements.length) {
        field.elements = choices;
        return true;
      }
    } catch (_) {}
  }

  const resolveElement = original => {
    if (original?.isConnected) return original;
    if (original?.id) {
      const byId = document.getElementById(original.id);
      if (byId) return byId;
    }

    const automationId = original?.getAttribute?.("data-automation-id");
    if (automationId) {
      try {
        const byAutomationId = document.querySelector(
          `[data-automation-id="${CSS.escape(automationId)}"]`
        );
        if (byAutomationId) return byAutomationId;
      } catch (_) {}
    }

    const originalName = original?.getAttribute?.("name");
    if (originalName) {
      try {
        const candidates = queryAgentElements(
          document,
          `[name="${CSS.escape(originalName)}"]`
        ).filter(candidate => {
          return candidate.tagName === original.tagName &&
            normalizeText(candidate.getAttribute?.("type") || "") ===
              normalizeText(original.getAttribute?.("type") || "");
        });
        if (candidates.length === 1) return candidates[0];
      } catch (_) {}
    }

    const candidates = queryAgentElements(
      document,
      'input:not([type="hidden"]), select, textarea, [contenteditable="true"]'
    ).filter(candidate => {
      return isElementVisible(candidate) &&
        normalizeText(getLabelText(candidate)) === normalizeText(field.label);
    });
    return candidates.length === 1 ? candidates[0] : null;
  };

  const refreshed = originalElements.map(resolveElement);
  if (refreshed.some(element => !element)) return false;
  field.elements = refreshed;
  return true;
};

const fillAgentAnswer = async answer => {
  const field = agentFieldRegistry.get(answer?.fieldId);

  if (!field) {
    return {
      filled: false,
      unresolved: true
    };
  }

  if (!refreshRegisteredFieldElements(field)) {
    answer.action = "unresolved";
    answer.value = "";
    answer.requiresReview = true;
    answer.reviewReason =
      "The field was replaced or removed after the page audit.";
    markAgentState(field.elements, "unresolved", answer.reviewReason);
    return { filled: false, unresolved: true };
  }

  const liveOwners = [...new Set(
    field.elements.map(getValueOwner).filter(Boolean)
  )];
  field.valueOwner = liveOwners.includes("user")
    ? "user"
    : liveOwners.includes("agent")
      ? "agent"
      : liveOwners.length === 1
        ? liveOwners[0]
        : field.valueOwner;

  const primary = field.elements[0];
  const ariaInvalid = primary?.getAttribute?.("aria-invalid") === "true";
  field.validity = {
    valid:
      !ariaInvalid &&
      (typeof primary?.checkValidity !== "function" || primary.checkValidity()),
    ariaInvalid,
    message: normalizeValue(primary?.validationMessage || "")
  };

  const liveValue = readRegisteredFieldValue(field);
  const value = answer?.value;
  const hasValue =
    Array.isArray(value)
      ? value.length > 0
      : normalizeValue(value).length > 0;

  if (!hasValue) {
    if (
      field.valueOwner === "user" &&
      comparableFieldValue(liveValue) &&
      field.validity?.valid !== false
    ) {
      answer.action = "keep";
      answer.value = liveValue;
      answer.source = "user";
      answer.confidence = 1;
      answer.requiresReview = false;
      answer.reviewReason = "";
      field.elements.forEach(element => {
        element.dataset.fa_agent_validated = "true";
      });
      markAgentState(field.elements, "filled");
      return { filled: true, unresolved: false, kept: true };
    }

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

  const expectedValue = expectedRegisteredFieldValue(field, value);
  if (
    comparableFieldValue(liveValue) !==
    comparableFieldValue(field.currentValue)
  ) {
    answer.action = "conflict";
    answer.value = "";
    answer.requiresReview = true;
    answer.reviewReason =
      "The field changed after the scan, so FastApply preserved the newer value.";
    markAgentState(field.elements, "review", answer.reviewReason);
    return { filled: false, unresolved: true, conflict: true };
  }

  if (comparableFieldValue(liveValue) === comparableFieldValue(expectedValue)) {
    answer.action = "keep";
    field.elements.forEach(element => {
      element.dataset.fa_agent_validated = "true";
    });
    markAgentState(field.elements, answer.requiresReview ? "review" : "filled");
    return { filled: true, unresolved: false, kept: true };
  }

  if (
    comparableFieldValue(liveValue) &&
    field.valueOwner === "user"
  ) {
    answer.action = "conflict";
    answer.value = "";
    answer.requiresReview = true;
    answer.reviewReason =
      "FastApply found a different answer but preserved the manually entered value.";
    markAgentState(field.elements, "review", answer.reviewReason);
    return { filled: false, unresolved: true, conflict: true };
  }

  answer.action = comparableFieldValue(liveValue) ? "replace" : "fill";

  let filled = false;

  if (field.type === "select") {
    filled = fillDropdown(field.elements[0], value, {
      force: true,
      source: "agent"
    });
  } else if (field.type === "radio") {
    filled = fillRadio(field.elements, value, {
      force: true,
      source: "agent"
    });
  } else if (field.type === "checkbox") {
    if (field.elements.length === 1) {
      filled = fillSingleCheckboxAnswer(
        field.elements[0],
        value,
        { source: "agent" }
      );
    } else {
      const targetValues = Array.isArray(value)
        ? value
        : String(value)
            .split(/[;,|]/)
            .map(item => item.trim())
            .filter(Boolean);
      const targetKeys = new Set(targetValues.map(normalizeText));

      field.elements.forEach(checkbox => {
        const optionKey = normalizeText(getOptionLabel(checkbox));
        if (isChoiceChecked(checkbox) && !targetKeys.has(optionKey)) {
          checkbox.click();
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });

      filled = targetValues.length > 0 && targetValues.every(target => {
        return fillCheckbox(field.elements, target, {
          force: true,
          source: "agent"
        });
      });
    }
  } else if (
    field.elements[0]?.matches('[contenteditable="true"]')
  ) {
    filled = fillContentEditable(
      field.elements[0],
      value,
      { source: "agent" }
    );
  } else {
    filled = fillField(field.elements[0], value, {
      force: true,
      source: "agent"
    });
  }

  if (!filled) {
    releaseFailedAgentOwnership(field.elements);
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

  // React-controlled ATS forms can replace or format an input after its
  // change event. Resolve the live node and verify only after that update has
  // had time to settle, otherwise later answers use a stale page snapshot.
  await new Promise(resolve => window.setTimeout(resolve, 140));
  if (!refreshRegisteredFieldElements(field)) {
    answer.value = "";
    answer.requiresReview = true;
    answer.reviewReason =
      "The page replaced the field before its answer could be verified.";
    return { filled: false, unresolved: true };
  }

  const retainedValue = readRegisteredFieldValue(field);
  if (
    comparableFieldValue(retainedValue) !==
    comparableFieldValue(expectedValue)
  ) {
    releaseFailedAgentOwnership(field.elements);
    answer.value = "";
    answer.requiresReview = true;
    answer.reviewReason =
      "The page did not retain the answer after it was applied.";
    markAgentState(field.elements, "unresolved", answer.reviewReason);
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
    unresolved: false,
    kept: false
  };
};

const applyAgentAnswers = async answers => {
  const summary = {
    answered: 0,
    reviewRequired: 0,
    unresolved: 0,
    kept: 0,
    corrected: 0,
    conflicts: 0
  };

  for (const answer of answers || []) {
    const result = await fillAgentAnswer(answer);

    if (result.filled) {
      summary.answered += 1;
    }

    if (result.kept) summary.kept += 1;
    if (result.filled && answer?.action === "replace") {
      summary.corrected += 1;
    }
    if (result.conflict) summary.conflicts += 1;

    if (answer?.requiresReview) {
      summary.reviewRequired += 1;
    }

    if (result.unresolved) {
      summary.unresolved += 1;
    }
  }

  return summary;
};

// Shared "set a field value the way a user would" primitive. iCIMS,
// SmartRecruiters and Eightfold each carried an identical private copy of
// this; they now delegate here. composed:true lets the events escape shadow
// DOM boundaries (SmartRecruiters renders inside closed Angular components).
const setEngineFieldValue = (element, value) => {
  if (
    !element ||
    !value ||
    element.dataset.fa_filled === "true" ||
    isProtectedFromDeterministicFill(element)
  ) return false;

  const selected = element.tagName === "SELECT"
    ? element.options?.[element.selectedIndex]
    : null;
  const selectedIsPlaceholder = selected && /^(select|select one|choose|choose one|please select|none)$/i.test(
    String(selected.text || selected.label || selected.value || "").trim()
  );
  if (
    (element.tagName === "SELECT" && selected && !selected.disabled && !selectedIsPlaceholder && String(selected.value || "").trim()) ||
    (element.tagName !== "SELECT" && String(element.value || "").trim())
  ) return false;

  const label = String(getLabelText(element) || "").toLowerCase();
  const target = element.type === "url" || /url|website|linkedin|github|portfolio/.test(label)
    ? ensureHttpUrl(value)
    : element.type === "tel" || /phone|telephone|mobile/.test(label)
      ? formatPhoneNumber(value)
      : String(value);
  if (!target) return false;
  element.focus();

  let proto = window.HTMLInputElement.prototype;
  if (element.tagName === "TEXTAREA") {
    proto = window.HTMLTextAreaElement.prototype;
  } else if (element.tagName === "SELECT") {
    proto = window.HTMLSelectElement.prototype;
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(element, target);
  } else {
    element.value = target;
  }

  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
  if (!String(element.value || "").trim()) return false;
  element.dataset.fa_filled = "true";
  setValueOwner(element, "deterministic");
  return true;
};

// Resolves the cached profile, falling back to a background fetch when the
// cache is empty (fresh install, popup never opened, cache cleared after a
// transient auth failure). Engines previously read storage directly and
// silently did nothing whenever the cache happened to be empty.
const loadProfileData = callback => {
  try {
    chrome.storage.local.get(["autofillEnabled", "profileData"], values => {
      if (values.autofillEnabled === false) {
        callback(null, false);
        return;
      }
      if (values.profileData) {
        callback(values.profileData, true);
        return;
      }
      try {
        chrome.runtime.sendMessage({ action: "FETCH_PROFILE_DATA" }, response => {
          if (chrome.runtime.lastError) {
            callback(null, true);
            return;
          }
          callback(response?.success && response.data ? response.data : null, true);
        });
      } catch (_) {
        callback(null, true);
      }
    });
  } catch (_) {
    callback(null, true);
  }
};

window.FastApplyUtils = {
  normalizeValue,
  normalizeText,
  escapeRegex,
  smartMatch,
  loadProfileData,
  setNativeValue,
  setEngineFieldValue,
  triggerEvents,
  getSemanticMatchScore,
  findBestSemanticMatch,
  getLabelText,
  getValueOwner,
  setValueOwner,
  isProtectedFromDeterministicFill,
  ensureHttpUrl,
  formatPhoneNumber,
  fillField,
  fillAutocomplete,
  fillDropdown,
  fillRadio,
  fillCheckbox,
  getAgentQueryRoots,
  queryAgentElements,
  collectAuditableFields,
  collectUnresolvedFields,
  applyAgentAnswers
};
