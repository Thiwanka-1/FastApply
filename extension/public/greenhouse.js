// public/greenhouse.js
console.log("[FastApply] Greenhouse Engine Active.");

// Engine scripts share one isolated world; an IIFE keeps top-level
// declarations from colliding with utils.js or other scripts.
(() => {

// Notice: smartMatch is removed from here because it now lives safely in utils.js!

const ghDebug = (...parts) => {
  try {
    console.debug("[FastApply:greenhouse]", ...parts);
  } catch (_) {}
};

// --- REACT-SELECT GHOST CLICKER ---
const fillReactDropdown = async (fieldWrapper, targetValue) => {
  if (fieldWrapper.dataset.fa_dropdown_processing === "true" || fieldWrapper.dataset.fa_filled === "true" || !targetValue) return false;

  const nativeSelect = fieldWrapper.querySelector('select');
  if (nativeSelect) {
    const selectedBefore = nativeSelect.options?.[nativeSelect.selectedIndex];
    if (
      selectedBefore &&
      !selectedBefore.disabled &&
      cleanGreenhouseText(selectedBefore.value)
    ) {
      // Preserve any real page/user selection. Returning "filled" here would
      // make the caller exit the whole field loop and repeatedly stop on this
      // same dropdown during every bounded retry.
      return false;
    }
    if (
      window.FastApplyUtils.isProtectedFromDeterministicFill?.(nativeSelect) ||
      window.FastApplyUtils.isProtectedFromDeterministicFill?.(fieldWrapper)
    ) return false;

    const availableOptions = Array.from(nativeSelect.options || [])
      .filter(option => !option.disabled && option.value)
      .map(option => option.text.trim())
      .filter(Boolean);

    const exactOption = resolveGreenhouseOption(
      targetValue,
      availableOptions,
      getGreenhouseFieldLabel(fieldWrapper)
    );

    if (!exactOption) return false;

    const option = Array.from(nativeSelect.options || []).find(item => {
      return normalizeGreenhouseText(item.text) ===
        normalizeGreenhouseText(exactOption);
    });

    if (!option) return false;

    nativeSelect.value = option.value;
    nativeSelect.dispatchEvent(new Event('input', { bubbles: true }));
    nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const selected = nativeSelect.options?.[nativeSelect.selectedIndex];
    const verified = normalizeGreenhouseText(selected?.text) ===
      normalizeGreenhouseText(exactOption);

    if (!verified) return false;

    fieldWrapper.dataset.fa_filled = "true";
    window.FastApplyUtils.setValueOwner?.(nativeSelect, "deterministic");
    fieldWrapper.style.border = '2px solid #8b5cf6';
    return true;
  }

  // Custom React combobox — the only dropdown type on the new
  // my.greenhouse.io application UI. Reuse the same machinery the agent
  // path uses: open, read the complete live option list (virtualized lists
  // included), resolve the option semantically, click it and verify.
  const control = getGreenhouseControl(fieldWrapper);
  if (!control.input && !control.trigger) return false;
  const ownerControl = control.input || control.trigger;
  if (
    window.FastApplyUtils.isProtectedFromDeterministicFill?.(ownerControl) ||
    window.FastApplyUtils.isProtectedFromDeterministicFill?.(fieldWrapper)
  ) return false;

  // Preserve any real page/user selection.
  const current = getGreenhouseCurrentValue(fieldWrapper, control);
  if (current) return false;

  // A dropdown that keeps failing (option truly absent, markup FastApply
  // cannot drive) must not be re-opened on all 20 polling passes.
  const tries = Number(fieldWrapper.dataset.fa_dropdown_tries || "0");
  if (tries >= 3) return false;

  fieldWrapper.dataset.fa_dropdown_processing = "true";
  try {
    const label = getGreenhouseFieldLabel(fieldWrapper);
    const options = await readGreenhouseOptions(fieldWrapper);

    let exactOption = "";
    if (options.length) {
      exactOption = resolveGreenhouseOption(targetValue, options, label);
      if (!exactOption) {
        fieldWrapper.dataset.fa_dropdown_tries = String(tries + 1);
        ghDebug(
          `dropdown "${label}": no option matched "${targetValue}" among ${options.length} options`
        );
        return false;
      }
    } else {
      // Search-driven lists (locations) render options only after typing —
      // pass the raw target through; the filler types it to filter.
      ghDebug(`dropdown "${label}": options are search-driven, typing "${targetValue}"`);
    }

    const filled = await fillGreenhouseAgentDropdown(
      fieldWrapper,
      exactOption || cleanGreenhouseText(targetValue),
      { source: "deterministic" }
    );

    if (!filled) {
      fieldWrapper.dataset.fa_dropdown_tries = String(tries + 1);
      ghDebug(
        `dropdown "${label}": option "${exactOption}" was clicked but the selection did not verify`
      );
      return false;
    }

    ghDebug(`dropdown "${label}": selected "${exactOption}"`);
    delete fieldWrapper.dataset.fa_dropdown_tries;
    fieldWrapper.style.border = '2px solid #8b5cf6';
    return true;
  } finally {
    delete fieldWrapper.dataset.fa_dropdown_processing;
  }
};

// Primary US time zone by state — lets "which time zone are you available
// to work in?" derive deterministically from the profile city/state.
const US_STATE_TIMEZONES = {
  connecticut: 'Eastern Time', delaware: 'Eastern Time', florida: 'Eastern Time',
  georgia: 'Eastern Time', maine: 'Eastern Time', maryland: 'Eastern Time',
  massachusetts: 'Eastern Time', michigan: 'Eastern Time',
  'new hampshire': 'Eastern Time', 'new jersey': 'Eastern Time',
  'new york': 'Eastern Time', 'north carolina': 'Eastern Time',
  ohio: 'Eastern Time', pennsylvania: 'Eastern Time', 'rhode island': 'Eastern Time',
  'south carolina': 'Eastern Time', vermont: 'Eastern Time', virginia: 'Eastern Time',
  'west virginia': 'Eastern Time', indiana: 'Eastern Time', kentucky: 'Eastern Time',
  'district of columbia': 'Eastern Time',
  alabama: 'Central Time', arkansas: 'Central Time', illinois: 'Central Time',
  iowa: 'Central Time', kansas: 'Central Time', louisiana: 'Central Time',
  minnesota: 'Central Time', mississippi: 'Central Time', missouri: 'Central Time',
  nebraska: 'Central Time', 'north dakota': 'Central Time', oklahoma: 'Central Time',
  'south dakota': 'Central Time', tennessee: 'Central Time', texas: 'Central Time',
  wisconsin: 'Central Time',
  arizona: 'Mountain Time', colorado: 'Mountain Time', idaho: 'Mountain Time',
  montana: 'Mountain Time', 'new mexico': 'Mountain Time', utah: 'Mountain Time',
  wyoming: 'Mountain Time',
  california: 'Pacific Time', nevada: 'Pacific Time', oregon: 'Pacific Time',
  washington: 'Pacific Time',
  alaska: 'Alaska Time', hawaii: 'Hawaii Time',
  ct: 'Eastern Time', de: 'Eastern Time', fl: 'Eastern Time', ga: 'Eastern Time',
  me: 'Eastern Time', md: 'Eastern Time', ma: 'Eastern Time', mi: 'Eastern Time',
  nh: 'Eastern Time', nj: 'Eastern Time', ny: 'Eastern Time', nc: 'Eastern Time',
  oh: 'Eastern Time', pa: 'Eastern Time', ri: 'Eastern Time', sc: 'Eastern Time',
  vt: 'Eastern Time', va: 'Eastern Time', wv: 'Eastern Time', in: 'Eastern Time',
  ky: 'Eastern Time', dc: 'Eastern Time',
  al: 'Central Time', ar: 'Central Time', il: 'Central Time', ia: 'Central Time',
  ks: 'Central Time', la: 'Central Time', mn: 'Central Time', ms: 'Central Time',
  mo: 'Central Time', ne: 'Central Time', nd: 'Central Time', ok: 'Central Time',
  sd: 'Central Time', tn: 'Central Time', tx: 'Central Time', wi: 'Central Time',
  az: 'Mountain Time', co: 'Mountain Time', id: 'Mountain Time', mt: 'Mountain Time',
  nm: 'Mountain Time', ut: 'Mountain Time', wy: 'Mountain Time',
  ca: 'Pacific Time', nv: 'Pacific Time', or: 'Pacific Time', wa: 'Pacific Time',
  ak: 'Alaska Time', hi: 'Hawaii Time'
};

const getUsTimezoneName = (state, country) => {
  const countryKey = String(country || '').toLowerCase();
  if (countryKey && !/united states|usa|u\.?s\.?a?\.?$|america/.test(countryKey)) return '';
  return US_STATE_TIMEZONES[String(state || '').toLowerCase().trim()] || '';
};

// --- GREENHOUSE CUSTOM FIELD MAPPER ---
const handleGreenhouseCustoms = async (profile) => {
  let filledAnything = false;
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const eeo = profile.eeo || {};
  const links = profile.websitesAndSkills || {};

  const memoryAnswer = key => {
    const answers = profile.applicationMemory?.answers;
    if (!Array.isArray(answers)) return "";
    const entry = answers.find(item => item?.key === key);
    const answer = entry?.answer;
    return answer === null || answer === undefined ? "" : String(answer);
  };

  // getGreenhouseDropdownWrappers also matches the new my.greenhouse.io
  // markup ([class*="field"], [data-testid*="field"]) that the old
  // class-list selector missed entirely. Deepest wrappers first, so a leaf
  // field always wins over a container that merely includes it.
  const fields = getGreenhouseDropdownWrappers().sort((first, second) => {
    return getGreenhouseWrapperDepth(second) - getGreenhouseWrapperDepth(first);
  });

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.dataset.fa_filled === "true") continue;
    if (!isGreenhouseVisible(field)) continue;

    const questionText = getGreenhouseFieldLabel(field).toLowerCase();
    if (!questionText) continue;
    // Never treat a combobox's internal search input as a plain text field.
    const textInput = field.querySelector(
      'input[type="text"]:not([role="combobox"]):not([aria-haspopup="listbox"]):not([aria-autocomplete="list"])'
    );

    // --- 1. Custom Text Inputs (Upgraded for Split Names) ---
    if (questionText.includes('preferred first name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.preferredName || pInfo.firstName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('preferred last name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.lastName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('legal first name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.firstName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('legal last name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.lastName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('legal name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, `${pInfo.firstName} ${pInfo.lastName || ''}`.trim())) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('preferred name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.preferredName || pInfo.firstName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('pronouns') && textInput && pInfo.pronouns) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.pronouns)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('linkedin') && textInput && links.linkedin) {
      if (window.FastApplyUtils.fillField(textInput, links.linkedin)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if ((questionText.includes('website') || questionText.includes('portfolio')) && textInput && links.portfolio) {
      if (window.FastApplyUtils.fillField(textInput, links.portfolio)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }

    // --- 2. Custom Dropdowns ---
    // Never `return` from inside this loop: an early return used to abort the
    // whole pass after the first dropdown, so pages with several EEO
    // dropdowns filled only one per polling attempt.
    const tryDropdown = async (targetVal) => {
      if (await fillReactDropdown(field, targetVal)) {
        filledAnything = true;
        return true;
      }
      return false;
    };

    if (
      (questionText.includes('based in the usa') || questionText.includes('based in the us.')) &&
      cInfo.country
    ) {
      const country = (cInfo.country || "").toLowerCase();
      const isUS = country === 'us' || country === 'usa' || country === 'united states' || country === 'america';
      await tryDropdown(isUS ? "Yes" : "No");
    }
    // Work/Visa checks
    else if (questionText.includes('authorized to work') || questionText.includes('legally entitled') || questionText.includes('legal right to work')) {
      await tryDropdown(eeo.authorizedToWork);
    }
    else if (questionText.includes('visa sponsorship') || questionText.includes('require sponsorship') || questionText.includes('immigration sponsorship')) {
      await tryDropdown(eeo.requireVisaFuture);
    }
    // Location / preferences. The question must actually ask WHICH country —
    // "select the status that allows you to work and live in that country"
    // also contains "country"+"live" but its options are visa statuses, so
    // status/eligibility wording is excluded.
    else if (
      cInfo.country &&
      (
        /\b(choose|select|pick|enter|which)\b[^?]{0,25}\bcountry\b/.test(questionText) ||
        questionText.includes('country of residence') ||
        questionText.includes('country do you') ||
        questionText.includes('country are you') ||
        questionText.includes('country you are')
      ) &&
      !/\b(status|visa|permit|citizen|authoriz|eligib|sponsor)/.test(questionText)
    ) {
      await tryDropdown(cInfo.country);
    }
    else if (questionText.includes('relocat')) {
      await tryDropdown(eeo.willingToRelocate || memoryAnswer('willingToRelocate'));
    }
    // Current location — usually a search-driven dropdown; try the fullest
    // form first, then shorter ones.
    else if (
      questionText.includes('current location') ||
      questionText.includes('where are you located') ||
      questionText.includes('where do you currently')
    ) {
      if (cInfo.city || cInfo.country) {
        const locationCandidates = [...new Set([
          [cInfo.city, cInfo.state, cInfo.country].filter(Boolean).join(', '),
          [cInfo.city, cInfo.state].filter(Boolean).join(', '),
          [cInfo.city, cInfo.country].filter(Boolean).join(', ')
        ].filter(Boolean))];
        for (const candidate of locationCandidates) {
          if (await tryDropdown(candidate)) break;
        }
      }
    }
    // English proficiency (CEFR-style lists: "C2 - Proficient").
    else if (
      questionText.includes('english') &&
      /proficien|fluen|level/.test(questionText)
    ) {
      const english = (pInfo.languages || []).find(item => {
        return /english/i.test(item?.language || '');
      });
      const proficiency = String(english?.proficiency || '').toLowerCase();
      const candidates = [];
      if (english) {
        if (
          english.fluent === true ||
          /native|fluent|proficient|full professional/.test(proficiency)
        ) {
          candidates.push('C2 - Proficient', 'Fluent', 'Native or bilingual');
        } else if (/advanced|professional working/.test(proficiency)) {
          candidates.push('C1 - Advanced', 'Advanced');
        } else if (/upper/.test(proficiency)) {
          candidates.push('B2 - Upper Intermediate', 'Upper Intermediate');
        } else if (/intermediate|conversational|limited working/.test(proficiency)) {
          candidates.push('B1 - Intermediate', 'Intermediate');
        } else if (/element|basic|beginner/.test(proficiency)) {
          candidates.push('A2 - Elementary', 'Beginner');
        } else if (english.proficiency) {
          candidates.push(english.proficiency);
        }
      }
      for (const candidate of candidates.slice(0, 3)) {
        if (await tryDropdown(candidate)) break;
      }
    }
    // U.S. time zone — derived from the profile state ("Texas" → Central).
    else if (/time ?zones?\b/.test(questionText)) {
      const timezone = getUsTimezoneName(cInfo.state, cInfo.country);
      if (timezone) {
        const boxes = Array.from(field.querySelectorAll('input[type="checkbox"]'));
        if (boxes.length) {
          if (window.FastApplyUtils.fillCheckbox(boxes, timezone)) {
            ghDebug(`time zone "${questionText.slice(0, 50)}" → "${timezone}"`);
            filledAnything = true;
          }
        } else if (await tryDropdown(timezone)) {
          ghDebug(`time zone "${questionText.slice(0, 50)}" → "${timezone}"`);
        }
      }
    }

    // --- Demographic EEO ---
    else if ((questionText.includes('hispanic') || questionText.includes('latino') || questionText.includes('latinx')) && !questionText.includes('race')) {
      if (eeo.optOut) {
        await tryDropdown("decline");
      } else if (eeo.ethnicity && eeo.ethnicity.trim() !== "") {
        const ethnicity = eeo.ethnicity.toLowerCase();
        const explicitlyNotHispanic = /\b(not|non)[\s-]+(hispanic|latino|latina|latinx)\b/.test(ethnicity);
        const explicitlyHispanic = !explicitlyNotHispanic &&
          /\b(hispanic|latino|latina|latinx)\b/.test(ethnicity);
        if (explicitlyNotHispanic) await tryDropdown("No");
        else if (explicitlyHispanic) await tryDropdown("Yes");
      }
    }
    else if ((questionText.includes('gender') || questionText.includes('sex') || questionText.includes('identify as')) && !questionText.includes('transgender') && !questionText.includes('sexual orientation') && !questionText.includes('ethnicity') && !questionText.includes('race') && !questionText.includes('hispanic')) {
      await tryDropdown(eeo.optOut ? "decline" : eeo.gender);
    }
    else if (questionText.includes('race')) {
      await tryDropdown(eeo.optOut ? "decline" : eeo.race);
    }
    else if (questionText.includes('ethnic')) {
      await tryDropdown(eeo.optOut ? "decline" : eeo.ethnicity);
    }
    else if (questionText.includes('veteran')) {
      await tryDropdown(eeo.optOut ? "decline" : eeo.veteran);
    }
    else if (questionText.includes('disability')) {
      await tryDropdown(eeo.optOut ? "decline" : eeo.disability);
    }
    else if (questionText.includes('transgender') && eeo.optOut) {
      await tryDropdown("decline");
    }
    else if (questionText.includes('sexual orientation') && eeo.optOut) {
      await tryDropdown("decline");
    }
    else if ((questionText.includes('parents/guardians') || questionText.includes('parents')) && eeo.optOut) {
      await tryDropdown("decline");
    }
  }

  return filledAnything;
};

// --- CORE ENGINE ---
const attemptAutofill = async (profile) => {
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  let filledAnything = false;

  const fNameInput = document.getElementById('first_name') || document.querySelector('input[name="first_name"]');
  const lNameInput = document.getElementById('last_name') || document.querySelector('input[name="last_name"]');
  const emailInput = document.getElementById('email') || document.querySelector('input[name="email"]');
  const phoneInput = document.getElementById('phone') || document.querySelector('input[name="phone"]');
  
  const locationInput = document.getElementById('job_application_location') || document.querySelector('input[autocomplete*="location"]') || document.querySelector('input[id*="location"]');
  const hiddenLocationInput = document.getElementById('job_application_location_autocomplete'); 

  if (window.FastApplyUtils.fillField(fNameInput, pInfo.firstName)) filledAnything = true;
  if (window.FastApplyUtils.fillField(lNameInput, pInfo.lastName)) filledAnything = true;
  if (window.FastApplyUtils.fillField(emailInput, cInfo.email)) filledAnything = true;
  if (window.FastApplyUtils.fillField(phoneInput, cInfo.phone)) filledAnything = true;

  if (locationInput && cInfo.city && locationInput.dataset.fa_filled !== "true") {
    const locString = [cInfo.city, cInfo.state, cInfo.country]
      .filter(Boolean)
      .join(", ");
    if (window.FastApplyUtils.fillAutocomplete(locationInput, hiddenLocationInput, locString)) filledAnything = true;
  }

  if (await handleGreenhouseCustoms(profile)) filledAnything = true;

  return filledAnything;
};

const greenhouseAgentFields = new Map();

const waitForGreenhouse = milliseconds => {
  return new Promise(resolve => {
    window.setTimeout(resolve, milliseconds);
  });
};

const cleanGreenhouseText = value => {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeGreenhouseText = value => {
  return cleanGreenhouseText(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const hashGreenhouseText = value => {
  const text = String(value ?? "");
  let hash = 0;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash =
      ((hash << 5) - hash) +
      text.charCodeAt(index);

    hash |= 0;
  }

  return Math.abs(hash).toString(36);
};

const isGreenhouseVisible = element => {
  if (!element?.isConnected) return false;

  const style = window.getComputedStyle(element);

  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  ) {
    return false;
  }

  const rectangle =
    element.getBoundingClientRect();

  return (
    rectangle.width > 0 &&
    rectangle.height > 0
  );
};

const getGreenhouseFieldLabel = wrapper => {
  if (!wrapper) return "";

  const label =
    wrapper.querySelector("label") ||
    wrapper.querySelector("legend") ||
    wrapper.querySelector(
      '[class*="label"], [data-testid*="label"]'
    );

  return cleanGreenhouseText(
    label?.innerText ||
    label?.textContent ||
    wrapper.getAttribute("aria-label") ||
    ""
  );
};

const isGreenhouseUploadField = (
  wrapper,
  label
) => {
  if (
    wrapper.querySelector(
      'input[type="file"]'
    )
  ) {
    return true;
  }

  const normalizedLabel =
    normalizeGreenhouseText(label);

  const looksLikeDocumentUpload =
    /\bresume\b|\bcv\b|\bcover letter\b/.test(
      normalizedLabel
    );

  const hasUploadButtons =
    Array.from(
      wrapper.querySelectorAll(
        "button, [role='button']"
      )
    ).some(button => {
      const text =
        normalizeGreenhouseText(
          button.innerText ||
          button.textContent
        );

      return (
        text === "attach" ||
        text === "dropbox" ||
        text === "google drive"
      );
    });

  return (
    looksLikeDocumentUpload &&
    hasUploadButtons
  );
};

const getGreenhouseControl = wrapper => {
  if (!wrapper) {
    return {
      nativeSelect: null,
      input: null,
      trigger: null
    };
  }

  const nativeSelect =
    wrapper.querySelector("select");

  const input =
    wrapper.querySelector(
      [
        'input[role="combobox"]',
        'input[aria-haspopup="listbox"]',
        'input[aria-autocomplete="list"]',
        'input[aria-controls][aria-expanded]'
      ].join(",")
    );

  const explicitTrigger =
    wrapper.querySelector(
      [
        'button[aria-haspopup="listbox"]',
        '[role="combobox"]',
        '[aria-haspopup="listbox"]',
        '[aria-controls][aria-expanded]'
      ].join(",")
    );

  const reactControl =
    wrapper.querySelector(
      [
        '[class*="-control"]',
        '[class*="select__control"]',
        '[data-testid*="select-control"]'
      ].join(",")
    );

  const trigger =
    explicitTrigger ||
    input?.closest('[role="combobox"]') ||
    input ||
    reactControl;

  return {
    nativeSelect,
    input,
    trigger
  };
};

const getGreenhouseListbox = control => {
  const ids = [
    control?.input?.getAttribute(
      "aria-controls"
    ),
    control?.input?.getAttribute(
      "aria-owns"
    ),
    control?.trigger?.getAttribute(
      "aria-controls"
    ),
    control?.trigger?.getAttribute(
      "aria-owns"
    )
  ].filter(Boolean);

  for (const id of ids) {
    const listbox =
      document.getElementById(id);

    if (listbox) return listbox;
  }

  const visibleListboxes = Array.from(
    document.querySelectorAll(
      [
        '[role="listbox"]',
        '[id*="-listbox"]',
        '[class*="-menu-list"]',
        '[class*="menuList"]'
      ].join(",")
    )
  ).filter(isGreenhouseVisible);

  return (
    visibleListboxes[
      visibleListboxes.length - 1
    ] || null
  );
};

const openGreenhouseDropdown = wrapper => {
  const control =
    getGreenhouseControl(wrapper);

  if (control.nativeSelect) {
    return control;
  }

  const clickTarget =
    control.trigger ||
    control.input;

  if (!clickTarget) return null;

  const isAlreadyOpen =
    clickTarget.getAttribute(
      "aria-expanded"
    ) === "true" ||
    control.input?.getAttribute(
      "aria-expanded"
    ) === "true";

  if (!isAlreadyOpen) {
    clickTarget.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );

    clickTarget.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );

    clickTarget.click();
  }

  return control;
};

const closeGreenhouseDropdown = () => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true
    })
  );
};

