import Profile from '../models/Profile.js';
import { storage } from '../config/firebase.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { extractProfileData, generateFormAnswers } from '../services/llmService.js';
import Application from '../models/Application.js';
import AIUsageLog from '../models/AIUsageLog.js';

// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);
// const pdfParse = require('pdf-parse');

const extractPdfDocument = async (buffer, includePageImages = false) => {
  const parser = new PDFParse({ data: buffer });

  try {
    const textResult = await parser.getText();
    let pageImages = [];

    if (includePageImages) {
      const imageResult = await parser.getScreenshot({
        desiredWidth: 1000,
        imageDataUrl: false,
        imageBuffer: true
      });

      pageImages = imageResult.pages.map((page, index) => ({
        pageNumber: index + 1,
        dataUrl: `data:image/png;base64,${Buffer.from(page.data).toString('base64')}`
      }));
    }

    return {
      text: textResult.text || '',
      pageImages
    };
  } finally {
    await parser.destroy();
  }
};

const DOCUMENT_LABELS = {
  resume: 'RESUME',
  cqfo: 'QUESTIONNAIRE',
  coverLetter: 'COVER LETTER'
};

const cleanFileName = (fileName) => {
  return fileName.replace(/[^a-zA-Z0-9._() -]/g, '_');
};

const detectDocumentType = (fileName) => {
  const name = fileName.toLowerCase();

  if (name.includes('cover') || name.includes('letter')) {
    return 'coverLetter';
  }

  if (
    name.includes('cqfo') ||
    name.includes('questionnaire') ||
    name.includes('common question')
  ) {
    return 'cqfo';
  }

  return 'resume';
};

const getUploadedDocumentFiles = (req) => {
  const files = {
    resume: req.files?.resume?.[0] || null,
    cqfo: req.files?.cqfo?.[0] || null,
    coverLetter: req.files?.coverLetter?.[0] || null
  };

  const legacyFiles = req.files?.documents || [];

  for (const file of legacyFiles) {
    const type = detectDocumentType(file.originalname);

    if (!files[type]) {
      files[type] = file;
    }
  }

  return files;
};

const extractDocumentContent = async (file, includePageImages = false) => {
  if (file.mimetype === 'application/pdf') {
    return await extractPdfDocument(file.buffer, includePageImages);
  }

  if (
    file.mimetype ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });

    return {
      text: result.value || '',
      pageImages: []
    };
  }

  throw new Error(`Unsupported document type: ${file.mimetype}`);
};

