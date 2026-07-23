import axios from "axios";

// ======================================================
// CONFIGURATION
// ======================================================

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.1";

const DEFAULT_HF_BASE_URL = "https://router.huggingface.co/v1";

// This model is currently shown by Hugging Face as a recommended
// conversational instruction model. You can override it in .env.
const DEFAULT_HF_MODEL = "openai/gpt-oss-20b";

const DEFAULT_REQUEST_TIMEOUT = 120_000;
const DEFAULT_HF_MAX_TOKENS = 4096;

// ======================================================
// PROFILE JSON TEMPLATE
// ======================================================

const JSON_TEMPLATE = {
  personalInfo: {
    firstName: "",
    lastName: "",
    preferredName: "",
    pronouns: "",
    languages: [
      {
        language: "",
        proficiency: "",
        fluent: false,
      },
    ],
  },

  contactInfo: {
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
  },

  websitesAndSkills: {
    linkedin: "",
    github: "",
    twitter: "",
    portfolio: "",
    skills: [],
  },

  workHistory: [
    {
      jobTitle: "",
      company: "",
      location: "",
      employmentType: "",
      currentlyWorkHere: false,
      startDate: "",
      endDate: "",
      description: "",
    },
  ],

  educationHistory: [
    {
      school: "",
      institutionLocation: "",
      degree: "",
      major: "",
      minor: "",
      gpa: "",
      gpaScale: "",
      startDate: "",
      endDate: "",
    },
  ],

  eeo: {
    optOut: false,
    authorizedToWork: "",
    requireVisaNow: "",
    requireVisaFuture: "",
    disability: "",
    veteran: "",
    gender: "",
    ethnicity: "",
    age: "",
  },
};

// ======================================================
// GENERAL HELPERS
// ======================================================

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeProviderName() {
  return (process.env.LLM_PROVIDER || "ollama")
    .trim()
    .toLowerCase();
}

function removeTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

function unwrapLLMResponse(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  if (
    parsed.Target_Schema_Layout &&
    typeof parsed.Target_Schema_Layout === "object"
  ) {
    return parsed.Target_Schema_Layout;
  }

  if (parsed.profile && typeof parsed.profile === "object") {
    return parsed.profile;
  }

  if (parsed.data && typeof parsed.data === "object") {
    return parsed.data;
  }

  return parsed;
}

/**
 * Finds the first complete JSON object in a string.
 *
 * This is safer than a greedy regular expression because it understands:
 * - Nested JSON objects
 * - Braces inside JSON strings
 * - Escaped quotation marks
 */
function extractFirstJSONObject(text) {
  let objectStart = -1;
  let objectDepth = 0;
  let insideString = false;
  let escapedCharacter = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (insideString) {
      if (escapedCharacter) {
        escapedCharacter = false;
        continue;
      }

      if (character === "\\") {
        escapedCharacter = true;
        continue;
      }

      if (character === '"') {
        insideString = false;
      }

      continue;
    }

    if (character === '"') {
      insideString = true;
      continue;
    }

    if (character === "{") {
      if (objectDepth === 0) {
        objectStart = index;
      }

      objectDepth += 1;
      continue;
    }

    if (character === "}") {
      if (objectDepth === 0) {
        continue;
      }

      objectDepth -= 1;

      if (objectDepth === 0 && objectStart !== -1) {
        return text.slice(objectStart, index + 1);
      }
    }
  }

  return null;
}

/**
 * Converts an LLM response into a JavaScript object.
 */
const sanitizeLLMOutput = (rawResponse) => {
  if (rawResponse === null || rawResponse === undefined) {
    throw new Error("AI returned an empty response.");
  }

  // The provider may already return a parsed object.
  if (
    typeof rawResponse === "object" &&
    !Array.isArray(rawResponse)
  ) {
    return unwrapLLMResponse(rawResponse);
  }

  let text =
    typeof rawResponse === "string"
      ? rawResponse.trim()
      : JSON.stringify(rawResponse);

  // Remove common Markdown code-block markers.
  const markdownMarkers = [
    "```json",
    "```JSON",
    "```Json",
    "```javascript",
    "```js",
    "```",
  ];

  for (const marker of markdownMarkers) {
    text = text.split(marker).join("");
  }

  text = text.trim();

  // First try parsing the entire response.
  try {
    const parsed = JSON.parse(text);
    return unwrapLLMResponse(parsed);
  } catch {
    // Continue and search for the first complete JSON object.
  }

  const jsonText = extractFirstJSONObject(text);

  if (!jsonText) {
    throw new Error(
      `AI did not return a valid JSON object. Response started with: ${text.slice(
        0,
        300,
      )}`,
    );
  }

  try {
    const parsed = JSON.parse(jsonText);
    return unwrapLLMResponse(parsed);
  } catch (error) {
    throw new Error(
      `AI returned malformed JSON: ${error.message}`,
    );
  }
};

