// public/greenhouse.js
console.log("[FastApply] Greenhouse Engine Active.");

// Notice: smartMatch is removed from here because it now lives safely in utils.js!

// --- REACT-SELECT GHOST CLICKER ---
const fillReactDropdown = (fieldWrapper, targetValue) => {
  if (fieldWrapper.dataset.fa_dropdown_processing === "true" || fieldWrapper.dataset.fa_filled === "true" || !targetValue) return false;

  const nativeSelect = fieldWrapper.querySelector('select');
  if (nativeSelect) {
    for (let i = 0; i < nativeSelect.options.length; i++) {
      if (smartMatch(nativeSelect.options[i].text, targetValue)) {
        nativeSelect.value = nativeSelect.options[i].value;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        fieldWrapper.dataset.fa_filled = "true";
        fieldWrapper.style.border = '2px solid #8b5cf6';
        return true;
      }
    }
    fieldWrapper.dataset.fa_filled = "true"; 
    return false;
  }

  const reactContainer = fieldWrapper.querySelector('[class*="-container"]');
  if (reactContainer) {
    const control = reactContainer.querySelector('[class*="-control"]') || reactContainer.firstElementChild;
    const toggleBtn = reactContainer.querySelector('button[aria-label="Toggle flyout"]');
    const clickTarget = toggleBtn || control;

    if (clickTarget) {
      fieldWrapper.dataset.fa_dropdown_processing = "true"; 

      clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      clickTarget.click();

      setTimeout(() => {
        let matchedOption = null;
        const options = document.querySelectorAll('[id*="-option"], [class*="-option"]');

        for (let i = 0; i < options.length; i++) {
          if (smartMatch(options[i].innerText, targetValue)) {
            matchedOption = options[i];
            break;
          }
        }

        if (matchedOption) {
          matchedOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          matchedOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          matchedOption.click();
          
          fieldWrapper.style.border = '2px solid #8b5cf6';
          fieldWrapper.style.borderRadius = '4px';
        } else {
          document.body.click(); 
        }
        
        fieldWrapper.dataset.fa_filled = "true";
        fieldWrapper.dataset.fa_dropdown_processing = "false"; 
      }, 250);

      return true; 
    }
  }
  return false;
};

// --- GREENHOUSE CUSTOM FIELD MAPPER ---
const handleGreenhouseCustoms = (profile) => {
  let filledAnything = false;
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const eeo = profile.eeo || {};
  const links = profile.websitesAndSkills || {};

  const fields = document.querySelectorAll('.field, .field-wrapper, .custom-field, .v2-make-it-custom, .select');

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.dataset.fa_filled === "true") continue;

    const labelTag = field.querySelector('label');
    if (!labelTag) continue;
    
    const questionText = labelTag.innerText.toLowerCase();
    const textInput = field.querySelector('input[type="text"]');

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
    const tryDropdown = (targetVal) => {
      if (fillReactDropdown(field, targetVal)) {
        filledAnything = true;
        return true; 
      }
      return false;
    };

    if (questionText.includes('based in the usa') || questionText.includes('based in the us.')) {
      const country = (cInfo.country || "").toLowerCase();
      const isUS = country === 'us' || country === 'usa' || country === 'united states' || country === 'america';
      if (tryDropdown(isUS ? "Yes" : "No")) return true; 
    }
    // Work/Visa checks
    else if (questionText.includes('authorized to work') || questionText.includes('legally entitled') || questionText.includes('legal right to work')) {
      if (tryDropdown(eeo.authorizedToWork)) return true;
    }
    else if (questionText.includes('visa sponsorship') || questionText.includes('require sponsorship') || questionText.includes('immigration sponsorship')) {
      if (tryDropdown(eeo.requireVisaFuture)) return true;
    }
    
    // --- Demographic EEO ---
    else if ((questionText.includes('hispanic') || questionText.includes('latino') || questionText.includes('latinx')) && !questionText.includes('race')) {
      if (eeo.optOut) {
        if (tryDropdown("decline")) return true;
      } else if (eeo.ethnicity && eeo.ethnicity.trim() !== "") {
        const isHisp = eeo.ethnicity.toLowerCase().includes('hispanic') || eeo.ethnicity.toLowerCase().includes('latino') || eeo.ethnicity.toLowerCase().includes('latinx');
        if (tryDropdown(isHisp ? "Yes" : "No")) return true;
      }
    }
    else if ((questionText.includes('gender') || questionText.includes('sex') || questionText.includes('identify as')) && !questionText.includes('transgender') && !questionText.includes('sexual orientation') && !questionText.includes('ethnicity') && !questionText.includes('race') && !questionText.includes('hispanic')) {
      if (tryDropdown(eeo.optOut ? "decline" : eeo.gender)) return true;
    }
    else if (questionText.includes('race')) {
      if (
        tryDropdown(
          eeo.optOut
            ? "decline"
            : eeo.race
        )
      ) {
        return true;
      }
    }
    else if (questionText.includes('ethnic')) {
      if (
        tryDropdown(
          eeo.optOut
            ? "decline"
            : eeo.ethnicity
        )
      ) {
        return true;
      }
    }
    else if (questionText.includes('veteran')) {
      if (tryDropdown(eeo.optOut ? "decline" : eeo.veteran)) return true;
    }
    else if (questionText.includes('disability')) {
      if (tryDropdown(eeo.optOut ? "decline" : eeo.disability)) return true;
    }
    else if (questionText.includes('transgender') && eeo.optOut) {
      if (tryDropdown("decline")) return true;
    }
    else if (questionText.includes('sexual orientation') && eeo.optOut) {
      if (tryDropdown("decline")) return true;
    }
    else if ((questionText.includes('parents/guardians') || questionText.includes('parents')) && eeo.optOut) {
      if (tryDropdown("decline")) return true; 
    }
  }

  return filledAnything;
};

