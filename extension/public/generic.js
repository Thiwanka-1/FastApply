//generic.js
console.log("[FastApply] Generic Universal Engine Active.");

// Engine scripts share one isolated world; an IIFE keeps top-level
// declarations from colliding with utils.js or other scripts.
(() => {

const U = window.FastApplyUtils;


const sendRuntimeMessage = request => {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(request, response => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message
        });

        return;
      }

      resolve(response);
    });
  });
};

const getLocalStorage = keys => {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, resolve);
  });
};

const getMemoryMap = profile => {
  const map = new Map();

  (
    profile?.applicationMemory?.answers || []
  ).forEach(item => {
    const key = String(item?.key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (key) {
      map.set(key, item.answer);
    }
  });

  return map;
};

const getMemoryValue = (memory, key) => {
  const normalized = String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return memory.get(normalized) || "";
};

const extractText = selectors => {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const text = element?.innerText?.trim();

    if (text) return text;
  }

  return "";
};

const extractJobLocation = () => {
  return extractText([
    '[data-testid*="location"]',
    '[data-test*="location"]',
    '[class*="job-location"]',
    '[class*="location"]',
    '[id*="location"]'
  ]).slice(0, 500);
};

const inferJobCountry = jobLocation => {
  const text = [
    jobLocation,
    document.title,
    window.location.hostname,
    window.location.pathname
  ].join(" ").toLowerCase();

  if (
    /\bcanada\b|\bcanadian\b|\bvancouver\b|\btoronto\b|\bmontreal\b|\bcalgary\b|\bottawa\b|\bbritish columbia\b|\bontario\b|\balberta\b/.test(
      text
    )
  ) {
    return "Canada";
  }

  if (
    /\bunited states\b|\busa\b|\bu\.s\.\b|\baustin\b|\btexas\b|\bcalifornia\b|\bnew york\b|\bseattle\b/.test(
      text
    )
  ) {
    return "United States";
  }

  return "";
};

const getCountryAwareAnswer = (
  memory,
  country,
  type
) => {
  if (type === "authorization") {
    if (country === "Canada") {
      return getMemoryValue(
        memory,
        "authorizedToWorkCanada"
      );
    }

    if (country === "United States") {
      return getMemoryValue(
        memory,
        "authorizedToWorkUSA"
      );
    }
  }

  if (type === "sponsorship") {
    if (country === "Canada") {
      return getMemoryValue(
        memory,
        "requiresCanadaSponsorship"
      );
    }

    if (country === "United States") {
      // The backend memory key is sponsorshipRequired (US is the default
      // sponsorship question); "requiresUSSponsorship" never existed, so US
      // sponsorship answers always came back empty.
      return getMemoryValue(memory, "sponsorshipRequired") ||
        getMemoryValue(memory, "requiresUSSponsorship");
    }
  }

  return "";
};

