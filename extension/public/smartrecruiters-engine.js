// public/smartrecruiters-engine.js
console.log("[FastApply] SmartRecruiters Shadow-Piercing Engine Active.");

// Engine scripts share one isolated world; an IIFE keeps top-level
// declarations from colliding with utils.js or other scripts.
(() => {

window.SREngine = window.SREngine || {};
window.SREngine.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. THE SHADOW DOM PIERCER ---
// Standard Javascript cannot see inside SmartRecruiters' Angular components. We must unlock them manually.
window.SREngine.getAllRoots = () => {
    const roots = [document];
    const walk = (node) => {
        if (node.shadowRoot) roots.push(node.shadowRoot);
        if (node.children) Array.from(node.children).forEach(walk);
    };
    walk(document.body);
    return roots;
};

window.SREngine.deepQueryAll = (selector) => {
    const elements = [];
    const roots = window.SREngine.getAllRoots();
    roots.forEach(root => {
        elements.push(...Array.from(root.querySelectorAll(selector)));
    });
    return elements;
};

// Searches every open Shadow Root for labels matching our target text
window.SREngine.findInputByLabelText = (text) => {
    const roots = window.SREngine.getAllRoots();
    const wanted = text.toLowerCase().trim();

    const allLabels = [];
    roots.forEach(root => {
        root.querySelectorAll('label, .c-spl-form-field-label').forEach(label => {
            allLabels.push({ root, label });
        });
    });
    const textOf = label =>
        (label.innerText || label.textContent || "").replace(/\*/g, '').toLowerCase().trim();

    // EXACT match across ALL roots first. The old combined exact-or-partial
    // find matched "Let the company know about your interest…" for
    // "Company" and wrote the employer name into the hiring-team message.
    let hit = allLabels.find(({ label }) => textOf(label) === wanted);
    if (!hit) {
        // Bounded partial match: a real field label is close in length to
        // the search phrase, a sentence-long prompt is not.
        hit = allLabels.find(({ label }) => {
            const t = textOf(label);
            return t.includes(wanted) && t.length <= Math.max(40, wanted.length * 4);
        });
    }
    if (!hit) return null;

    const { root, label } = hit;
    // First try matching the 'for' attribute to the input's 'id'
    const forAttr = label.getAttribute('for') || label.htmlFor;
    if (forAttr) {
        const input = root.querySelector(`[id="${forAttr}"]`);
        if (input && input.dataset.fa_filled !== "true") return input;
    }
    // Fallback: Check the parent wrapper for an input
    const wrapper = label.closest('div') || root;
    const input = wrapper.querySelector('input:not([type="hidden"]), textarea, select');
    if (input && input.dataset.fa_filled !== "true") return input;
    return null;
};

// --- 2. THE ANGULAR INJECTOR ---
// Delegates to the shared implementation in utils.js (identical logic
// previously copy-pasted into each engine).
window.SREngine.setNativeValue = (element, value) =>
    window.FastApplyUtils.setEngineFieldValue(element, value);

// Autocomplete fields (City, Institution, locations) reject plain typed
// text: SmartRecruiters requires picking a suggestion, otherwise the field
// stays "Value is required". Type via the native editing pipeline so the
// suggestion list opens, then click the best suggestion.
window.SREngine.commitAutocomplete = async (input, value) => {
    if (!input || !value) return false;
    if (input.dataset.fa_committed === "true") return true;

    try {
        input.focus();
        input.select?.();
        document.execCommand("insertText", false, value);
    } catch (_) {}
    if (!String(input.value || "").trim()) {
        window.SREngine.setNativeValue(input, value);
    }
    await window.SREngine.wait(900);

    const visible = el => el.getClientRects?.().length > 0;
    let suggestions = window.SREngine.deepQueryAll(
        '[role="option"], [role="listbox"] li, ul[class*="autocomplete" i] li, li[class*="option" i], [class*="suggestion" i] li'
    ).filter(visible);

    if (suggestions.length) {
        const best = window.FastApplyUtils.findBestSemanticMatch?.(
            suggestions,
            value,
            el => (el.innerText || "").trim()
        ) || suggestions[0];
        best.click();
        await window.SREngine.wait(300);
    } else {
        // No visible list — commit via keyboard as a fallback.
        for (const key of ["ArrowDown", "Enter"]) {
            input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
        }
        await window.SREngine.wait(300);
    }

    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));

    if (String(input.value || "").trim()) {
        input.dataset.fa_committed = "true";
        input.dataset.fa_filled = "true";
        window.FastApplyUtils.setValueOwner?.(input, "deterministic");
        return true;
    }
    return false;
};

