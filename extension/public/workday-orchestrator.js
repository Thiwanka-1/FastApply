// public/workday-orchestrator.js
console.log("[FastApply] Workday Orchestrator Active.");

window.WorkdayEngine = window.WorkdayEngine || {};

// --- SHARED UTILS ---
window.WorkdayEngine.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

window.WorkdayEngine.getTodayDate = () => {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const yyyy = today.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

window.WorkdayEngine.formatMonthYear = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{2}\/\d{4}$/.test(raw)) return raw;
  if (/^\d{1}\/\d{4}$/.test(raw)) {
    const [m, y] = raw.split("/");
    return `${m.padStart(2, "0")}/${y}`;
  }
  if (/^\d{4}-\d{2}/.test(raw)) {
    const [y, m] = raw.split("-");
    return `${m}/${y}`;
  }
  const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  const parts = raw.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const month = months[parts[0].toLowerCase().slice(0, 3)];
    const year = parts.find((p) => /^\d{4}$/.test(p));
    if (month && year) return `${month}/${year}`;
  }
  return raw;
};

window.WorkdayEngine.isVisible = (el) => {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
};

window.WorkdayEngine.workdaySmartMatch = (optText, targetValue) => {
  const o = String(optText || "").toLowerCase().trim();
  const t = String(targetValue || "").toLowerCase().trim();
  if (!o || !t) return false;

  if ((t.includes("decline") || t.includes("prefer not")) && (o.includes("decline") || o.includes("prefer not") || o.includes("not wish") || o.includes("choose not"))) return true;

  const isTargetMale = t === "male" || t === "man";
  const isTargetFemale = t === "female" || t === "woman";
  const isOptMale = /\b(male|man)\b/i.test(o) && !/\b(female|woman)\b/i.test(o);
  const isOptFemale = /\b(female|woman)\b/i.test(o);

  if (isTargetMale && isOptMale) return true;
  if (isTargetFemale && isOptFemale) return true;

  if (!isTargetMale && !isTargetFemale) {
    if (o === t) return true;
    if (o.includes(t) || t.includes(o)) return true;
    const tTokens = t.split(/[\s,()/:-]+/).filter(Boolean);
    const oTokens = o.split(/[\s,()/:-]+/).filter(Boolean);
    for (let token of tTokens) {
      if (token.length > 3 && oTokens.includes(token)) return true;
    }
  }

  if (t.includes("veteran") && o.includes("veteran")) {
    const targetIsNo = t.includes("not") || t.includes("no");
    const optIsNo = o.includes("not") || o.includes("no");
    if (targetIsNo && optIsNo) return true;
    if (!targetIsNo && !optIsNo) return true;
  }

  if (t.startsWith("yes") && o.startsWith("yes")) return true;
  if (t.startsWith("no") && o.startsWith("no")) return true;
  if (t.includes("asian") && o.includes("asian")) return true;
  if (t.includes("black") && (o.includes("black") || o.includes("african"))) return true;
  if ((t.includes("hispanic") || t.includes("latino") || t.includes("latinx")) && (o.includes("latinx") || o.includes("hispanic") || o.includes("latino"))) return true;
  if (t.includes("white") && o.includes("white")) return true;
  if (t.includes("agree") && o.includes("agree") && !o.includes("do not")) return true;

  return false;
};