const getGreenhouseOptionElements = listbox => {
  const root = listbox || document;

  return Array.from(
    root.querySelectorAll(
      [
        '[role="option"]',
        '[id*="-option"]',
        '[class*="-option"]'
      ].join(",")
    )
  ).filter(isGreenhouseVisible);
};

const getGreenhouseScrollContainer = listbox => {
  if (!listbox) return null;

  const candidates = [
    listbox,
    ...Array.from(listbox.querySelectorAll("*"))
  ].filter(element => {
    return element.scrollHeight > element.clientHeight + 2;
  });

  return candidates.sort((first, second) => {
    return (
      second.scrollHeight - second.clientHeight
    ) - (
      first.scrollHeight - first.clientHeight
    );
  })[0] || listbox;
};

const readAllGreenhouseOptions =
  async listbox => {
    const options = new Set();
    const scrollContainer =
      getGreenhouseScrollContainer(listbox);

    const collectVisibleOptions = () => {
      getGreenhouseOptionElements(
        listbox
      ).forEach(option => {
        const text =
          cleanGreenhouseText(
            option.innerText ||
            option.textContent
          );

        if (
          text &&
          normalizeGreenhouseText(text) !==
            "select"
        ) {
          options.add(text);
        }
      });
    };

    collectVisibleOptions();

    if (!scrollContainer) {
      return [...options];
    }

    const originalScrollTop =
      scrollContainer.scrollTop;

    scrollContainer.scrollTop = 0;
    scrollContainer.dispatchEvent(
      new Event("scroll", { bubbles: true })
    );
    await waitForGreenhouse(80);

    let unchangedPasses = 0;
    let previousScrollTop =
      scrollContainer.scrollTop;
    let previousOptionCount = -1;

    for (
      let attempt = 0;
      attempt < 100;
      attempt += 1
    ) {
      collectVisibleOptions();

      const atBottom =
        scrollContainer.scrollTop +
          scrollContainer.clientHeight >=
        scrollContainer.scrollHeight - 2;

      if (atBottom) break;

      scrollContainer.scrollTop = Math.min(
        scrollContainer.scrollHeight,
        scrollContainer.scrollTop +
          Math.max(
            120,
            scrollContainer.clientHeight * 0.8
          )
      );

      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true
        })
      );

      await waitForGreenhouse(80);

      if (
        scrollContainer.scrollTop === previousScrollTop &&
        options.size === previousOptionCount
      ) {
        unchangedPasses += 1;
      } else {
        unchangedPasses = 0;
      }

      if (unchangedPasses >= 2) break;

      previousScrollTop = scrollContainer.scrollTop;
      previousOptionCount = options.size;
    }

    collectVisibleOptions();

    scrollContainer.scrollTop =
      originalScrollTop;

    scrollContainer.dispatchEvent(
      new Event("scroll", {
        bubbles: true
      })
    );

    return [...options];
  };