const uploadDocumentToFirebase = async (userId, type, file, rawText) => {
  const safeName = cleanFileName(file.originalname);
  const storagePath = `user_documents/${userId}/${type}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  const snapshot = await uploadBytesResumable(storageRef, file.buffer, {
    contentType: file.mimetype
  });

  const fileUrl = await getDownloadURL(snapshot.ref);

  return {
    fileName: file.originalname,
    fileUrl,
    storagePath,
    rawText,
    mimeType: file.mimetype,
    uploadedAt: new Date()
  };
};

const deleteFirebaseFile = async (storagePathOrUrl) => {
  if (!storagePathOrUrl) return;

  try {
    const fileRef = ref(storage, storagePathOrUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.warn(`Could not delete Firebase file: ${error.message}`);
  }
};

const getOldDocumentReference = (document) => {
  return document?.storagePath || document?.fileUrl || '';
};


const cleanText = (value) => {
  return typeof value === 'string' ? value.trim() : '';
};

const cleanStringArray = (values) => {
  if (!Array.isArray(values)) return [];

  return [...new Set(
    values
      .filter(value => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
  )];
};

const cleanLanguages = (languages) => {
  if (!Array.isArray(languages)) return [];

  return languages
    .map(item => ({
      language: cleanText(item?.language),
      proficiency: cleanText(item?.proficiency),
      fluent: item?.fluent === true
    }))
    .filter(item => item.language);
};

const cleanWorkHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
    .map(item => ({
      jobTitle: cleanText(item?.jobTitle),
      company: cleanText(item?.company),
      location: cleanText(item?.location),
      employmentType: cleanText(item?.employmentType),
      currentlyWorkHere: item?.currentlyWorkHere === true,
      startDate: cleanText(item?.startDate),
      endDate: cleanText(item?.endDate),
      description: cleanText(item?.description)
    }))
    .filter(item => item.jobTitle || item.company);
};

const cleanEducationHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
  .map(item => {
    const { gpa, gpaScale } = normalizeGpaFields(item);

    return {
      school: cleanText(item?.school),
      institutionLocation: cleanText(item?.institutionLocation),
      degree: cleanText(item?.degree),
      major: cleanText(item?.major),
      minor: cleanText(item?.minor),
      gpa,
      gpaScale,
      startDate: cleanText(item?.startDate),
      endDate: cleanText(item?.endDate)
    };
  })
  .filter(item => item.school || item.degree);
};

const isSensitiveMemoryKey = (key) => {
  return /birth|gender|ethnicity|race|disability|veteran|nationality|citizen|visa|sponsor|salary|reference|government|agreement|criminal|legal|authorization/i.test(
    key
  );
};

const cleanApplicationMemory = (memory) => {
  if (!Array.isArray(memory?.answers)) {
    return {
      answers: [],
      lastExtractedAt: new Date()
    };
  }

  const usedKeys = new Set();

  const answers = memory.answers
    .map(item => ({
      key: cleanText(item?.key).replace(/\s+/g, ''),
      question: cleanText(item?.question),
      answer: item?.answer ?? '',
      answerType: ['text', 'boolean', 'number', 'array', 'object'].includes(item?.answerType)
        ? item.answerType
        : 'text',
      aliases: cleanStringArray(item?.aliases),
      source: ['resume', 'cqfo', 'coverLetter'].includes(item?.source)
        ? item.source
        : 'cqfo',
      sensitive: item?.sensitive === true || isSensitiveMemoryKey(item?.key || ''),
      confidence: Math.min(1, Math.max(0, Number(item?.confidence) || 0))
    }))
    .filter(item => {
      if (!item.key || !item.question || usedKeys.has(item.key)) return false;

      const hasAnswer = item.answer !== '' &&
        item.answer !== null &&
        item.answer !== undefined &&
        (!Array.isArray(item.answer) || item.answer.length > 0);

      if (!hasAnswer) return false;

      usedKeys.add(item.key);
      return true;
    });

  return {
    answers,
    lastExtractedAt: new Date()
  };
};

const normalizeExtractedProfile = (data = {}) => {
  return {
    personalInfo: {
      firstName: cleanText(data.personalInfo?.firstName),
      lastName: cleanText(data.personalInfo?.lastName),
      preferredName: cleanText(data.personalInfo?.preferredName),
      pronouns: cleanText(data.personalInfo?.pronouns),
      languages: cleanLanguages(data.personalInfo?.languages)
    },

    contactInfo: {
      email: cleanText(data.contactInfo?.email),
      phone: cleanText(data.contactInfo?.phone),
      addressLine1: cleanText(data.contactInfo?.addressLine1),
      addressLine2: cleanText(data.contactInfo?.addressLine2),
      city: cleanText(data.contactInfo?.city),
      state: cleanText(data.contactInfo?.state),
      country: normalizeCountry(data.contactInfo?.country),
      postalCode: cleanText(data.contactInfo?.postalCode)
    },

    websitesAndSkills: {
      linkedin: cleanText(data.websitesAndSkills?.linkedin),
      github: cleanText(data.websitesAndSkills?.github),
      twitter: cleanText(data.websitesAndSkills?.twitter),
      portfolio: cleanText(data.websitesAndSkills?.portfolio),
      skills: cleanStringArray(data.websitesAndSkills?.skills)
    },

    workHistory: cleanWorkHistory(data.workHistory),
    educationHistory: cleanEducationHistory(data.educationHistory),

    eeo: {
      optOut: data.eeo?.optOut === true,
      authorizedToWork: normalizeYesNo(data.eeo?.authorizedToWork),
      requireVisaNow: normalizeYesNo(data.eeo?.requireVisaNow),
      requireVisaFuture: normalizeYesNo(data.eeo?.requireVisaFuture),
      disability: cleanText(data.eeo?.disability),
      veteran: cleanText(data.eeo?.veteran),
      gender: cleanText(data.eeo?.gender),
      ethnicity: cleanText(data.eeo?.ethnicity),
      race: cleanText(data.eeo?.race),
      age: cleanText(data.eeo?.age)
    },

    applicationMemory: cleanApplicationMemory(data.applicationMemory)
  };
};

const MEMORY_ALIASES = {
  telephoneAccessible24Hours: [
    '24 hour telephone access',
    'available by phone 24/7',
    'telephone accessibility'
  ],

  dateOfBirth: [
    'birth date',
    'birthday',
    'dob'
  ],

  race: [
    'racial background',
    'race category'
  ],

  travelPercentage: [
    'acceptable travel percentage',
    'travel requirement',
    'percentage willing to travel'
  ],

  travelFlexibility: [
    'willing to travel',
    'available for travel',
    'can you travel'
  ],

  willingToRelocate: [
    'open to relocation',
    'relocation preference',
    'are you willing to move'
  ],

  eveningsWeekendsAvailable: [
    'evening availability',
    'weekend availability',
    'flexible work schedule'
  ],

  nationality: [
    'country of nationality',
    'national origin'
  ],

  otherCitizenshipOrResidency: [
    'other citizenship',
    'permanent residency',
    'citizen of another country'
  ],

  authorizedToWorkUSA: [
    'authorized to work in the usa',
    'authorized to work in the united states',
    'us work authorization'
  ],

  authorizedToWorkCanada: [
    'authorized to work in canada',
    'canadian work authorization',
    'eligible to work in canada'
  ],

  requiresCanadaSponsorship: [
    'canada sponsorship required',
    'canadian work permit sponsorship',
    'require sponsorship in canada'
  ],

  canadaWorkAuthorizationDetails: [
    'canada visa details',
    'canadian work permit details',
    'canada authorization details'
  ],

  salaryMinimum: [
    'minimum salary expectation',
    'expected salary minimum',
    'minimum compensation'
  ],

  salaryMaximum: [
    'maximum salary expectation',
    'expected salary maximum',
    'maximum compensation'
  ],

  salaryCurrency: [
    'salary currency',
    'compensation currency'
  ],

  salaryNegotiationNotes: [
    'salary negotiation',
    'compensation notes',
    'salary flexibility'
  ],

  sponsorshipRequired: [
    'visa sponsorship required',
    'employment sponsorship',
    'immigration sponsorship'
  ],

  sponsorshipDetails: [
    'visa sponsorship details',
    'immigration details',
    'work permit details'
  ],

  governmentEmployment: [
    'government employee',
    'public sector employment',
    'employed by government'
  ],

  employmentAgreement: [
    'non compete agreement',
    'non solicitation agreement',
    'employment covenant'
  ],

  criminalHistory: [
    'criminal conviction',
    'criminal record',
    'felony or misdemeanor'
  ],

  interviewAvailability: [
    'available interview times',
    'interview schedule',
    'dates available to interview'
  ]
};

const NON_SENSITIVE_MEMORY_KEYS = new Set([
  'telephoneAccessible24Hours',
  'travelPercentage',
  'travelFlexibility',
  'willingToRelocate',
  'eveningsWeekendsAvailable',
  'interviewAvailability'
]);

const normalizeMemoryKey = (value) => {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
};

const camelCaseToWords = (value) => {
  return cleanText(value)
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .toLowerCase();
};

const findMemoryAnswer = (answers, key) => {
  const wantedKey = normalizeMemoryKey(key);

  return answers.find(item => {
    return normalizeMemoryKey(item.key) === wantedKey;
  });
};

const upsertMemoryAnswer = (answers, newAnswer) => {
  const index = answers.findIndex(item => {
    return normalizeMemoryKey(item.key) === normalizeMemoryKey(newAnswer.key);
  });

  const normalizedAnswer = {
    key: newAnswer.key,
    question: newAnswer.question || camelCaseToWords(newAnswer.key),
    answer: newAnswer.answer,
    answerType: newAnswer.answerType || 'text',
    aliases: cleanStringArray(newAnswer.aliases),
    source: newAnswer.source || 'cqfo',
    sensitive: newAnswer.sensitive === true,
    confidence: Number.isFinite(Number(newAnswer.confidence))
      ? Number(newAnswer.confidence)
      : 1
  };

  if (index === -1) {
    answers.push(normalizedAnswer);
    return;
  }

  const existing = answers[index];

  answers[index] = {
    ...existing,
    ...normalizedAnswer,
    question: normalizedAnswer.question || existing.question,
    answer: normalizedAnswer.answer !== '' ? normalizedAnswer.answer : existing.answer,
    aliases: cleanStringArray([
      ...(existing.aliases || []),
      ...(normalizedAnswer.aliases || [])
    ])
  };
};

const ensureEnglishLanguage = (languages, documentText) => {
  const cleanedLanguages = Array.isArray(languages) ? [...languages] : [];

  const alreadyHasEnglish = cleanedLanguages.some(item => {
    return cleanText(item.language).toLowerCase() === 'english';
  });

  const documentsImplyEnglish = /languages?\s+(other than|besides)\s+english/i.test(
    documentText || ''
  );

  if (!alreadyHasEnglish && documentsImplyEnglish) {
    cleanedLanguages.unshift({
      language: 'English',
      proficiency: 'Fluent',
      fluent: true
    });
  }

  return cleanedLanguages;
};

const normalizeVeteranStatus = (value) => {
  const text = cleanText(value).toLowerCase();

  if (!text) {
    return { value: '', optOut: false };
  }

  if (
    text === 'no' ||
    text.includes('not a veteran') ||
    text.includes('not a protected veteran') ||
    text.includes('have not served')
  ) {
    return {
      value: 'I am not a protected veteran',
      optOut: false
    };
  }

  if (
    text === 'yes' ||
    text.includes('protected veteran') ||
    text.includes('one or more of the classifications')
  ) {
    return {
      value: 'I am a protected veteran',
      optOut: false
    };
  }

  if (
    text.includes('do not wish') ||
    text.includes('prefer not') ||
    text.includes('decline')
  ) {
    return {
      value: '',
      optOut: true
    };
  }

  return {
    value: cleanText(value),
    optOut: false
  };
};
const normalizeInterviewTime = (value) => {
  let text = cleanText(value);

  text = text.replace(/\b(\d{1,2})\.(\d{2})\b/g, '$1:$2');
  text = text.replace(/\b(am|pm)\b/gi, match => match.toUpperCase());

  text = text.replace(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi,
    (match, startHour, startMinute, startPeriod, endHour, endMinute, endPeriod) => {
      let fixedEndPeriod = endPeriod.toUpperCase();

      if (
        startPeriod.toUpperCase() === 'PM' &&
        fixedEndPeriod === 'AM' &&
        Number(startHour) === 12 &&
        Number(endHour) >= 1 &&
        Number(endHour) <= 7
      ) {
        fixedEndPeriod = 'PM';
      }

      const start = `${Number(startHour)}:${startMinute || '00'} ${startPeriod.toUpperCase()}`;
      const end = `${Number(endHour)}:${endMinute || '00'} ${fixedEndPeriod}`;

      return `${start}-${end}`;
    }
  );

  return text;
};

const correctEmploymentTypes = (history) => {
  if (!Array.isArray(history)) return [];

  return history.map(item => {
    const roleText = [
      item.company,
      item.jobTitle,
      item.description
    ].join(' ').toLowerCase();

    const isIndependentWork =
      /\bindependent\b/.test(roleText) ||
      /\bself[- ]employed\b/.test(roleText) ||
      /\bfreelance\b/.test(roleText) ||
      /\bconsulting\b/.test(roleText) ||
      /\bconsultant\b/.test(roleText) ||
      /\bfounder\b/.test(roleText) ||
      /\bowner\b/.test(roleText);

    if (isIndependentWork) {
      return {
        ...item,
        employmentType: 'Self-employed'
      };
    }

    return item;
  });
};

const addMemoryAliases = (answers) => {
  return answers.map(item => {
    const aliases = [
      ...(item.aliases || []),
      ...(MEMORY_ALIASES[item.key] || []),
      camelCaseToWords(item.key)
    ];

    const referenceMatch = item.key.match(/^reference(\d+)(.+)$/i);

    if (referenceMatch) {
      const referenceNumber = referenceMatch[1];
      const fieldName = camelCaseToWords(referenceMatch[2]);

      aliases.push(
        `reference ${referenceNumber} ${fieldName}`,
        `professional reference ${referenceNumber} ${fieldName}`,
        `referee ${referenceNumber} ${fieldName}`
      );
    }

    const certificationMatch = item.key.match(/^certification(\d+)(.+)$/i);

    if (certificationMatch) {
      const certificationNumber = certificationMatch[1];
      const fieldName = camelCaseToWords(certificationMatch[2]);

      aliases.push(
        `certification ${certificationNumber} ${fieldName}`,
        `license ${certificationNumber} ${fieldName}`
      );
    }

    return {
      ...item,
      sensitive: NON_SENSITIVE_MEMORY_KEYS.has(item.key)
        ? false
        : item.sensitive === true,
      aliases: cleanStringArray(aliases).slice(0, 10)
    };
  });
};

const enrichAuthorizationMemory = (profileData, documentText) => {
  const answers = [...(profileData.applicationMemory?.answers || [])];

  const authorizedToWork = normalizeYesNo(profileData.eeo?.authorizedToWork);
  const combinedCitizenship = findMemoryAnswer(answers, 'otherCitizenshipOrResidency');
  const sponsorshipDetails = findMemoryAnswer(answers, 'sponsorshipDetails');

  const combinedAnswer = cleanText(combinedCitizenship?.answer);
  const detailsAnswer = cleanText(sponsorshipDetails?.answer);

  const evidenceText = [
    combinedAnswer,
    detailsAnswer,
    documentText || ''
  ].join(' ');

  if (
    authorizedToWork &&
    /legally authorized to work in the (usa|united states)/i.test(documentText || '')
  ) {
    upsertMemoryAnswer(answers, {
      key: 'authorizedToWorkUSA',
      question: 'Are you legally authorized to work in the United States?',
      answer: authorizedToWork,
      aliases: MEMORY_ALIASES.authorizedToWorkUSA,
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  const lacksCanadaAuthorization =
  /\b(?:no|do not have(?: any)?)\s+(?:valid\s+)?(?:canada|canadian)\s+work authorization\b/i.test(
    evidenceText
  ) ||
  /\bno\s+work authorization\s+for\s+canada\b/i.test(
    evidenceText
  );

if (lacksCanadaAuthorization) {
  upsertMemoryAnswer(answers, {
    key: 'authorizedToWorkCanada',
    question: 'Are you legally authorized to work in Canada?',
    answer: 'No',
    aliases: MEMORY_ALIASES.authorizedToWorkCanada,
    source: 'cqfo',
    sensitive: true,
    confidence: 1
  });
}

  if (
    /sponsorship from employer|work permit sponsorship|need.*sponsorship/i.test(
      evidenceText
    )
  ) {
    upsertMemoryAnswer(answers, {
      key: 'requiresCanadaSponsorship',
      question: 'Will you require employer sponsorship to work in Canada?',
      answer: 'Yes',
      aliases: MEMORY_ALIASES.requiresCanadaSponsorship,
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  let canadaDetails = detailsAnswer;

  if (!canadaDetails && combinedAnswer.includes('-')) {
    canadaDetails = combinedAnswer.split('-').slice(1).join('-').trim();
  }

  if (canadaDetails && /canada|work permit|sponsorship/i.test(canadaDetails)) {
    upsertMemoryAnswer(answers, {
      key: 'canadaWorkAuthorizationDetails',
      question: 'Canada work authorization details',
      answer: canadaDetails,
      aliases: MEMORY_ALIASES.canadaWorkAuthorizationDetails,
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  if (combinedCitizenship && /^(yes|no)\b/i.test(combinedAnswer)) {
    combinedCitizenship.answer = combinedAnswer.match(/^(yes|no)\b/i)[1]
      .replace(/^./, letter => letter.toUpperCase());
  }

  return answers;
};

const postProcessExtractedProfile = (profileData, documents) => {
  const cqfoText = documents?.cqfo || '';

  profileData.personalInfo.languages = ensureEnglishLanguage(
    profileData.personalInfo.languages,
    cqfoText
  );

  profileData.eeo.disability = normalizeDisabilityStatus(
    profileData.eeo.disability
  );

  profileData.eeo.age = cleanAgeValue(profileData.eeo.age);

  let answers = canonicalizeApplicationMemory(
    profileData,
    cqfoText
  );

  const storedVeteranAnswer = findMemoryAnswer(
    answers,
    'veteranStatusOriginal'
  );

  const originalVeteranValue =
    cleanText(profileData.eeo.veteran) ||
    cleanText(storedVeteranAnswer?.answer);

  const normalizedVeteran = normalizeVeteranStatus(
    originalVeteranValue
  );

  profileData.eeo.veteran = normalizedVeteran.value;

  if (normalizedVeteran.optOut) {
    profileData.eeo.optOut = true;
  }

  if (originalVeteranValue) {
    upsertMemoryAnswer(answers, {
      key: 'veteranStatusOriginal',
      question: 'Veteran status',
      answer: originalVeteranValue,
      aliases: [
        'military service status',
        'veteran classification',
        'protected veteran status'
      ],
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  if (profileData.eeo.race) {
    upsertMemoryAnswer(answers, {
      key: 'race',
      question: 'Race',
      answer: profileData.eeo.race,
      aliases: MEMORY_ALIASES.race,
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  const interviewAvailability = findMemoryAnswer(
    answers,
    'interviewAvailability'
  );

  if (interviewAvailability) {
    interviewAvailability.answer = normalizeInterviewTime(
      interviewAvailability.answer
    );
  }

  profileData.workHistory = correctEmploymentTypes(
    profileData.workHistory
  );

  profileData.educationHistory = refineEducationHistory(
    profileData.educationHistory,
    documents
  );

  profileData.applicationMemory = {
    ...profileData.applicationMemory,
    answers: addMemoryAliases(answers)
  };

  return profileData;
};

const MEMORY_KEY_MAP = {
  telephoneAvailability: 'telephoneAccessible24Hours',
  discontinueIfDobMandated: 'stopApplicationIfDobRequired',
  relocationStatus: 'willingToRelocate',
  workTimeAvailability: 'eveningsWeekendsAvailable',
  citizenshipStatus: 'otherCitizenshipOrResidency',
  citizenshipDetails: 'canadaWorkAuthorizationDetails',
  salaryNotes: 'salaryNegotiationNotes',
  governmentEmploymentUSA: 'governmentEmployment',
  employmentAgreements: 'employmentAgreement'
};

const DEGREE_REFINEMENTS = [
  { pattern: /\bBachelor of Engineering\b/i, value: 'Bachelor of Engineering' },
  { pattern: /\bBachelor of Technology\b/i, value: 'Bachelor of Technology' },
  { pattern: /\bBachelor of Science\b/i, value: 'Bachelor of Science' },
  { pattern: /\bBachelor of Arts\b/i, value: 'Bachelor of Arts' },
  { pattern: /\bMaster of Engineering\b/i, value: 'Master of Engineering' },
  { pattern: /\bMaster of Science\b/i, value: 'Master of Science' },
  { pattern: /\bMaster of Arts\b/i, value: 'Master of Arts' },
  { pattern: /\bMaster of Business Administration\b/i, value: 'Master of Business Administration' },
  { pattern: /\bDoctor of Philosophy\b/i, value: 'Doctor of Philosophy' }
];

const normalizeDisabilityStatus = (value) => {
  const text = cleanText(value).toLowerCase();

  if (!text) return '';
  if (text === 'no' || text.includes("don't have") || text.includes('do not have')) {
    return "No, I don't have a disability";
  }

  if (text === 'yes' || text.includes('have a disability')) {
    return 'Yes, I have a disability';
  }

  return cleanText(value);
};

const cleanAgeValue = (value) => {
  const text = cleanText(value);

  if (
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text) ||
    /^\d{4}-\d{1,2}-\d{1,2}$/.test(text)
  ) {
    return '';
  }

  return /^\d{1,3}$/.test(text) ? text : '';
};

const parseSalaryRange = (value) => {
  const text = cleanText(value);
  const match = text.match(
    /([\d,]+(?:\.\d+)?)\s*(?:-|to)\s*([\d,]+(?:\.\d+)?)\s*([A-Za-z]{3})?/i
  );

  if (!match) return null;

  return {
    minimum: match[1].replace(/,/g, ''),
    maximum: match[2].replace(/,/g, ''),
    currency: cleanText(match[3]).toUpperCase()
  };
};

const refineEducationHistory = (history, documents) => {
  if (!Array.isArray(history)) return [];

  const documentText = [
    documents?.resume || '',
    documents?.cqfo || '',
    documents?.coverLetter || ''
  ].join('\n');

  return history.map(item => {
    let degree = cleanText(item.degree);

    if (/^(bachelor|master|associate|doctor)(?:'s)? degree$/i.test(degree)) {
      const refinement = DEGREE_REFINEMENTS.find(entry => {
        return entry.pattern.test(documentText);
      });

      if (refinement) degree = refinement.value;
    }

    return {
      ...item,
      degree
    };
  });
};

const canonicalizeApplicationMemory = (profileData, cqfoText) => {
  const enrichedAnswers = enrichAuthorizationMemory(profileData, cqfoText);

  // Legacy keys are processed first. Canonical keys then replace them.
  const orderedAnswers = [...enrichedAnswers].sort((first, second) => {
    const firstLegacy = MEMORY_KEY_MAP[first.key] ? 0 : 1;
    const secondLegacy = MEMORY_KEY_MAP[second.key] ? 0 : 1;
    return firstLegacy - secondLegacy;
  });

  const canonicalAnswers = [];

  orderedAnswers.forEach(item => {
    if (!item?.key) return;

    if (item.key === 'salaryRange') {
      const range = parseSalaryRange(item.answer);

      if (range) {
        upsertMemoryAnswer(canonicalAnswers, {
          key: 'salaryMinimum',
          question: 'Minimum expected annual base salary',
          answer: range.minimum,
          source: 'cqfo',
          sensitive: true,
          confidence: item.confidence || 1
        });

        upsertMemoryAnswer(canonicalAnswers, {
          key: 'salaryMaximum',
          question: 'Maximum expected annual base salary',
          answer: range.maximum,
          source: 'cqfo',
          sensitive: true,
          confidence: item.confidence || 1
        });

        if (range.currency) {
          upsertMemoryAnswer(canonicalAnswers, {
            key: 'salaryCurrency',
            question: 'Expected salary currency',
            answer: range.currency,
            source: 'cqfo',
            sensitive: true,
            confidence: item.confidence || 1
          });
        }
      }

      return;
    }

    const canonicalKey = MEMORY_KEY_MAP[item.key] || item.key;
    let answer = item.answer;

    if (
      canonicalKey === 'otherCitizenshipOrResidency' ||
      canonicalKey === 'authorizedToWorkUSA' ||
      canonicalKey === 'authorizedToWorkCanada' ||
      canonicalKey === 'requiresCanadaSponsorship' ||
      canonicalKey === 'sponsorshipRequired'
    ) {
      answer = normalizeYesNo(answer);
    }

    upsertMemoryAnswer(canonicalAnswers, {
      ...item,
      key: canonicalKey,
      answer
    });
  });

  const canadaDetails =
    cleanText(findMemoryAnswer(canonicalAnswers, 'canadaWorkAuthorizationDetails')?.answer) ||
    cleanText(findMemoryAnswer(canonicalAnswers, 'sponsorshipDetails')?.answer);

  if (/do not have.*canada work authorization|no work authorization.*canada/i.test(canadaDetails)) {
    upsertMemoryAnswer(canonicalAnswers, {
      key: 'authorizedToWorkCanada',
      question: 'Are you legally authorized to work in Canada?',
      answer: 'No',
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  if (/sponsorship|work permit/i.test(canadaDetails)) {
    upsertMemoryAnswer(canonicalAnswers, {
      key: 'requiresCanadaSponsorship',
      question: 'Will you require employer sponsorship to work in Canada?',
      answer: 'Yes',
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  if (
    normalizeYesNo(profileData.eeo.authorizedToWork) === 'Yes' &&
    /legally authorized to work in the USA/i.test(cqfoText)
  ) {
    upsertMemoryAnswer(canonicalAnswers, {
      key: 'authorizedToWorkUSA',
      question: 'Are you legally authorized to work in the United States?',
      answer: 'Yes',
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  return canonicalAnswers;
};

const limitContextText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const cleanFieldOptions = (options) => {
  if (!Array.isArray(options)) return [];

  return [...new Set(
    options
      .map(option => typeof option === 'string' ? option.trim() : option?.label?.trim())
      .filter(Boolean)
  )].slice(0, 50);
};

const normalizeApplicationFields = (fields) => {
  if (!Array.isArray(fields)) return [];

  const usedIds = new Set();

  return fields.slice(0, 40).map((field, index) => {
    const item = typeof field === 'string' ? { label: field } : field;
    const label = cleanText(item?.label || item?.question);
    let fieldId = cleanText(item?.fieldId || item?.id || item?.name);

    if (!fieldId) fieldId = `field_${index + 1}`;
    if (usedIds.has(fieldId)) fieldId = `${fieldId}_${index + 1}`;

    usedIds.add(fieldId);

    return {
      fieldId: fieldId.slice(0, 200),
      label: label.slice(0, 1000),
      type: cleanText(item?.type || 'text').slice(0, 50),
      required: item?.required === true,
      options: cleanFieldOptions(item?.options),
      currentValue: item?.currentValue ?? '',
      maxLength: Number.isFinite(Number(item?.maxLength)) ? Number(item.maxLength) : null
    };
  }).filter(field => field.label);
};

const normalizeJobContext = (body) => {
  const context = body.jobContext || {};

  return {
    company: cleanText(context.company || body.targetCompany).slice(0, 300),
    jobTitle: cleanText(context.jobTitle || body.targetJobTitle).slice(0, 300),
    jobUrl: cleanText(context.jobUrl || body.jobUrl).slice(0, 2000),
    location: cleanText(context.location).slice(0, 500),
    description: limitContextText(context.description || body.jobDescription, 30000),
    companyDescription: limitContextText(context.companyDescription, 10000),
    responsibilities: cleanStringArray(context.responsibilities).slice(0, 50),
    requirements: cleanStringArray(context.requirements).slice(0, 50),
    preferredQualifications: cleanStringArray(context.preferredQualifications).slice(0, 50)
  };
};

const normalizeCountry = (value) => {
  const country = cleanText(value);
  const normalized = country.toLowerCase().replace(/[.\s]/g, '');

  if (['usa', 'us', 'unitedstates', 'unitedstatesofamerica'].includes(normalized)) {
    return 'United States';
  }

  return country;
};

const normalizeYesNo = (value) => {
  const answer = cleanText(value).toLowerCase();

  if (answer === 'yes' || answer.startsWith('yes,')) return 'Yes';
  if (answer === 'no' || answer.startsWith('no,')) return 'No';

  return cleanText(value);
};

const normalizeGpaFields = (item) => {
  let gpa = cleanText(item?.gpa);
  let gpaScale = cleanText(item?.gpaScale);
  const percentage = gpa.match(/^(\d+(?:\.\d+)?)\s*%/);

  if (percentage) {
    gpa = (Number(percentage[1]) * 0.04).toFixed(2);
    gpaScale = '4.0';
  }

  return { gpa, gpaScale };
};


const validateExtractedProfile = (
  profileData,
  documentText,
  usedCqfoVision
) => {
  const errors = [];
  const resumeText = documentText.resume || '';
  const cqfoText = documentText.cqfo || '';

  if (resumeText.trim() && profileData.workHistory.length === 0) {
    errors.push('No work history was extracted from the resume.');
  }

  if (
    /education/i.test(resumeText) &&
    profileData.educationHistory.length === 0
  ) {
    errors.push('No education history was extracted.');
  }

  if (
    !profileData.personalInfo.firstName &&
    !profileData.personalInfo.lastName
  ) {
    errors.push('The candidate name was not extracted.');
  }

  if (usedCqfoVision) {
    const memoryKeys = new Set(
      profileData.applicationMemory.answers.map(item => {
        return cleanText(item.key)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
      })
    );

    const requireKey = (condition, key, label) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (condition && !memoryKeys.has(normalizedKey)) {
        errors.push(`${label} was not extracted from the CQFO.`);
      }
    };

    requireKey(
      /expected base salary/i.test(cqfoText),
      'salaryMinimum',
      'Minimum salary'
    );

    requireKey(
      /expected base salary/i.test(cqfoText),
      'salaryMaximum',
      'Maximum salary'
    );

    requireKey(
      /expected base salary/i.test(cqfoText),
      'salaryCurrency',
      'Salary currency'
    );

    requireKey(
      /citizen of another country|permanent residency/i.test(cqfoText),
      'otherCitizenshipOrResidency',
      'Citizenship or permanent-residency answer'
    );

    requireKey(
      /legally authorized to work in the USA/i.test(cqfoText),
      'authorizedToWorkUSA',
      'United States work authorization'
    );

    requireKey(
      /government entity/i.test(cqfoText),
      'governmentEmployment',
      'Government-employment answer'
    );

    requireKey(
      /agreement or covenant not to compete/i.test(cqfoText),
      'employmentAgreement',
      'Employment-agreement answer'
    );

    requireKey(
      /convicted of|pled guilty/i.test(cqfoText),
      'criminalHistory',
      'Criminal-history answer'
    );

    requireKey(
      /dates and time ranges.*interview/i.test(cqfoText),
      'interviewAvailability',
      'Interview availability'
    );

    const referenceMatches = cqfoText.match(/\*?Reference\s*0?\d+/gi) || [];
    const referenceCount = Math.min(new Set(referenceMatches.map(item => {
      return item.toLowerCase().replace(/[^0-9]/g, '');
    })).size, 3);

    for (let index = 1; index <= referenceCount; index++) {
      requireKey(
        true,
        `reference${index}FullName`,
        `Reference ${index} full name`
      );

      requireKey(
        true,
        `reference${index}Phone`,
        `Reference ${index} phone`
      );
    }

    const certificationMatches =
      cqfoText.match(/License\/Certification name/gi) || [];

    for (
      let index = 1;
      index <= Math.min(certificationMatches.length, 5);
      index++
    ) {
      requireKey(
        true,
        `certification${index}Name`,
        `Certification ${index} name`
      );

      requireKey(
        true,
        `certification${index}Issuer`,
        `Certification ${index} issuer`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Document extraction validation failed: ${errors.join(' ')}`
    );
  }
};