const handleGenericCustoms = profile => {
  let filledAnything = false;

  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const eeo = profile.eeo || {};
  const links = profile.websitesAndSkills || {};
  const memory = getMemoryMap(profile);

  const jobLocation = extractJobLocation();
  const jobCountry = inferJobCountry(jobLocation);

  const fields = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="password"]), select, textarea'
  );

  fields.forEach(field => {
    if (
      field.dataset.fa_filled === "true" ||
      field.disabled ||
      field.readOnly ||
      String(field.value || "").trim()
    ) {
      return;
    }

    const labelText = (
      U.getLabelText(field) || ""
    ).toLowerCase();

    if (!labelText) return;

    let targetValue = "";

    if (/(first|given).*name/i.test(labelText)) {
      targetValue = pInfo.firstName;
    } else if (/(last|family|sur).*name/i.test(labelText)) {
      targetValue = pInfo.lastName;
    } else if (/(full.*name|^name\*?$)/i.test(labelText)) {
      targetValue = `${pInfo.firstName || ""} ${pInfo.lastName || ""}`.trim();
    } else if (/email/i.test(labelText)) {
      targetValue = cInfo.email;
    } else if (/(phone|mobile|cell|telephone)/i.test(labelText)) {
      // Preserve the international prefix; stripping to bare digits corrupted
      // non-US numbers ("+94 71 …" became "9471…").
      targetValue = U.formatPhoneNumber(cInfo.phone);
    } else if (/(address line 1|street address)/i.test(labelText)) {
      targetValue = cInfo.addressLine1;
    } else if (/city/i.test(labelText)) {
      targetValue = cInfo.city;
    } else if (/(zip|postal)/i.test(labelText)) {
      targetValue = cInfo.postalCode;
    } else if (/(state|province)/i.test(labelText)) {
      targetValue = cInfo.state;
    } else if (/country/i.test(labelText)) {
      targetValue = cInfo.country;
    } else if (/linkedin/i.test(labelText)) {
      targetValue = links.linkedin;
    } else if (/github/i.test(labelText)) {
      targetValue = links.github;
    } else if (/(portfolio|website|url)/i.test(labelText)) {
      targetValue = links.portfolio || links.github;
    } else if (/pronoun/i.test(labelText)) {
      targetValue = pInfo.pronouns;
    } else if (/\brace\b/i.test(labelText)) {
      targetValue = eeo.optOut
        ? "prefer not to answer"
        : eeo.race;
    } else if (/ethnic/i.test(labelText)) {
      targetValue = eeo.optOut
        ? "prefer not to answer"
        : eeo.ethnicity;
    } else if (/(gender|sex)/i.test(labelText)) {
      targetValue = eeo.optOut
        ? "prefer not to answer"
        : eeo.gender;
    } else if (/veteran/i.test(labelText)) {
      targetValue = eeo.optOut
        ? "prefer not to answer"
        : eeo.veteran;
    } else if (/(disability|impairment)/i.test(labelText)) {
      targetValue = eeo.optOut
        ? "don't wish to answer"
        : eeo.disability;
    } else if (/(authorized|legally authorised|legally authorized)/i.test(labelText)) {
      targetValue = getCountryAwareAnswer(
        memory,
        jobCountry,
        "authorization"
      );
    } else if (/(sponsor|require.*visa|visa.*sponsor)/i.test(labelText)) {
      targetValue = getCountryAwareAnswer(
        memory,
        jobCountry,
        "sponsorship"
      );
    }

    if (!targetValue) return;

    if (field.tagName === "SELECT") {
      if (U.fillDropdown(field, targetValue)) {
        filledAnything = true;
      }
    } else if (U.fillField(field, targetValue)) {
      filledAnything = true;
    }
  });

  const radioGroups = {};
  let fallbackId = 0;

  document
    .querySelectorAll('input[type="radio"]')
    .forEach(radio => {
      const groupKey =
        radio.name ||
        radio.closest("fieldset")?.id ||
        `generic_fallback_${fallbackId++}`;

      if (!radioGroups[groupKey]) {
        radioGroups[groupKey] = [];
      }

      radioGroups[groupKey].push(radio);
    });

  Object.values(radioGroups).forEach(group => {
    if (
      group.length === 0 ||
      group.some(radio => radio.checked) ||
      group[0].dataset.fa_filled === "true"
    ) {
      return;
    }

    const groupText = (
      U.getLabelText(group[0]) ||
      group[0].closest(
        "fieldset, .form-group, [role='radiogroup'], div"
      )?.innerText ||
      ""
    ).toLowerCase();

    let target = "";

    if (/\brace\b/i.test(groupText)) {
      target = eeo.optOut
        ? "prefer not to answer"
        : eeo.race;
    } else if (/ethnic/i.test(groupText)) {
      target = eeo.optOut
        ? "prefer not to answer"
        : eeo.ethnicity;
    } else if (/(gender|sex)/i.test(groupText)) {
      target = eeo.optOut
        ? "prefer not to answer"
        : eeo.gender;
    } else if (/veteran/i.test(groupText)) {
      target = eeo.optOut
        ? "prefer not to answer"
        : eeo.veteran;
    } else if (/(disability|impairment)/i.test(groupText)) {
      target = eeo.optOut
        ? "don't wish to answer"
        : eeo.disability;
    } else if (/(sponsor|require.*visa|visa.*sponsor)/i.test(groupText)) {
      target = getCountryAwareAnswer(
        memory,
        jobCountry,
        "sponsorship"
      );
    } else if (/(authorized|legally authorised|legally authorized)/i.test(groupText)) {
      target = getCountryAwareAnswer(
        memory,
        jobCountry,
        "authorization"
      );
    }

    if (target && U.fillRadio(group, target)) {
      filledAnything = true;
    }
  });

  return filledAnything;
};

