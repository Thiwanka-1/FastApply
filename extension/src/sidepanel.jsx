import React, {
  useEffect,
  useMemo,
  useState
} from 'react';
import ReactDOM from 'react-dom/client';
import {
  Search,
  Bot,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Copy,
  Check,
  User,
  MapPin,
  Briefcase,
  GraduationCap,
  ExternalLink,
  FileText,
  Zap,
  RefreshCw
} from 'lucide-react';
import './index.css';

const STORAGE_KEYS = [
  'profileData',
  'lastPageScan',
  'lastAgent2Result',
  'lastAgent2Summary',
  'agent2RunState',
  'sidePanelActiveView'
];

const hasChromeStorage = () => {
  return (
    typeof chrome !== 'undefined' &&
    chrome.storage?.local
  );
};

const readStorage = keys => {
  return new Promise(resolve => {
    if (!hasChromeStorage()) {
      resolve({});
      return;
    }

    chrome.storage.local.get(
      keys,
      values => resolve(values || {})
    );
  });
};

const sendRuntimeMessage = request => {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      request,
      response => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error:
              chrome.runtime.lastError.message
          });
          return;
        }

        resolve(response);
      }
    );
  });
};

const getActiveTab = () => {
  return new Promise(resolve => {
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true
      },
      tabs => {
        resolve(tabs?.[0] || null);
      }
    );
  });
};

const getTabFrames = tabId => {
  return new Promise(resolve => {
    chrome.webNavigation.getAllFrames(
      { tabId },
      frames => {
        if (chrome.runtime.lastError) {
          resolve([{ frameId: 0 }]);
          return;
        }

        resolve(
          Array.isArray(frames) && frames.length > 0
            ? frames
            : [{ frameId: 0 }]
        );
      }
    );
  });
};

const sendToFrame = (tabId, frameId, action) => {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(
      tabId,
      { action },
      { frameId },
      response => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(response || null);
      }
    );
  });
};

const findFastApplyFrame = async tabId => {
  const frames = await getTabFrames(tabId);

  const candidates = (
    await Promise.all(
      frames.map(async frame => {
        const response = await sendToFrame(
          tabId,
          frame.frameId,
          'FASTAPPLY_GET_PAGE_STATE'
        );

        if (!response?.success || !response.data?.registered) {
          return null;
        }

        const isDedicated =
          response.data.atsPlatform &&
          response.data.atsPlatform !== 'generic';

        return {
          frameId: frame.frameId,
          response,
          score:
            (isDedicated ? 100000 : 0) +
            Number(response.data.supportedControls || 0) +
            (frame.frameId === 0 ? 1 : 0)
        };
      })
    )
  ).filter(Boolean);

  candidates.sort((first, second) => second.score - first.score);
  return candidates[0] || null;
};

const sendToActivePage = async action => {
  const tab = await getActiveTab();

  if (!tab?.id) {
    return {
      success: false,
      error: 'No active browser tab was found.'
    };
  }

  const target = await findFastApplyFrame(tab.id);

  if (!target) {
    return {
      success: false,
      error:
        'FastApply is not connected to this page. Reload the job page after reloading the extension.'
    };
  }

  return (
    await sendToFrame(tab.id, target.frameId, action)
  ) || {
    success: false,
    error: 'The job page did not return a response.'
  };
};

const hasValue = value => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return (
    value !== '' &&
    value !== null &&
    value !== undefined
  );
};

const getCountMetric = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value.length;
    }

    const numericValue = Number(value);

    if (Number.isFinite(numericValue) && numericValue >= 0) {
      return numericValue;
    }
  }

  return 0;
};

const formatValue = value => {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value ?? '');
};

