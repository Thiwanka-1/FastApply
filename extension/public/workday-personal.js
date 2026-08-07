// public/workday-personal.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;

  W.handlePersonalInfo = async profile => {
    if (W.isProcessingPersonal) return false;
    W.isProcessingPersonal = true;

    try {
      const personal = profile.personalInfo || {};
      const contact = profile.contactInfo || {};
      const labels = Array.from(document.querySelectorAll("label")).filter(W.isVisible);

      for (const label of labels) {
        const question = W.normalizeText(W.getElementText(label));
        if (!question) continue;
        const container = W.getFieldContainer(label);
        if (!container) continue;
        const input = container.querySelector(
          "input[type='text'], input[type='email'], input[type='tel'], textarea"
        );

        if (question.includes("given name") || question === "first name") {
          W.fillTextField(input, personal.firstName);
        } else if (question.includes("family name") || question === "last name") {
          W.fillTextField(input, personal.lastName);
        } else if (question.includes("address line 1")) {
          W.fillTextField(input, contact.addressLine1);
        } else if (question === "city") {
          W.fillTextField(input, contact.city);
        } else if (question.includes("postal code") || question === "zip") {
          W.fillTextField(input, contact.postalCode);
        } else if (question.includes("email address")) {
          W.fillTextField(input, contact.email);
        } else if (
          question.includes("phone number") &&
          !question.includes("extension")
        ) {
          W.fillTextField(input, String(contact.phone || "").replace(/[^\d+]/g, ""));
        } else if (question.includes("phone device type")) {
          await W.fillWorkdayDropdown(container, "Mobile");
        } else if (
          question.includes("country") &&
          !question.includes("phone code")
        ) {
          await W.fillWorkdayDropdown(container, contact.country);
        }
      }

      return true;
    } finally {
      W.isProcessingPersonal = false;
    }
  };
})();
