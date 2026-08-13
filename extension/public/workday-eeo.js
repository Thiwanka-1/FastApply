// public/workday-eeo.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;
  const U = window.FastApplyUtils;

  const hasValue = value => {
    if (Array.isArray(value)) return value.some(hasValue);
    if (typeof value === "boolean" || typeof value === "number") return true;
    return String(value ?? "").trim().length > 0;
  };

  const choiceValue = value => {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return value;
  };

  const isProtected = element => Boolean(
    element?.dataset?.fa_user_owned === "true" ||
    element?.dataset?.fa_manual === "true" ||
    element?.dataset?.fa_agent_filled === "true" ||
    U?.isProtectedFromDeterministicFill?.(element) ||
    element?.closest?.('[data-fa-user-owned="true"], [data-fa-agent-filled="true"]')
  );

  const fillSingleCheckbox = (checkbox, target) => {
    if (!checkbox || checkbox.disabled || isProtected(checkbox)) return false;
    if (checkbox.checked) return false;
    const normalized = W.normalizeText(choiceValue(target));
    const shouldCheck = [
      "yes",
      "true",
      "agree",
      "agreed",
      "acknowledge",
      "acknowledged",
      "checked"
    ].includes(normalized);
    if (!shouldCheck) return false;

    checkbox.click();
    if (!checkbox.checked) return false;
    checkbox.dataset.fa_filled = "true";
    checkbox.dataset.fa_fill_type = "checkbox";
    U?.setValueOwner?.(checkbox, "deterministic");
    return true;
  };

  const fillChoice = async (container, target) => {
    if (!container || !hasValue(target) || isProtected(container)) return false;
    const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
    if (radios.length) {
      if (radios.some(radio => radio.checked) || radios.some(isProtected)) return false;
      return U?.fillRadio?.(radios, choiceValue(target)) === true;
    }

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    if (checkboxes.length === 1) return fillSingleCheckbox(checkboxes[0], target);
    if (checkboxes.length > 1) {
      if (checkboxes.some(checkbox => checkbox.checked) || checkboxes.some(isProtected)) {
        return false;
      }
      const targets = Array.isArray(target) ? target : [target];
      return targets.some(value => {
        return U?.fillCheckbox?.(checkboxes, choiceValue(value)) === true;
      });
    }

    // The EEO wave loop re-visits every dropdown up to three times; cap the
    // per-dropdown waits so unmatched dropdowns cannot consume minutes.
    return W.fillDeterministicDropdown(container, choiceValue(target), {
      openTimeout: 3000,
      searchTimeout: 3500
    });
  };

  const getStoredAnswer = (profile, question) => {
    const target = W.normalizeText(question);
    if (!target) return undefined;
    const answers = profile.applicationMemory?.answers;
    if (!Array.isArray(answers)) return undefined;

    const findByKey = key => {
      const keyed = answers.find(item => item?.key === key);
      return hasValue(keyed?.answer) ? keyed.answer : undefined;
    };

    const entry = answers.find(item => {
      const candidates = [
        item?.question,
        item?.key,
        ...(Array.isArray(item?.aliases) ? item.aliases : [])
      ].map(W.normalizeText).filter(Boolean);
      return candidates.some(candidate => {
        if (candidate === target) return true;
        // CQFO memory stores reusable aliases while Workday adds employer-
        // specific wording around the same question. Require a meaningful
        // phrase, never a one-word/fuzzy match, so opposite legal choices are
        // not guessed.
        if (candidate.length < 8 || candidate.split(" ").length < 2) return false;
        return target.includes(candidate) || candidate.includes(target);
      });
    });

    if (hasValue(entry?.answer)) return entry.answer;

    // Stable CQFO memory keys cover common Workday questions even when an
    // employer rewrites the sentence completely. These mappings are narrow
    // and question-specific; unsupported/legal attestations remain empty.
    if (/\brelocat(e|ing|ion)\b/.test(target)) {
      return findByKey("willingToRelocate");
    }
    if (/\bnon compete\b|\bnon solicitation\b/.test(target)) {
      return findByKey("employmentAgreement");
    }
    if (/\bgovernment\b/.test(target) && /\b(employee|employment|worked)\b/.test(target)) {
      return findByKey("governmentEmployment");
    }
    if (/\bauthorized to work\b/.test(target)) {
      const usaAnswer = findByKey("authorizedToWorkUSA");
      const canadaAnswer = findByKey("authorizedToWorkCanada");
      if (/\b(canada|canadian)\b/.test(target)) return canadaAnswer;
      if (/\b(usa|united states|u s)\b/.test(target)) return usaAnswer;
      if (hasValue(usaAnswer) && !hasValue(canadaAnswer)) return usaAnswer;
      if (hasValue(canadaAnswer) && !hasValue(usaAnswer)) return canadaAnswer;
      if (W.normalizeText(usaAnswer) === W.normalizeText(canadaAnswer)) return usaAnswer;
      return undefined;
    }
    if (/\bsponsorship\b|\bimmigration filing\b/.test(target)) {
      return findByKey("sponsorshipRequired");
    }

    return undefined;
  };

  const findStoredAnswerByKey = (profile, key) => {
    const answers = profile.applicationMemory?.answers;
    if (!Array.isArray(answers)) return undefined;
    const entry = answers.find(item => item?.key === key);
    return hasValue(entry?.answer) ? entry.answer : undefined;
  };

  const getConditionalDetailAnswer = (profile, label, question) => {
    if (!/\b(details?|explain|describe|specify|additional information)\b/.test(question)) {
      return undefined;
    }

    const labels = Array.from(document.querySelectorAll("label")).filter(W.isVisible);
    const labelIndex = labels.indexOf(label);
    const previousQuestions = labels
      .slice(Math.max(0, labelIndex - 4), labelIndex)
      .map(item => W.normalizeText(W.getElementText(item)))
      .join(" ");
    const context = `${previousQuestions} ${question}`;

    if (/\bsponsorship\b|\bimmigration\b|\bvisa\b|\bwork permit\b/.test(context)) {
      return findStoredAnswerByKey(profile, "sponsorshipDetails") ||
        findStoredAnswerByKey(profile, "canadaWorkAuthorizationDetails");
    }
    if (/\bnon compete\b|\bnon solicitation\b/.test(context)) {
      return findStoredAnswerByKey(profile, "employmentAgreementDetails");
    }
    if (/\bgovernment\b/.test(context)) {
      return findStoredAnswerByKey(profile, "governmentEmploymentDetails");
    }

    return undefined;
  };

  const getQuestionPageSignature = () => {
    return Array.from(document.querySelectorAll([
      "label",
      '[data-automation-id="selectWidget"]',
      'input:not([type="hidden"])',
      "textarea"
    ].join(",")))
      .filter(W.isVisible)
      .map((element, index) => [
        element.tagName,
        element.id || "",
        element.getAttribute("data-automation-id") || "",
        W.normalizeText(W.getElementText(element)),
        index
      ].join(":"))
      .join("|");
  };

  const combineYesNo = (first, second) => {
    const values = [first, second]
      .map(value => W.normalizeText(value))
      .filter(Boolean);
    if (values.some(value => value === "yes" || value.startsWith("yes "))) return "Yes";
    if (values.length === 2 && values.every(value => value === "no" || value.startsWith("no "))) {
      return "No";
    }
    return "";
  };

  const getSponsorshipAnswer = (question, eeo) => {
    const asksFuture = question.includes("future") || question.includes("will you");
    const asksNow = question.includes("now") || question.includes("currently");
    if (asksFuture && asksNow) {
      return combineYesNo(eeo.requireVisaNow, eeo.requireVisaFuture);
    }
    if (asksFuture) return eeo.requireVisaFuture;
    if (asksNow) return eeo.requireVisaNow;
    return W.normalizeText(eeo.requireVisaNow) === W.normalizeText(eeo.requireVisaFuture)
      ? eeo.requireVisaNow
      : "";
  };

  const getTextInput = (label, container) => {
    const linked = label?.control || (() => {
      const labelFor = label?.getAttribute?.("for");
      return labelFor
        ? (label.getRootNode()?.getElementById?.(labelFor) || document.getElementById(labelFor))
        : null;
    })();
    if (linked?.matches?.("input[type='text']:not([role='combobox']), textarea")) return linked;
    return container.querySelector("input[type='text']:not([role='combobox']), textarea");
  };

  W.handleEEO = async profile => {
    if (W.isProcessingQuestions) return false;
    W.isProcessingQuestions = true;

    try {
      const eeo = profile.eeo || {};
      const optOut = eeo.optOut === true;
      let filledAnything = false;

      for (let wave = 0; wave < 3; wave += 1) {
        const signatureBefore = getQuestionPageSignature();
        const labels = Array.from(document.querySelectorAll("label")).filter(W.isVisible);
        let filledThisWave = false;

        for (const label of labels) {
          const question = W.normalizeText(W.getElementText(label));
          if (!question) continue;
          const container = W.getFieldContainer(label);
          if (!container) continue;
          const textInput = getTextInput(label, container);
          const storedAnswer = getStoredAnswer(profile, question);
          const conditionalDetail = getConditionalDetailAnswer(profile, label, question);
          let target;

          if (question.includes("authorized to work")) {
            target = hasValue(storedAnswer) ? storedAnswer : eeo.authorizedToWork;
          } else if (
            question.includes("sponsorship") ||
            question.includes("immigration filing") ||
            question.includes("visa sponsorship")
          ) {
            target = hasValue(storedAnswer)
              ? storedAnswer
              : getSponsorshipAnswer(question, eeo);
          } else if (question.includes("gender")) {
            target = optOut ? "prefer not" : eeo.gender;
          } else if (
            question.includes("ethnicity") ||
            question.includes("race") ||
            question.includes("hispanic")
          ) {
            target = optOut ? "prefer not" : (eeo.ethnicity || eeo.race);
          } else if (question.includes("veteran")) {
            target = optOut ? "prefer not" : eeo.veteran;
          } else if (question.includes("disability")) {
            // Same opt-out phrasing as the other demographics; the semantic
            // matcher classifies "prefer not" to the opt-out option whatever
            // wording the tenant uses ("I don't wish to answer", …).
            target = optOut ? "prefer not" : eeo.disability;
          }

          if (hasValue(target)) {
            const knownAnswerFilled = await fillChoice(container, target);
            filledThisWave = knownAnswerFilled || filledThisWave;
            filledAnything = knownAnswerFilled || filledAnything;
            if (knownAnswerFilled) continue;
          }

          const answer = hasValue(conditionalDetail) ? conditionalDetail : storedAnswer;
          // Legal agreements, certifications, privacy statements and arbitrary
          // application questions are filled only from an exact stored answer.
          if (!hasValue(answer)) continue;

          if (textInput) {
            const textValue = Array.isArray(answer)
              ? answer.join(", ")
              : choiceValue(answer);
            const textFilled = W.fillDeterministicText(textInput, textValue);
            filledThisWave = textFilled || filledThisWave;
            filledAnything = textFilled || filledAnything;
          } else {
            const choiceFilled = await fillChoice(container, answer);
            filledThisWave = choiceFilled || filledThisWave;
            filledAnything = choiceFilled || filledAnything;
          }
        }

        await W.wait(filledThisWave ? 450 : 220);
        const signatureAfter = getQuestionPageSignature();
        if (!filledThisWave && signatureAfter === signatureBefore) break;
      }

      return filledAnything;
    } finally {
      W.isProcessingQuestions = false;
    }
  };
})();