const hasApplicationValue = value => {
  if (Array.isArray(value)) return value.length > 0;

  return value !== '' &&
    value !== null &&
    value !== undefined;
};

const getWritingRuntimeInfo = () => {
  const provider = (
    process.env.LLM_PROVIDER || 'ollama'
  ).trim().toLowerCase();

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      model:
        process.env.OLLAMA_WRITING_MODEL ||
        process.env.OLLAMA_MODEL ||
        'llama3.1'
    };
  }

  return {
    provider: 'huggingface',
    model:
      process.env.HF_WRITING_MODEL ||
      process.env.HF_EXTRACTION_MODEL ||
      process.env.HF_MODEL ||
      'openai/gpt-oss-120b'
  };
};

const normalizeGeneratedAnswers = (result, fields) => {
  const sourceValues = [
    'profile',
    'applicationMemory',
    'documents',
    'generated',
    'unknown'
  ];

  const rawAnswers = Array.isArray(result?.answers)
    ? result.answers
    : [];

  const answerMap = new Map();

  rawAnswers.forEach(answer => {
    if (answer?.fieldId) {
      answerMap.set(answer.fieldId, answer);
    }
  });

  return fields.map(field => {
    const answer = answerMap.get(field.fieldId) || {};
    const value = answer.value ?? '';
    const confidence = Math.min(
      1,
      Math.max(0, Number(answer.confidence) || 0)
    );

    return {
      fieldId: field.fieldId,
      label: field.label,
      value,
      source: sourceValues.includes(answer.source)
        ? answer.source
        : 'unknown',
      confidence,
      requiresReview:
        answer.requiresReview !== false ||
        !hasApplicationValue(value),
      reviewReason: cleanText(answer.reviewReason)
    };
  });
};

