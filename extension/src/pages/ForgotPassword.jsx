import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Briefcase, KeyRound, MailCheck, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { API_URL } from '../config';

const RESEND_COOLDOWN_SECONDS = 60;

const ForgotPassword = () => {
  const navigate = useNavigate();

  // step 1 = request code, step 2 = enter code + new password, step 3 = done
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setInterval(() => {
      setResendIn(seconds => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const requestCode = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/forgot-password`, { email });
      setInfo(data?.message || 'If an account exists for that email, a reset code has been sent.');
      setStep(2);
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not request a reset code. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        email,
        code: code.trim(),
        newPassword
      });
      setStep(3);
      setInfo('');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'The reset code is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = event => {
    event.preventDefault();
    if (submitting) return;
    if (step === 1) requestCode();
    else if (step === 2) submitReset();
  };

  const inputClasses =
    'w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 ' +
    'focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-600';

  return (
    <div className="min-h-screen w-full flex bg-slate-950 font-sans selection:bg-cyan-500/30 overflow-hidden">
      {/* LEFT SIDE: Product visuals (hidden on mobile) — mirrors the Login page */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 border-r border-slate-800 items-center justify-center">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[100px] animate-pulse"></div>
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: '1s' }}
        ></div>

        <div className="relative z-10 max-w-lg p-12">
          <div className="flex items-center space-x-4 mb-6">
            <Briefcase className="w-12 h-12 text-cyan-400" />
            <h1 className="text-5xl font-black text-white">FastApply</h1>
          </div>
          <p className="text-slate-400 text-lg leading-relaxed">
            Forgot your password? It happens. We&apos;ll email you a one-time code so you can set a
            new one and get back to applying.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: The form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute lg:hidden top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full bg-cyan-500/5 rounded-full blur-[120px]"></div>

        <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-3xl shadow-2xl">
          <div className="flex flex-col items-center mb-8 text-center">
            <KeyRound className="w-10 h-10 text-cyan-400 mb-3" />
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
              {step === 3 ? 'Password Updated' : 'Reset Password'}
            </h2>
            <p className="text-slate-400 mt-2 text-sm">
              {step === 1 && 'Enter your account email and we will send you a 6-digit code.'}
              {step === 2 && `Enter the code we sent to ${email} and choose a new password.`}
              {step === 3 && 'You can now log in with your new password.'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center font-medium">
              {error}
            </div>
          )}
          {info && step === 2 && (
            <div className="mb-6 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-300 text-sm text-center font-medium">
              {info}
            </div>
          )}

          {step === 3 ? (
            <div className="flex flex-col items-center space-y-6">
              <MailCheck className="w-14 h-14 text-emerald-400" />
              <p className="text-slate-300 text-sm text-center">
                Your password was reset successfully. Redirecting you to the login page…
              </p>
              <Link
                to="/login"
                className="w-full text-center bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_0_15px_rgba(8,145,178,0.4)] transition-all duration-300"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  className={inputClasses}
                  placeholder="you@example.com"
                  disabled={step === 2}
                  required
                />
              </div>

              {step === 2 && (
                <>
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">
                      6-Digit Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
                      className={`${inputClasses} tracking-[0.5em] text-center text-lg font-bold`}
                      placeholder="••••••"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={event => setNewPassword(event.target.value)}
                        className={`${inputClasses} pr-12`}
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-cyan-400 transition-colors"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={event => setConfirmPassword(event.target.value)}
                      className={inputClasses}
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_0_15px_rgba(8,145,178,0.4)] transition-all duration-300 transform hover:-translate-y-0.5"
              >
                {submitting
                  ? 'Please wait…'
                  : step === 1
                    ? 'Send Reset Code'
                    : 'Reset Password'}
              </button>

              {step === 2 && (
                <button
                  type="button"
                  disabled={resendIn > 0 || submitting}
                  onClick={() => {
                    setCode('');
                    requestCode();
                  }}
                  className="w-full text-sm text-slate-400 hover:text-cyan-300 disabled:hover:text-slate-400 disabled:opacity-60 transition-colors"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : "Didn't get the code? Send again"}
                </button>
              )}
            </form>
          )}

          {step !== 3 && (
            <p className="mt-8 text-center text-slate-400 text-sm">
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                <ArrowLeft size={14} /> Back to Login
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