// ======================================================
// PROMPT BUILDERS
// ======================================================

function buildProfilePrompts(textContext) {
  const systemPrompt = `
You are a highly accurate Applicant Tracking System data extractor.

Read the candidate's resume and questionnaire and fill the supplied JSON
template using only information found in the documents.

CRITICAL RULES:

1. WORK HISTORY
- Extract every job found in the documents.
- Do not skip jobs.
- Extract jobTitle, company, location, employmentType, startDate, endDate,
  currentlyWorkHere, and description when available.
- If the candidate currently works there, set currentlyWorkHere to true.

2. EDUCATION
- Extract every education entry.
- Extract school, location, degree, major, minor, GPA, start date, and end date.
- If GPA is provided as a percentage, multiply it by 0.04 to estimate the
  4.0 scale.
- When converting a percentage, set gpaScale to "4.0".

3. LANGUAGES
- Extract every language mentioned.
- Create one language object for every language.
- Do not combine multiple languages into one string.

4. EEO AND WORK AUTHORIZATION
Use these exact values when the documents clearly support them:

- disability:
  "Yes, I have a disability"
  or
  "No, I don't have a disability"

- veteran:
  "I am a protected veteran"
  or
  "I am not a protected veteran"

- authorizedToWork:
  "Yes" or "No"

- requireVisaNow:
  "Yes" or "No"

- requireVisaFuture:
  "Yes" or "No"

5. COUNTRY
- If the address is clearly located in the United States, set country to
  "United States".

6. MISSING INFORMATION
- Do not invent information.
- Use an empty string for unavailable text fields.
- Use false for unavailable boolean fields.
- Use an empty array when no list data is available.

7. OUTPUT
- Return one raw JSON object only.
- Do not include Markdown.
- Do not include explanations.
- Preserve the supplied JSON structure.
`.trim();

  const userPrompt = `
Fill this JSON template:

${JSON.stringify(JSON_TEMPLATE, null, 2)}

CANDIDATE DOCUMENTS:

${textContext}
`.trim();

  return {
    systemPrompt,
    userPrompt,
  };
}

function buildFormAnswerPrompts(
  context,
  company,
  jobTitle,
  answerTemplate,
) {
  const systemPrompt = `
You are a professional job applicant completing a job application.

Answer each question using only information supported by the applicant's
background documents.

RULES:

1. Write answers in the first person using "I", "me", and "my".
2. Keep answers concise, professional, natural, and human-sounding.
3. Tailor the answers to the supplied company and job title.
4. Do not invent qualifications, experience, education, certifications,
   achievements, or skills.
5. Use the exact application questions as the JSON keys.
6. Return one raw JSON object only.
7. Do not include Markdown or explanations.
`.trim();

  const userPrompt = `
COMPANY:
${company || "Not provided"}

JOB TITLE:
${jobTitle || "Not provided"}

APPLICANT BACKGROUND DOCUMENTS:

${context}

Fill the following JSON template:

${JSON.stringify(answerTemplate, null, 2)}
`.trim();

  return {
    systemPrompt,
    userPrompt,
  };
}

// ======================================================
// OLLAMA HELPERS
// ======================================================

function getOllamaEndpoint() {
  const baseURL = removeTrailingSlashes(
    process.env.OLLAMA_BASE_URL?.trim() ||
      DEFAULT_OLLAMA_BASE_URL,
  );

  return `${baseURL}/api/generate`;
}