const readGreenhouseOptions =
  async wrapper => {
    const control =
      openGreenhouseDropdown(wrapper);

    if (!control) return [];

    if (control.nativeSelect) {
      return Array.from(
        control.nativeSelect.options || []
      )
        .filter(option => {
          return (
            !option.disabled &&
            cleanGreenhouseText(
              option.value
            ) &&
            cleanGreenhouseText(
              option.text
            )
          );
        })
        .map(option => {
          return cleanGreenhouseText(
            option.text
          );
        });
    }

    await waitForGreenhouse(250);

    const listbox =
      getGreenhouseListbox(control);

    const options =
      await readAllGreenhouseOptions(
        listbox
      );

    closeGreenhouseDropdown();

    await waitForGreenhouse(80);

    return [...new Set(options)];
  };

const getGreenhouseCurrentValue = (
  wrapper,
  control = getGreenhouseControl(
    wrapper
  )
) => {
  if (control.nativeSelect) {
    const selected =
      control.nativeSelect.options?.[
        control.nativeSelect.selectedIndex
      ];

    if (
      selected &&
      cleanGreenhouseText(
        selected.value
      )
    ) {
      return cleanGreenhouseText(
        selected.text
      );
    }
  }

  const selectedNodes = Array.from(
    wrapper.querySelectorAll(
      [
        '[class*="-singleValue"]',
        '[class*="-multiValue"]',
        '[class*="single-value"]',
        '[class*="multi-value"]',
        '[data-testid*="selected"]',
        '[aria-selected="true"]'
      ].join(",")
    )
  );

  const selectedText = selectedNodes
    .map(node => {
      return cleanGreenhouseText(
        node.innerText ||
        node.textContent
      );
    })
    .filter(Boolean)
    .join(", ");

  if (selectedText) {
    return selectedText;
  }

  const removeButtons = Array.from(
    wrapper.querySelectorAll(
      [
        'button[aria-label^="Remove"]',
        '[aria-label^="Remove"]'
      ].join(",")
    )
  );

  const chipText = removeButtons
    .map(button => {
      const parent =
        button.parentElement;

      return cleanGreenhouseText(
        parent?.innerText ||
        parent?.textContent
      ).replace(/\s*[×x]\s*$/i, "");
    })
    .filter(Boolean)
    .join(", ");

  if (chipText) return chipText;

  // The my.greenhouse.io combobox shows the selected option as the search
  // input's resting value — without this read, selections were reported as
  // empty and verification always failed on the new UI.
  const inputValue = cleanGreenhouseText(control.input?.value);
  if (inputValue && !/^(select|choose)\b/i.test(inputValue)) {
    return inputValue;
  }

  const triggerText =
    cleanGreenhouseText(
      control.trigger?.innerText ||
      control.trigger?.textContent
    );

  const label =
    getGreenhouseFieldLabel(wrapper);

  const cleanedTriggerText =
    triggerText
      .replace(label, "")
      .replace(/\bselect\.{0,3}\b/gi, "")
      .replace(/[×x]\s*$/i, "")
      .trim();

  return /^(one|select one|choose|choose one|please select)$/i.test(cleanedTriggerText)
    ? ""
    : cleanedTriggerText;
};