window.WorkdayEngine.fillWorkdayDropdown = (container, targetValue) => {
  if (!container || !targetValue || container.dataset.fa_dropdown_processing === "true" || container.dataset.fa_filled === "true") return false;
  const trigger = container.querySelector('[data-automation-id="selectWidget"], button, [role="combobox"], [role="listbox"]');
  if (!trigger) return false;

  container.dataset.fa_dropdown_processing = "true";
  try {
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    trigger.click();
  } catch (e) {
    container.dataset.fa_dropdown_processing = "false";
    return false;
  }

  setTimeout(() => {
    let matchedOption = null;
    const options = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);

    for (let i = 0; i < options.length; i++) {
      if (window.WorkdayEngine.workdaySmartMatch(options[i].innerText, targetValue)) {
        matchedOption = options[i];
        break;
      }
    }

    if (!matchedOption) {
      const searchInput = document.querySelector('[data-automation-id="searchBox"]');
      if (searchInput) {
        window.FastApplyUtils.fillField(searchInput, targetValue);
        setTimeout(() => {
          const newOptions = Array.from(document.querySelectorAll('[data-automation-id="promptOption"], [role="option"], li')).filter(window.WorkdayEngine.isVisible);
          for (let i = 0; i < newOptions.length; i++) {
            if (window.WorkdayEngine.workdaySmartMatch(newOptions[i].innerText, targetValue)) {
              matchedOption = newOptions[i];
              break;
            }
          }
          if (matchedOption) {
            matchedOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
            matchedOption.click();
            container.dataset.fa_filled = "true";
            trigger.style.border = "2px solid #8b5cf6";
          } else {
            searchInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
          }
          container.dataset.fa_dropdown_processing = "false";
        }, 500);
        return;
      }
    }

    if (matchedOption) {
      matchedOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      matchedOption.click();
      container.dataset.fa_filled = "true";
      trigger.style.border = "2px solid #8b5cf6";
    } else {
      document.body.click();
    }
    container.dataset.fa_dropdown_processing = "false";
  }, 500);
  return true;
};

// --- ROUTER FIX: ONLY READ LABELS AND HEADINGS ---
const getCurrentPage = () => {
  // Grab text ONLY from labels and headings. This ignores the progress tracker at the top!
  const labelsText = Array.from(document.querySelectorAll('label')).map(l => l.innerText.toLowerCase()).join(" ");
  const headingsText = Array.from(document.querySelectorAll('h2, h3, h4, h5')).map(h => h.innerText.toLowerCase()).join(" ");

  // 1. EEO / Voluntary Disclosures
  if (headingsText.includes("voluntary disclosures") || headingsText.includes("self identify") || labelsText.includes("gender") || labelsText.includes("veteran") || labelsText.includes("ethnicity")) {
    return "EEO_DISCLOSURES";
  }

  // 2. Experience & Education
  // FIX: Look for "Add Another" buttons too!
  const hasAddButtons = Array.from(document.querySelectorAll('button')).some(b => {
      const text = b.innerText.trim().toLowerCase();
      return text === "add" || text === "add another";
  });
  
  if (headingsText.includes("work experience") || headingsText.includes("education") || labelsText.includes("type to add skills") || hasAddButtons) {
    return "EXPERIENCE_EDUCATION";
  }

  // 3. Personal Information
  if (labelsText.includes("given name") || labelsText.includes("address line 1") || document.querySelector('input[type="email"]')) {
    return "PERSONAL_INFO";
  }

  return "UNKNOWN";
};

// --- MAIN LOOP ---
const startEngine = () => {
  chrome.storage.local.get(["autofillEnabled", "profileData"], (res) => {
    if (res.autofillEnabled === false || !res.profileData) return;

    setInterval(() => {
      // 1. Are there unfilled text inputs?
      const needsFilling = document.querySelectorAll(
        'input:not([data-fa_filled="true"]):not([type="hidden"]), textarea:not([data-fa_filled="true"])'
      ).length > 0;
      
      // 2. Are there unclicked "Add" OR "Add Another" buttons for our sections?
      const needsExpanding = Array.from(document.querySelectorAll('button')).some(b => {
          const text = b.innerText.trim().toLowerCase();
          return (text === "add" || text === "add another") && b.dataset.fa_expanded !== "true";
      });

      // If either is true, run the page logic!
      if (needsFilling || needsExpanding) {
        const currentPage = getCurrentPage();
        
        switch(currentPage) {
          case "PERSONAL_INFO":
            if(window.WorkdayEngine.handlePersonalInfo) window.WorkdayEngine.handlePersonalInfo(res.profileData);
            break;
          case "EXPERIENCE_EDUCATION":
            if(window.WorkdayEngine.handleExperience) window.WorkdayEngine.handleExperience(res.profileData);
            break;
          case "EEO_DISCLOSURES":
            if(window.WorkdayEngine.handleEEO) window.WorkdayEngine.handleEEO(res.profileData);
            break;
        }
      }
    }, 1500);
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startEngine);
} else {
  startEngine();
}