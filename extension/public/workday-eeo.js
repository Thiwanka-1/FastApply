// public/workday-eeo.js
window.WorkdayEngine = window.WorkdayEngine || {};

window.WorkdayEngine.handleEEO = (profile) => {
  const pInfo = profile.personalInfo || {};
  const eeo = profile.eeo || {};
  const optOut = !!eeo.optOut;

  const labels = document.querySelectorAll("label");

  labels.forEach((label) => {
    const questionText = label.innerText.toLowerCase().replace(/\*/g, "").trim();
    if (!questionText) return;

    let container = label.parentElement;
    for (let i = 0; i < 4; i++) {
      if (container && container.querySelector("input, select, textarea, [data-automation-id='selectWidget']")) break;
      if (container && container.parentElement) container = container.parentElement;
    }
    if (!container) return;

    let textInput = container.querySelector("input[type='text']");
    let radios = Array.from(container.querySelectorAll("input[type='radio']"));
    let checkboxes = Array.from(container.querySelectorAll("input[type='checkbox']"));

    // Authorization
    if (questionText.includes("authorized to work")) {
      if (radios.length > 0 && eeo.authorizedToWork) window.FastApplyUtils.fillRadio(radios, eeo.authorizedToWork);
      window.WorkdayEngine.fillWorkdayDropdown(container, eeo.authorizedToWork);
    }
    else if (questionText.includes("sponsorship") || questionText.includes("immigration filing")) {
      if (radios.length > 0 && eeo.requireVisaFuture) window.FastApplyUtils.fillRadio(radios, eeo.requireVisaFuture);
      window.WorkdayEngine.fillWorkdayDropdown(container, eeo.requireVisaFuture);
    }

    // Voluntary Disclosures
    else if (questionText.includes("gender")) {
      const target = optOut ? "prefer not" : eeo.gender;
      window.WorkdayEngine.fillWorkdayDropdown(container, target);
    }
    else if (questionText.includes("ethnicity") || questionText.includes("hispanic")) {
      const target = optOut ? "prefer not" : eeo.ethnicity;
      window.WorkdayEngine.fillWorkdayDropdown(container, target);
    }
    else if (questionText.includes("veterans status") || questionText.includes("veteran")) {
      const target = optOut ? "prefer not" : eeo.veteran;
      window.WorkdayEngine.fillWorkdayDropdown(container, target);
    }
    else if (questionText.includes("disability")) {
      if (checkboxes.length > 0) {
        const target = optOut ? "i do not want to answer" : (eeo.disability === "yes" ? "yes" : "no");
        window.FastApplyUtils.fillCheckbox(checkboxes, target);
      }
    }

    // Terms & Signatures
    else if (questionText.includes("read and agree") || questionText.includes("terms")) {
      window.WorkdayEngine.fillWorkdayDropdown(container, "agree");
    }
    else if (questionText.includes("name") && (questionText.includes("signature") || questionText.includes("enter your name"))) {
      if (textInput && !document.querySelector('input[data-automation-id="legalNameSection_firstName"]')) {
        window.FastApplyUtils.fillField(textInput, `${pInfo.firstName} ${pInfo.lastName || ""}`.trim());
      }
    }
    else if (questionText.includes("today's date") || questionText === "date") {
      if (textInput) window.FastApplyUtils.fillField(textInput, window.WorkdayEngine.getTodayDate());
    }
    
    // Privacy statements
    else if (questionText.includes("privacy") || questionText.includes("acknowledge") || questionText.includes("recruitment privacy statement")) {
      if (checkboxes[0] && !checkboxes[0].checked) {
        checkboxes[0].click();
      }
    }
  });
};