// "Pick a date" inputs reject raw profile strings like "January 2024" —
// parse and type MM/YYYY-style candidates until one sticks.
window.SREngine.fillSrDate = async (input, rawDate) => {
    if (!input || input.dataset.fa_filled === "true") return false;

    const text = String(rawDate || "").trim();
    if (!text) return false;
    let month = null;
    let year = null;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        month = parsed.getMonth() + 1;
        year = parsed.getFullYear();
    } else {
        const monthYear = text.match(/(\d{1,2})[\/\-.](\d{4})/);
        if (monthYear) { month = Number(monthYear[1]); year = Number(monthYear[2]); }
        else {
            const yearOnly = text.match(/(19|20)\d{2}/);
            if (yearOnly) { month = 1; year = Number(yearOnly[0]); }
        }
    }
    if (!year) return false;

    const mm = String(month || 1).padStart(2, "0");
    const candidates = [`${mm}/${year}`, `${mm}/01/${year}`, `${year}-${mm}`];

    for (const candidate of candidates) {
        try {
            input.focus();
            input.select?.();
            document.execCommand("insertText", false, candidate);
        } catch (_) {}
        if (!String(input.value || "").trim()) {
            try {
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, "value"
                )?.set;
                if (setter) setter.call(input, candidate);
                else input.value = candidate;
            } catch (_) {}
            input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        }
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
        await window.SREngine.wait(250);

        if (String(input.value || "").includes(String(year))) {
            input.dataset.fa_filled = "true";
            window.FastApplyUtils.setValueOwner?.(input, "deterministic");
            return true;
        }
        try {
            input.focus();
            input.select?.();
            document.execCommand("delete");
        } catch (_) {}
    }
    return false;
};

// The phone widget defaults its country picker by geo-IP (a Swiss +41 makes
// a US number "not valid"). Align the picker with the profile country and
// re-validate the number.
window.SREngine.fixPhoneCountry = async (profile) => {
    const c = profile.contactInfo || {};
    if (!/united states|usa|u\.s/i.test(String(c.country || ""))) return false;

    const phoneInput = window.SREngine.deepQueryAll('input[type="tel"]')[0] ||
        window.SREngine.findInputByLabelText("Phone number");
    if (!phoneInput) return false;

    let digits = String(c.phone || "").replace(/[^\d]/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (!digits) return false;

    const selects = window.SREngine.deepQueryAll("select");
    const countrySelect = selects.find(select => {
        const options = Array.from(select.options || []);
        return options.length > 30 && options.some(option => {
            return /\+\d{1,4}/.test(option.text) || /united states|switzerland/i.test(option.text);
        });
    });

    if (countrySelect) {
        const current = (countrySelect.options[countrySelect.selectedIndex]?.text || "");
        if (!/united states|\+1\b/i.test(current)) {
            const usOption = Array.from(countrySelect.options).find(option => {
                return /united states/i.test(option.text);
            });
            if (usOption) {
                countrySelect.value = usOption.value;
                countrySelect.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
                countrySelect.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
                await window.SREngine.wait(300);
            }
        }
        // Re-enter the number so it validates against the corrected code.
        try {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, "value"
            )?.set;
            if (setter) setter.call(phoneInput, digits);
            else phoneInput.value = digits;
        } catch (_) {}
        phoneInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        phoneInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        phoneInput.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
        phoneInput.dataset.fa_filled = "true";
        return true;
    }

    // No native select (intl-tel-input style): a full +1 number sets the flag.
    if (!String(phoneInput.value || "").startsWith("+")) {
        try {
            phoneInput.focus();
            phoneInput.select?.();
            document.execCommand("insertText", false, `+1${digits}`);
        } catch (_) {}
        phoneInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        phoneInput.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
    }
    return true;
};