const getApplicationMemoryValue = (answers, key) => {
  const wantedKey = normalizeMemoryKey(key);

  const match = (answers || []).find(item => {
    return normalizeMemoryKey(item.key) === wantedKey;
  });

  return cleanText(match?.answer);
};

const inferJobCountry = jobContext => {
  const text = [
    jobContext?.location,
    jobContext?.description,
    jobContext?.jobUrl
  ].join(' ').toLowerCase();

  if (
    /\bcanada\b|\bcanadian\b|\bvancouver\b|\btoronto\b|\bmontreal\b|\bcalgary\b|\bottawa\b|\bbc\b|\bontario\b|\balberta\b/i.test(
      text
    )
  ) {
    return 'Canada';
  }

  if (
    /\bunited states\b|\busa\b|\bu\.s\.a?\b|\bcalifornia\b|\btexas\b|\bnew york\b/i.test(
      text
    )
  ) {
    return 'United States';
  }

  return '';
};

const applyAnswerReviewRules = ({
  answers,
  fields,
  jobContext,
  applicationMemory
}) => {
  const fieldMap = new Map(
    fields.map(field => [field.fieldId, field])
  );

  const jobCountry = inferJobCountry(jobContext);
  const storedSalaryCurrency = getApplicationMemoryValue(
    applicationMemory,
    'salaryCurrency'
  ).toUpperCase();

  return answers.map(answer => {
    const field = fieldMap.get(answer.fieldId);
    const label = cleanText(field?.label).toLowerCase();

    const isSalaryField =
      /\bsalary\b|\bcompensation\b|\bpay range\b/.test(label);

    if (!isSalaryField || !hasApplicationValue(answer.value)) {
      return {
        ...answer,
        reviewReason: ''
      };
    }

    const currencyMismatch =
      (jobCountry === 'Canada' && storedSalaryCurrency === 'USD') ||
      (
        jobCountry === 'United States' &&
        storedSalaryCurrency === 'CAD'
      );

    if (!currencyMismatch) {
      return {
        ...answer,
        reviewReason: ''
      };
    }

    return {
      ...answer,
      confidence: Math.min(answer.confidence, 0.9),
      requiresReview: true,
      reviewReason:
        `Stored salary currency is ${storedSalaryCurrency}, but the job appears to be in ${jobCountry}.`
    };
  });
};



