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
      // The dashboard-editable profile field is authoritative; CQFO memory
      // is the fallback for older profiles.
      const direct = profile.eeo?.willingToRelocate;
      if (hasValue(direct)) return direct;
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
    const labelIndex = label ? labels.indexOf(label) : -1;
    const previousQuestions = labelIndex > 0
      ? labels
          .slice(Math.max(0, labelIndex - 4), labelIndex)
          .map(item => W.normalizeText(W.getElementText(item)))
          .join(" ")
      : "";
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

  // Fills the CC-305 "Date" widget with today's date. Handles both the
  // segmented MM / DD / YYYY inputs and a single MM/DD/YYYY text input.
  const fillTodayDate = container => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const year = String(today.getFullYear());

    const findSegment = (kind, placeholder) => container.querySelector([
      `input[data-automation-id="dateSection${kind}-input"]`,
      `input[placeholder="${placeholder}" i]`,
      `input[aria-label*="${kind.toLowerCase()}" i]`
    ].join(","));

    const writeSegment = (input, digits) => {
      if (!input || input.disabled || input.readOnly) return false;
      const current = String(input.value || "").replace(/\D/g, "");
      if (current) return true;
      W.setInputValue(input, digits);
      if (String(input.value || "").replace(/\D/g, "") === digits) return true;
      try {
        input.focus();
        input.select?.();
        document.execCommand("insertText", false, digits);
      } catch (_) {}
      return String(input.value || "").replace(/\D/g, "") === digits;
    };

    const monthInput = findSegment("Month", "MM");
    const dayInput = findSegment("Day", "DD");
    const yearInput = findSegment("Year", "YYYY");

    if (monthInput && dayInput && yearInput) {
      const filled = writeSegment(monthInput, month) &&
        writeSegment(dayInput, day) &&
        writeSegment(yearInput, year);
      if (!filled) W.debug?.("CC-305 date segments did not confirm");
      return filled;
    }

    const singleInput = container.querySelector(
      'input[placeholder*="MM/DD/YYYY" i], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
    );
    if (singleInput) {
      return W.fillDeterministicText(
        singleInput,
        `${month}/${day}/${year}`,
        { typeCharacters: true }
      );
    }
    return false;
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

      // The CC-305 voluntary disability form carries required Name and Date
      // fields alongside the disability checkboxes.
      const isDisabilityForm = /\bcc[\s-]*305\b|self[\s-]identification of disability/i.test(
        document.body?.innerText || ""
      );

      for (let wave = 0; wave < 3; wave += 1) {
        const signatureBefore = getQuestionPageSignature();
        let filledThisWave = false;

        // Build question blocks from visible <label> elements AND from
        // label-less formFields. Tenants (including Workday's own careers
        // site) render question text without <label>, exposing it only as
        // the control's accessible name — the label-only loop saw nothing
        // there and the page silently stayed empty.
        const blocks = [];
        const seenContainers = new Set();
        for (const label of Array.from(document.querySelectorAll("label")).filter(W.isVisible)) {
          const question = W.normalizeText(W.getElementText(label));
          if (!question) continue;
          const container = W.getFieldContainer(label);
          if (!container || seenContainers.has(container)) continue;
          seenContainers.add(container);
          blocks.push({ question, label, container });
        }
        for (const field of Array.from(
          document.querySelectorAll('[data-automation-id*="formField" i]')
        ).filter(W.isVisible)) {
          if (seenContainers.has(field)) continue;
          const control = field.querySelector([
            '[data-automation-id="selectWidget"]',
            '[role="combobox"]',
            '[aria-haspopup="listbox"]',
            'input:not([type="hidden"])',
            "textarea"
          ].join(","));
          if (!control) continue;
          const question = W.normalizeText(U?.getLabelText?.(control) || "");
          if (!question) continue;
          seenContainers.add(field);
          blocks.push({ question, label: null, container: field });
        }

        if (wave === 0) {
          W.debug?.(`questions page: ${blocks.length} question blocks found`);
        }

        for (const { question, label, container } of blocks) {
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
          } else if (question.includes("race") && !question.includes("ethnicity")) {
            // Race questions list race+ethnicity combos ("White (Not Hispanic
            // or Latino)…"); an ethnicity-only value like "Not Hispanic or
            // Latino" matches every row equally, so only a real race value is
            // usable deterministically — otherwise leave it to the AI audit.
            target = optOut ? "prefer not" : eeo.race;
          } else if (
            question.includes("ethnicity") ||
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
          } else if (
            isDisabilityForm &&
            /^(please check one of the boxes( below)?|check one of the boxes( below)?)$/.test(question)
          ) {
            // CC-305 phrases the disability choice as "Please check one of
            // the boxes below:" without the word "disability" in the label.
            target = optOut ? "prefer not" : eeo.disability;
          } else if (isDisabilityForm && /^(name|your name|legal name)$/.test(question)) {
            const personal = profile.personalInfo || {};
            const fullName = [personal.firstName, personal.lastName]
              .filter(Boolean)
              .join(" ");
            if (textInput && fullName) {
              const nameFilled = W.fillDeterministicText(textInput, fullName);
              filledThisWave = nameFilled || filledThisWave;
              filledAnything = nameFilled || filledAnything;
            }
            continue;
          } else if (
            isDisabilityForm &&
            /^(date|today s date|date signed)$/.test(question)
          ) {
            const dateFilled = fillTodayDate(container);
            filledThisWave = dateFilled || filledThisWave;
            filledAnything = dateFilled || filledAnything;
            continue;
          }

          if (hasValue(target)) {
            const knownAnswerFilled = await fillChoice(container, target);
            filledThisWave = knownAnswerFilled || filledThisWave;
            filledAnything = knownAnswerFilled || filledAnything;
            if (!knownAnswerFilled) {
              W.debug?.(
                "question not filled:",
                question.slice(0, 70),
                "→ target:",
                choiceValue(target)
              );
            }
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