// --- CORE ENGINE ---
const attemptAutofill = (profile) => {
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
    const locString = `${cInfo.city}, ${cInfo.country || ''}`.trim();
    if (window.FastApplyUtils.fillAutocomplete(locationInput, hiddenLocationInput, locString)) filledAnything = true;
  }

  if (handleGreenhouseCustoms(profile)) filledAnything = true;

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

const readAllGreenhouseOptions =
  async listbox => {
    const options = new Set();

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

    if (
      !listbox ||
      listbox.scrollHeight <=
        listbox.clientHeight
    ) {
      return [...options];
    }

    const originalScrollTop =
      listbox.scrollTop;

    let previousScrollTop = -1;

    for (
      let attempt = 0;
      attempt < 15;
      attempt += 1
    ) {
      collectVisibleOptions();

      const atBottom =
        listbox.scrollTop +
          listbox.clientHeight >=
        listbox.scrollHeight - 2;

      if (atBottom) break;

      previousScrollTop =
        listbox.scrollTop;

      listbox.scrollTop = Math.min(
        listbox.scrollHeight,
        listbox.scrollTop +
          Math.max(
            120,
            listbox.clientHeight * 0.8
          )
      );

      listbox.dispatchEvent(
        new Event("scroll", {
          bubbles: true
        })
      );

      await waitForGreenhouse(80);

      if (
        listbox.scrollTop ===
        previousScrollTop
      ) {
        break;
      }
    }

    collectVisibleOptions();

    listbox.scrollTop =
      originalScrollTop;

    listbox.dispatchEvent(
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

  return cleanedTriggerText;
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

const getGreenhouseWordSet = value => {
  return new Set(
    normalizeGreenhouseText(value)
      .split(" ")
      .filter(word => {
        return (
          word.length > 1 &&
          ![
            "a",
            "an",
            "the",
            "i",
            "am",
            "as",
            "of",
            "to",
            "in",
            "and",
            "or",
            "have",
            "has",
            "my"
          ].includes(word)
        );
      })
  );
};

const countGreenhouseOverlap = (
  first,
  second
) => {
  const firstWords =
    getGreenhouseWordSet(first);

  const secondWords =
    getGreenhouseWordSet(second);

  let overlap = 0;

  firstWords.forEach(word => {
    if (secondWords.has(word)) {
      overlap += 1;
    }
  });

  return overlap;
};

const classifyGreenhouseYesNo =
  value => {
    const normalized =
      normalizeGreenhouseText(value);

    if (!normalized) return "";

    if (
      /\bnot a veteran\b|\bhave not served\b|\bnot protected veteran\b|\bdo not\b|\bdont\b|\bno\b|\bfalse\b/.test(
        normalized
      )
    ) {
      return "no";
    }

    if (
      /\byes\b|\btrue\b|\bprotected veteran\b|\bi am a veteran\b/.test(
        normalized
      )
    ) {
      return "yes";
    }

    return "";
  };

const isGreenhouseDeclineValue =
  value => {
    return /\bdecline\b|\bprefer not\b|\bdont wish\b|\bdo not wish\b|\bchoose not\b/.test(
      normalizeGreenhouseText(value)
    );
  };

const resolveGreenhouseOption = (
  value,
  options,
  label
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

    if (
      isGreenhouseDeclineValue(value)
    ) {
      const declineOption =
        availableOptions.find(option => {
          return (
            /\bdecline\b|\bprefer not\b|\bdont wish\b|\bdo not wish\b/.test(
              normalizeGreenhouseText(
                option
              )
            )
          );
        });

      if (declineOption) {
        return declineOption;
      }
    }

    const normalizedLabel =
      normalizeGreenhouseText(label);

    const yesNo =
      classifyGreenhouseYesNo(value);

    if (yesNo) {
      const yesNoOptions =
        availableOptions.filter(option => {
          const normalizedOption =
            normalizeGreenhouseText(
              option
            );

          if (yesNo === "yes") {
            return (
              normalizedOption === "yes" ||
              normalizedOption.startsWith(
                "yes "
              ) ||
              /\bi am a veteran\b/.test(
                normalizedOption
              )
            );
          }

          return (
            normalizedOption === "no" ||
            normalizedOption.startsWith(
              "no "
            ) ||
            /\bnot a veteran\b/.test(
              normalizedOption
            )
          );
        });

      if (
        yesNoOptions.length === 1
      ) {
        return yesNoOptions[0];
      }

      if (
        normalizedLabel.includes(
          "veteran"
        )
      ) {
        const veteranOption =
          yesNoOptions.find(option => {
            return normalizeGreenhouseText(
              option
            ).includes("veteran");
          });

        if (veteranOption) {
          return veteranOption;
        }
      }
    }

    const containedMatches =
      availableOptions.filter(option => {
        const normalizedOption =
          normalizeGreenhouseText(
            option
          );

        return (
          normalizedOption.includes(
            normalizedValue
          ) ||
          normalizedValue.includes(
            normalizedOption
          )
        );
      });

    if (
      containedMatches.length === 1
    ) {
      return containedMatches[0];
    }

    const scoredOptions =
      availableOptions
        .map(option => ({
          option,
          score:
            countGreenhouseOverlap(
              value,
              option
            )
        }))
        .filter(item => {
          return item.score > 0;
        })
        .sort((first, second) => {
          return second.score - first.score;
        });

    if (scoredOptions.length === 0) {
      return "";
    }

    const best =
      scoredOptions[0];

    const second =
      scoredOptions[1];

    /*
     * Never guess when two options have the same
     * semantic score. For example, a stored value
     * of "Asian (East / South)" cannot safely choose
     * between separate East Asian and South Asian
     * form options without more specific evidence.
     */
    if (
      second &&
      second.score === best.score
    ) {
      return "";
    }

    return best.option;
  };

const findGreenhouseOptionElement = (
  options,
  targetValue
) => {
    const normalizedTarget =
      normalizeGreenhouseText(
        targetValue
      );

    return (
      options.find(option => {
        return (
          normalizeGreenhouseText(
            option.innerText ||
            option.textContent
          ) === normalizedTarget
        );
      }) ||
      options.find(option => {
        return window.FastApplyUtils
          .smartMatch(
            cleanGreenhouseText(
              option.innerText ||
              option.textContent
            ),
            targetValue
          );
      }) ||
      null
    );
  };

const fillGreenhouseAgentDropdown =
  async (
    wrapper,
    targetValue
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
      const filled =
        window.FastApplyUtils
          .fillDropdown(
            control.nativeSelect,
            target
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

    const optionElements =
      getGreenhouseOptionElements(
        listbox
      );

    const matchedOption =
      findGreenhouseOptionElement(
        optionElements,
        target
      );

    if (!matchedOption) {
      closeGreenhouseDropdown();
      return false;
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

    matchedOption.click();

    await waitForGreenhouse(180);

    const currentValue =
      getGreenhouseCurrentValue(
        wrapper
      );

    const verified =
      normalizeGreenhouseText(
        currentValue
      ).includes(
        normalizeGreenhouseText(
          target
        )
      ) ||
      window.FastApplyUtils.smartMatch(
        currentValue,
        target
      );

    if (!verified) return false;

    wrapper.dataset.fa_filled =
      "true";

    wrapper.dataset.fa_agent_filled =
      "true";

    return true;
  };

const collectGreenhouseAgentFields =
  async () => {
    greenhouseAgentFields.clear();

    const customFields = [];
    const processedWrappers = [];
    const customLabels = new Set();

    const wrappers =
      getGreenhouseDropdownWrappers();

    /*
     * First register every real Greenhouse dropdown.
     * Its internal search input is temporarily marked
     * processed so the generic collector cannot add
     * the same control again as a text input.
     */
    for (const wrapper of wrappers) {
      if (
        !isGreenhouseVisible(wrapper) ||
        wrapper.dataset.fa_filled ===
          "true"
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

      const currentValue =
        getGreenhouseCurrentValue(
          wrapper,
          control
        );

      if (currentValue) {
        /*
         * The visible Greenhouse control already has a
         * selected value. Do not collect a hidden or
         * internal search input as another empty field.
         */
        setGreenhouseControlsProcessed(
          wrapper,
          true
        );

        processedWrappers.push(
          wrapper
        );

        continue;
      }

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
        control.nativeSelect?.name || ""
      ].join("|");

      const fieldId =
        `fa_greenhouse_select_${hashGreenhouseText(identity)}`;

      const multiple =
        isGreenhouseMultipleSelect(
          wrapper,
          label
        );

      wrapper.dataset.fa_agent_field_id =
        fieldId;

      greenhouseAgentFields.set(
        fieldId,
        {
          wrapper,
          label,
          options,
          multiple
        }
      );

      customLabels.add(
        normalizeGreenhouseText(
          label
        )
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
        currentValue: "",
        maxLength: null
      });
    }

    const standardFields =
      window.FastApplyUtils
        .collectUnresolvedFields()
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
      const identity = [
        normalizeGreenhouseText(
          field.label
        ),
        field.type
      ].join("|");

      const existing =
        uniqueFields.get(identity);

      /*
       * Prefer the custom Greenhouse field because it
       * contains the real dropdown options.
       */
      if (
        !existing ||
        field.fieldId.startsWith(
          "fa_greenhouse_select_"
        )
      ) {
        uniqueFields.set(
          identity,
          field
        );
      }
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

const applyGreenhouseAgentAnswers =
  async answers => {
    const standardAnswers = [];

    const summary = {
      answered: 0,
      reviewRequired: 0,
      unresolved: 0
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

      if (
        !hasGreenhouseAnswerValue(
          answer?.value
        )
      ) {
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
        matchedValues.length === 0
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

      let allFilled = true;

      for (
        const matchedValue of
          valuesToApply
      ) {
        const filled =
          await fillGreenhouseAgentDropdown(
            customField.wrapper,
            matchedValue
          );

        if (!filled) {
          allFilled = false;
          break;
        }
      }

      if (!allFilled) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The exact Greenhouse option was found, but the page did not confirm that it was selected.";

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
      window.FastApplyUtils
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
        standardSummary.unresolved
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
  chrome.storage.local.get(['autofillEnabled', 'profileData'], (res) => {
    if (res.autofillEnabled === false || !res.profileData) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attemptAutofill(res.profileData)) console.log(`[FastApply] ✅ Greenhouse Autofill successful on attempt ${attempts}!`);
      
      if (attempts >= 20) {
        clearInterval(interval);
        console.log("[FastApply] 🏁 Greenhouse Autofill sequence completed.");
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