// @desc    Get current user's profile
// @route   GET /api/profile
export const getProfile = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id });
    if (!profile) {
      res.status(404);
      throw new Error('Profile not found');
    }
    res.status(200).json(profile);
  } catch (error) { next(error); }
};

// @desc    Update profile (or add new data)
// @route   PUT /api/profile
export const updateProfile = async (req, res, next) => {
  try {
    // Finds the profile and updates only the fields provided in req.body
    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedProfile) {
      res.status(404);
      throw new Error('Profile not found');
    }

    res.status(200).json(updatedProfile);
  } catch (error) { next(error); }
};

// @desc    Replace the current resume file
// @route   POST /api/profile/upload-resume
export const uploadResume = async (req, res, next) => {
  let newStoragePath = '';

  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'No resume uploaded.'
      });
    }

    let profile = await Profile.findOne({ user: req.user._id });

    if (!profile) {
      profile = await Profile.create({ user: req.user._id });
    }

    const documentContent = await extractDocumentContent(req.file);
    const rawText = documentContent.text;

    if (!rawText.trim()) {
      return res.status(400).json({
        message: 'No readable text was found in the resume.'
      });
    }

    const oldFileReference = getOldDocumentReference(profile.resume);

    const resumeMetadata = await uploadDocumentToFirebase(
      req.user._id,
      'resume',
      req.file,
      rawText
    );

    newStoragePath = resumeMetadata.storagePath;

    profile.resume = resumeMetadata;
    await profile.save();

    if (oldFileReference) {
      await deleteFirebaseFile(oldFileReference);
    }

    res.status(200).json({
      message: 'Resume replaced successfully.',
      resume: profile.resume
    });
  } catch (error) {
    if (newStoragePath) {
      await deleteFirebaseFile(newStoragePath);
    }

    next(error);
  }
};
// @desc    Clear entirely ALL profile data
// @route   DELETE /api/profile/clear-all
export const clearEntireProfile = async (req, res, next) => {
  try {
    const emptyProfileData = {
      personalInfo: { firstName: '', lastName: '', preferredName: '', pronouns: '', languages: [] },
      contactInfo: { email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', country: '', postalCode: '' },
      websitesAndSkills: { linkedin: '', github: '', twitter: '', portfolio: '', skills: [] },
      workHistory: [],
      educationHistory: [],
      eeo: { optOut: false, authorizedToWork: '', requireVisaNow: '', requireVisaFuture: '', disability: '', veteran: '', gender: '', ethnicity: '', race: '', age: '' }
      // Note: We intentionally DO NOT clear the resume here. If they want to delete the file, they should do it explicitly.
    };

    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: emptyProfileData },
      { new: true }
    );

    res.status(200).json({ message: 'Entire profile cleared', profile: updatedProfile });
  } catch (error) { next(error); }
};