function createOllamaError(error) {
  if (!axios.isAxiosError(error)) {
    return error;
  }

  if (error.code === "ECONNREFUSED") {
    return new Error(
      "Could not connect to Ollama. Make sure Ollama is running and OLLAMA_BASE_URL is correct.",
    );
  }

  if (error.code === "ETIMEDOUT") {
    return new Error(
      "The Ollama request timed out before the model finished responding.",
    );
  }

  const status = error.response?.status;
  const responseData = error.response?.data;

  const details = responseData
    ? typeof responseData === "string"
      ? responseData
      : JSON.stringify(responseData)
    : error.message;

  return new Error(
    `Ollama request failed${
      status ? ` with HTTP ${status}` : ""
    }: ${details}`,
  );
}

// ======================================================
// OLLAMA: PROFILE EXTRACTION
// ======================================================

async function callOllama(textContext) {
  const { systemPrompt, userPrompt } =
    buildProfilePrompts(textContext);

  const prompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const response = await axios.post(
      getOllamaEndpoint(),
      {
        model:
          process.env.OLLAMA_MODEL?.trim() ||
          DEFAULT_OLLAMA_MODEL,

        prompt,

        stream: false,

        options: {
          temperature: 0,
          num_ctx: parsePositiveInteger(
            process.env.OLLAMA_NUM_CTX,
            8192,
          ),
        },

        format: "json",
      },
      {
        timeout: parsePositiveInteger(
          process.env.LLM_REQUEST_TIMEOUT,
          DEFAULT_REQUEST_TIMEOUT,
        ),
      },
    );

    const generatedText = response.data?.response;

    if (!generatedText) {
      throw new Error(
        `Ollama returned an unexpected response: ${JSON.stringify(
          response.data,
        )}`,
      );
    }

    return sanitizeLLMOutput(generatedText);
  } catch (error) {
    throw createOllamaError(error);
  }
}

// ======================================================
// HUGGING FACE HELPERS
// ======================================================

function getHuggingFaceEndpoint() {
  const configuredBaseURL =
    process.env.HF_BASE_URL?.trim() ||
    DEFAULT_HF_BASE_URL;

  if (
    configuredBaseURL.includes(
      "api-inference.huggingface.co",
    )
  ) {
    throw new Error(
      "HF_BASE_URL is using the old api-inference.huggingface.co endpoint. Change it to https://router.huggingface.co/v1",
    );
  }

  const cleanBaseURL =
    removeTrailingSlashes(configuredBaseURL);

  // Support either:
  // HF_BASE_URL=https://router.huggingface.co/v1
  // or:
  // HF_BASE_URL=https://router.huggingface.co/v1/chat/completions
  if (cleanBaseURL.endsWith("/chat/completions")) {
    return cleanBaseURL;
  }

  return `${cleanBaseURL}/chat/completions`;
}

function getHuggingFaceToken() {
  const token = (
    process.env.HF_API_KEY ||
    process.env.HF_TOKEN ||
    ""
  ).trim();

  if (!token) {
    throw new Error(
      "Missing Hugging Face token. Add HF_API_KEY or HF_TOKEN to your .env file.",
    );
  }

  return token;
}

function getHuggingFaceModel() {
  const configuredModel =
    process.env.HF_MODEL?.trim() ||
    DEFAULT_HF_MODEL;

  // A model may already contain a routing suffix:
  // model-name:fastest
  // model-name:cheapest
  // model-name:preferred
  // model-name:together
  if (configuredModel.includes(":")) {
    return configuredModel;
  }

  const providerOrPolicy = (
    process.env.HF_PROVIDER ||
    process.env.HF_PROVIDER_POLICY ||
    ""
  )
    .trim()
    .toLowerCase();

  // When no suffix is supplied, the HF router automatically chooses
  // an available provider.
  if (!providerOrPolicy) {
    return configuredModel;
  }

  // "auto" is represented by the fastest routing policy when using
  // the OpenAI-compatible HTTP endpoint.
  if (providerOrPolicy === "auto") {
    return `${configuredModel}:fastest`;
  }

  return `${configuredModel}:${providerOrPolicy}`;
}

function responseFormatIsUnsupported(error) {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;

  if (status !== 400 && status !== 422) {
    return false;
  }

  const responseData = JSON.stringify(
    error.response?.data || "",
  ).toLowerCase();

  return (
    responseData.includes("response_format") ||
    responseData.includes("json_object") ||
    responseData.includes("structured output") ||
    responseData.includes("structured-output")
  );
}