const formatDate = value => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const CopyField = ({
  label,
  value,
  link = false
}) => {
  const [copied, setCopied] =
    useState(false);

  if (!hasValue(value)) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(
      formatValue(value)
    );

    setCopied(true);

    window.setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  return (
    <div className="border-b border-slate-800/60 py-2 last:border-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
        {label}
      </p>

      {link ? (
        <button
          type="button"
          onClick={() => {
            chrome.tabs.create({
              url: formatValue(value)
            });
          }}
          className="mt-1 flex max-w-full items-center text-left text-sm text-cyan-400"
        >
          <span className="truncate">
            {formatValue(value)}
          </span>

          <ExternalLink className="ml-1 h-3 w-3 shrink-0" />
        </button>
      ) : (
        <button
          type="button"
          onClick={copy}
          className="mt-1 flex w-full items-start justify-between gap-3 text-left"
        >
          <span className="break-words text-sm text-slate-200">
            {formatValue(value)}
          </span>

          {copied ? (
            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4 shrink-0 text-slate-600" />
          )}
        </button>
      )}
    </div>
  );
};

const Metric = ({
  label,
  value,
  className
}) => {
  return (
    <div
      className={`rounded-xl border p-3 ${className}`}
    >
      <p className="text-xl font-black">
        {Number(value) || 0}
      </p>

      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider opacity-80">
        {label}
      </p>
    </div>
  );
};

