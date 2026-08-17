import {
  Shield,
  EyeOff,
  AlertCircle
} from 'lucide-react';

const YES_NO_OPTIONS = [
  '',
  'Yes',
  'No',
  'Decline to Self-Identify'
];

const RELOCATE_OPTIONS = [
  '',
  'Yes',
  'No'
];

const GENDER_OPTIONS = [
  '',
  'Male',
  'Female',
  'Non-Binary',
  'Prefer not to say',
  'Decline to Self-Identify'
];

const VETERAN_OPTIONS = [
  '',
  'I am a protected veteran',
  'I am not a protected veteran',
  'Decline to Self-Identify'
];

const DISABILITY_OPTIONS = [
  '',
  'Yes, I have a disability',
  "No, I don't have a disability",
  'Decline to Self-Identify'
];

const ETHNICITY_OPTIONS = [
  '',
  'Hispanic or Latino',
  'Not Hispanic or Latino',
  'Decline to Self-Identify'
];

const RACE_OPTIONS = [
  '',
  'American Indian or Alaska Native',
  'Asian',
  'Asian (East / South)',
  'Black or African American',
  'Native Hawaiian or Other Pacific Islander',
  'White',
  'Two or More Races',
  'Decline to Self-Identify'
];

const includeCurrentValue = (options, currentValue) => {
  if (
    currentValue &&
    !options.includes(currentValue)
  ) {
    return [
      options[0],
      currentValue,
      ...options.slice(1)
    ];
  }

  return options;
};

const renderOptions = (
  options,
  currentValue,
  fieldName
) => {
  return includeCurrentValue(
    options,
    currentValue
  ).map(option => (
    <option
      key={`${fieldName}-${option || 'empty'}`}
      value={option}
    >
      {option || 'Select...'}
    </option>
  ));
};

export default function EEOInfo({
  data = {},
  updateSection
}) {
  const handleChange = event => {
    updateSection(
      'eeo',
      event.target.name,
      event.target.value
    );
  };

  const handleOptOutToggle = event => {
    updateSection(
      'eeo',
      'optOut',
      event.target.checked
    );
  };

  const isOptedOut = data.optOut === true;

  return (
    <div className="bg-slate-900/30 p-6 md:p-8 rounded-3xl border border-slate-800/50 space-y-8 relative overflow-hidden">
      <div
        className={`p-5 rounded-2xl border transition-all duration-300 ${
          isOptedOut
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-slate-950 border-slate-800'
        }`}
      >
        <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
          <div className="flex items-center space-x-4">
            <div
              className={`p-2 rounded-xl ${
                isOptedOut
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isOptedOut ? (
                <EyeOff className="w-6 h-6" />
              ) : (
                <Shield className="w-6 h-6" />
              )}
            </div>

            <div>
              <h3
                className={`font-bold ${
                  isOptedOut
                    ? 'text-amber-400'
                    : 'text-white'
                }`}
              >
                I choose not to disclose
              </h3>

              <p className="text-slate-400 text-sm mt-0.5">
                Toggle this to automatically skip EEO questions on applications.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={isOptedOut}
              onChange={handleOptOutToggle}
              className="sr-only peer"
            />

            <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500" />
          </label>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-300 ${
          isOptedOut
            ? 'opacity-30 pointer-events-none'
            : 'opacity-100'
        }`}
      >
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-800/50">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Authorized to work in country?
            </label>

            <select
              name="authorizedToWork"
              value={data.authorizedToWork || ''}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
            >
              {renderOptions(
                YES_NO_OPTIONS,
                data.authorizedToWork,
                'authorizedToWork'
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Require Visa Sponsorship Now?
            </label>

            <select
              name="requireVisaNow"
              value={data.requireVisaNow || ''}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
            >
              {renderOptions(
                YES_NO_OPTIONS,
                data.requireVisaNow,
                'requireVisaNow'
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Require Visa Sponsorship Future?
            </label>

            <select
              name="requireVisaFuture"
              value={data.requireVisaFuture || ''}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
            >
              {renderOptions(
                YES_NO_OPTIONS,
                data.requireVisaFuture,
                'requireVisaFuture'
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Willing to relocate?
            </label>

            <select
              name="willingToRelocate"
              value={data.willingToRelocate || ''}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
            >
              {renderOptions(
                RELOCATE_OPTIONS,
                data.willingToRelocate,
                'willingToRelocate'
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Disability Status
          </label>

          <select
            name="disability"
            value={data.disability || ''}
            onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
          >
            {renderOptions(
              DISABILITY_OPTIONS,
              data.disability,
              'disability'
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Veteran Status
          </label>

          <select
            name="veteran"
            value={data.veteran || ''}
            onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
          >
            {renderOptions(
              VETERAN_OPTIONS,
              data.veteran,
              'veteran'
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Gender
          </label>

          <select
            name="gender"
            value={data.gender || ''}
            onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
          >
            {renderOptions(
              GENDER_OPTIONS,
              data.gender,
              'gender'
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Ethnicity
          </label>

          <select
            name="ethnicity"
            value={data.ethnicity || ''}
            onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
          >
            {renderOptions(
              ETHNICITY_OPTIONS,
              data.ethnicity,
              'ethnicity'
            )}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Race
          </label>

          <select
            name="race"
            value={data.race || ''}
            onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
          >
            {renderOptions(
              RACE_OPTIONS,
              data.race,
              'race'
            )}
          </select>
        </div>
      </div>

      <div className="flex items-start space-x-3 text-slate-500 text-xs mt-6 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
        <AlertCircle className="w-5 h-5 shrink-0 text-slate-400" />

        <p>
          Equal Employment Opportunity data is strictly separated from your application by employers for compliance purposes. Filling this out in FastApply prevents you from having to click these dropdowns manually on every application.
        </p>
      </div>
    </div>
  );
}