// public/rippling.js
console.log("[FastApply] Rippling Engine Active. (Fixed Scope Edition)");

// --- RIPPLING BESPOKE COMBOBOX CLICKER ---
const fillRipplingCombobox = (inputElement, targetValue) => {
  if (!inputElement || !targetValue || inputElement.dataset.fa_dropdown_processing === "true" || inputElement.dataset.fa_filled === "true") return false;

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
    const options = document.querySelectorAll('[role="presentation"] li, [role="listbox"] li, [role="option"]');
    let matchedOption = null;

    for (let i = 0; i < options.length; i++) {
      // FIX: Seamlessly using the smartMatch function already provided by your utils.js!
      if (smartMatch(options[i].innerText, targetValue)) {
        matchedOption = options[i];
        break;
      }
    }

    if (matchedOption) {
      matchedOption.click();
      inputElement.style.border = '2px solid #8b5cf6';
      inputElement.dataset.fa_filled = "true";
    } else {
      inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', keyCode: 40 }));
      inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
      document.body.click(); 
      inputElement.dataset.fa_filled = "true";
    }
    inputElement.dataset.fa_dropdown_processing = "false";
  }, 600);

  return true;
};

// --- RIPPLING BESPOKE RADIO CLICKER ---
const fillRipplingRadios = (radioNodes, targetValue) => {
    if (!radioNodes || radioNodes.length === 0 || !targetValue) return false;
    let clicked = false;

    radioNodes.forEach(radio => {
        if (radio.dataset.fa_filled === "true") return;
        
        const wrapper = radio.closest('[data-testid^="radio-label-"]');
        const labelText = wrapper ? wrapper.innerText : (radio.parentElement.innerText || '');

        // FIX: Seamlessly using the smartMatch function already provided by your utils.js!
        if (smartMatch(labelText, targetValue)) {
            if (!radio.checked) radio.click();
            if (wrapper) {
                wrapper.style.backgroundColor = '#f0fdfa';
                wrapper.style.border = '1px solid #06b6d4';
                wrapper.style.borderRadius = '4px';
            }
            clicked = true;
        }
    });

    if (clicked) radioNodes.forEach(r => r.dataset.fa_filled = "true");
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
          } else {
              const isHisp = eeo.ethnicity && (eeo.ethnicity.toLowerCase().includes('hispanic') || eeo.ethnicity.toLowerCase().includes('latino'));
              if (fillRipplingCombobox(combobox, isHisp ? "Yes" : "No")) filledAnything = true;
          }
      }
      else if ((blockText.includes('race') || blockText.includes('ethnic')) && combobox) {
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
      else if ((blockText.includes('consent') || blockText.includes('text message')) && radios.length > 0) {
          if (fillRipplingRadios(radios, 'yes')) filledAnything = true;
      }
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
  chrome.storage.local.get(['autofillEnabled', 'profileData'], (res) => {
    if (res.autofillEnabled === false || !res.profileData) return;
    
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEngine);
else startEngine();