// @desc    Clear a specific section of the profile
// @route   DELETE /api/profile/clear-section/:sectionName
export const clearProfileSection = async (req, res, next) => {
  try {
    const { sectionName } = req.params;
    
    // Define the valid sections and their empty states
    const validSections = {
      personalInfo: { firstName: '', lastName: '', preferredName: '', pronouns: '', languages: [] },
      contactInfo: { email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', country: '', postalCode: '' },
      websitesAndSkills: { linkedin: '', github: '', twitter: '', portfolio: '', skills: [] },
      workHistory: [],
      educationHistory: [],
      eeo: { optOut: false, authorizedToWork: '', requireVisaNow: '', requireVisaFuture: '', disability: '', veteran: '', gender: '', ethnicity: '', race: '', age: '' }
    };

    if (!validSections[sectionName]) {
      res.status(400);
      throw new Error('Invalid section name provided');
    }

    // Use dynamic key insertion to clear only the requested section
    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: { [sectionName]: validSections[sectionName] } },
      { new: true }
    );

    res.status(200).json({ message: `${sectionName} cleared successfully`, profile: updatedProfile });
  } catch (error) { next(error); }
};

// @desc    Parse documents, rebuild profile data and replace uploaded files
// @route   POST /api/profile/parse-docs
export const parseDocumentsAndPopulateProfile = async (req, res, next) => {
  const newlyUploadedPaths = [];

  try {
    const uploadedFiles = getUploadedDocumentFiles(req);
    const uploadedTypes = Object.keys(uploadedFiles).filter(type => uploadedFiles[type]);

    if (uploadedTypes.length === 0) {
      return res.status(400).json({
        message: 'No documents uploaded for parsing.'
      });
    }

    let profile = await Profile.findOne({ user: req.user._id });

    if (!profile) {
      profile = await Profile.create({ user: req.user._id });
    }

    const parsedDocuments = {};

    for (const type of uploadedTypes) {
      const file = uploadedFiles[type];

      if (type === 'cqfo' && file.mimetype !== 'application/pdf') {
        return res.status(400).json({
          message: 'The CQFO must currently be uploaded as a PDF so highlighted selections can be read.'
        });
      }

      const documentContent = await extractDocumentContent(file, type === 'cqfo');

      if (!documentContent.text.trim()) {
        return res.status(400).json({
          message: `No readable text was found in ${file.originalname}.`
        });
      }

      parsedDocuments[type] = {
        file,
        rawText: documentContent.text,
        pageImages: documentContent.pageImages
      };
    }

    const latestDocumentText = {
      resume: parsedDocuments.resume?.rawText || profile.resume?.rawText || '',
      cqfo: parsedDocuments.cqfo?.rawText || profile.cqfo?.rawText || '',
      coverLetter: parsedDocuments.coverLetter?.rawText || profile.coverLetter?.rawText || ''
    };

    let combinedTextContent = '';

    for (const type of Object.keys(latestDocumentText)) {
      const rawText = latestDocumentText[type];

      if (rawText.trim()) {
        combinedTextContent += `\n--- ${DOCUMENT_LABELS[type]} ---\n${rawText}`;
      }
    }

    if (!combinedTextContent.trim()) {
      return res.status(400).json({
        message: 'No readable document context is available.'
      });
    }

    const extractedData = await extractProfileData({
      resumeText: latestDocumentText.resume,
      cqfoText: latestDocumentText.cqfo,
      coverLetterText: latestDocumentText.coverLetter,
      cqfoImages: parsedDocuments.cqfo?.pageImages || [],
      existingEeo: profile.eeo?.toObject?.() || profile.eeo || {},
      existingApplicationMemory:
        profile.applicationMemory?.toObject?.() ||
        profile.applicationMemory ||
        { answers: [] }
    });
    let structuredProfile = normalizeExtractedProfile(extractedData);

    structuredProfile = postProcessExtractedProfile(
      structuredProfile,
      latestDocumentText
    );

    validateExtractedProfile(
      structuredProfile,
      latestDocumentText,
      parsedDocuments.cqfo?.pageImages?.length > 0
    );

    console.log(
      'AI Extracted Data:',
      JSON.stringify(extractedData, null, 2)
    );

    const newDocumentMetadata = {};
    const oldDocumentReferences = [];

    for (const type of uploadedTypes) {
      const oldReference = getOldDocumentReference(profile[type]);

      if (oldReference) {
        oldDocumentReferences.push(oldReference);
      }

      const documentMetadata = await uploadDocumentToFirebase(
        req.user._id,
        type,
        parsedDocuments[type].file,
        parsedDocuments[type].rawText
      );

      newDocumentMetadata[type] = documentMetadata;
      newlyUploadedPaths.push(documentMetadata.storagePath);
    }

    const updatePayload = {
      ...structuredProfile,
      ...newDocumentMetadata
    };

    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: updatePayload },
      {
        new: true,
        runValidators: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    for (const oldReference of oldDocumentReferences) {
      await deleteFirebaseFile(oldReference);
    }

    res.status(200).json({
      message: 'Documents replaced and profile rebuilt successfully.',
      replacedDocuments: uploadedTypes,
      profile: updatedProfile
    });
  } catch (error) {
    for (const storagePath of newlyUploadedPaths) {
      await deleteFirebaseFile(storagePath);
    }

    console.error('Document Parsing Error:', error);
    next(error);
  }
};

