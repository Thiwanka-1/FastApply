import axios from 'axios';

// We define the empty template. The AI will treat this like a form to fill out.
const JSON_TEMPLATE = {
  personalInfo: { firstName: "", lastName: "", preferredName: "", pronouns: "", languages: [{ language: "", proficiency: "", fluent: false }] },
  contactInfo: { email: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "", country: "", postalCode: "" },
  websitesAndSkills: { linkedin: "", github: "", twitter: "", portfolio: "", skills: [] },
  workHistory: [{ jobTitle: "", company: "", location: "", employmentType: "", currentlyWorkHere: false, startDate: "", endDate: "", description: "" }],
  educationHistory: [{ school: "", institutionLocation: "", degree: "", major: "", minor: "", gpa: "", gpaScale: "", startDate: "", endDate: "" }],
  eeo: { optOut: false, authorizedToWork: "", requireVisaNow: "", requireVisaFuture: "", disability: "", veteran: "", gender: "", ethnicity: "", age: "" }
};

// Safe un-nester that will never trigger a Regex Syntax Error
const sanitizeLLMOutput = (rawResponse) => {
  let text = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse);
  
  // Safely strip markdown code blocks without regex
  if (text.includes('```')) {
    text = text.split('```json').join('');
    text = text.split('```').join('');
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI did not return any valid JSON structure.");
  
  let parsed = JSON.parse(jsonMatch[0].trim());

  if (parsed.Target_Schema_Layout) parsed = parsed.Target_Schema_Layout;
  if (parsed.profile) parsed = parsed.profile;
  if (parsed.data) parsed = parsed.data;

  return parsed;
};

// --- OLLAMA METHOD (LOCAL) ---
async function callOllama(textContext) {
  const url = `${process.env.OLLAMA_BASE_URL}/api/generate`;
  
  // The "Fill-In-The-Blanks" Prompt Strategy
  const prompt = `You are a highly accurate Applicant Tracking System (ATS) AI. Read the provided Resume and Questionnaire and fill in the missing values in the JSON template below.

CRITICAL RULES TO AVOID MISSING DATA:
1. WORK HISTORY DATES: Look closely at the "Professional Experience" section. You MUST extract "startDate" (e.g. "August 2016") and "endDate" (e.g. "August 2024") and "jobTitle" for EVERY single job. Do not skip any jobs.
2. EDUCATION DATES & GPA: Extract "startDate" (e.g. "Aug/2004") and "endDate". If GPA is a percentage (like 72%), multiply by 0.04 to get the 4.0 scale (e.g. "2.88"). Set "gpaScale" to "4.0".
3. MULTIPLE LANGUAGES: Look for "Are you fluent in any languages". Extract ALL of them (e.g., Hindi, Marathi, English). Add an object for each.
4. EEO COMPLIANCE (STRICT MATCHING): You must match the questionnaire answers EXACTLY to these options:
   - disability: "Yes, I have a disability" or "No, I don't have a disability"
   - veteran: "I am a protected veteran" or "I am not a protected veteran"
   - authorizedToWork / requireVisaNow / requireVisaFuture: "Yes" or "No"
5. COUNTRY: Do not forget to map the Address Country to "United States" if they live in the US.

OUTPUT FORMAT: Return ONLY valid JSON matching this exact structure filled with the candidate's data.

JSON TEMPLATE TO FILL:
${JSON.stringify(JSON_TEMPLATE, null, 2)}

RAW DOCUMENTS TO PROCESS:
${textContext}`;

  const response = await axios.post(url, {
    model: process.env.OLLAMA_MODEL || "llama3.1",
    prompt: prompt,
    stream: false,
    options: { 
      temperature: 0.0,
      num_ctx: 8192 // Ensure it reads the whole context
    }, 
    format: "json" // Back to basic JSON mode instead of rigid schema mode
  });

  return sanitizeLLMOutput(response.data.response);
}

// --- HUGGING FACE METHOD (PRODUCTION) ---
async function callHuggingFace(textContext) {
  const model = process.env.HF_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct";
  const url = `[https://api-inference.huggingface.co/models/$](https://api-inference.huggingface.co/models/$){model}`;
  
  const systemPrompt = `You are a strict JSON data extractor. Fill the template exactly. Output RAW JSON ONLY.`;
  const userPrompt = `Template to fill:\n${JSON.stringify(JSON_TEMPLATE, null, 2)}\n\nDocuments:\n${textContext}`;

  const response = await axios.post(
    url,
    {
      inputs: `<|system|>\n${systemPrompt}\n<|user|>\n${userPrompt}\n<|assistant|>\n`,
      parameters: { max_new_tokens: 2048, temperature: 0.1, return_full_text: false }
    },
    { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}`, 'Content-Type': 'application/json' } }
  );

  return sanitizeLLMOutput(response.data[0].generated_text);
}

export const extractProfileData = async (textContext) => {
  const provider = process.env.LLM_PROVIDER || 'ollama';
  if (provider === 'ollama') return await callOllama(textContext);
  if (provider === 'huggingface') return await callHuggingFace(textContext);
  throw new Error(`Unsupported LLM provider: ${provider}`);
};