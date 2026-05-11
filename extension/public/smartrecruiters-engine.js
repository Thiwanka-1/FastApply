// public/smartrecruiters-engine.js
console.log("[FastApply] SmartRecruiters Shadow-Piercing Engine Active.");

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
    for (const root of roots) {
        const labels = Array.from(root.querySelectorAll('label, .c-spl-form-field-label'));
        const label = labels.find(l => (l.innerText || l.textContent || "").toLowerCase().trim() === text.toLowerCase().trim() || 
                                       (l.innerText || l.textContent || "").toLowerCase().trim().includes(text.toLowerCase().trim()));

        if (label) {
            // First try matching the 'for' attribute to the input's 'id' (from your screenshots)
            const forAttr = label.getAttribute('for') || label.htmlFor;
            if (forAttr) {
                const input = root.querySelector(`[id="${forAttr}"]`);
                if (input && input.dataset.fa_filled !== "true") return input;
            }
            // Fallback: Check the parent wrapper for an input
            const wrapper = label.closest('div') || root;
            const input = wrapper.querySelector('input:not([type="hidden"]), textarea, select');
            if (input && input.dataset.fa_filled !== "true") return input;
        }
    }
    return null;
};

// --- 2. THE ANGULAR INJECTOR ---
window.SREngine.setNativeValue = (element, value) => {
    if (!element || !value || element.dataset.fa_filled === "true") return;
    
    element.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set ||
                         Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeSetter) {
        nativeSetter.call(element, value);
    } else {
        element.value = value;
    }

    // CRITICAL: composed: true allows the event to escape the Shadow DOM so Angular knows we typed!
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, key: 'Enter', keyCode: 13 }));

    element.dataset.fa_filled = "true";
};

// --- 3. SECTION HANDLERS ---
window.SREngine.fillPersonalInfo = async (profile) => {
    const p = profile.personalInfo || {};
    const c = profile.contactInfo || {};

    const mappings = [
        { label: "First name", value: p.firstName },
        { label: "Last name", value: p.lastName },
        { label: "Email", value: c.email },
        { label: "Confirm your email", value: c.email },
        { label: "City", value: c.city },
        { label: "Phone number", value: c.phone }
    ];

    for (const map of mappings) {
        const input = window.SREngine.findInputByLabelText(map.label);
        if (input) {
            window.SREngine.setNativeValue(input, map.value);
            await window.SREngine.wait(200); 
        }
    }
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
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("From"), work.startDate);

            if (work.currentlyWorkHere) {
                const cbs = window.SREngine.deepQueryAll('input[type="checkbox"]');
                const currentCb = cbs[cbs.length - 1]; // Grabs the most recently rendered checkbox
                if (currentCb && !currentCb.checked) currentCb.click();
            } else {
                window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("To"), work.endDate);
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

            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Institution"), edu.school);
            await window.SREngine.wait(200);
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Major"), edu.major);
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Degree"), edu.degree);
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("School location"), edu.location || "");
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("Description"), edu.description || "");
            window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("From"), edu.startDate);

            if (edu.currentlyAttending) {
                const cbs = window.SREngine.deepQueryAll('input[type="checkbox"]');
                const currentCb = cbs[cbs.length - 1]; 
                if (currentCb && !currentCb.checked) currentCb.click();
            } else {
                window.SREngine.setNativeValue(window.SREngine.findInputByLabelText("To"), edu.endDate);
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
    chrome.storage.local.get(["autofillEnabled", "profileData"], (res) => {
        if (res.autofillEnabled === false || !res.profileData) return;

        setInterval(() => {
            window.SREngine.fillPersonalInfo(res.profileData);
            window.SREngine.fillProfiles(res.profileData);
            window.SREngine.handleExperience(res.profileData.workHistory);
            window.SREngine.handleEducation(res.profileData.educationHistory);
        }, 2000); 
    });
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSREngine);
} else {
    startSREngine();
}