// --- 3. SECTION HANDLERS ---
window.SREngine.fillPersonalInfo = async (profile) => {
    const p = profile.personalInfo || {};
    const c = profile.contactInfo || {};

    const mappings = [
        { label: "First name", value: p.firstName },
        { label: "Last name", value: p.lastName },
        { label: "Email", value: c.email },
        { label: "Confirm your email", value: c.email }
    ];

    for (const map of mappings) {
        const input = window.SREngine.findInputByLabelText(map.label);
        if (input) {
            window.SREngine.setNativeValue(input, map.value);
            await window.SREngine.wait(200);
        }
    }

    // City must be committed through its suggestion list.
    const cityInput = window.SREngine.findInputByLabelText("City");
    if (cityInput) await window.SREngine.commitAutocomplete(cityInput, c.city);

    // Phone: number + geo-defaulted country picker correction.
    await window.SREngine.fixPhoneCountry(profile);
};

window.SREngine.fillProfiles = async (profile) => {
    const links = profile.websitesAndSkills || {};
    const mappings = [
        { label: "LinkedIn", value: links.linkedin },
        { label: "Facebook", value: links.facebook },
        { label: "X (fka Twitter)", value: links.twitter },
        { label: "Website", value: links.portfolio || links.github }
    ];

    for (const map of mappings) {
        const input = window.SREngine.findInputByLabelText(map.label);
        if (input) window.SREngine.setNativeValue(input, map.value);
    }
};

// Clicks the "+ Add" button for specific sections across Shadow Boundaries
window.SREngine.clickSectionAddButton = (sectionKeyword) => {
    const roots = window.SREngine.getAllRoots();
    for (const root of roots) {
        const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, p, legend'));
        const heading = headings.find(h => (h.innerText || h.textContent || "").toLowerCase().includes(sectionKeyword));

        if (heading) {
            let container = heading.parentElement;
            for (let i = 0; i < 6; i++) { // Walk up the DOM tree looking for the Add button
                if (!container) break;
                const btns = Array.from(container.querySelectorAll('button'));
                const addBtn = btns.find(b => (b.innerText || b.textContent || "").toLowerCase().includes("add") && !b.dataset.fa_clicked);

                if (addBtn) {
                    addBtn.dataset.fa_clicked = "true";
                    addBtn.click();
                    return true;
                }
                // Jump the Shadow DOM boundary if the container is an isolated component
                container = container.parentElement || (container.getRootNode() && container.getRootNode().host);
            }
        }
    }
    return false;
};

// Safe sequential loops for repeating arrays
window.SREngine.handleExperience = async (workHistory) => {
    if (!workHistory || workHistory.length === 0) return;
    if (window.SREngine.isAddingExp) return;
    window.SREngine.isAddingExp = true;

    try {
        const existingTitles = window.SREngine.deepQueryAll('h4, p, span').map(el => (el.innerText || "").toLowerCase());

        for (const work of workHistory) {
            if (!work.jobTitle) continue;
            if (existingTitles.some(t => t.includes(work.jobTitle.toLowerCase()))) continue; // Skip if already visually on page

            const clicked = window.SREngine.clickSectionAddButton("experience");
            if (clicked) await window.SREngine.wait(1200); // Wait for modal to slide down

            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Title"), work.jobTitle);
            await window.SREngine.wait(200);
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Company"), work.company);
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("location"), work.location);
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Description"), work.description);
            await window.SREngine.fillSrDate(window.SREngine.findInputByLabelText("From"), work.startDate);

            if (work.currentlyWorkHere) {
                const cbs = window.SREngine.deepQueryAll('input[type="checkbox"]');
                const currentCb = cbs[cbs.length - 1]; // Grabs the most recently rendered checkbox
                if (currentCb && !currentCb.checked) currentCb.click();
            } else {
                await window.SREngine.fillSrDate(window.SREngine.findInputByLabelText("To"), work.endDate);
            }

            await window.SREngine.wait(500);

            const btns = window.SREngine.deepQueryAll('button');
            const saveBtn = btns.find(b => (b.innerText || "").toLowerCase().trim() === "save");
            if (saveBtn) {
                saveBtn.click();
                await window.SREngine.wait(1500); // Wait for modal to close into a card
            }
            break; // Stop loop and let the orchestrator run it again so DOM stays fresh
        }
    } finally {
        window.SREngine.isAddingExp = false;
    }
};

