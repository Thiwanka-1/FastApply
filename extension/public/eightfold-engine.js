// public/eightfold-engine.js
console.log("[FastApply] Eightfold.ai Engine Active.");

window.EightfoldEngine = window.EightfoldEngine || {};
window.EightfoldEngine.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Native React Injector
window.EightfoldEngine.setNativeValue = (element, value) => {
    if (!element || !value || element.dataset.fa_filled === "true") return;
    element.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set ||
                         Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ||
                         Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    if (nativeSetter) {
        nativeSetter.call(element, value);
    } else {
        element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dataset.fa_filled = "true";
};

// Custom Fuzzy Matcher for Eightfold's specific EEO options
window.EightfoldEngine.smartMatch = (optText, targetValue) => {
    const o = String(optText || "").toLowerCase().trim();
    const t = String(targetValue || "").toLowerCase().trim();
    if (!o || !t) return false;

    if ((t.includes("decline") || t.includes("prefer not") || t.includes("not wish")) &&
        (o.includes("decline") || o.includes("prefer not") || o.includes("not wish") || o.includes("choose not"))) return true;

    if ((t === "male" || t === "man") && /\b(male|man)\b/i.test(o) && !/\b(female|woman)\b/i.test(o)) return true;
    if ((t === "female" || t === "woman") && /\b(female|woman)\b/i.test(o)) return true;

    if (t.includes("veteran") && o.includes("veteran")) {
        const targetIsNo = t.includes("not") || t.includes("no");
        const optIsNo = o.includes("not") || o.includes("no");
        if (targetIsNo && optIsNo) return true;
        if (!targetIsNo && !optIsNo) return true;
    }

    if (t.includes("disability") && o.includes("disability")) {
        const targetIsNo = t.includes("not") || t.includes("no");
        const optIsNo = o.includes("not") || o.includes("no");
        if (targetIsNo && optIsNo) return true;
        if (!targetIsNo && !optIsNo) return true;
    }

    if (t.startsWith("yes") && o.startsWith("yes")) return true;
    if (t.startsWith("no") && o.startsWith("no")) return true;
    if (t.includes("asian") && o.includes("asian")) return true;
    if (t.includes("black") && (o.includes("black") || o.includes("african"))) return true;
    if ((t.includes("hispanic") || t.includes("latino")) && (o.includes("hispanic") || o.includes("latino"))) return true;
    if (t.includes("white") && o.includes("white")) return true;

    return o === t || o.includes(t) || t.includes(o);
};

// Finds Inputs by explicitly stripping the red asterisks (*)
window.EightfoldEngine.findInputByLabelText = (text) => {
    const labels = Array.from(document.querySelectorAll('label, div.mb-1, span, div.text-sm'));
    const label = labels.find(l => {
        const cleanText = (l.innerText || "").replace(/\*/g, '').trim().toLowerCase();
        return cleanText === text.toLowerCase();
    });

    if (label) {
        if (label.htmlFor) {
            const input = document.getElementById(label.htmlFor);
            if (input && input.dataset.fa_filled !== "true") return input;
        }

        let container = label.parentElement;
        for (let i = 0; i < 4; i++) {
            if (!container) break;
            const input = container.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
            if (input && input.dataset.fa_filled !== "true") return input;
            container = container.parentElement;
        }
    }
    return null;
};

// Safe Radio Button Clicker
window.EightfoldEngine.fillRadioGroup = (questionText, answerValue) => {
    if (!answerValue) return;

    const elements = Array.from(document.querySelectorAll('div, p, span, h3, h4, legend'));
    const question = elements.find(el => {
        const cleanText = (el.innerText || "").replace(/\*/g, '').trim().toLowerCase();
        return cleanText === questionText.toLowerCase();
    });

    if (!question) return;

    let container = question.parentElement;
    for (let i = 0; i < 5; i++) {
        if (!container) break;
        const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
        
        if (radios.length > 0 && !radios[0].dataset.fa_filled) {
            const labels = Array.from(container.querySelectorAll('label'));
            let matchedLabel = labels.find(l => window.EightfoldEngine.smartMatch(l.innerText, answerValue));
            
            if (matchedLabel) {
                const radio = container.querySelector(`input[id="${matchedLabel.htmlFor}"]`) || matchedLabel.querySelector('input[type="radio"]');
                if (radio && !radio.checked) {
                    radio.click(); 
                    radios.forEach(r => r.dataset.fa_filled = "true"); 
                }
            }
            break;
        }
        container = container.parentElement;
    }
};

window.EightfoldEngine.fillSelectDropdown = (labelText, targetValue) => {
    const select = window.EightfoldEngine.findInputByLabelText(labelText);
    if (!select || select.tagName.toLowerCase() !== 'select') return;
    
    const options = Array.from(select.options);
    const match = options.find(o => window.EightfoldEngine.smartMatch(o.text, targetValue));
    
    if (match) {
        window.EightfoldEngine.setNativeValue(select, match.value);
    }
};

window.EightfoldEngine.runAutofill = async (profile) => {
    if (window.EightfoldEngine.isRunning) return;
    window.EightfoldEngine.isRunning = true;

    try {
        const p = profile.personalInfo || {};
        const c = profile.contactInfo || {};
        const e = profile.eeo || {};

        // 1. Text Inputs
        window.EightfoldEngine.setNativeValue(window.EightfoldEngine.findInputByLabelText("Email"), c.email);
        window.EightfoldEngine.setNativeValue(window.EightfoldEngine.findInputByLabelText("First name"), p.firstName);
        window.EightfoldEngine.setNativeValue(window.EightfoldEngine.findInputByLabelText("Last name"), p.lastName);
        window.EightfoldEngine.setNativeValue(window.EightfoldEngine.findInputByLabelText("Phone"), c.phone);
        window.EightfoldEngine.setNativeValue(window.EightfoldEngine.findInputByLabelText("City"), c.city);

        // 2. Select Dropdowns
        window.EightfoldEngine.fillSelectDropdown("Country", c.country);

        // 3. EEO & Work Eligibility Radio Groups
        window.EightfoldEngine.fillRadioGroup("Are you currently eligible to work within the United States?", e.legallyAuthorized ? "Yes" : "No");
        window.EightfoldEngine.fillRadioGroup("Gender", e.gender);
        window.EightfoldEngine.fillRadioGroup("What is your race/ethnicity?", e.race);
        
        // Note: Eightfold uses weird punctuation on these specific sections, mapped exactly from your photos.
        window.EightfoldEngine.fillRadioGroup("Please check one of the boxes:", e.disability);
        window.EightfoldEngine.fillRadioGroup("Please check one of the boxes:-", e.veteran);

        // 4. Visa Sponsorship Textarea
        if (e.requireSponsorship !== undefined) {
            const sponsorshipText = e.requireSponsorship ? "Yes, I will require sponsorship." : "No, I do not require sponsorship.";
            window.EightfoldEngine.setNativeValue(window.EightfoldEngine.findInputByLabelText("Will you now, or in the future, require visa sponsorship? If so, please explain."), sponsorshipText);
        }

    } finally {
        window.EightfoldEngine.isRunning = false;
    }
};

// Main Orchestrator
const startEightfoldEngine = () => {
    chrome.storage.local.get(["autofillEnabled", "profileData"], (res) => {
        if (res.autofillEnabled === false || !res.profileData) return;

        setInterval(() => {
            window.EightfoldEngine.runAutofill(res.profileData);
        }, 1500); 
    });
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEightfoldEngine);
} else {
    startEightfoldEngine();
}