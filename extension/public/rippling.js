// public/rippling.js
console.log("[FastApply] Rippling Engine Active. (Fixed Scope Edition)");

// Engine scripts share one isolated world; an IIFE keeps top-level
// declarations from colliding with utils.js or other scripts.
(() => {

// --- RIPPLING BESPOKE COMBOBOX CLICKER ---
const fillRipplingCombobox = (inputElement, targetValue) => {
  if (
    !inputElement ||
    !targetValue ||
    String(inputElement.value || "").trim() ||
    inputElement.dataset.fa_dropdown_processing === "true" ||
    inputElement.dataset.fa_filled === "true" ||
    window.FastApplyUtils.isProtectedFromDeterministicFill?.(inputElement)
  ) return false;

  inputElement.dataset.fa_dropdown_processing = "true";
  
  // 1. Force the Material-UI portal open
  inputElement.focus();
  inputElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  inputElement.click();

  // 2. Inject text to filter the dropdown list
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  if (nativeSetter) nativeSetter.call(inputElement, targetValue);
  else inputElement.value = targetValue;
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));

  // 3. Wait for portal to render, then select
  setTimeout(() => {
    const options = Array.from(
      document.querySelectorAll(
        '[role="presentation"] li, [role="listbox"] li, [role="option"]'
      )
    );
    const normalizedTarget = String(targetValue).trim().toLowerCase();
    const exactOption = options.find(option => {
      return String(option.innerText || option.textContent)
        .trim()
        .toLowerCase() === normalizedTarget;
    });
    const matchedOption = exactOption || window.FastApplyUtils.findBestSemanticMatch?.(
      options,
      targetValue,
      option => option.innerText || option.textContent || ""
    );

    if (matchedOption) {
      const matchedLabel = String(matchedOption.innerText || matchedOption.textContent)
        .trim()
        .toLowerCase();
      matchedOption.click();

      setTimeout(() => {
        const selectedValue = String(inputElement.value || "")
          .trim()
          .toLowerCase();
        const selectionConfirmed =
          inputElement.getAttribute("aria-expanded") === "false" ||
          matchedOption.getAttribute("aria-selected") === "true";

        if (
          (selectedValue === matchedLabel ||
            window.FastApplyUtils.smartMatch?.(selectedValue, matchedLabel) === true) &&
          selectionConfirmed
        ) {
          inputElement.style.border = '2px solid #8b5cf6';
          inputElement.dataset.fa_filled = "true";
          window.FastApplyUtils.setValueOwner?.(inputElement, "deterministic");
        }

        inputElement.dataset.fa_dropdown_processing = "false";
      }, 180);
    } else {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Escape',
          code: 'Escape'
        })
      );
      inputElement.dataset.fa_dropdown_processing = "false";
    }
  }, 600);

  return false;
};

// --- RIPPLING BESPOKE RADIO CLICKER ---
const fillRipplingRadios = (radioNodes, targetValue) => {
    if (!radioNodes || radioNodes.length === 0 || !targetValue) return false;
    let clicked = false;

    const radios = Array.from(radioNodes);
    if (
      radios.some(radio => radio.checked) ||
      radios.some(radio => window.FastApplyUtils.isProtectedFromDeterministicFill?.(radio))
    ) return false;
    const exactMatches = radios.filter(radio => {
        const wrapper = radio.closest('[data-testid^="radio-label-"]');
        const labelText = wrapper ? wrapper.innerText : (radio.parentElement.innerText || '');
        return labelText.trim().toLowerCase() === targetValue.trim().toLowerCase();
    });

    const matches = exactMatches;

    if (matches.length !== 1) return false;

    matches.forEach(radio => {
        if (radio.dataset.fa_filled === "true") return;
        
        const wrapper = radio.closest('[data-testid^="radio-label-"]');
        const labelText = wrapper ? wrapper.innerText : (radio.parentElement.innerText || '');

        if (labelText.trim().toLowerCase() === targetValue.trim().toLowerCase()) {
            if (!radio.checked) radio.click();
            if (wrapper) {
                wrapper.style.backgroundColor = '#f0fdfa';
                wrapper.style.border = '1px solid #06b6d4';
                wrapper.style.borderRadius = '4px';
            }
            clicked = true;
        }
    });

    if (clicked) radios.forEach(r => {
      r.dataset.fa_filled = "true";
      window.FastApplyUtils.setValueOwner?.(r, "deterministic");
    });
    return clicked;
};