window.SREngine.handleEducation = async (eduHistory) => {
    if (!eduHistory || eduHistory.length === 0) return;
    if (window.SREngine.isAddingEdu) return;
    window.SREngine.isAddingEdu = true;

    try {
        const existingSchools = window.SREngine.deepQueryAll('h4, p, span').map(el => (el.innerText || "").toLowerCase());

        for (const edu of eduHistory) {
            if (!edu.school) continue;
            if (existingSchools.some(s => s.includes(edu.school.toLowerCase()))) continue;

            const clicked = window.SREngine.clickSectionAddButton("education");
            if (clicked) await window.SREngine.wait(1200);

            // Institution is a suggestion-committed autocomplete like City.
            const institutionInput = window.SREngine.findInputByLabelText("Institution");
            if (!(await window.SREngine.commitAutocomplete(institutionInput, edu.school))) {
                window.SREngine.setNativeValue(institutionInput, edu.school);
            }
            await window.SREngine.wait(200);
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Major"), edu.major);
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Degree"), edu.degree);
            const schoolLocationInput = window.SREngine.findInputByLabelText("School location");
            if (schoolLocationInput && edu.institutionLocation) {
                await window.SREngine.commitAutocomplete(schoolLocationInput, edu.institutionLocation);
            }
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Description"), edu.description || "");
            await window.SREngine.fillSrDate(window.SREngine.findInputByLabelText("From"), edu.startDate);

            if (edu.currentlyAttending) {
                const cbs = window.SREngine.deepQueryAll('input[type="checkbox"]');
                const currentCb = cbs[cbs.length - 1];
                if (currentCb && !currentCb.checked) currentCb.click();
            } else {
                await window.SREngine.fillSrDate(window.SREngine.findInputByLabelText("To"), edu.endDate);
            }

            await window.SREngine.wait(500);

            const btns = window.SREngine.deepQueryAll('button');
            const saveBtn = btns.find(b => (b.innerText || "").toLowerCase().trim() === "save");
            if (saveBtn) {
                saveBtn.click();
                await window.SREngine.wait(1500);
            }
            break;
        }
    } finally {
        window.SREngine.isAddingEdu = false;
    }
};

// --- ORCHESTRATOR LOOP ---
const startSREngine = () => {
    window.FastApplyUtils.loadProfileData((profileData, autofillEnabled) => {
        if (!autofillEnabled || !profileData) return;
        const res = { profileData };
        let currentProfile = res.profileData;
        let pendingRun = 0;
        const run = () => runSmartRecruitersDeterministic(currentProfile);
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

const runSmartRecruitersDeterministic = async profile => {
    try {
        await window.SREngine.fillPersonalInfo(profile);
        await window.SREngine.fillProfiles(profile);

        await window.SREngine.handleExperience(profile.workHistory);
        await window.SREngine.handleEducation(profile.educationHistory);
    } catch (error) {
        console.warn("[FastApply] SmartRecruiters pass failed:", error);
    }
};

window.FastApplyAgent2Controller?.register({
    atsPlatform: "smartrecruiters",
    runDeterministic: runSmartRecruitersDeterministic
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSREngine);
} else {
    startSREngine();
}
})();