const getGreenhouseSelectedValues = wrapper => {
  const control = getGreenhouseControl(wrapper);

  if (control.nativeSelect) {
    return Array.from(control.nativeSelect.selectedOptions || [])
      .filter(option => cleanGreenhouseText(option.value))
      .map(option => cleanGreenhouseText(option.text));
  }

  return [...new Set(
    Array.from(wrapper.querySelectorAll([
      '[class*="-singleValue"]',
      '[class*="-multiValue"]',
      '[class*="single-value"]',
      '[class*="multi-value"]',
      '[data-testid*="selected"]'
    ].join(",")))
      .map(node => cleanGreenhouseText(node.innerText || node.textContent))
      .filter(Boolean)
  )];
};

const getGreenhouseDropdownWrappers =
  () => {
    const wrappers = new Set(
      Array.from(
        document.querySelectorAll(
          [
            ".field",
            ".field-wrapper",
            ".custom-field",
            ".v2-make-it-custom",
            ".select",
            '[class*="field"]',
            '[data-testid*="field"]'
          ].join(",")
        )
      )
    );

    document
      .querySelectorAll(
        [
          'input[role="combobox"]',
          '[role="combobox"]',
          '[aria-haspopup="listbox"]'
        ].join(",")
      )
      .forEach(control => {
        const wrapper =
          control.closest(
            [
              ".field",
              ".field-wrapper",
              ".custom-field",
              ".v2-make-it-custom",
              ".select",
              '[class*="field"]',
              '[data-testid*="field"]'
            ].join(",")
          );

        if (wrapper) {
          wrappers.add(wrapper);
        }
      });

    return [...wrappers];
  };

