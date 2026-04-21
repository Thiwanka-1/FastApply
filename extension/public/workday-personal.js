// public/workday-personal.js
window.WorkdayEngine = window.WorkdayEngine || {};

window.WorkdayEngine.handlePersonalInfo = (profile) => {
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};

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

    let textInput = container.querySelector("input[type='text'], input[type='email'], input[type='tel']");

    if (questionText.includes("given name") || questionText.includes("first name")) {
      if (textInput) window.FastApplyUtils.fillField(textInput, pInfo.firstName);
    }
    else if (questionText.includes("family name") || questionText.includes("last name")) {
      if (textInput) window.FastApplyUtils.fillField(textInput, pInfo.lastName);
    }
    else if (questionText.includes("address line 1")) {
      if (textInput) window.FastApplyUtils.fillField(textInput, cInfo.addressLine1);
    }
    else if (questionText === "city") {
      if (textInput) window.FastApplyUtils.fillField(textInput, cInfo.city);
    }
    else if (questionText.includes("postal code") || questionText === "zip") {
      if (textInput) window.FastApplyUtils.fillField(textInput, cInfo.postalCode);
    }
    else if (questionText.includes("email address")) {
      if (textInput) window.FastApplyUtils.fillField(textInput, cInfo.email);
    }
    else if (questionText.includes("phone number") && !questionText.includes("extension")) {
      const phoneVal = String(cInfo.phone || "").replace(/[^\d]/g, "");
      if (textInput) window.FastApplyUtils.fillField(textInput, phoneVal);
    }
    else if (questionText.includes("phone device type")) {
      window.WorkdayEngine.fillWorkdayDropdown(container, "Mobile");
    }
    else if (questionText.includes("country") && !questionText.includes("phone code")) {
      window.WorkdayEngine.fillWorkdayDropdown(container, cInfo.country);
    }
  });
};