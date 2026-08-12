// public/workday-personal.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;

  const PLACEHOLDER_PATTERN = /^(select|select one|choose|choose one|please select|search)$/i;
  const CONTROL_SELECTOR = [
    "input:not([type='hidden']):not([type='checkbox']):not([type='radio'])",
    "textarea"
  ].join(",");

  const hasProtectedOwner = element => Boolean(
    element?.dataset?.fa_user_owned === "true" ||
    element?.dataset?.fa_manual === "true" ||
    element?.dataset?.fa_agent_filled === "true" ||
    element?.closest?.('[data-fa-user-owned="true"], [data-fa-agent-filled="true"]')
  );

  const getLinkedControl = (label, container) => {
    const linked = label?.control || (() => {
      const labelFor = label?.getAttribute?.("for");
      if (!labelFor) return null;
      return label.getRootNode()?.getElementById?.(labelFor) ||
        document.getElementById(labelFor);
    })();

    return linked?.matches?.(CONTROL_SELECTOR)
      ? linked
      : container?.querySelector?.(CONTROL_SELECTOR) || null;
  };

  W.isWorkdayPlaceholder = W.isWorkdayPlaceholder || (value => {
    const normalized = W.normalizeText?.(value) || String(value || "").trim().toLowerCase();
    return !normalized || PLACEHOLDER_PATTERN.test(normalized);
  });

  W.canFillDeterministicControl = W.canFillDeterministicControl || (element => {
    if (!element || element.disabled || element.readOnly || hasProtectedOwner(element)) {
      return false;
    }

    if (typeof W.canDeterministicallyWrite === "function") {
      return W.canDeterministicallyWrite(element);
    }

    return !String(element.value || "").trim();
  });

  W.fillDeterministicText = W.fillDeterministicText || ((element, value, options = {}) => {
    const target = String(value ?? "").trim();
    if (!target || !W.canFillDeterministicControl(element)) return false;
    return W.fillTextField?.(element, target, options) === true;
  });

  W.fillDeterministicDropdown = W.fillDeterministicDropdown || (async (
    container,
    value
  ) => {
    const target = String(value ?? "").trim();
    if (!container || !target || hasProtectedOwner(container)) return false;

    const trigger = container.querySelector([
      '[data-automation-id="selectWidget"]',
      '[role="combobox"][aria-haspopup="listbox"]',
      'input[role="combobox"]',
      '[aria-haspopup="listbox"]'
    ].join(","));

    if (!trigger || hasProtectedOwner(trigger)) return false;
    const current = W.readDropdownValue?.(container, trigger) || "";
    if (!W.isWorkdayPlaceholder(current)) return false;
    return await W.fillWorkdayDropdown?.(container, target) === true;
  });

  const COUNTRY_ALIASES = new Map([
    ["us", "United States of America"],
    ["usa", "United States of America"],
    ["united states", "United States of America"],
    ["united states of america", "United States of America"],
    ["uk", "United Kingdom"],
    ["great britain", "United Kingdom"],
    ["england", "United Kingdom"],
    ["uae", "United Arab Emirates"]
  ]);

  const normalizeCountry = country => {
    const value = String(country || "").trim();
    return COUNTRY_ALIASES.get(W.normalizeText(value)) || value;
  };

  const US_STATE_NAMES = new Map(Object.entries({
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
    CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
    KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
    WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia"
  }));

  const normalizeState = (state, country) => {
    const value = String(state || "").trim();
    const countryKey = W.normalizeText(country);
    const isUnitedStates = [
      "us", "usa", "united states", "united states of america"
    ].includes(countryKey);
    return isUnitedStates
      ? (US_STATE_NAMES.get(value.toUpperCase()) || value)
      : value;
  };

  const getCountryCallingCode = country => {
    const key = W.normalizeText(country);
    if (["us", "usa", "united states", "united states of america", "canada"].includes(key)) {
      return "1";
    }
    if (["sri lanka", "lk", "lka"].includes(key)) return "94";
    if (["united kingdom", "uk", "great britain", "england"].includes(key)) return "44";
    if (["india", "in", "ind"].includes(key)) return "91";
    if (["australia", "au", "aus"].includes(key)) return "61";
    if (["new zealand", "nz", "nzl"].includes(key)) return "64";
    return "";
  };

  const formatNationalPhone = (rawPhone, country) => {
    const raw = String(rawPhone || "").trim();
    if (!raw) return "";

    let digits = raw.replace(/\D/g, "");
    const callingCode = getCountryCallingCode(country);

    if (raw.startsWith("+") && callingCode && digits.startsWith(callingCode)) {
      digits = digits.slice(callingCode.length);
    }

    const countryKey = W.normalizeText(country);
    const isNanp = [
      "us",
      "usa",
      "united states",
      "united states of america",
      "canada"
    ].includes(countryKey);

    if (isNanp && digits.length === 11 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }

    if (isNanp && digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    if (["sri lanka", "lk", "lka"].includes(countryKey) && digits.length === 9) {
      return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
    }

    // Workday stores the calling code in a separate control. Keep the national
    // number free of a duplicated international prefix when no safe mask is known.
    return digits;
  };

  W.normalizeWorkdayCountry = W.normalizeWorkdayCountry || normalizeCountry;
  W.formatWorkdayNationalPhone = W.formatWorkdayNationalPhone || formatNationalPhone;

  W.handlePersonalInfo = async profile => {
    if (W.isProcessingPersonal) return false;
    W.isProcessingPersonal = true;

    try {
      const personal = profile.personalInfo || {};
      const contact = profile.contactInfo || {};
      const country = normalizeCountry(contact.country);
      const callingCode = getCountryCallingCode(contact.country);
      const phoneCountryTarget = country && callingCode
        ? `${country} (+${callingCode})`
        : country;
      const labels = Array.from(document.querySelectorAll("label")).filter(W.isVisible);
      let filledAnything = false;

      const fillKnownInput = (selectors, value, options = {}) => {
        const element = selectors
          .map(selector => document.querySelector(selector))
          .find(candidate => candidate && W.isVisible(candidate));
        if (!element) return false;
        return W.fillDeterministicText(element, value, options);
      };

      // Workday tenants occasionally render the input before its label is
      // linked into the accessibility tree. Fill stable automation controls
      // first, then use the label-based pass below for tenant-specific fields.
      filledAnything = fillKnownInput([
        'input[data-automation-id="legalNameSection_firstName"]',
        'input[data-automation-id="firstName"]'
      ], personal.firstName) || filledAnything;
      filledAnything = fillKnownInput([
        'input[data-automation-id="legalNameSection_lastName"]',
        'input[data-automation-id="lastName"]'
      ], personal.lastName) || filledAnything;
      filledAnything = fillKnownInput([
        'input[data-automation-id="addressSection_addressLine1"]',
        'input[data-automation-id="addressLine1"]'
      ], contact.addressLine1) || filledAnything;
      filledAnything = fillKnownInput([
        'input[data-automation-id="addressSection_addressLine2"]',
        'input[data-automation-id="addressLine2"]'
      ], contact.addressLine2) || filledAnything;
      filledAnything = fillKnownInput([
        'input[data-automation-id="addressSection_city"]',
        'input[data-automation-id="addressSection_municipality"]',
        'input[data-automation-id="city"]'
      ], contact.city) || filledAnything;
      filledAnything = fillKnownInput([
        'input[data-automation-id="addressSection_postalCode"]',
        'input[data-automation-id="postalCode"]'
      ], contact.postalCode) || filledAnything;
      filledAnything = fillKnownInput([
        'input[data-automation-id="phone-number"]',
        'input[data-automation-id="phoneNumber"]',
        'input[type="tel"]'
      ], formatNationalPhone(contact.phone, contact.country), {
        typeCharacters: true
      }) || filledAnything;

      for (const label of labels) {
        const question = W.normalizeText(W.getElementText(label));
        if (!question) continue;
        const container = W.getFieldContainer(label);
        if (!container) continue;
        const input = getLinkedControl(label, container);

        if (
          question.includes("preferred first name") ||
          question.includes("preferred given name")
        ) {
          filledAnything = W.fillDeterministicText(input, personal.preferredName) || filledAnything;
        } else if (question.includes("have a preferred name")) {
          const checkbox = label.control || container.querySelector('input[type="checkbox"]');
          if (personal.preferredName && checkbox && !checkbox.checked &&
            !window.FastApplyUtils?.isProtectedFromDeterministicFill?.(checkbox)) {
            checkbox.click();
            if (checkbox.checked) {
              checkbox.dataset.fa_filled = "true";
              window.FastApplyUtils?.setValueOwner?.(checkbox, "deterministic");
              filledAnything = true;
            }
          }
        } else if (question.includes("given name") || question === "first name") {
          filledAnything = W.fillDeterministicText(input, personal.firstName) || filledAnything;
        } else if (question.includes("family name") || question === "last name") {
          filledAnything = W.fillDeterministicText(input, personal.lastName) || filledAnything;
        } else if (question.includes("address line 1")) {
          filledAnything = W.fillDeterministicText(input, contact.addressLine1) || filledAnything;
        } else if (question.includes("address line 2")) {
          filledAnything = W.fillDeterministicText(input, contact.addressLine2) || filledAnything;
        } else if (question === "city") {
          filledAnything = W.fillDeterministicText(input, contact.city) || filledAnything;
        } else if (question.includes("postal code") || question === "zip") {
          filledAnything = W.fillDeterministicText(input, contact.postalCode) || filledAnything;
        } else if (
          question.includes("phone number") &&
          !question.includes("extension")
        ) {
          filledAnything = W.fillDeterministicText(
            input,
            formatNationalPhone(contact.phone, contact.country),
            { typeCharacters: true }
          ) || filledAnything;
        } else if (question.includes("phone device type")) {
          filledAnything = await W.fillDeterministicDropdown(container, "Mobile") || filledAnything;
        } else if (
          question.includes("country territory phone code") ||
          question.includes("country phone code") ||
          question.includes("calling code")
        ) {
          filledAnything = await W.fillDeterministicDropdown(
            container,
            phoneCountryTarget
          ) || filledAnything;
        } else if (
          question === "state" ||
          question === "state province" ||
          question.includes("state region")
        ) {
          filledAnything = await W.fillDeterministicDropdown(
            container,
            normalizeState(contact.state, contact.country)
          ) || filledAnything;
        } else if (
          (question === "country" || question.includes("country territory")) &&
          !question.includes("phone code")
        ) {
          filledAnything = await W.fillDeterministicDropdown(container, country) || filledAnything;
        } else if (question.includes("email address")) {
          filledAnything = W.fillDeterministicText(input, contact.email) || filledAnything;
        }
      }

      return filledAnything;
    } finally {
      W.isProcessingPersonal = false;
    }
  };
})();