const getGreenhouseWrapperDepth = element => {
  let depth = 0;
  let current = element;

  while (current?.parentElement) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
};

const setGreenhouseControlsProcessed = (
  wrapper,
  processed
) => {
  const controls =
    wrapper.querySelectorAll(
      [
        "select",
        'input[role="combobox"]',
        'input[aria-haspopup="listbox"]',
        'input[aria-autocomplete="list"]',
        '[role="combobox"]',
        '[aria-haspopup="listbox"]'
      ].join(",")
    );

  controls.forEach(control => {
    if (processed) {
      control.dataset.fa_agent_processed =
        "true";
    } else {
      delete control.dataset
        .fa_agent_processed;
    }
  });
};

const isGreenhouseMultipleSelect = (
  wrapper,
  label
) => {
  const normalizedLabel =
    normalizeGreenhouseText(label);

  return (
    /\bmark all that apply\b|\bselect all\b|\bchoose all\b|\ball that apply\b/.test(
      normalizedLabel
    ) ||
    wrapper.querySelector(
      '[aria-multiselectable="true"]'
    ) !== null ||
    wrapper.querySelector(
      '[class*="-multiValue"], [class*="multi-value"]'
    ) !== null
  );
};

const markGreenhouseAgentState = (
  wrapper,
  state,
  reason = ""
) => {
  if (!wrapper) return;

  wrapper.dataset.fa_agent_processed =
    "true";

  wrapper.dataset.fa_agent_state =
    state;

  wrapper.dataset.fa_agent_reason =
    reason;

  try {
    if (state === "review") {
      wrapper.style.border =
        "2px solid #f59e0b";

      wrapper.style.backgroundColor =
        "#fffbeb";
    } else if (
      state === "unresolved"
    ) {
      wrapper.style.border =
        "2px dashed #ef4444";

      wrapper.style.backgroundColor =
        "#fef2f2";
    } else {
      wrapper.style.border =
        "2px solid #06b6d4";

      wrapper.style.backgroundColor =
        "#f0fdfa";
    }

    wrapper.style.borderRadius = "6px";
  } catch (_) {}
};

const resolveGreenhouseOption = (
  value,
  options,
  fieldLabel = ""
) => {
    const availableOptions =
      Array.isArray(options)
        ? options.filter(Boolean)
        : [];

    if (
      !hasGreenhouseAnswerValue(value) ||
      availableOptions.length === 0
    ) {
      return "";
    }

    const normalizedValue =
      normalizeGreenhouseText(value);

    const exactMatch =
      availableOptions.find(option => {
        return (
          normalizeGreenhouseText(
            option
          ) === normalizedValue
        );
      });
    if (exactMatch) return exactMatch;

    // Known-equivalent names matched as whole options only (never prefixes:
    // "us" as a prefix would grab "US Virgin Islands").
    const VALUE_ALIASES = {
      'united states': ['united states of america', 'usa', 'u s a', 'us'],
      'usa': ['united states', 'united states of america'],
      'united kingdom': ['uk', 'great britain'],
      'uk': ['united kingdom']
    };
    const aliases = VALUE_ALIASES[normalizedValue] || [];
    const aliasMatch = availableOptions.find(option => {
      return aliases.includes(normalizeGreenhouseText(option));
    });
    if (aliasMatch) return aliasMatch;

    // Country-style ties: "United States" scores identically against
    // "United States of America" and "United States Minor Outlying Islands",
    // so the semantic matcher refuses to choose. A multi-word target that is
    // a whole-word PREFIX of some options resolves to the shortest of them.
    if (normalizedValue.split(' ').length >= 2) {
      const prefixMatches = availableOptions
        .filter(option => {
          return normalizeGreenhouseText(option).startsWith(`${normalizedValue} `);
        })
        .sort((first, second) => {
          return normalizeGreenhouseText(first).length -
            normalizeGreenhouseText(second).length;
        });
      if (prefixMatches.length) return prefixMatches[0];
    }

    const semanticMatch = window.FastApplyUtils.findBestSemanticMatch?.(
      availableOptions,
      value
    );
    if (semanticMatch) return semanticMatch;

    // Both call sites pass the question label (previously silently dropped by
    // a two-parameter signature). Use it to break ties: drop option rows that
    // merely repeat the question wording, then retry once.
    const labelKey = normalizeGreenhouseText(fieldLabel);
    if (labelKey) {
      const filtered = availableOptions.filter(option => {
        const optionKey = normalizeGreenhouseText(option);
        return optionKey && optionKey !== labelKey;
      });
      if (filtered.length && filtered.length < availableOptions.length) {
        return window.FastApplyUtils.findBestSemanticMatch?.(
          filtered,
          value
        ) || "";
      }
    }

    return "";
  };

const findRenderedGreenhouseOption = (
  listbox,
  targetValue
) => {
  const normalizedTarget =
    normalizeGreenhouseText(targetValue);

  return getGreenhouseOptionElements(listbox).find(option => {
    return normalizeGreenhouseText(
      option.innerText || option.textContent
    ) === normalizedTarget;
  }) || null;
};

const findVirtualizedGreenhouseOption = async (
  listbox,
  targetValue
) => {
  if (!listbox) return null;

  let match = findRenderedGreenhouseOption(
    listbox,
    targetValue
  );

  if (match) return match;

  const scrollContainer =
    getGreenhouseScrollContainer(listbox);

  if (!scrollContainer) return null;

  scrollContainer.scrollTop = 0;
  scrollContainer.dispatchEvent(
    new Event("scroll", { bubbles: true })
  );
  await waitForGreenhouse(80);

  let previousScrollTop = -1;
  let unchangedPasses = 0;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    match = findRenderedGreenhouseOption(
      listbox,
      targetValue
    );

    if (match) return match;

    const atBottom =
      scrollContainer.scrollTop +
        scrollContainer.clientHeight >=
      scrollContainer.scrollHeight - 2;

    if (atBottom) break;

    const nextScrollTop = Math.min(
      scrollContainer.scrollHeight,
      scrollContainer.scrollTop + Math.max(
        120,
        scrollContainer.clientHeight * 0.8
      )
    );

    if (nextScrollTop === previousScrollTop) {
      unchangedPasses += 1;
    } else {
      unchangedPasses = 0;
    }

    if (unchangedPasses >= 2) break;

    previousScrollTop = nextScrollTop;
    scrollContainer.scrollTop = nextScrollTop;
    scrollContainer.dispatchEvent(
      new Event("scroll", { bubbles: true })
    );
    await waitForGreenhouse(80);
  }

  return findRenderedGreenhouseOption(
    listbox,
    targetValue
  );
};

