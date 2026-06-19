import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, AtSign, Calendar, Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, Ticket, User, X } from 'lucide-react';
import { AUTH_REDIRECT_MESSAGE_KEY, signInWithGoogle, auth, db } from '../lib/backend';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from '@/src/lib/supabaseAuthCompat';
import { getPasswordStrength } from '@/src/lib/passwordStrength';
import { requestEmailOtp, verifyEmailOtp } from '@/src/lib/emailOtp';
import { redeemStoreReferralCode, updateCustomerProfile, validateStoreReferralCode } from '@/src/lib/secureQr';
import { useToast } from './ToastProvider';
import { supabase } from '@/src/lib/supabase';
import { doc, getDoc } from '@/src/lib/dataCompat';
import {
  findTrustedLoginDevice,
  getMfaPromptReason,
  trustCurrentDeviceForUser,
  TrustedLoginProfile,
} from '@/src/lib/trustedDevice';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
}

const USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,22}[a-z0-9]$/;
const RESERVED_USERNAMES = new Set(["admin", "administrator", "api", "help", "perkup", "staff", "store", "support"]);

const emptySignupProfile = {
  name: '',
  accountUsername: '',
  phone: '',
  birthday: '',
  referralCode: '',
};

const normalizeSignupUsername = (value: string) => value.trim().toLowerCase();

const getSignupUsernameError = (value: string) => {
  const username = normalizeSignupUsername(value);
  if (!username) return 'Username is required.';
  if (username.length < 4) return 'Username must be at least 4 characters.';
  if (username.length > 24) return 'Username must be 24 characters or fewer.';
  if (!USERNAME_PATTERN.test(username)) return 'Start with a letter; use letters, numbers, dots, or underscores.';
  if (username.includes('..') || username.includes('__') || username.includes('._') || username.includes('_.')) {
    return 'Do not repeat or mix separators.';
  }
  if (RESERVED_USERNAMES.has(username)) return 'This username is reserved.';
  return '';
};

type PendingMfa = {
  userId: string;
  factorId: string;
  factorName: string;
  reason: string;
};