// --- MAIN RIPPLING MAPPER ---
const handleRipplingCustoms = (profile) => {
  let filledAnything = false;
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const eeo = profile.eeo || {};
  const links = profile.websitesAndSkills || {};
  const currentCompany = profile.workHistory && profile.workHistory.length > 0 ? profile.workHistory[0].company : '';

  // 1. DIRECT INJECTIONS VIA DEVELOPER IDs
  const directMap = [
      { id: 'input-first_name', val: pInfo.firstName },
      { id: 'input-last_name', val: pInfo.lastName },
      { id: 'input-email', val: cInfo.email },
      { id: 'input-phone_number', val: cInfo.phone },
      { id: 'input-current_company', val: currentCompany },
      { id: 'input-linkedin_link', val: links.linkedin },
      { id: 'input-github_link', val: links.github },
      { id: 'input-portfolio_link', val: links.portfolio },
      { id: 'input-website_link', val: links.portfolio },
      { id: 'input-externalPlaceId', val: `${cInfo.city}, ${cInfo.country || ''}`.trim() } 
  ];

  directMap.forEach(field => {
      if (!field.val) return;
      const inputEl = document.querySelector(`[data-testid="${field.id}"]`);
      if (inputEl && inputEl.dataset.fa_filled !== "true") {
          if (inputEl.getAttribute('role') === 'combobox') {
              if (fillRipplingCombobox(inputEl, field.val)) filledAnything = true;
          } else {
              if (window.FastApplyUtils.fillField(inputEl, field.val)) filledAnything = true;
          }
      }
  });

  // 2. DYNAMIC FIELD BLOCKS 
  const fieldBlocks = document.querySelectorAll('[data-testid="field"]');

  fieldBlocks.forEach(block => {
      const blockText = block.innerText.toLowerCase();
      
      const combobox = block.querySelector('input[role="combobox"]');
      const radios = block.querySelectorAll('input[type="radio"]');

      if (blockText.includes('pronouns') && combobox) {
          if (fillRipplingCombobox(combobox, pInfo.pronouns)) filledAnything = true;
      }
      else if ((blockText.includes('gender') || blockText.includes('identify')) && !blockText.includes('race') && !blockText.includes('hispanic') && combobox) {
          const target = eeo.optOut ? "decline" : eeo.gender;
          if (fillRipplingCombobox(combobox, target)) filledAnything = true;
      }
      else if ((blockText.includes('hispanic') || blockText.includes('latino')) && combobox) {
          if (eeo.optOut) {
              if (fillRipplingCombobox(combobox, "decline")) filledAnything = true;
          } else if (eeo.ethnicity) {
              const ethnicity = eeo.ethnicity.toLowerCase();
              const explicitlyNotHispanic = /\b(not|non)[\s-]+(hispanic|latino|latina|latinx)\b/.test(ethnicity);
              const explicitlyHispanic = !explicitlyNotHispanic && /\b(hispanic|latino|latina|latinx)\b/.test(ethnicity);
              if (explicitlyNotHispanic && fillRipplingCombobox(combobox, "No")) filledAnything = true;
              else if (explicitlyHispanic && fillRipplingCombobox(combobox, "Yes")) filledAnything = true;
          }
      }
      else if (blockText.includes('race') && combobox) {
          const target = eeo.optOut ? "decline" : eeo.race;
          if (fillRipplingCombobox(combobox, target)) filledAnything = true;
      }
      else if (blockText.includes('ethnic') && combobox) {
          const target = eeo.optOut ? "decline" : eeo.ethnicity;
          if (fillRipplingCombobox(combobox, target)) filledAnything = true;
      }
      else if (blockText.includes('veteran') && combobox) {
          const target = eeo.optOut ? "decline" : eeo.veteran;
          if (fillRipplingCombobox(combobox, target)) filledAnything = true;
      }
      else if (blockText.includes('disability') && combobox) {
          const target = eeo.optOut ? "decline" : eeo.disability;
          if (fillRipplingCombobox(combobox, target)) filledAnything = true;
      }

      // --- RADIOS ---
      else if ((blockText.includes('authorized to work') || blockText.includes('right to work')) && radios.length > 0 && eeo.authorizedToWork) {
          if (fillRipplingRadios(radios, eeo.authorizedToWork)) filledAnything = true;
      }
      else if ((blockText.includes('sponsorship') || blockText.includes('visa')) && radios.length > 0 && eeo.requireVisaFuture) {
          if (fillRipplingRadios(radios, eeo.requireVisaFuture)) filledAnything = true;
      }
  });

  return filledAnything;
};

const attemptAutofill = (profile) => {
  let filledAnything = false;
  if (handleRipplingCustoms(profile)) filledAnything = true;
  return filledAnything;
};

const startEngine = () => {
  window.FastApplyUtils.loadProfileData((profileData, autofillEnabled) => {
    if (!autofillEnabled || !profileData) return;
    const res = { profileData };
    
    console.log("[FastApply] ⚡ Initiating Rippling form lock...");
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attemptAutofill(res.profileData)) console.log(`[FastApply] ✅ Rippling Autofill successful on attempt ${attempts}!`);
      
      if (attempts >= 20) {
        clearInterval(interval);
        console.log("[FastApply] 🏁 Rippling Autofill sequence completed.");
      }
    }, 500);
  });
};

window.FastApplyAgent2Controller?.register({
  atsPlatform: "rippling",
  runDeterministic: attemptAutofill
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEngine);
else startEngine();
})();
