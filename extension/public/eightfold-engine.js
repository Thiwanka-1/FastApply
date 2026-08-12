// public/eightfold-engine.js
console.log("[FastApply] Eightfold.ai Engine Active.");

window.EightfoldEngine = window.EightfoldEngine || {};
window.EightfoldEngine.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Native React Injector
window.EightfoldEngine.setNativeValue = (element, value) => {
    const utils = window.FastApplyUtils;
    if (
        !element ||
        !value ||
        element.dataset.fa_filled === "true" ||
        utils?.isProtectedFromDeterministicFill?.(element)
    ) return false;

    const selected = element.tagName === "SELECT"
        ? element.options?.[element.selectedIndex]
        : null;
    const selectedIsPlaceholder = selected && /^(select|select one|choose|choose one|please select|none)$/i.test(
        String(selected.text || selected.label || selected.value || "").trim()
    );
    if (
        (element.tagName === "SELECT" && selected && !selected.disabled && !selectedIsPlaceholder && String(selected.value || "").trim()) ||
        (element.tagName !== "SELECT" && String(element.value || "").trim())
    ) return false;

    const label = String(utils?.getLabelText?.(element) || "").toLowerCase();
    const target = element.type === "url" || /url|website|linkedin|github|portfolio/.test(label)
        ? utils?.ensureHttpUrl?.(value)
        : element.type === "tel" || /phone|telephone|mobile/.test(label)
            ? utils?.formatPhoneNumber?.(value)
            : String(value);
    if (!target) return false;
    element.focus();
    const prototype = element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : element.tagName === "SELECT"
            ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (nativeSetter) {
        nativeSetter.call(element, target);
    } else {
        element.value = target;
    }
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    if (!String(element.value || "").trim()) return false;
    element.dataset.fa_filled = "true";
    utils?.setValueOwner?.(element, "deterministic");
    return true;
};

// Custom Fuzzy Matcher for Eightfold's specific EEO options
window.EightfoldEngine.smartMatch = (optText, targetValue) => {
    if (typeof window.FastApplyUtils?.smartMatch === "function") {
        return window.FastApplyUtils.smartMatch(optText, targetValue);
    }
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
        
        if (
            radios.length > 0 &&
            !radios[0].dataset.fa_filled &&
            !radios.some(radio => radio.checked) &&
            !radios.some(radio => window.FastApplyUtils?.isProtectedFromDeterministicFill?.(radio))
        ) {
            const labels = Array.from(container.querySelectorAll('label'));
            let matchedLabel = labels.find(l => window.EightfoldEngine.smartMatch(l.innerText, answerValue));
            
            if (matchedLabel) {
                const radio = container.querySelector(`input[id="${matchedLabel.htmlFor}"]`) || matchedLabel.querySelector('input[type="radio"]');
                if (radio && !radio.checked) {
                    radio.click(); 
                    radios.forEach(r => {
                        r.dataset.fa_filled = "true";
                        window.FastApplyUtils?.setValueOwner?.(r, "deterministic");
                    });
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
        window.EightfoldEngine.fillRadioGroup(
            "Are you currently eligible to work within the United States?",
            e.authorizedToWork
        );
        window.EightfoldEngine.fillRadioGroup("Gender", e.gender);
        window.EightfoldEngine.fillRadioGroup("What is your race/ethnicity?", e.race);
        
        // Note: Eightfold uses weird punctuation on these specific sections, mapped exactly from your photos.
        window.EightfoldEngine.fillRadioGroup("Please check one of the boxes:", e.disability);
        window.EightfoldEngine.fillRadioGroup("Please check one of the boxes:-", e.veteran);

        // 4. Visa Sponsorship Textarea
        if (e.requireVisaFuture) {
            const requiresSponsorship = String(e.requireVisaFuture).toLowerCase().startsWith("yes");
            const sponsorshipText = requiresSponsorship ? "Yes, I will require sponsorship." : "No, I do not require sponsorship.";
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
        let currentProfile = res.profileData;
        let pendingRun = 0;
        const run = () => window.EightfoldEngine.runAutofill(currentProfile);
        const schedule = () => {
            clearTimeout(pendingRun);
            pendingRun = setTimeout(run, 300);
        };

        run();
        const observer = new MutationObserver(mutations => {
            const addedFormControls = mutations.some(mutation => {
                return Array.from(mutation.addedNodes || []).some(node => {
                    return node.nodeType === Node.ELEMENT_NODE &&
                        (node.matches?.('input, select, textarea, form') ||
                         node.querySelector?.('input, select, textarea, form'));
                });
            });
            if (addedFormControls) schedule();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === "local" && changes.profileData?.newValue) {
                currentProfile = changes.profileData.newValue;
            }
        });
    });
};

window.FastApplyAgent2Controller?.register({
    atsPlatform: "eightfold",
    runDeterministic: profile => {
        return window.EightfoldEngine.runAutofill(profile);
    }
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEightfoldEngine);
} else {
    startEightfoldEngine();
}
