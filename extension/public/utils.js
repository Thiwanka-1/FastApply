// public/utils.js
console.log("[FastApply] Utils Loaded.");

const setNativeValue = (element, value) => {
  const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  if (nativeSetter) nativeSetter.call(element, value);
  else element.value = value;
};

// --- THE GLOBAL SMART MATCHER ---
const smartMatch = (optText, targetValue) => {
  const o = (optText || '').toLowerCase().trim();
  const t = (targetValue || '').toLowerCase().trim();

  if ((t.includes('decline') || t.includes('prefer not')) && 
      (o.includes('decline') || o.includes('prefer not') || o.includes('wish to answer') || o.includes('not wish'))) return true;
  
  const isTargetMale = t === 'male' || t === 'man';
  const isTargetFemale = t === 'female' || t === 'woman';
  const isOptMale = /\b(male|man)\b/i.test(o) && !/\b(female|woman)\b/i.test(o); 
  const isOptFemale = /\b(female|woman)\b/i.test(o);
  
  if (isTargetMale && isOptMale) return true;
  if (isTargetFemale && isOptFemale) return true;

  if (!isTargetMale && !isTargetFemale) {
    if (new RegExp(`\\b${t}\\b`, 'i').test(o)) return true;
    if (new RegExp(`\\b${o}\\b`, 'i').test(t)) return true;
  }

  if (t.includes('veteran') && o.includes('veteran')) {
    const targetIsNo = t.includes('not') || t.includes('no');
    const optIsNo = o.includes('not') || o.includes('no');
    if (targetIsNo && optIsNo) return true;
    if (!targetIsNo && !optIsNo) return true;
  }

  if (t.startsWith('yes') && o.startsWith('yes')) return true;
  if (t.startsWith('no') && o.startsWith('no')) return true;

  if (t.includes('asian') && o.includes('asian')) return true;
  if (t.includes('black') && (o.includes('black') || o.includes('african'))) return true;
  if ((t.includes('hispanic') || t.includes('latino') || t.includes('latinx')) && 
      (o.includes('latinx') || o.includes('hispanic') || o.includes('latino'))) return true;
  if (t.includes('white') && o.includes('white')) return true;

  return false;
};

// --- NEW: ADVANCED LABEL EXTRACTOR ---
// Defeats Ashby's disconnected labels by matching the 'for' attribute!
const getLabelText = (input) => {
  let text = '';
  if (input.id) {
    try {
      const el = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (el) text = el.innerText;
    } catch(e) {}
  }
  if (!text && input.closest) {
    const wrapper = input.closest('[class*="option"], [class*="radio"], [class*="checkbox"], label');
    if (wrapper && wrapper !== input) text = wrapper.innerText;
  }
  if (!text) {
    text = input.parentElement?.innerText || input.nextElementSibling?.innerText || input.value || '';
  }
  return text;
};

const fillField = (element, value) => {
  if (!element || !value || value.trim() === '' || element.dataset.fa_filled === "true") return false;
  try {
    element.focus(); 
    setNativeValue(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    if (!element.name?.toLowerCase().includes('location')) element.dispatchEvent(new Event('blur', { bubbles: true }));

    element.style.border = '2px solid #06b6d4';
    element.style.backgroundColor = '#f0fdfa';
    element.dataset.fa_filled = "true"; 
    return true;
  } catch (error) { return false; }
};

const fillAutocomplete = (visibleInput, hiddenInput, value) => {
  if (!visibleInput || !value || visibleInput.dataset.fa_filled === "true") return false;
  try {
    visibleInput.focus();
    setNativeValue(visibleInput, value);
    visibleInput.dispatchEvent(new Event('input', { bubbles: true }));
    visibleInput.style.border = '2px solid #06b6d4';
    visibleInput.style.backgroundColor = '#f0fdfa';
    visibleInput.dataset.fa_filled = "true";

    if (hiddenInput) {
      setNativeValue(hiddenInput, value);
      hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setTimeout(() => {
      const dropdownContainer = visibleInput.parentElement.querySelector('.dropdown-container');
      if (dropdownContainer) {
        const firstOption = dropdownContainer.querySelector('li, .dropdown-item, a, div');
        if (firstOption) {
          firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          firstOption.click();
        }
      }
      const pacItem = document.querySelector('.pac-container .pac-item');
      if (pacItem) {
        pacItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        pacItem.click();
      }
      visibleInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }, 800);
    return true;
  } catch (error) { return false; }
};

const fillDropdown = (selectElement, targetValue) => {
  if (!selectElement || !targetValue || targetValue.trim() === '' || selectElement.dataset.fa_filled === "true") return false;
  let matchedOption = null;

  for (let i = 0; i < selectElement.options.length; i++) {
    if (smartMatch(selectElement.options[i].text, targetValue)) {
      matchedOption = selectElement.options[i];
      break;
    }
  }

  if (matchedOption) {
    try {
      selectElement.value = matchedOption.value;
      selectElement.selectedIndex = matchedOption.index;
      selectElement.dispatchEvent(new Event('change', { bubbles: true }));
      selectElement.style.border = '2px solid #8b5cf6'; 
      selectElement.style.backgroundColor = '#f5f3ff';
      selectElement.dataset.fa_filled = "true";
      return true;
    } catch (error) { return false; }
  }
  return false;
};

const fillRadio = (radioNodeList, targetText) => {
  if (!radioNodeList || radioNodeList.length === 0 || !targetText || targetText.trim() === '') return false;
  
  for (let i = 0; i < radioNodeList.length; i++) {
    const radio = radioNodeList[i];
    if (radio.dataset.fa_filled === "true") return false; 
    
    // Utilize the new powerful ID extractor!
    const label = getLabelText(radio);
    
    if (smartMatch(label, targetText)) {
      if (!radio.checked) radio.click(); 
      radio.parentElement.style.backgroundColor = '#f0fdfa';
      radio.parentElement.style.border = '1px solid #06b6d4';
      radio.parentElement.style.borderRadius = '4px';
      radioNodeList.forEach(r => r.dataset.fa_filled = "true");
      return true;
    }
  }
  return false;
};

const fillCheckbox = (checkboxNodeList, targetText) => {
  if (!checkboxNodeList || checkboxNodeList.length === 0 || !targetText || targetText.trim() === '') return false;
  let clickedAnything = false;

  for (let i = 0; i < checkboxNodeList.length; i++) {
    const cb = checkboxNodeList[i];
    if (cb.dataset.fa_filled === "true") continue;
    
    const label = getLabelText(cb);
    
    if (smartMatch(label, targetText)) {
      if (!cb.checked) cb.click();
      cb.parentElement.style.backgroundColor = '#f0fdfa';
      cb.parentElement.style.border = '1px solid #06b6d4';
      cb.parentElement.style.borderRadius = '4px';
      cb.dataset.fa_filled = "true";
      clickedAnything = true;
    }
  }
  return clickedAnything;
};

window.FastApplyUtils = { fillField, fillAutocomplete, fillDropdown, fillRadio, fillCheckbox };