export function AuthModal({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) {
  const toast = useToast();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [hasAgreedToPrivacy, setHasAgreedToPrivacy] = useState(initialMode !== 'signup');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setHasAgreedToPrivacy(initialMode !== 'signup');
      setUsername('');
      setPassword('');
      setSignupProfile(emptySignupProfile);
      setOtpCode('');
      setOtpToken('');
      setOtpEmail('');
      setOtpExpiresAt(0);
      setPendingMfa(null);
      setMfaCode('');
      setTrustDevice(false);
      const redirectMessage = window.sessionStorage.getItem(AUTH_REDIRECT_MESSAGE_KEY);
      setError(redirectMessage || '');
      if (redirectMessage) {
        toast.error(redirectMessage);
        window.sessionStorage.removeItem(AUTH_REDIRECT_MESSAGE_KEY);
      }
      setMessage('');
    }
  }, [isOpen, initialMode, toast]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signupProfile, setSignupProfile] = useState(emptySignupProfile);
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [otpSecondsRemaining, setOtpSecondsRemaining] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingMfa, setPendingMfa] = useState<PendingMfa | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    if (!otpExpiresAt) {
      setOtpSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      setOtpSecondsRemaining(Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000)));
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [otpExpiresAt]);

  if (!isOpen) return null;

  const formatOtpCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const requestSignupOtp = async (targetEmail: string) => {
    const otp = await requestEmailOtp(targetEmail, targetEmail, 'signup');
    setOtpToken(otp.otpToken);
    setOtpEmail(targetEmail);
    setOtpCode('');
    setOtpExpiresAt(Date.now() + otp.expiresInSeconds * 1000);
    const otpMessage = `We sent a 6-digit OTP to ${targetEmail}. Enter it below to create your account.`;
    setMessage(otpMessage);
    toast.success(otpMessage);
  };

  const showInlineError = (text: string) => {
    setError(text);
    toast.error(text);
  };

  const showInlineSuccess = (text: string) => {
    setMessage(text);
    toast.success(text);
  };

  const getUserProfile = async (userId: string) => {
    const userDoc = await getDoc(doc(db, 'users', userId));
    return userDoc.data() as TrustedLoginProfile;
  };

  const prepareMfaChallengeIfNeeded = async (userId: string) => {
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) throw factors.error;

    const factor = factors.data.totp.find((item) => item.status === 'verified');
    if (!factor) return false;

    const profile = await getUserProfile(userId);
    const trustedDevice = await findTrustedLoginDevice(profile);
    if (trustedDevice) return false;

    setPendingMfa({
      userId,
      factorId: factor.id,
      factorName: factor.friendly_name || 'Authenticator app',
      reason: await getMfaPromptReason(profile),
    });
    setMfaCode('');
    setTrustDevice(false);
    return true;
  };

  const verifyPendingMfa = async () => {
    if (!pendingMfa || !mfaCode.trim()) return;

    setLoading(true);
    setError('');
    setMessage('');
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: pendingMfa.factorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId: pendingMfa.factorId,
        challengeId: challenge.data.id,
        code: mfaCode.trim(),
      });
      if (verify.error) throw verify.error;

      if (trustDevice) {
        await trustCurrentDeviceForUser(pendingMfa.userId);
      }

      toast.success('Signed in successfully.');
      setPendingMfa(null);
      setMfaCode('');
      onClose();
    } catch (err: any) {
      showInlineError(err.message || 'Invalid authentication code.');
    } finally {
      setLoading(false);
    }
  };

  const cancelPendingMfa = async () => {
    setLoading(true);
    await auth.client.signOut().catch(() => undefined);
    setPendingMfa(null);
    setMfaCode('');
    setTrustDevice(false);
    setLoading(false);
  };

  const handleClose = async () => {
    if (pendingMfa) {
      await cancelPendingMfa();
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (mode === 'signup' && !hasAgreedToPrivacy) {
      showInlineError('Please review and agree to the Data Privacy Act notice before creating an account.');
      setLoading(false);
      return;
    }

    const targetEmail = username.trim().toLowerCase();
    const normalizedAccountUsername = normalizeSignupUsername(signupProfile.accountUsername);

    try {
      if (mode === 'signup') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
          showInlineError('Enter a valid email address.');
          return;
        }
        if (!signupProfile.name.trim()) {
          showInlineError('Enter your full name.');
          return;
        }
        const usernameError = getSignupUsernameError(normalizedAccountUsername);
        if (usernameError) {
          showInlineError(usernameError);
          return;
        }
        if (!signupProfile.phone.trim()) {
          showInlineError('Enter your phone number.');
          return;
        }
        if (!signupProfile.birthday) {
          showInlineError('Enter your birthday.');
          return;
        }
        const referralCode = signupProfile.referralCode.trim().toUpperCase();
        if (referralCode) {
          await validateStoreReferralCode(referralCode);
        }

        if (!otpToken || otpEmail !== targetEmail) {
          await requestSignupOtp(targetEmail);
          return;
        }

        if (otpSecondsRemaining <= 0) {
          showInlineError('This OTP has expired. Request a new code.');
          return;
        }

        if (!otpCode.trim()) {
          showInlineError('Enter the OTP sent to your email.');
          return;
        }

        await verifyEmailOtp(otpToken, otpCode, targetEmail, 'signup');
        await createUserWithEmailAndPassword(auth, targetEmail, password, {
          name: signupProfile.name,
          username: normalizedAccountUsername,
          phone: signupProfile.phone,
          birthday: signupProfile.birthday,
        });
        await updateCustomerProfile({
          name: signupProfile.name,
          username: normalizedAccountUsername,
          phone: signupProfile.phone,
          bio: '',
          birthday: signupProfile.birthday,
          avatarUrl: '',
        });
        if (referralCode) {
          const referral = await redeemStoreReferralCode(referralCode);
          toast.success(`Account created. You received ${referral.points} stamp from ${referral.storeName}.`);
        } else {
          toast.success('Account created successfully.');
        }
        onClose();
      } else if (mode === 'signin') {
        const creds = await signInWithEmailAndPassword(auth, targetEmail, password);
        const mfaRequired = await prepareMfaChallengeIfNeeded(creds.user.uid);
        if (mfaRequired) {
          setMessage('Enter the code from your authenticator app to finish signing in.');
          return;
        }
        toast.success('Signed in successfully.');
        onClose();
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, username); // Must provide a valid email to reset
        showInlineSuccess('Password reset email sent. Check your inbox.');
      }
    } catch (err: any) {
      // Improve error messages
      let errorMessage = '';
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered.';
      } else if (mode === 'signin' && (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')) {
        errorMessage = 'No account was found, try registering.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/password sign-in is disabled. Please enable it in Supabase Auth.';
      } else if (err.code === 'auth/email-not-authorized') {
        errorMessage = 'Supabase rejected this email address. Use a real email address, disable email confirmation for local testing, or configure custom SMTP.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Enter a valid email address.';
      } else if (mode === 'signup' && err.code === 'auth/signup-failed') {
        errorMessage = err.message || 'Supabase could not create the account.';
      } else {
        errorMessage = err.message || 'An error occurred. Make sure email/password sign-in is enabled in Supabase Auth.';
      }
      showInlineError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (mode === 'signup' && !hasAgreedToPrivacy) {
      showInlineError('Please review and agree to the Data Privacy Act notice before continuing.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await signInWithGoogle(mode === 'signup' ? 'signup' : 'signin');
      onClose();
    } catch (err: any) {
      if (err?.code !== 'auth/cancelled-popup-request' && err?.code !== 'auth/popup-closed-by-user') {
        showInlineError(mode === 'signup' ? 'Google sign up failed. Please try again.' : 'Google sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role: 'customer' | 'store_owner' | 'staff' | 'admin') => {
    setLoading(true);
    setError('');
    const demoEmail = `demo_${role}@perkup.local`;
    const demoPassword = 'password123';

    try {
      const creds = await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
      if (role === 'staff') {
        const { doc, setDoc } = await import('@/src/lib/dataCompat');
        const { db } = await import('../lib/backend');
        await setDoc(doc(db, 'users', creds.user.uid), { storeId: 'demo1' }, { merge: true });
      }
      toast.success(`Signed in as demo ${role.replace('_', ' ')}.`);
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        try {
          const creds = await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
          if (role !== 'customer') {
            const { doc, setDoc } = await import('@/src/lib/dataCompat');
            const { db } = await import('../lib/backend');
            const userData: any = {
              email: creds.user.email,
              name: `Demo ${role}`,
              role: role,
              updatedAt: new Date(),
            };
            if (role === 'staff') {
              userData.storeId = 'demo1';
            }
            await setDoc(doc(db, 'users', creds.user.uid), userData, { merge: true });
            
            // Reload to ensure the correct role is fetched by AuthContext if we overwrote it.
            setTimeout(() => {
              window.location.reload();
            }, 500);
          }
          toast.success(`Created and signed in as demo ${role.replace('_', ' ')}.`);
          onClose();
        } catch (createErr: any) {
          showInlineError('Failed to create demo account: ' + createErr.message);
        }
      } else if (err.code === 'auth/operation-not-allowed') {
        showInlineError('Email/password sign-in is disabled. Please enable it in Supabase Auth.');
      } else {
        showInlineError('Demo login failed: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: 'signin' | 'signup' | 'forgot') => {
    setMode(newMode);
    setHasAgreedToPrivacy(newMode !== 'signup');
    setError('');
    setMessage('');
    setPassword('');
    setSignupProfile(emptySignupProfile);
    setOtpCode('');
    setOtpToken('');
    setOtpEmail('');
    setOtpExpiresAt(0);
    setPendingMfa(null);
    setMfaCode('');
    setTrustDevice(false);
  };

  const handlePrivacyAgreement = () => {
    setHasAgreedToPrivacy(true);
    setError('');
    setMessage('');
  };

  const handlePrivacyDisagreement = () => {
    setMode('signin');
    setHasAgreedToPrivacy(true);
    setPassword('');
    setError('');
    showInlineError('Signup was cancelled because the privacy notice was not accepted.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-gray-900 w-full max-w-[400px] max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors mx-4"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          {mode === 'signup' && !hasAgreedToPrivacy ? (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors mb-2">
                  Data Privacy Notice
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Please review this before creating a customer account.
                </p>
              </div>

              {(error || message) && (
                <div className={`p-3 rounded-xl text-sm ${error ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
                  {error || message}
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/70 p-4 text-left text-sm leading-6 text-gray-600 dark:text-gray-300">
                <p>
                  In accordance with the Data Privacy Act of 2012, PerkUp collects and processes the information you provide during signup, such as your email address, password credentials, profile details, loyalty activity, reward redemptions, and related account records.
                </p>
                <p className="mt-3">
                  Your data is used to create and secure your customer account, identify you when earning or redeeming rewards, maintain loyalty cards and transaction history, provide customer support, prevent misuse, and improve PerkUp services. Authorized partner store staff may only access customer information needed to operate loyalty and promotion workflows.
                </p>
                <p className="mt-3">
                  By selecting Agree, you confirm that you understand this notice and consent to the collection and use of your data for these purposes.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handlePrivacyDisagreement}
                  className="w-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-[0.98]"
                >
                  Disagree
                </button>
                <button
                  type="button"
                  onClick={handlePrivacyAgreement}
                  className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium py-3 px-4 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-[0.98]"
                >
                  Agree
                </button>
              </div>
            </div>
          ) : (
            <>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors mb-1">
              {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {mode === 'signin' ? 'Enter your details to sign in.' : mode === 'signup' ? 'Join PerkUp to earn rewards.' : 'We will send you a reset link.'}
            </p>
          </div>

          {(error || message) && (
            <div className={`p-3 rounded-xl mb-4 text-sm ${error ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
              {error || message}
            </div>
          )}

          {pendingMfa ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                verifyPendingMfa();
              }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-left dark:border-orange-900/50 dark:bg-orange-900/20">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Authenticator code required</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{pendingMfa.reason}</p>
                    {pendingMfa.reason.startsWith('We noticed') && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-orange-700 dark:text-orange-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        We noticed an attempt to log in. Verify it was you to continue.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  Authentication Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="block w-full px-4 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                  placeholder="123456"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Use the 6-digit code from {pendingMfa.factorName}.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-left dark:border-gray-800 dark:bg-gray-800/70">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(event) => setTrustDevice(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white">Trust this device for 30 days</span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    Skip the authenticator prompt on this browser unless the device or location changes. You can turn this off in your profile.
                  </span>
                </span>
              </label>

              <button
                type="submit"
                disabled={loading || !mfaCode}
                className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium py-3 px-4 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? 'Verifying...' : 'Verify and sign in'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={cancelPendingMfa}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel sign in
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (mode === 'signup') {
                      setOtpCode('');
                      setOtpToken('');
                      setOtpEmail('');
                      setOtpExpiresAt(0);
                      setMessage('');
                    }
                  }}
                  className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 text-left sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <User className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      required
                      value={signupProfile.name}
                      onChange={(e) => setSignupProfile({ ...signupProfile, name: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                      placeholder="Juan Dela Cruz"
                    />
                  </div>
                </div>

                <div className="space-y-1 text-left sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Username</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <AtSign className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      required
                      value={signupProfile.accountUsername}
                      onChange={(e) => setSignupProfile({ ...signupProfile, accountUsername: normalizeSignupUsername(e.target.value) })}
                      className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                      placeholder="juan.delacruz"
                    />
                  </div>
                  <p className={`text-xs font-medium ${getSignupUsernameError(signupProfile.accountUsername) ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                    {getSignupUsernameError(signupProfile.accountUsername) || 'Strong format. Uniqueness is verified when your account is created.'}
                  </p>
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Phone Number</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Phone className="h-5 w-5" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={signupProfile.phone}
                      onChange={(e) => setSignupProfile({ ...signupProfile, phone: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                      placeholder="0917 123 4567"
                    />
                  </div>
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Birthday</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <input
                      type="date"
                      required
                      value={signupProfile.birthday}
                      onChange={(e) => setSignupProfile({ ...signupProfile, birthday: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1 text-left sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Referral Code (Optional)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Ticket className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      value={signupProfile.referralCode}
                      onChange={(e) => setSignupProfile({ ...signupProfile, referralCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })}
                      className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors uppercase"
                      placeholder="STORE123"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    New customers can redeem one store referral code during signup for 1 stamp.
                  </p>
                </div>
              </div>
            )}

            {mode !== 'forgot' && (
              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {mode === 'signup' && password && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-gray-500 dark:text-gray-400">Password strength</span>
                      <span className="text-gray-900 dark:text-gray-100">{passwordStrength.label}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${passwordStrength.tone}`}
                        style={{ width: `${passwordStrength.percent}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {passwordStrength.checks.map((check) => (
                        <span
                          key={check.label}
                          className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                            check.met
                              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {check.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {mode === 'signup' && otpToken && (
              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Email OTP</label>
                  <span className={`text-xs font-semibold ${otpSecondsRemaining > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-orange-600 dark:text-orange-400'}`}>
                    {otpSecondsRemaining > 0 ? `Expires in ${formatOtpCountdown(otpSecondsRemaining)}` : 'Expired'}
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="block w-full px-4 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                  placeholder="123456"
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    const targetEmail = username.trim().toLowerCase();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
                      showInlineError('Enter a valid email address.');
                      return;
                    }
                    setLoading(true);
                    setError('');
                    try {
                      await requestSignupOtp(targetEmail);
                    } catch (err: any) {
                      showInlineError(err.message || 'Could not send a new OTP.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-500 disabled:opacity-50 dark:text-orange-400"
                >
                  Request new OTP
                </button>
              </div>
            )}

            {mode === 'signin' && (
              <div className="flex justify-end">
                <button 
                  type="button" 
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-500"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium py-3 px-4 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? (otpToken ? 'Verify OTP & create account' : 'Send OTP') : 'Send reset link'}
            </button>
          </form>
          )}

          {mode !== 'forgot' && !pendingMfa && (
            <>
              <div className="mt-6 flex items-center text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest before:flex-1 before:border-t before:border-gray-200 dark:before:border-gray-800 before:mr-4 after:flex-1 after:border-t after:border-gray-200 dark:after:border-gray-800 after:ml-4">
                Or
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="mt-6 w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  <path d="M1 1h22v22H1z" fill="none"/>
                </svg>
                {mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
              </button>
            </>
          )}

          {!pendingMfa && <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button onClick={() => switchMode('signup')} className="text-orange-600 dark:text-orange-400 font-medium hover:underline">
                  Sign up
                </button>
              </>
            ) : mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button onClick={() => switchMode('signin')} className="text-orange-600 dark:text-orange-400 font-medium hover:underline">
                  Sign in
                </button>
              </>
            ) : (
              <button onClick={() => switchMode('signin')} className="text-gray-600 dark:text-gray-300 font-medium hover:underline">
                Back to sign in
              </button>
            )}
          </div>}

          {!pendingMfa && <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-widest font-semibold">Demo Accounts</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('customer')}
                className="text-xs py-2 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Customer
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('store_owner')}
                className="text-xs py-2 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Store Owner
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('staff')}
                className="text-xs py-2 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Staff
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('admin')}
                className="text-xs py-2 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Admin
              </button>
            </div>
          </div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
