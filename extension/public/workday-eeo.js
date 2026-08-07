// public/workday-eeo.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;
  const U = window.FastApplyUtils;

  const fillChoice = async (container, target) => {
    if (!container || !target) return false;
    const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
    if (radios.length) return U.fillRadio(radios, target);

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    if (checkboxes.length > 1) return U.fillCheckbox(checkboxes, target);

    return W.fillWorkdayDropdown(container, target);
  };

  W.handleEEO = async profile => {
    if (W.isProcessingQuestions) return false;
    W.isProcessingQuestions = true;

    try {
      const personal = profile.personalInfo || {};
      const eeo = profile.eeo || {};
      const optOut = eeo.optOut === true;
      const labels = Array.from(document.querySelectorAll("label")).filter(W.isVisible);

      for (const label of labels) {
        const question = W.normalizeText(W.getElementText(label));
        if (!question) continue;
        const container = W.getFieldContainer(label);
        if (!container) continue;
        const textInput = container.querySelector(
          "input[type='text']:not([role='combobox']), textarea"
        );
        const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));

        if (question.includes("authorized to work")) {
          await fillChoice(container, eeo.authorizedToWork);
        } else if (
          question.includes("sponsorship") ||
          question.includes("immigration filing") ||
          question.includes("visa sponsorship")
        ) {
          await fillChoice(
            container,
            eeo.requireVisaFuture || eeo.requireVisaNow
          );
        } else if (question.includes("gender")) {
          await fillChoice(container, optOut ? "prefer not" : eeo.gender);
        } else if (
          question.includes("ethnicity") ||
          question.includes("race") ||
          question.includes("hispanic")
        ) {
          await fillChoice(
            container,
            optOut ? "prefer not" : (eeo.ethnicity || eeo.race)
          );
        } else if (question.includes("veteran")) {
          await fillChoice(container, optOut ? "prefer not" : eeo.veteran);
        } else if (question.includes("disability")) {
          const target = optOut
            ? "I do not want to answer"
            : eeo.disability;
          await fillChoice(container, target);
        } else if (
          question.includes("read and agree") ||
          question === "terms" ||
          question.includes("certify that")
        ) {
          await fillChoice(container, "agree");
        } else if (
          question.includes("signature") ||
          question.includes("enter your name")
        ) {
          W.fillTextField(
            textInput,
            `${personal.firstName || ""} ${personal.lastName || ""}`.trim()
          );
        } else if (question.includes("todays date") || question === "date") {
          W.fillTextField(textInput, W.getTodayDate());
        } else if (
          question.includes("privacy") ||
          question.includes("acknowledge")
        ) {
          const checkbox = checkboxes[0];
          if (checkbox && !checkbox.checked) checkbox.click();
          if (checkbox?.checked) checkbox.dataset.fa_filled = "true";
        }
      }

      return true;
    } finally {
      W.isProcessingQuestions = false;
    }
  };
})();
