import {
  Plus,
  Trash2,
  GraduationCap,
  Building2,
  MapPin,
  Award,
  Calendar,
  BookOpen
} from 'lucide-react';
import {
  fromMonthInputValue,
  toMonthInputValue
} from '../../utils/profileDate';

export default function EducationHistory({
  data = [],
  updateSection
}) {
  const addEducation = () => {
    const newEducation = {
      school: '',
      institutionLocation: '',
      degree: '',
      major: '',
      minor: '',
      gpa: '',
      gpaScale: '4.0',
      startDate: '',
      endDate: ''
    };

    updateSection(
      'educationHistory',
      [...data, newEducation]
    );
  };

  const updateEducation = (index, field, value) => {
    const updatedEducation = data.map(
      (education, educationIndex) => {
        if (educationIndex !== index) {
          return education;
        }

        return {
          ...education,
          [field]: value
        };
      }
    );

    updateSection(
      'educationHistory',
      updatedEducation
    );
  };

  const updateMonth = (index, field, inputValue) => {
    updateEducation(
      index,
      field,
      fromMonthInputValue(inputValue)
    );
  };

  const removeEducation = index => {
    updateSection(
      'educationHistory',
      data.filter((_, educationIndex) => {
        return educationIndex !== index;
      })
    );
  };

  return (
    <div className="space-y-6">
      {data.length === 0 && (
        <div className="text-center py-10 bg-slate-900/30 border border-slate-800/50 rounded-3xl border-dashed">
          <GraduationCap className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">
            No education history added yet.
          </p>
        </div>
      )}

      {data.map((education, index) => (
        <div
          key={education._id || index}
          className="bg-slate-900/40 p-6 md:p-8 rounded-3xl border border-slate-700/50 shadow-lg relative transition-all hover:border-cyan-500/50"
        >
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800/80">
            <h3 className="text-lg font-bold text-white flex items-center">
              <span className="bg-cyan-500/20 text-cyan-400 py-1 px-3 rounded-lg mr-3 text-sm">
                Institution {index + 1}
              </span>
              {education.school || 'New Education'}
            </h3>

            <button
              type="button"
              onClick={() => removeEducation(index)}
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
              title="Remove this education entry"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                School / University
              </label>

              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />

                <input
                  type="text"
                  value={education.school || ''}
                  onChange={event => {
                    updateEducation(
                      index,
                      'school',
                      event.target.value
                    );
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
                  placeholder="e.g. Stanford University"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Location
              </label>

              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />

                <input
                  type="text"
                  value={education.institutionLocation || ''}
                  onChange={event => {
                    updateEducation(
                      index,
                      'institutionLocation',
                      event.target.value
                    );
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
                  placeholder="e.g. Stanford, CA"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Degree
              </label>

              <div className="relative">
                <Award className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />

                <input
                  type="text"
                  value={education.degree || ''}
                  onChange={event => {
                    updateEducation(
                      index,
                      'degree',
                      event.target.value
                    );
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
                  placeholder="e.g. Bachelor of Science"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Major
              </label>

              <div className="relative">
                <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />

                <input
                  type="text"
                  value={education.major || ''}
                  onChange={event => {
                    updateEducation(
                      index,
                      'major',
                      event.target.value
                    );
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
                  placeholder="e.g. Computer Science"
                />
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 mt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                  Minor (Optional)
                </label>

                <input
                  type="text"
                  value={education.minor || ''}
                  onChange={event => {
                    updateEducation(
                      index,
                      'minor',
                      event.target.value
                    );
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder-slate-700"
                  placeholder="e.g. Mathematics"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                    GPA
                  </label>

                  <input
                    type="text"
                    value={education.gpa || ''}
                    onChange={event => {
                      updateEducation(
                        index,
                        'gpa',
                        event.target.value
                      );
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder-slate-700"
                    placeholder="3.8"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                    Out of (Scale)
                  </label>

                  <input
                    type="text"
                    value={education.gpaScale || ''}
                    onChange={event => {
                      updateEducation(
                        index,
                        'gpaScale',
                        event.target.value
                      );
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder-slate-700"
                    placeholder="4.0"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                  Start Date
                </label>

                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />

                  <input
                    type="month"
                    value={toMonthInputValue(
                      education.startDate
                    )}
                    onChange={event => {
                      updateMonth(
                        index,
                        'startDate',
                        event.target.value
                      );
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                  End Date (or Expected)
                </label>

                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />

                  <input
                    type="month"
                    value={toMonthInputValue(
                      education.endDate
                    )}
                    onChange={event => {
                      updateMonth(
                        index,
                        'endDate',
                        event.target.value
                      );
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addEducation}
        className="w-full flex items-center justify-center space-x-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 font-bold py-4 rounded-2xl transition-all duration-300 border-dashed"
      >
        <Plus className="w-5 h-5" />
        <span>Add Education Entry</span>
      </button>
    </div>
  );
}