const fillGreenhouseAgentDropdown =
  async (
    wrapper,
    targetValue,
    settings = {}
  ) => {
    const target =
      cleanGreenhouseText(
        targetValue
      );

    if (!wrapper || !target) {
      return false;
    }

    const control =
      getGreenhouseControl(wrapper);

    if (control.nativeSelect) {
      if (settings.multiple === true && control.nativeSelect.multiple) {
        const option = Array.from(control.nativeSelect.options || []).find(item => {
          return normalizeGreenhouseText(item.text) === normalizeGreenhouseText(target);
        });
        if (!option || option.disabled) return false;
        option.selected = true;
        control.nativeSelect.dispatchEvent(new Event("input", { bubbles: true }));
        control.nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        const retained = Array.from(control.nativeSelect.selectedOptions || []).some(item => {
          return normalizeGreenhouseText(item.text) === normalizeGreenhouseText(target);
        });
        if (retained) {
          window.FastApplyUtils.setValueOwner?.(control.nativeSelect, "agent");
        }
        return retained;
      }

      const filled =
        window.FastApplyUtils
          .fillDropdown(
            control.nativeSelect,
            target,
            {
              force: true,
              source: "agent",
              exact: true
            }
          );

      if (!filled) return false;

      const selected =
        control.nativeSelect.options?.[
          control.nativeSelect
            .selectedIndex
        ];

      return (
        normalizeGreenhouseText(
          selected?.text
        ) ===
        normalizeGreenhouseText(
          target
        )
      );
    }

    const openedControl =
      openGreenhouseDropdown(wrapper);

    if (!openedControl) return false;

    await waitForGreenhouse(250);

    const listbox =
      getGreenhouseListbox(
        openedControl
      );

    let matchedOption =
      await findVirtualizedGreenhouseOption(
        listbox,
        target
      );

    // Search-driven lists (locations, long country lists) render options
    // only after typing — filter with the target text and retry.
    if (!matchedOption && openedControl.input) {
      try {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        if (setter) setter.call(openedControl.input, target);
        else openedControl.input.value = target;
        openedControl.input.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}
      await waitForGreenhouse(650);

      const searchListbox = getGreenhouseListbox(openedControl);
      matchedOption = await findVirtualizedGreenhouseOption(
        searchListbox,
        target
      );

      if (!matchedOption) {
        const rendered = getGreenhouseOptionElements(searchListbox);
        matchedOption = window.FastApplyUtils.findBestSemanticMatch?.(
          rendered,
          target,
          element => cleanGreenhouseText(element.innerText || element.textContent)
        ) || (rendered.length === 1 ? rendered[0] : null);
      }
    }

    if (!matchedOption) {
      closeGreenhouseDropdown();
      return false;
    }

    // Captured before the click — selected options can unmount immediately.
    const chosenText = cleanGreenhouseText(
      matchedOption.innerText || matchedOption.textContent
    ) || target;

    matchedOption.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (typeof PointerEvent === "function") {
      matchedOption.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "mouse",
        isPrimary: true
      }));
    }

    matchedOption.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );

    matchedOption.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );

    if (typeof PointerEvent === "function") {
      matchedOption.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerType: "mouse",
        isPrimary: true
      }));
    }

    matchedOption.click();

    await waitForGreenhouse(180);

    const isExpanded = () =>
      control.input?.getAttribute("aria-expanded") === "true" ||
      control.trigger?.getAttribute("aria-expanded") === "true";

    // Some tenants leave the menu open after a successful pick — close it
    // before judging instead of calling the fill a failure.
    if (isExpanded()) {
      closeGreenhouseDropdown();
      await waitForGreenhouse(150);
    }

    // The displayed value can be a shorter or longer form of the clicked
    // option ("United States" vs "United States of America") — exact-only
    // comparison rolled those back as "did not verify".
    const valueMatches = (liveValue, expected) => {
      const live = normalizeGreenhouseText(liveValue);
      const wanted = normalizeGreenhouseText(expected);
      if (!live || !wanted) return false;
      if (live === wanted) return true;
      const shorter = live.length < wanted.length ? live : wanted;
      if (
        (shorter.split(" ").length >= 2 || shorter.length >= 6) &&
        (live.includes(wanted) || wanted.includes(live))
      ) return true;
      return window.FastApplyUtils.smartMatch?.(liveValue, expected) === true;
    };

    const verified = settings.multiple === true
      ? getGreenhouseSelectedValues(wrapper).some(value => {
          return valueMatches(value, chosenText) || valueMatches(value, target);
        })
      : !isExpanded() && (() => {
          const currentValue = getGreenhouseCurrentValue(wrapper);
          return valueMatches(currentValue, chosenText) ||
            valueMatches(currentValue, target);
        })();

    if (!verified) return false;

    wrapper.dataset.fa_filled =
      "true";

    const fillSource =
      settings.source === "deterministic" ? "deterministic" : "agent";
    if (fillSource === "agent") {
      wrapper.dataset.fa_agent_filled = "true";
    }

    const ownerControl = control.nativeSelect || control.input || control.trigger || wrapper;
    window.FastApplyUtils.setValueOwner?.(ownerControl, fillSource);

    return true;
  };