function createHuggingFaceError(error, model, endpoint) {
  if (!axios.isAxiosError(error)) {
    return error;
  }

  const status = error.response?.status;
  const responseData = error.response?.data;
  const networkCode = error.code;

  if (networkCode === "ENOTFOUND") {
    let hostname = "router.huggingface.co";

    try {
      hostname = new URL(endpoint).hostname;
    } catch {
      // Keep the default hostname.
    }

    return new Error(
      `DNS could not resolve ${hostname}. The application is using the current Hugging Face router endpoint, so check your Windows DNS, VPN, proxy, firewall, or internet connection. Original error: ${error.message}`,
    );
  }

  if (networkCode === "ETIMEDOUT") {
    return new Error(
      "The Hugging Face request timed out before the model responded.",
    );
  }

  if (
    networkCode === "ECONNRESET" ||
    networkCode === "ECONNREFUSED"
  ) {
    return new Error(
      `Could not establish a connection to Hugging Face. Network error: ${networkCode}.`,
    );
  }

  const details = responseData
    ? typeof responseData === "string"
      ? responseData
      : JSON.stringify(responseData)
    : error.message;

  if (status === 401) {
    return new Error(
      `Hugging Face authentication failed. Check HF_API_KEY and make sure the token has Inference Providers permission. Details: ${details}`,
    );
  }

  if (status === 402) {
    return new Error(
      `Hugging Face billing or inference credits are required for model "${model}". Details: ${details}`,
    );
  }

  if (status === 403) {
    return new Error(
      `Access to Hugging Face model "${model}" was denied. The model may be gated, your account may need to accept its license, or the token may not have the necessary permission. Details: ${details}`,
    );
  }

  if (status === 404) {
    return new Error(
      `Hugging Face could not find an available inference provider for model "${model}", or the model name is incorrect. Details: ${details}`,
    );
  }

  if (status === 429) {
    return new Error(
      `Hugging Face rate limit exceeded. Try again after the rate-limit period. Details: ${details}`,
    );
  }

  return new Error(
    `Hugging Face request failed${
      status ? ` with HTTP ${status}` : ""
    }${networkCode ? ` (${networkCode})` : ""}: ${details}`,
  );
}

/**
 * Sends a chat-completion request through the current Hugging Face
 * OpenAI-compatible router.
 *
 * It first requests JSON mode. If the selected provider does not support
 * response_format, it retries once without response_format.
 */
async function makeHuggingFaceRequest({
  systemPrompt,
  userPrompt,
  temperature,
}) {
  const endpoint = getHuggingFaceEndpoint();
  const token = getHuggingFaceToken();
  const model = getHuggingFaceModel();

  const basePayload = {
    model,

    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],

    temperature,

    max_tokens: parsePositiveInteger(
      process.env.HF_MAX_TOKENS,
      DEFAULT_HF_MAX_TOKENS,
    ),

    stream: false,
  };

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },

    timeout: parsePositiveInteger(
      process.env.LLM_REQUEST_TIMEOUT,
      DEFAULT_REQUEST_TIMEOUT,
    ),
  };

  let response;

  try {
    try {
      // JSON mode is preferred because your application needs
      // machine-readable output.
      response = await axios.post(
        endpoint,
        {
          ...basePayload,
          response_format: {
            type: "json_object",
          },
        },
        axiosConfig,
      );
    } catch (error) {
      if (!responseFormatIsUnsupported(error)) {
        throw error;
      }

      console.warn(
        `Hugging Face provider for "${model}" does not support response_format. Retrying without JSON mode.`,
      );

      response = await axios.post(
        endpoint,
        basePayload,
        axiosConfig,
      );
    }
  } catch (error) {
    throw createHuggingFaceError(
      error,
      model,
      endpoint,
    );
  }

  const choice = response.data?.choices?.[0];
  const generatedContent = choice?.message?.content;

  if (
    choice?.finish_reason === "length" &&
    generatedContent
  ) {
    throw new Error(
      `Hugging Face stopped because the output reached HF_MAX_TOKENS. Increase HF_MAX_TOKENS in your .env file. Partial response: ${generatedContent.slice(
        0,
        300,
      )}`,
    );
  }

  if (!generatedContent) {
    throw new Error(
      `Hugging Face returned an unexpected response: ${JSON.stringify(
        response.data,
      )}`,
    );
  }

  return sanitizeLLMOutput(generatedContent);
}