const ProfileCopy = ({ profile }) => {
  if (!profile) {
    return (
      <p className="text-sm text-slate-500">
        No profile is available.
      </p>
    );
  }

  const personal =
    profile.personalInfo || {};

  const contact =
    profile.contactInfo || {};

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-2 flex items-center font-bold text-white">
          <User className="mr-2 h-4 w-4 text-cyan-400" />
          Personal
        </h3>

        <CopyField
          label="First Name"
          value={personal.firstName}
        />

        <CopyField
          label="Last Name"
          value={personal.lastName}
        />

        <CopyField
          label="Preferred Name"
          value={personal.preferredName}
        />

        <CopyField
          label="Pronouns"
          value={personal.pronouns}
        />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-2 flex items-center font-bold text-white">
          <MapPin className="mr-2 h-4 w-4 text-indigo-400" />
          Contact
        </h3>

        <CopyField
          label="Email"
          value={contact.email}
        />

        <CopyField
          label="Phone"
          value={contact.phone}
        />

        <CopyField
          label="Address"
          value={contact.addressLine1}
        />

        <CopyField
          label="City"
          value={contact.city}
        />

        <CopyField
          label="State"
          value={contact.state}
        />

        <CopyField
          label="Country"
          value={contact.country}
        />

        <CopyField
          label="Postal Code"
          value={contact.postalCode}
        />
      </section>

      {profile.workHistory?.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-2 flex items-center font-bold text-white">
            <Briefcase className="mr-2 h-4 w-4 text-fuchsia-400" />
            Work History
          </h3>

          {profile.workHistory.map(
            (job, index) => (
              <div
                key={job._id || index}
                className="mb-4 last:mb-0"
              >
                <p className="text-xs font-bold text-fuchsia-400">
                  Position {index + 1}
                </p>

                <CopyField
                  label="Job Title"
                  value={job.jobTitle}
                />

                <CopyField
                  label="Company"
                  value={job.company}
                />

                <CopyField
                  label="Location"
                  value={job.location}
                />

                <CopyField
                  label="Start Date"
                  value={job.startDate}
                />

                <CopyField
                  label="End Date"
                  value={
                    job.currentlyWorkHere
                      ? 'Present'
                      : job.endDate
                  }
                />
              </div>
            )
          )}
        </section>
      )}

      {profile.educationHistory?.length >
        0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-2 flex items-center font-bold text-white">
            <GraduationCap className="mr-2 h-4 w-4 text-amber-400" />
            Education
          </h3>

          {profile.educationHistory.map(
            (education, index) => (
              <div
                key={
                  education._id || index
                }
                className="mb-4 last:mb-0"
              >
                <CopyField
                  label={`Institution ${index + 1}`}
                  value={education.school}
                />

                <CopyField
                  label="Degree"
                  value={education.degree}
                />

                <CopyField
                  label="Major"
                  value={education.major}
                />

                <CopyField
                  label="Start Date"
                  value={education.startDate}
                />

                <CopyField
                  label="End Date"
                  value={education.endDate}
                />
              </div>
            )
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-2 flex items-center font-bold text-white">
          <ExternalLink className="mr-2 h-4 w-4 text-emerald-400" />
          Links
        </h3>

        <CopyField
          label="LinkedIn"
          value={
            profile.websitesAndSkills
              ?.linkedin
          }
          link
        />

        <CopyField
          label="GitHub"
          value={
            profile.websitesAndSkills
              ?.github
          }
          link
        />

        <CopyField
          label="Portfolio"
          value={
            profile.websitesAndSkills
              ?.portfolio
          }
          link
        />

        <CopyField
          label="Resume"
          value={profile.resume?.fileUrl}
          link
        />
      </section>
    </div>
  );
};

function SidePanel() {
  const [view, setView] =
    useState('controls');

  const [profile, setProfile] =
    useState(null);

  const [scan, setScan] =
    useState(null);

  const [agentResult, setAgentResult] =
    useState(null);

  const [runState, setRunState] =
    useState(null);

  const [action, setAction] =
    useState('');

  const [error, setError] =
    useState('');

  const [clockTime, setClockTime] =
    useState(0);

  const answers = useMemo(() => {
    return Array.isArray(
      agentResult?.answers
    )
      ? agentResult.answers
      : [];
  }, [agentResult]);

  const reviewAnswers =
    answers.filter(answer => {
      return (
        hasValue(answer.value) &&
        answer.requiresReview
      );
    });

  const unresolvedAnswers =
    answers.filter(answer => {
      return !hasValue(answer.value);
    });

  const appliedAnswers =
    answers.filter(answer => {
      return (
        hasValue(answer.value) &&
        !answer.requiresReview
      );
    });

  const scanFields = Array.isArray(agentResult?.fieldsAfterApply)
    ? agentResult.fieldsAfterApply
    : Array.isArray(scan?.fields)
      ? scan.fields
      : [];

  const derivedEmptyFields = scanFields.length > 0
    ? scanFields.filter(field => {
        return (
          field?.repairOnly !== true &&
          !hasValue(field?.currentValue)
        );
      }).length
    : undefined;

  const derivedInvalidFields = scanFields.filter(field => {
    return (
      field?.invalid === true ||
      field?.isValid === false ||
      field?.validity?.valid === false ||
      field?.validationState === 'invalid' ||
      field?.status === 'invalid'
    );
  }).length;

  const totalFieldCount = getCountMetric(
    scan?.totalFields,
    scan?.auditableFields,
    scan?.auditableFieldCount,
    scanFields
  );

  const auditableFieldCount = getCountMetric(
    scan?.auditableFields,
    scan?.auditableFieldCount,
    scan?.totalFields,
    scanFields
  );

  const emptyFieldCount = getCountMetric(
    agentResult?.emptyAfterApply,
    scan?.emptyFields,
    scan?.emptyFieldCount,
    derivedEmptyFields,
    scan?.missingFields
  );

  const invalidFieldCount = getCountMetric(
    agentResult?.invalidAfterApply,
    scan?.invalidFields,
    scan?.invalidFieldCount,
    scan?.validationIssueCount,
    derivedInvalidFields
  );

  const correctedFieldCount = getCountMetric(
    agentResult?.correctedFields,
    agentResult?.correctedFieldCount,
    runState?.correctedFields,
    runState?.correctedFieldCount,
    agentResult?.appliedFields
  );

  const conflictFieldCount = getCountMetric(
    agentResult?.conflicts,
    agentResult?.conflictFields,
    agentResult?.conflictCount,
    runState?.conflicts,
    runState?.conflictFields,
    scan?.conflicts,
    scan?.conflictFields
  );

  const structuralIssueCount = getCountMetric(
    scan?.structuralIssues
  );

  const hasAuditTargets = Boolean(
    scan &&
    (
      auditableFieldCount > 0 ||
      structuralIssueCount > 0 ||
      scanFields.length > 0
    )
  );

  const loadStorage = async () => {
    const stored =
      await readStorage(STORAGE_KEYS);

    const activeTab = await getActiveTab();
    const activeFrame = activeTab?.id
      ? await findFastApplyFrame(activeTab.id)
      : null;

    const currentPageUrl =
      activeFrame?.response?.data?.pageUrl || '';
    const currentPageKey =
      activeFrame?.response?.data?.pageKey || '';

    const scanMatchesCurrentPage =
      !stored.lastPageScan ||
      (
        Boolean(currentPageUrl) &&
        stored.lastPageScan.pageUrl === currentPageUrl &&
        (
          !currentPageKey ||
          !stored.lastPageScan.pageKey ||
          stored.lastPageScan.pageKey === currentPageKey
        )
      );

    setView(
      stored.sidePanelActiveView === 'profile'
        ? 'profile'
        : 'controls'
    );

    setProfile(
      stored.profileData || null
    );

    setScan(
      scanMatchesCurrentPage
        ? stored.lastPageScan || null
        : null
    );

    setAgentResult(
      scanMatchesCurrentPage &&
        stored.lastAgent2Result?.pageUrl === currentPageUrl &&
        (
          !currentPageKey ||
          !stored.lastAgent2Result?.pageKey ||
          stored.lastAgent2Result.pageKey === currentPageKey
        )
        ? stored.lastAgent2Result
        : null
    );

    setRunState(
      scanMatchesCurrentPage
        ? stored.agent2RunState || null
        : null
    );
  };

  const refreshProfile = async () => {
    const response =
      await sendRuntimeMessage({
        action: 'FETCH_PROFILE_DATA'
      });

    if (response?.success) {
      setProfile(response.data);
    }
  };

  const scanCurrentPage = async () => {
    setAction('scanning');
    setError('');

    const response =
      await sendToActivePage(
        'FASTAPPLY_SCAN_PAGE'
      );

    if (response?.success) {
      setScan(response.data);
      setAgentResult(null);
    } else {
      setError(
        response?.error ||
        'The page could not be scanned.'
      );
    }

    setAction('');
  };

  const auditAndCorrectPage = async () => {
    setAction('auditing');
    setError('');
    setAgentResult(null);

    const response =
      await sendToActivePage(
        'FASTAPPLY_RUN_AGENT2'
      );

    if (response?.success) {
      setScan(
        response.data?.scan || scan
      );

      setAgentResult(
        response.data?.result || null
      );
    } else {
      setError(
        response?.error ||
        'Agent 2 could not audit and correct the page.'
      );
    }

    setAction('');
  };

  useEffect(() => {
    loadStorage();
    refreshProfile();

    const storageListener = (
      changes,
      areaName
    ) => {
      if (areaName !== 'local') return;

      if (changes.profileData) {
        setProfile(
          changes.profileData.newValue ||
          null
        );
      }

      if (changes.lastPageScan) {
        setScan(
          changes.lastPageScan.newValue ||
          null
        );
      }

      if (changes.lastAgent2Result) {
        setAgentResult(
          changes.lastAgent2Result
            .newValue || null
        );
      }

      if (changes.agent2RunState) {
        setRunState(
          changes.agent2RunState
            .newValue || null
        );
      }

      if (changes.sidePanelActiveView) {
        setView(
          changes.sidePanelActiveView.newValue === 'profile'
            ? 'profile'
            : 'controls'
        );
      }
    };

    chrome.storage.onChanged.addListener(
      storageListener
    );

    return () => {
      chrome.storage.onChanged.removeListener(
        storageListener
      );
    };
  }, []);

  useEffect(() => {
    const updateClock = () => {
      setClockTime(Date.now());
    };
    updateClock();
    const timer = window.setInterval(updateClock, 30000);

    return () => window.clearInterval(timer);
  }, []);

  const runStateUpdatedAt = Date.parse(
    runState?.updatedAt || runState?.startedAt || ''
  );
  const isRemoteAnalysisActive =
    runState?.status === 'analysing' &&
    Number.isFinite(runStateUpdatedAt) &&
    clockTime > 0 &&
    clockTime - runStateUpdatedAt < 10 * 60 * 1000;
  const isBusy =
    action !== '' || isRemoteAnalysisActive;

  return (
    <div className="min-h-screen bg-slate-950 pb-8 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 p-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-lg font-black text-transparent">
              FastApply Assistant
            </h1>

            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">
              Manual AI application controls
            </p>
          </div>

          <button
            type="button"
            onClick={loadStorage}
            className="rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-slate-500 hover:text-cyan-400"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setView('controls')}
            className={`rounded-lg px-3 py-2.5 text-xs font-bold ${
              view === 'controls'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-slate-500'
            }`}
          >
            AI Controls
          </button>

          <button
            type="button"
            onClick={() => setView('profile')}
            className={`rounded-lg px-3 py-2.5 text-xs font-bold ${
              view === 'profile'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-500'
            }`}
          >
            Profile Copy
          </button>
        </div>
      </header>

      <main className="space-y-4 p-4">
        {view === 'profile' ? (
          <ProfileCopy profile={profile} />
        ) : (
          <>
            {error && (
              <div className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="font-bold text-white">
                Application Page
              </h2>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Inspect reads the loaded application page without changing any answers. Agent 2 can then audit both empty and completed values before correcting supported issues.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={scanCurrentPage}
                  disabled={isBusy}
                  className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                >
                  {action === 'scanning' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="h-5 w-5" />
                  )}

                  Inspect Current Page
                </button>

                <button
                  type="button"
                  onClick={auditAndCorrectPage}
                  disabled={
                    isBusy ||
                    !hasAuditTargets
                  }
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 py-3 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {action === 'auditing' ||
                  runState?.status ===
                    'analysing' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Bot className="h-5 w-5" />
                  )}

                  Audit &amp; Correct with Agent 2
                </button>
              </div>

              <p className="mt-3 text-[10px] leading-4 text-slate-600">
                Completed fields remain part of the audit, so Agent 2 can keep correct answers and replace supported answers that are invalid or conflict with your profile.
              </p>
            </section>

            {scan && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-cyan-500">
                      {scan.atsPlatform}
                    </p>

                    <h3 className="mt-1 truncate font-bold text-white">
                      {scan.jobContext?.jobTitle ||
                        scan.pageTitle ||
                        'Job Application'}
                    </h3>

                    <p className="mt-1 truncate text-xs text-slate-500">
                      {scan.jobContext?.company ||
                        'Company not detected'}
                    </p>
                  </div>

                  <span className="shrink-0 text-[10px] text-slate-600">
                    {formatDate(scan.scannedAt)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Metric
                    label="Total"
                    value={totalFieldCount}
                    className="border-slate-700 bg-slate-950 text-slate-300"
                  />

                  <Metric
                    label="Empty"
                    value={emptyFieldCount}
                    className="border-amber-500/30 bg-amber-500/10 text-amber-400"
                  />

                  <Metric
                    label="Invalid"
                    value={invalidFieldCount}
                    className="border-red-500/30 bg-red-500/10 text-red-400"
                  />

                  <Metric
                    label="Corrected"
                    value={correctedFieldCount}
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  />

                  <Metric
                    label="Conflicts"
                    value={conflictFieldCount}
                    className="border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400"
                  />
                </div>

                {scanFields.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                      Fields available for audit
                    </p>

                    <div className="max-h-64 space-y-2 overflow-y-auto custom-scrollbar">
                      {scanFields.map(field => (
                        <div
                          key={field.fieldId}
                          className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-semibold leading-5 text-slate-300">
                              {field.label}
                            </p>

                            <span className="shrink-0 rounded bg-slate-800 px-2 py-1 text-[9px] uppercase text-slate-500">
                              {field.type}
                            </span>
                          </div>

                          {field.required && (
                            <p className="mt-1 text-[9px] font-bold uppercase text-red-400">
                              Required
                            </p>
                          )}

                          {hasValue(field.currentValue) && (
                            <p className="mt-2 truncate text-[10px] text-slate-500">
                              Current: {formatValue(field.currentValue)}
                            </p>
                          )}

                          {field.options?.length > 0 && (
                            <p className="mt-2 text-[10px] text-slate-600">
                              {field.options.length} available options
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {emptyFieldCount === 0 && totalFieldCount > 0 && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    No empty supported fields were found. Completed values will still be audited for correctness and validity.
                  </div>
                )}

                {totalFieldCount === 0 && structuralIssueCount === 0 && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
                    <CircleAlert className="h-4 w-4" />
                    No supported fields were detected on this page.
                  </div>
                )}
              </section>
            )}

            {isRemoteAnalysisActive && (
              <div className="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-indigo-300">
                <Loader2 className="h-5 w-5 animate-spin" />

                <p className="text-xs font-semibold">
                  Agent 2 is auditing completed and empty answers on the current page.
                </p>
              </div>
            )}

            {agentResult && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="font-bold text-white">
                  Agent 2 Audit Result
                </h3>

                {agentResult.persistenceWarning && (
                  <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {agentResult.persistenceWarning}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Metric
                    label="Corrected"
                    value={correctedFieldCount}
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  />

                  <Metric
                    label="Conflicts"
                    value={conflictFieldCount}
                    className="border-amber-500/30 bg-amber-500/10 text-amber-400"
                  />

                  <Metric
                    label="Unresolved"
                    value={
                      agentResult.unresolvedAfterApply
                    }
                    className="border-red-500/30 bg-red-500/10 text-red-400"
                  />
                </div>

                {reviewAnswers.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 flex items-center text-xs font-bold text-amber-400">
                      <CircleAlert className="mr-2 h-4 w-4" />
                      Review Required
                    </p>

                    <div className="space-y-2">
                      {reviewAnswers.map(answer => (
                        <CopyField
                          key={answer.fieldId}
                          label={answer.label}
                          value={answer.value}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {unresolvedAnswers.length >
                  0 && (
                  <div className="mt-5">
                    <p className="mb-2 flex items-center text-xs font-bold text-red-400">
                      <CircleX className="mr-2 h-4 w-4" />
                      Unresolved
                    </p>

                    <div className="space-y-2">
                      {unresolvedAnswers.map(
                        answer => (
                          <div
                            key={answer.fieldId}
                            className="rounded-xl border border-red-500/20 bg-red-500/5 p-3"
                          >
                            <p className="text-xs font-semibold text-slate-300">
                              {answer.label}
                            </p>

                            <p className="mt-1 text-[10px] leading-5 text-red-300/70">
                              {answer.reviewReason ||
                                'No supported answer was found.'}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {appliedAnswers.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 flex items-center text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Completed or Corrected Answers
                    </p>

                    <div className="space-y-2">
                      {appliedAnswers.map(answer => (
                        <CopyField
                          key={answer.fieldId}
                          label={answer.label}
                          value={answer.value}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {!scan && (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-7 text-center">
                <Zap className="mx-auto h-8 w-8 text-cyan-500" />

                <p className="mt-3 font-bold text-white">
                  Ready to inspect
                </p>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Open a job application form and wait for it to load. Inspection is observational; Audit &amp; Correct is the action that may update supported answers.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById('sidepanel-root')
).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