const collectGreenhouseAgentFields =
  async () => {
    greenhouseAgentFields.clear();

    const customFields = [];
    const processedWrappers = [];
    const customLabels = new Set();

    const wrappers = getGreenhouseDropdownWrappers()
      .sort((first, second) => {
        return getGreenhouseWrapperDepth(second) -
          getGreenhouseWrapperDepth(first);
      });
    const registeredControls = new Set();
    const registeredControlKeys = new Set();

    /*
     * First register every real Greenhouse dropdown.
     * Its internal search input is temporarily marked
     * processed so the generic collector cannot add
     * the same control again as a text input.
     */
    for (let wrapperIndex = 0; wrapperIndex < wrappers.length; wrapperIndex += 1) {
      const wrapper = wrappers[wrapperIndex];
      if (
        !isGreenhouseVisible(wrapper)
      ) {
        continue;
      }

      const label =
        getGreenhouseFieldLabel(
          wrapper
        );

      if (
        !label ||
        isGreenhouseUploadField(
          wrapper,
          label
        )
      ) {
        continue;
      }

      const control =
        getGreenhouseControl(wrapper);

      if (
        !control.nativeSelect &&
        !control.trigger &&
        !control.input
      ) {
        continue;
      }

      const ownerControl = control.nativeSelect || control.input || control.trigger || wrapper;
      const normalizedCustomLabel = normalizeGreenhouseText(label);
      const controlKey = [
        normalizedCustomLabel,
        ownerControl.id || "",
        ownerControl.getAttribute?.("name") || "",
        ownerControl.getAttribute?.("aria-controls") || ""
      ].join("|");
      if (
        registeredControls.has(ownerControl) ||
        registeredControlKeys.has(controlKey)
      ) continue;
      registeredControls.add(ownerControl);
      registeredControlKeys.add(controlKey);

      setGreenhouseControlsProcessed(
        wrapper,
        true
      );

      processedWrappers.push(
        wrapper
      );

      const options =
        await readGreenhouseOptions(
          wrapper
        );

      const identity = [
        window.location.pathname,
        label,
        control.input?.id || "",
        control.input?.name || "",
        control.nativeSelect?.id || "",
        control.nativeSelect?.name || "",
        wrapperIndex
      ].join("|");

      const fieldId =
        `fa_greenhouse_select_${hashGreenhouseText(identity)}`;

      const multiple =
        isGreenhouseMultipleSelect(
          wrapper,
          label
        );
      const currentValue = multiple
        ? getGreenhouseSelectedValues(wrapper)
        : getGreenhouseCurrentValue(wrapper, control);
      const valueOwner = window.FastApplyUtils.getValueOwner?.(ownerControl) ||
        (wrapper.dataset.fa_filled === "true" ? "deterministic" : "");

      wrapper.dataset.fa_agent_field_id =
        fieldId;

      greenhouseAgentFields.set(
        fieldId,
        {
          wrapper,
          label,
          options,
          multiple,
          currentValue,
          valueOwner,
          ownerControl
        }
      );

      customLabels.add(
        normalizedCustomLabel
      );

      customFields.push({
        fieldId,
        label,
        type: "select",
        required:
          label.includes("*") ||
          control.input?.required ===
            true ||
          control.nativeSelect
            ?.required === true ||
          control.input?.getAttribute(
            "aria-required"
          ) === "true" ||
          control.trigger?.getAttribute(
            "aria-required"
          ) === "true",
        options,
        currentValue,
        maxLength: null,
        valueOwner,
        validity: {
          valid:
            ownerControl.getAttribute?.("aria-invalid") !== "true" &&
            (typeof ownerControl.checkValidity !== "function" || ownerControl.checkValidity()),
          ariaInvalid: ownerControl.getAttribute?.("aria-invalid") === "true",
          message: cleanGreenhouseText(ownerControl.validationMessage || "")
        }
      });
    }

    const standardFields =
      window.FastApplyUtils
        .collectAuditableFields()
        .filter(field => {
          /*
           * Remove any remaining duplicate Greenhouse
           * control collected through an internal input.
           */
          return !customLabels.has(
            normalizeGreenhouseText(
              field.label
            )
          );
        })
        .filter(field => {
          const label =
            normalizeGreenhouseText(
              field.label
            );

          return (
            label !== "attach" &&
            label !== "dropbox" &&
            label !== "google drive"
          );
        });

    processedWrappers.forEach(
      wrapper => {
        setGreenhouseControlsProcessed(
          wrapper,
          false
        );
      }
    );

    const uniqueFields = new Map();

    [
      ...standardFields,
      ...customFields
    ].forEach(field => {
      uniqueFields.set(field.fieldId, field);
    });

    return [
      ...uniqueFields.values()
    ];
  };

const hasGreenhouseAnswerValue =
  value => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return (
      value !== "" &&
      value !== null &&
      value !== undefined
    );
  };

const comparableGreenhouseValue = value => {
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map(normalizeGreenhouseText).filter(Boolean).sort()
    );
  }
  return normalizeGreenhouseText(value);
};

const refreshGreenhouseAgentField = field => {
  if (
    field?.wrapper?.isConnected &&
    field?.ownerControl?.isConnected
  ) {
    return true;
  }

  const expectedLabel = normalizeGreenhouseText(field?.label);
  const wrapper = getGreenhouseDropdownWrappers()
    .sort((first, second) => {
      return getGreenhouseWrapperDepth(second) -
        getGreenhouseWrapperDepth(first);
    })
    .find(candidate => {
      if (!isGreenhouseVisible(candidate)) return false;
      if (
        normalizeGreenhouseText(getGreenhouseFieldLabel(candidate)) !==
        expectedLabel
      ) {
        return false;
      }

      const control = getGreenhouseControl(candidate);
      return Boolean(control.nativeSelect || control.input || control.trigger);
    });

  if (!wrapper) return false;

  const control = getGreenhouseControl(wrapper);
  const ownerControl = control.nativeSelect || control.input || control.trigger || wrapper;
  field.wrapper = wrapper;
  field.ownerControl = ownerControl;
  field.valueOwner = window.FastApplyUtils.getValueOwner?.(ownerControl) ||
    field.valueOwner;
  return true;
};

const releaseFailedGreenhouseOwnership = field => {
  if (!field) return;

  const ownerControl = field.ownerControl || field.wrapper;
  if (ownerControl) {
    window.FastApplyUtils.setValueOwner?.(ownerControl, "page");
    delete ownerControl.dataset.fa_agent_filled;
    delete ownerControl.dataset.fa_filled;
  }

  if (field.wrapper) {
    delete field.wrapper.dataset.fa_agent_filled;
    delete field.wrapper.dataset.fa_filled;
  }
};