// ======================================================
// HUGGING FACE: PROFILE EXTRACTION
// ======================================================

async function callHuggingFace(textContext) {
  const { systemPrompt, userPrompt } =
    buildProfilePrompts(textContext);

  return makeHuggingFaceRequest({
    systemPrompt,
    userPrompt,
    temperature: 0.1,
  });
}

// ======================================================
// EXPORTED PROFILE EXTRACTION FUNCTION
// ======================================================

export const extractProfileData = async (
  textContext,
) => {
  if (
    typeof textContext !== "string" ||
    !textContext.trim()
  ) {
    throw new Error(
      "extractProfileData requires a non-empty textContext string.",
    );
  }

  const provider = normalizeProviderName();

  if (provider === "ollama") {
    return callOllama(textContext);
  }

  if (
    provider === "huggingface" ||
    provider === "hugging-face" ||
    provider === "hf"
  ) {
    return callHuggingFace(textContext);
  }

  throw new Error(
    `Unsupported LLM provider: "${provider}". Use "ollama" or "huggingface".`,
  );
};

// ======================================================
// OLLAMA: FORM ANSWERING
// ======================================================

async function callOllamaForAnswers(
  context,
  company,
  jobTitle,
  questions,
) {
  const answerTemplate = {};

  for (const question of questions) {
    answerTemplate[question] = "";
  }

  const { systemPrompt, userPrompt } =
    buildFormAnswerPrompts(
      context,
      company,
      jobTitle,
      answerTemplate,
    );

  const prompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const response = await axios.post(
      getOllamaEndpoint(),
      {
        model:
          process.env.OLLAMA_MODEL?.trim() ||
          DEFAULT_OLLAMA_MODEL,

        prompt,

        stream: false,

        options: {
          temperature: 0.3,
          num_ctx: parsePositiveInteger(
            process.env.OLLAMA_NUM_CTX,
            8192,
          ),
        },

        format: "json",
      },
      {
        timeout: parsePositiveInteger(
          process.env.LLM_REQUEST_TIMEOUT,
          DEFAULT_REQUEST_TIMEOUT,
        ),
      },
    );

    const generatedText = response.data?.response;

    if (!generatedText) {
      throw new Error(
        `Ollama returned an unexpected response: ${JSON.stringify(
          response.data,
        )}`,
      );
    }

    return sanitizeLLMOutput(generatedText);
  } catch (error) {
    throw createOllamaError(error);
  }
}

// ======================================================
// HUGGING FACE: FORM ANSWERING
// ======================================================

async function callHuggingFaceForAnswers(
  context,
  company,
  jobTitle,
  questions,
) {
  const answerTemplate = {};

  for (const question of questions) {
    answerTemplate[question] = "";
  }

  const { systemPrompt, userPrompt } =
    buildFormAnswerPrompts(
      context,
      company,
      jobTitle,
      answerTemplate,
    );

  return makeHuggingFaceRequest({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
  });
}

// ======================================================
// EXPORTED FORM ANSWERING FUNCTION
// ======================================================

export const generateFormAnswers = async (
  context,
  company,
  jobTitle,
  questions,
) => {
  if (typeof context !== "string" || !context.trim()) {
    throw new Error(
      "generateFormAnswers requires a non-empty context string.",
    );
  }

  if (!Array.isArray(questions)) {
    throw new Error(
      "generateFormAnswers requires questions to be an array.",
    );
  }

  const validQuestions = questions.filter(
    (question) =>
      typeof question === "string" &&
      question.trim().length > 0,
  );

  if (validQuestions.length === 0) {
    return {};
  }

  const provider = normalizeProviderName();

  if (provider === "ollama") {
    return callOllamaForAnswers(
      context,
      company,
      jobTitle,
      validQuestions,
    );
  }

  if (
    provider === "huggingface" ||
    provider === "hugging-face" ||
    provider === "hf"
  ) {
    return callHuggingFaceForAnswers(
      context,
      company,
      jobTitle,
      validQuestions,
    );
  }

  throw new Error(
    `Unsupported LLM provider: "${provider}". Use "ollama" or "huggingface".`,
  );
};