const extractJobContext = () => {
  const h1 = extractText(["h1"]);

  const metaTitle =
    document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content") || "";

  const company =
    document
      .querySelector('meta[property="og:site_name"]')
      ?.getAttribute("content") ||
    extractText([
      '[data-testid*="company"]',
      '[class*="company-name"]',
      '[class*="company"]'
    ]);

  const descriptionRoot =
    document.querySelector(
      "main, article, [class*='job-description'], [id*='job-description']"
    ) ||
    document.body;

  const description = String(
    descriptionRoot?.innerText || ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);

  return {
    company: String(company).trim().slice(0, 300),
    jobTitle: String(
      h1 || metaTitle || document.title
    ).trim().slice(0, 300),
    jobUrl: window.location.href,
    location: extractJobLocation(),
    description,
    companyDescription: "",
    responsibilities: [],
    requirements: [],
    preferredQualifications: []
  };
};

const looksLikeJobApplicationPage = () => {
  const urlText = `${window.location.hostname} ${window.location.pathname}`
    .toLowerCase();

  if (/\b(job|jobs|career|careers|apply|application)\b/.test(urlText)) {
    return true;
  }

  const pageSignals = String(
    document.querySelector("main, form")?.innerText || ""
  )
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, 12000);

  const hasApplicationLanguage =
    /apply (for|to) (this|the) (job|position)|job application|submit application/.test(
      pageSignals
    );

  const hasCandidateFields = Boolean(
    document.querySelector(
      [
        'input[type="file"][name*="resume" i]',
        'input[type="file"][id*="resume" i]',
        'input[name*="linkedin" i]',
        'input[id*="linkedin" i]'
      ].join(",")
    )
  );

  return hasApplicationLanguage || hasCandidateFields;
};

const loadProfile = async () => {
  const stored = await getLocalStorage([
    "autofillEnabled",
    "profileData"
  ]);

  if (stored.autofillEnabled === false) {
    return null;
  }

  if (stored.profileData) {
    return stored.profileData;
  }

  const response = await sendRuntimeMessage({
    action: "FETCH_PROFILE_DATA"
  });

  return response?.success
    ? response.data
    : null;
};

const startGenericEngine = async () => {
  if (!looksLikeJobApplicationPage()) {
    console.log(
      "[FastApply] Generic autofill paused because this does not look like a job application page."
    );
    return;
  }

  let profile = await loadProfile();

  if (!profile) {
    console.warn(
      "[FastApply] No authenticated profile available."
    );

    return;
  }

  if (
    document.querySelectorAll(
      "form, input, select, textarea"
    ).length === 0
  ) {
    return;
  }

  console.log(
    "[FastApply] Initiating Generic Universal Observer."
  );

  const runCycle = () => {
    handleGenericCustoms(profile);
  };

  runCycle();

  const observer = new MutationObserver(mutations => {
    const hasAddedFields = mutations.some(mutation => {
      return Array.from(mutation.addedNodes || []).some(node => {
        return (
          node.nodeType === Node.ELEMENT_NODE &&
          (
            node.matches?.(
              "input, select, textarea, form"
            ) ||
            node.querySelector?.(
              "input, select, textarea"
            )
          )
        );
      });
    });

    if (hasAddedFields) {
      runCycle();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.profileData?.newValue) {
      profile = changes.profileData.newValue;
    }
  });
};

if (window.FastApplyAgent2Controller) {
  window.FastApplyAgent2Controller.register({
    atsPlatform: "generic",

    runDeterministic: profile => {
      return handleGenericCustoms(profile);
    },

    extractJobContext
  });
} else {
  console.warn(
    "[FastApply] Manual Agent 2 controller was not loaded for the generic engine."
  );
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    startGenericEngine,
    { once: true }
  );
} else {
  startGenericEngine();
}
})();