// @desc    Answer unresolved application fields
// @route   POST /api/profile/answer-questions
export const answerApplicationQuestions = async (req, res, next) => {
  const startedAt = Date.now();
  const runtime = getWritingRuntimeInfo();

  let application = null;
  let inputCharacters = 0;

  try {
    let incomingFields = req.body.fields;

    if (
      !Array.isArray(incomingFields) &&
      Array.isArray(req.body.unansweredQuestions)
    ) {
      incomingFields = req.body.unansweredQuestions;
    }

    const fields = normalizeApplicationFields(incomingFields)
      .filter(field => !hasApplicationValue(field.currentValue));

    if (fields.length === 0) {
      return res.status(400).json({
        message: 'No unresolved application fields were provided.'
      });
    }

    const profile = await Profile.findOne({
      user: req.user._id
    });

    if (!profile) {
      return res.status(404).json({
        message: 'Profile not found. Upload the client documents first.'
      });
    }

    const jobContext = normalizeJobContext(req.body);
    const applicationId = cleanText(req.body.applicationId);

    if (applicationId && !/^[a-f\d]{24}$/i.test(applicationId)) {
      return res.status(400).json({
        message: 'Invalid application ID.'
      });
    }

    if (applicationId) {
      application = await Application.findOne({
        _id: applicationId,
        user: req.user._id
      });

      if (!application) {
        return res.status(404).json({
          message: 'Application not found.'
        });
      }

      application.jobContext = jobContext;
      application.fields = fields;
      application.status = 'analysing';
      application.errorMessage = '';
      await application.save();
    } else {
      application = await Application.create({
        user: req.user._id,
        atsPlatform: cleanText(req.body.atsPlatform) || 'generic',
        jobContext,
        fields,
        status: 'analysing'
      });
    }

    const profileData = profile.toObject();

    const candidateContext = {
      profile: {
        personalInfo: profileData.personalInfo,
        contactInfo: profileData.contactInfo,
        websitesAndSkills: profileData.websitesAndSkills,
        workHistory: profileData.workHistory,
        educationHistory: profileData.educationHistory,
        eeo: profileData.eeo
      },

      applicationMemory:
        profileData.applicationMemory?.answers || [],

      documents: {
        resume: {
          fileName: profileData.resume?.fileName || '',
          rawText: limitContextText(
            profileData.resume?.rawText,
            35000
          )
        },

        cqfo: {
          fileName: profileData.cqfo?.fileName || '',
          rawText: limitContextText(
            profileData.cqfo?.rawText,
            30000
          )
        },

        coverLetter: {
          fileName: profileData.coverLetter?.fileName || '',
          rawText: limitContextText(
            profileData.coverLetter?.rawText,
            20000
          )
        }
      }
    };

    inputCharacters = JSON.stringify({
      candidateContext,
      jobContext,
      fields
    }).length;

    const result = await generateFormAnswers({
      candidateContext,
      jobContext,
      fields
    });

    let answers = normalizeGeneratedAnswers(
      result,
      fields
    );

    answers = applyAnswerReviewRules({
      answers,
      fields,
      jobContext,
      applicationMemory:
        profileData.applicationMemory?.answers || []
    });

    const aiFilled = answers.filter(answer => {
      return hasApplicationValue(answer.value);
    }).length;

    const unresolved = answers.length - aiFilled;

    application.answers = answers;
    application.status = 'ready_for_review';
    application.errorMessage = '';

    application.stats = {
      totalFields: Number(req.body.scriptStats?.totalFields) ||
        fields.length,
      scriptFilled: Number(req.body.scriptStats?.scriptFilled) || 0,
      aiFilled,
      unresolved
    };

    await application.save();

    await AIUsageLog.create({
      user: req.user._id,
      application: application._id,
      task: 'form_answers',
      provider: runtime.provider,
      model: runtime.model,
      inputCharacters,
      outputCharacters: JSON.stringify(result).length,
      durationMs: Date.now() - startedAt,
      success: true
    });

    res.status(200).json({
      message: 'Application fields analysed successfully.',
      applicationId: application._id,
      status: application.status,
      jobContext,
      requestedFields: fields.length,
      answeredFields: aiFilled,
      unresolvedFields: unresolved,
      answers
    });
  } catch (error) {
    if (application) {
      application.status = 'failed';
      application.errorMessage = error.message;

      try {
        await application.save();
      } catch (saveError) {
        console.error(
          'Could not save failed application:',
          saveError.message
        );
      }
    }

    try {
      await AIUsageLog.create({
        user: req.user._id,
        application: application?._id || null,
        task: 'form_answers',
        provider: runtime.provider,
        model: runtime.model,
        inputCharacters,
        outputCharacters: 0,
        durationMs: Date.now() - startedAt,
        success: false,
        errorMessage: error.message
      });
    } catch (logError) {
      console.error(
        'Could not save AI usage log:',
        logError.message
      );
    }

    console.error('AI Form Answering Error:', error);
    next(error);
  }
};