const applyGreenhouseAgentAnswers =
  async answers => {
    const standardAnswers = [];

    const summary = {
      answered: 0,
      reviewRequired: 0,
      unresolved: 0,
      kept: 0,
      corrected: 0,
      conflicts: 0
    };

    for (const answer of answers || []) {
      const customField =
        greenhouseAgentFields.get(
          answer?.fieldId
        );

      if (!customField) {
        standardAnswers.push(answer);
        continue;
      }

      if (!refreshGreenhouseAgentField(customField)) {
        answer.action = "unresolved";
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The Greenhouse field was replaced or removed after the page audit.";
        summary.unresolved += 1;
        continue;
      }

      customField.valueOwner = window.FastApplyUtils.getValueOwner?.(
        customField.ownerControl
      ) || customField.valueOwner;

      const liveValue = customField.multiple
        ? getGreenhouseSelectedValues(customField.wrapper)
        : getGreenhouseCurrentValue(customField.wrapper);

      if (
        comparableGreenhouseValue(liveValue) !==
        comparableGreenhouseValue(customField.currentValue)
      ) {
        answer.action = "conflict";
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The field changed after the audit, so FastApply preserved the newer value.";
        markGreenhouseAgentState(customField.wrapper, "review", answer.reviewReason);
        summary.unresolved += 1;
        summary.conflicts += 1;
        summary.reviewRequired += 1;
        continue;
      }

      if (
        !hasGreenhouseAnswerValue(
          answer?.value
        )
      ) {
        const isValid = customField.ownerControl.getAttribute?.("aria-invalid") !== "true" &&
          (typeof customField.ownerControl.checkValidity !== "function" ||
            customField.ownerControl.checkValidity());

        if (
          customField.valueOwner === "user" &&
          hasGreenhouseAnswerValue(liveValue) &&
          isValid
        ) {
          answer.action = "keep";
          answer.value = liveValue;
          answer.source = "user";
          answer.confidence = 1;
          answer.requiresReview = false;
          answer.reviewReason = "";
          customField.ownerControl.dataset.fa_agent_validated = "true";
          markGreenhouseAgentState(customField.wrapper, "filled");
          summary.answered += 1;
          summary.kept += 1;
          continue;
        }

        markGreenhouseAgentState(
          customField.wrapper,
          "unresolved",
          answer?.reviewReason ||
            "No supported answer was available."
        );

        summary.unresolved += 1;
        continue;
      }

      const incomingValues =
        Array.isArray(answer.value)
          ? answer.value
          : [answer.value];

      const matchedValues = [
        ...new Set(
          incomingValues
            .map(value => {
              return resolveGreenhouseOption(
                value,
                customField.options,
                customField.label
              );
            })
            .filter(Boolean)
        )
      ];

      if (
        matchedValues.length === 0 ||
        matchedValues.length !== new Set(
          incomingValues.map(normalizeGreenhouseText).filter(Boolean)
        ).size
      ) {
        const originalValue =
          cleanGreenhouseText(
            Array.isArray(
              answer.value
            )
              ? answer.value.join(", ")
              : answer.value
          );

        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          customField.options.length === 0
            ? "FastApply could not read the available Greenhouse dropdown options."
            : `The stored answer "${originalValue}" did not safely match any available Greenhouse option.`;

        ghDebug(
          `agent: "${customField.label}" → ${answer.reviewReason}`
        );

        markGreenhouseAgentState(
          customField.wrapper,
          "unresolved",
          answer.reviewReason
        );

        summary.unresolved += 1;
        continue;
      }

      const valuesToApply =
        customField.multiple
          ? matchedValues
          : [matchedValues[0]];
      const targetValue = customField.multiple ? valuesToApply : valuesToApply[0];

      if (
        comparableGreenhouseValue(liveValue) ===
        comparableGreenhouseValue(targetValue)
      ) {
        answer.action = "keep";
        customField.ownerControl.dataset.fa_agent_validated = "true";
        markGreenhouseAgentState(
          customField.wrapper,
          answer.requiresReview ? "review" : "filled",
          answer.reviewReason || ""
        );
        summary.answered += 1;
        summary.kept += 1;
        if (answer.requiresReview) summary.reviewRequired += 1;
        continue;
      }

      if (
        hasGreenhouseAnswerValue(liveValue) &&
        customField.valueOwner === "user"
      ) {
        answer.action = "conflict";
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "FastApply preserved the manually entered value.";
        markGreenhouseAgentState(customField.wrapper, "review", answer.reviewReason);
        summary.unresolved += 1;
        summary.conflicts += 1;
        summary.reviewRequired += 1;
        continue;
      }

      answer.action = hasGreenhouseAnswerValue(liveValue) ? "replace" : "fill";

      if (customField.multiple && hasGreenhouseAnswerValue(liveValue)) {
        Array.from(customField.wrapper.querySelectorAll(
          'button[aria-label^="Remove"], [aria-label^="Remove"][role="button"]'
        )).filter(isGreenhouseVisible).forEach(button => button.click());
        await waitForGreenhouse(180);
        if (!refreshGreenhouseAgentField(customField)) {
          answer.value = "";
          answer.requiresReview = true;
          answer.reviewReason =
            "The Greenhouse field was replaced before its existing selections could be cleared.";
          summary.unresolved += 1;
          continue;
        }
      }

      let allFilled = true;

      for (
        const matchedValue of
          valuesToApply
      ) {
        if (!refreshGreenhouseAgentField(customField)) {
          allFilled = false;
          break;
        }

        const filled =
          await fillGreenhouseAgentDropdown(
            customField.wrapper,
            matchedValue,
            { multiple: customField.multiple }
          );

        if (!filled) {
          allFilled = false;
          break;
        }
      }

      if (!allFilled) {
        refreshGreenhouseAgentField(customField);
        releaseFailedGreenhouseOwnership(customField);
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The exact Greenhouse option was found, but the page did not confirm that it was selected.";

        ghDebug(
          `agent: "${customField.label}" → option matched but selection did not verify`
        );

        markGreenhouseAgentState(
          customField.wrapper,
          "unresolved",
          answer.reviewReason
        );

        summary.unresolved += 1;
        continue;
      }

      /*
       * Replace the model wording with the exact option
       * selected on the page. The side panel and stored
       * application will now show the real ATS value.
       */
      answer.value =
        customField.multiple
          ? valuesToApply
          : valuesToApply[0];

      summary.answered += 1;
      if (answer.action === "replace") {
        summary.corrected += 1;
      }

      if (
        answer.requiresReview === true
      ) {
        summary.reviewRequired += 1;
      }

      markGreenhouseAgentState(
        customField.wrapper,
        answer.requiresReview
          ? "review"
          : "filled",
        answer.reviewReason || ""
      );
    }

    const standardSummary =
      await window.FastApplyUtils
        .applyAgentAnswers(
          standardAnswers
        );

    return {
      answered:
        summary.answered +
        standardSummary.answered,

      reviewRequired:
        summary.reviewRequired +
        standardSummary.reviewRequired,

      unresolved:
        summary.unresolved +
        standardSummary.unresolved,

      kept:
        summary.kept +
        (standardSummary.kept || 0),

      corrected:
        summary.corrected +
        (standardSummary.corrected || 0),

      conflicts:
        summary.conflicts +
        (standardSummary.conflicts || 0)
    };
  };

const extractGreenhouseJobContext = () => {
  const clean = value => {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const getText = selectors => {
    for (const selector of selectors) {
      const element =
        document.querySelector(selector);

      const text = clean(
        element?.innerText ||
        element?.textContent
      );

      if (text) return text;
    }

    return "";
  };

  const company =
    document
      .querySelector(
        'meta[property="og:site_name"]'
      )
      ?.getAttribute("content") ||
    getText([
      ".company-name",
      '[class*="company-name"]',
      '[class*="company"]'
    ]);

  const jobTitle =
    getText([
      "h1",
      ".app-title",
      '[class*="job-title"]'
    ]) ||
    document
      .querySelector(
        'meta[property="og:title"]'
      )
      ?.getAttribute("content") ||
    document.title;

  const location = getText([
    ".location",
    '[class*="location"]'
  ]);

  const descriptionRoot =
    document.querySelector(
      "#content, main, article, .job-post, [class*='job-description']"
    ) ||
    document.body;

  return {
    company:
      clean(company).slice(0, 300),
    jobTitle:
      clean(jobTitle).slice(0, 300),
    jobUrl:
      window.location.href,
    location:
      clean(location).slice(0, 500),
    description:
      clean(
        descriptionRoot?.innerText
      ).slice(0, 30000),
    companyDescription: "",
    responsibilities: [],
    requirements: [],
    preferredQualifications: []
  };
};

const startEngine = () => {
  window.FastApplyUtils.loadProfileData((profileData, autofillEnabled) => {
    if (!autofillEnabled || !profileData) return;
    let attempts = 0;
    let passRunning = false;
    const interval = setInterval(async () => {
      // Dropdown passes are async (open, scroll, click, verify) — never let
      // a new polling tick start while the previous one is still driving a
      // dropdown, or two passes fight over the same open listbox.
      if (passRunning) return;
      passRunning = true;
      try {
        attempts++;
        if (await attemptAutofill(profileData)) console.log(`[FastApply] ✅ Greenhouse Autofill successful on attempt ${attempts}!`);
      } catch (error) {
        console.warn("[FastApply] Greenhouse autofill pass failed:", error);
      } finally {
        passRunning = false;
        if (attempts >= 20) {
          clearInterval(interval);
          console.log("[FastApply] 🏁 Greenhouse Autofill sequence completed.");
        }
      }
    }, 500);
  });
};

if (window.FastApplyAgent2Controller) {
  window.FastApplyAgent2Controller.register({
    atsPlatform: "greenhouse",

    runDeterministic: profile => {
      return attemptAutofill(profile);
    },

    collectFields:
      collectGreenhouseAgentFields,

    applyAnswers:
      applyGreenhouseAgentAnswers,

    extractJobContext:
      extractGreenhouseJobContext
  });
} else {
  console.warn(
    "[FastApply] Manual Agent 2 controller was not loaded for Greenhouse."
  );
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    startEngine
  );
} else {
  startEngine();
}
})();
