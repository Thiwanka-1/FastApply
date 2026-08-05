import React, {
  useEffect,
  useState
} from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import {
  BarChart3,
  User,
  Settings,
  Zap,
  AlertTriangle,
  Bot,
  FileText,
  Loader2,
  CheckCircle2,
  CircleX
} from 'lucide-react';
import './index.css';
import { API_URL, DASHBOARD_URL } from './config';

const hasChromeStorage = () => {
  return (
    typeof chrome !== 'undefined' &&
    chrome.storage?.local
  );
};

const writeLocalStorage = values => {
  return new Promise(resolve => {
    if (!hasChromeStorage()) {
      resolve();
      return;
    }

    chrome.storage.local.set(
      values,
      resolve
    );
  });
};

const clearCachedProfile = () => {
  return new Promise(resolve => {
    if (!hasChromeStorage()) {
      resolve();
      return;
    }

    chrome.storage.local.remove(
      ['profileData', 'profileFetchedAt'],
      resolve
    );
  });
};

function Popup() {
  const [stats, setStats] =
    useState({
      today: 0,
      goal: 10
    });

  const [
    autofillEnabled,
    setAutofillEnabled
  ] = useState(true);

  const [isLoggedIn, setIsLoggedIn] =
    useState(false);

  const [agentState, setAgentState] =
    useState(null);

  useEffect(() => {
    const fetchSystemData = async () => {
      try {
        const [
          statsResponse,
          profileResponse
        ] = await Promise.all([
          axios.get(
            `${API_URL}/api/analytics`,
            {
              withCredentials: true
            }
          ),
          axios.get(
            `${API_URL}/api/profile`,
            {
              withCredentials: true
            }
          )
        ]);

        setStats({
          today:
            statsResponse.data.stats
              .today,
          goal: 10
        });

        setIsLoggedIn(true);

        await writeLocalStorage({
          profileData:
            profileResponse.data,
          profileFetchedAt:
            new Date().toISOString()
        });
      } catch (_) {
        setIsLoggedIn(false);
        await clearCachedProfile();
      }
    };

    fetchSystemData();

    if (!hasChromeStorage()) return;

    chrome.storage.local.get(
      [
        'autofillEnabled',
        'agent2RunState'
      ],
      values => {
        if (
          values.autofillEnabled !==
          undefined
        ) {
          setAutofillEnabled(
            values.autofillEnabled
          );
        }

        if (values.agent2RunState) {
          setAgentState(
            values.agent2RunState
          );
        }
      }
    );

    const handleStorageChange = (
      changes,
      areaName
    ) => {
      if (areaName !== 'local') {
        return;
      }

      if (changes.agent2RunState) {
        setAgentState(
          changes.agent2RunState
            .newValue || null
        );
      }

      if (changes.autofillEnabled) {
        setAutofillEnabled(
          changes.autofillEnabled
            .newValue !== false
        );
      }
    };

    chrome.storage.onChanged.addListener(
      handleStorageChange
    );

    return () => {
      chrome.storage.onChanged.removeListener(
        handleStorageChange
      );
    };
  }, []);

  const toggleAutofill = () => {
    const nextValue =
      !autofillEnabled;

    setAutofillEnabled(nextValue);

    writeLocalStorage({
      autofillEnabled: nextValue
    });
  };

  const openDashboard = hash => {
    window.open(
      `${DASHBOARD_URL}#${hash}`,
      '_blank'
    );
  };

  const openSidePanel = async view => {
    await writeLocalStorage({
      sidePanelActiveView: view
    });

    if (
      typeof chrome !== 'undefined' &&
      chrome.sidePanel
    ) {
      try {
        const [tab] =
          await chrome.tabs.query({
            active: true,
            currentWindow: true
          });

        await chrome.sidePanel.open({
          windowId: tab.windowId
        });

        return;
      } catch (error) {
        console.error(
          'Failed to open side panel:',
          error
        );
      }
    }

    window.open(
      globalThis.chrome?.runtime?.getURL?.('sidepanel.html') ||
        `${DASHBOARD_URL}/sidepanel.html`,
      'FastApply Assistant',
      'width=430,height=800'
    );
  };

  const radius = 50;
  const circumference =
    2 * Math.PI * radius;

  const progress = Math.min(
    stats.today / stats.goal,
    1
  );

  const strokeDashoffset =
    circumference -
    progress * circumference;

  const getAgentStatus = () => {
    if (
      agentState?.status ===
      'analysing'
    ) {
      return {
        text: 'Agent 2 analysing',
        classes:
          'text-indigo-400',
        icon: Loader2,
        animate: true
      };
    }

    if (
      agentState?.status ===
      'complete'
    ) {
      return {
        text: 'Last run complete',
        classes:
          'text-emerald-400',
        icon: CheckCircle2,
        animate: false
      };
    }

    if (
      agentState?.status ===
      'failed'
    ) {
      return {
        text: 'Last run failed',
        classes:
          'text-red-400',
        icon: CircleX,
        animate: false
      };
    }

    return {
      text: 'Waiting for job page',
      classes:
        'text-slate-500',
      icon: Bot,
      animate: false
    };
  };

  const agentStatus =
    getAgentStatus();

  const AgentStatusIcon =
    agentStatus.icon;

  if (!isLoggedIn) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-950 p-6 text-center">
        <AlertTriangle className="mb-4 h-12 w-12 text-rose-500" />

        <h2 className="mb-2 text-xl font-bold text-white">
          Not Authenticated
        </h2>

        <p className="mb-6 text-sm text-slate-400">
          Please log in to your
          FastApply dashboard to enable
          the extension.
        </p>

        <button
          type="button"
          onClick={() => {
            openDashboard('/login');
          }}
          className="rounded-xl bg-cyan-600 px-6 py-2 font-bold text-white transition-colors hover:bg-cyan-500"
        >
          Open Login
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-slate-950 p-5 font-sans text-slate-100">
      <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-[60px]" />

      <div className="relative z-10 mb-5 flex items-center justify-center">
        <div className="mr-2 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500 p-1.5">
          <Zap className="h-4 w-4 text-slate-950" />
        </div>

        <h1 className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-2xl font-black tracking-wide text-transparent">
          FastApply
        </h1>
      </div>

      <div className="relative z-10 mb-5 flex flex-col items-center">
        <div className="relative flex h-36 w-36 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90">
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-slate-800"
            />

            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-cyan-400 transition-all duration-1000 ease-out"
              strokeDasharray={
                circumference
              }
              strokeDashoffset={
                strokeDashoffset
              }
              strokeLinecap="round"
            />
          </svg>

          <div className="z-10 text-center">
            <span className="block text-5xl font-black leading-none text-white">
              {stats.today}
            </span>

            <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              Apps Today
            </span>
          </div>
        </div>

        <p className="mt-2 text-xs font-medium uppercase tracking-widest text-slate-500">
          Goal: {stats.goal}
        </p>
      </div>

      <div className="relative z-10 mb-4 flex justify-center space-x-4">
        <button
          type="button"
          onClick={() => {
            openDashboard('/analytics');
          }}
          className="group rounded-full bg-slate-800 p-3 text-slate-300 transition-all hover:bg-indigo-500/20 hover:text-indigo-400"
          title="Analytics"
        >
          <BarChart3 className="h-5 w-5 transition-transform group-hover:scale-110" />
        </button>

        <button
          type="button"
          onClick={() => {
            openDashboard('/');
          }}
          className="group rounded-full bg-slate-800 p-3 text-slate-300 transition-all hover:bg-cyan-500/20 hover:text-cyan-400"
          title="Profile"
        >
          <User className="h-5 w-5 transition-transform group-hover:scale-110" />
        </button>

        <button
          type="button"
          onClick={() => {
            openDashboard('/settings');
          }}
          className="group rounded-full bg-slate-800 p-3 text-slate-300 transition-all hover:bg-fuchsia-500/20 hover:text-fuchsia-400"
          title="Settings"
        >
          <Settings className="h-5 w-5 transition-transform group-hover:scale-110" />
        </button>
      </div>

      <div className="relative z-10 mb-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="mb-3 flex items-center justify-center gap-2">
          <AgentStatusIcon
            className={`h-4 w-4 ${
              agentStatus.classes
            } ${
              agentStatus.animate
                ? 'animate-spin'
                : ''
            }`}
          />

          <p
            className={`text-[10px] font-bold uppercase tracking-wider ${agentStatus.classes}`}
          >
            {agentStatus.text}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              openSidePanel('agent');
            }}
            className="flex flex-col items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-3 text-indigo-300 transition hover:bg-indigo-500/20"
          >
            <Bot className="mb-1.5 h-5 w-5" />

            <span className="text-xs font-bold">
              Agent 2
            </span>

            <span className="mt-0.5 text-[9px] text-indigo-400/70">
              Monitor
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              openSidePanel('profile');
            }}
            className="flex flex-col items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-3 text-cyan-300 transition hover:bg-cyan-500/20"
          >
            <FileText className="mb-1.5 h-5 w-5" />

            <span className="text-xs font-bold">
              Profile
            </span>

            <span className="mt-0.5 text-[9px] text-cyan-400/70">
              Copy fields
            </span>
          </button>
        </div>
      </div>

      <div className="relative z-10 mt-auto flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center space-x-3">
          <Zap
            className={`h-5 w-5 ${
              autofillEnabled
                ? 'text-amber-400'
                : 'text-slate-600'
            }`}
          />

          <p className="text-sm font-bold text-white">
            Autofill Enabled
          </p>
        </div>

        <button
          type="button"
          onClick={toggleAutofill}
          className={`relative flex h-6 w-12 items-center rounded-full px-1 transition-colors focus:outline-none ${
            autofillEnabled
              ? 'bg-cyan-500'
              : 'bg-slate-700'
          }`}
        >
          <div
            className={`h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
              autofillEnabled
                ? 'translate-x-6'
                : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById('popup-root')
).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
