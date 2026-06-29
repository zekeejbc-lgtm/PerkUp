import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, KeyRound, Loader2, Lock, Mail, QrCode, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import { auth, db } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase";
import { getPasswordStrength } from "@/src/lib/passwordStrength";
import { requestEmailOtp, verifyEmailOtp } from "@/src/lib/emailOtp";
import { SkeletonBlock } from "@/src/components/LoadingSkeleton";
import { updateEmail } from "@/src/lib/supabaseAuthCompat";
import { useAuth } from "@/src/contexts/AuthContext";
import { doc, serverTimestamp, setDoc } from "@/src/lib/dataCompat";
import { getActiveTrustedDevices, updateTrustedDevicePreference } from "@/src/lib/trustedDevice";
import { invokeAdminBackend } from "@/src/lib/adminBackend";

type Message = {
  text: string;
  type: "success" | "error";
};

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
  last_challenged_at?: string;
};

const qrImageSrc = (qrCode: string) => {
  if (!qrCode) return "";
  if (qrCode.startsWith("data:")) return qrCode;
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`;
};

const formatEnrollmentDate = (dateValue?: string) => {
  if (!dateValue) return "Enrollment date unavailable";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Enrollment date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export default function AccountSecurity() {
  const { user, refreshUser } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMfaCode, setPasswordMfaCode] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailOtpToken, setEmailOtpToken] = useState("");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailOtpExpiresAt, setEmailOtpExpiresAt] = useState(0);
  const [emailOtpSecondsRemaining, setEmailOtpSecondsRemaining] = useState(0);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<Message | null>(null);

  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [showMfaEnroll, setShowMfaEnroll] = useState(false);
  const [enrollFactorId, setEnrollFactorId] = useState("");
  const [enrollQr, setEnrollQr] = useState("");
  const [enrollSecret, setEnrollSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [removingFactor, setRemovingFactor] = useState<TotpFactor | null>(null);
  const [removeCode, setRemoveCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<Message | null>(null);
  const [trustedDeviceEnabled, setTrustedDeviceEnabled] = useState(true);
  const [trustedDeviceBusy, setTrustedDeviceBusy] = useState(false);
  const [trustedDeviceMessage, setTrustedDeviceMessage] = useState<Message | null>(null);
  const [deletionStep, setDeletionStep] = useState<"start" | "otp" | "credentials">("start");
  const [deletionOtpToken, setDeletionOtpToken] = useState("");
  const [deletionOtpCode, setDeletionOtpCode] = useState("");
  const [deletionOtpExpiresAt, setDeletionOtpExpiresAt] = useState(0);
  const [deletionProof, setDeletionProof] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionUsername, setDeletionUsername] = useState("");
  const [deletionAcknowledged, setDeletionAcknowledged] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<Message | null>(null);
  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const activeTrustedDevices = useMemo(() => getActiveTrustedDevices(user), [user]);

  const loadFactors = async () => {
    setLoadingFactors(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setFactors(data.totp ?? []);
    } catch (error) {
      console.error("Failed to load MFA factors:", error);
      setMfaMessage({ text: "Could not load authenticator settings.", type: "error" });
    } finally {
      setLoadingFactors(false);
    }
  };

  useEffect(() => {
    loadFactors();
  }, []);

  useEffect(() => {
    setTrustedDeviceEnabled(user?.skipMfaOnTrustedDevice !== false);
  }, [user?.skipMfaOnTrustedDevice]);

  useEffect(() => {
    if (!emailOtpExpiresAt) {
      setEmailOtpSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      setEmailOtpSecondsRemaining(Math.max(0, Math.ceil((emailOtpExpiresAt - Date.now()) / 1000)));
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [emailOtpExpiresAt]);

  const formatOtpCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  };

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMfaCode("");
    setShowPasswordForm(false);
  };

  const resetEmailForm = () => {
    setNewEmail("");
    setEmailOtpToken("");
    setEmailOtpCode("");
    setEmailOtpExpiresAt(0);
    setShowEmailForm(false);
  };

  const requestDeletionOtp = async () => {
    if (!user?.email) return;
    setIsDeletingAccount(true);
    setDeleteMessage(null);
    try {
      // Reuse the deployed identity-verification OTP channel. No email is changed.
      const otp = await requestEmailOtp(user.email, user.name || user.email, "email_change");
      setDeletionOtpToken(otp.otpToken);
      setDeletionOtpExpiresAt(Date.now() + otp.expiresInSeconds * 1000);
      setDeletionOtpCode("");
      setDeletionStep("otp");
      setDeleteMessage({ text: `A 6-digit verification code was sent to ${user.email}.`, type: "success" });
    } catch (error) {
      setDeleteMessage({
        text: error instanceof Error ? error.message : "Could not send the deletion OTP.",
        type: "error",
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const verifyDeletionOtpCode = async () => {
    if (!deletionOtpToken || !/^\d{6}$/.test(deletionOtpCode)) return;
    if (deletionOtpExpiresAt <= Date.now()) {
      setDeleteMessage({ text: "The OTP expired. Request a new code.", type: "error" });
      return;
    }
    setIsDeletingAccount(true);
    setDeleteMessage(null);
    try {
      const result = await invokeAdminBackend<{ deletionProof: string; expiresAt: number }>({
        action: "verify_account_deletion_otp",
        otpToken: deletionOtpToken,
        otpCode: deletionOtpCode,
      });
      setDeletionProof(result.deletionProof);
      setDeletionStep("credentials");
      setDeleteMessage({ text: "Email verified. Complete the final identity check within 5 minutes.", type: "success" });
    } catch (error) {
      setDeleteMessage({
        text: error instanceof Error ? error.message : "The OTP is invalid or expired.",
        type: "error",
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const deleteAccount = async () => {
    if (!deletionProof || !deletionPassword || !deletionUsername.trim() || !deletionAcknowledged) return;
    setIsDeletingAccount(true);
    setDeleteMessage(null);
    try {
      await invokeAdminBackend<{ deleted: boolean }>({
        action: "delete_my_account",
        deletionProof,
        password: deletionPassword,
        username: deletionUsername.trim(),
      });
      await supabase.auth.signOut({ scope: "local" });
      window.location.assign("/");
    } catch (error) {
      setDeleteMessage({
        text: error instanceof Error ? error.message : "Account deletion failed.",
        type: "error",
      });
      setIsDeletingAccount(false);
    }
  };

  const handleStartEmailChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailMessage(null);

    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!user?.id) {
      setEmailMessage({ text: "You need to be signed in to change your email.", type: "error" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailMessage({ text: "Enter a valid email address.", type: "error" });
      return;
    }

    if (normalizedEmail === user.email?.toLowerCase()) {
      setEmailMessage({ text: "Enter a different email address.", type: "error" });
      return;
    }

    await requestEmailChangeOtp(normalizedEmail);
  };

  const requestEmailChangeOtp = async (normalizedEmail: string) => {
    setIsChangingEmail(true);
    try {
      const otp = await requestEmailOtp(normalizedEmail, user?.name || normalizedEmail, "email_change");
      setNewEmail(normalizedEmail);
      setEmailOtpToken(otp.otpToken);
      setEmailOtpCode("");
      setEmailOtpExpiresAt(Date.now() + otp.expiresInSeconds * 1000);
      setEmailMessage({ text: `We sent a 6-digit OTP to ${normalizedEmail}.`, type: "success" });
    } catch (error) {
      console.error("Email OTP request failed:", error);
      setEmailMessage({ text: error instanceof Error ? error.message : "Could not send email OTP.", type: "error" });
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleConfirmEmailChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailMessage(null);

    if (!user?.id) {
      setEmailMessage({ text: "You need to be signed in to change your email.", type: "error" });
      return;
    }

    if (!emailOtpToken || !emailOtpCode.trim()) {
      setEmailMessage({ text: "Enter the OTP sent to your new email.", type: "error" });
      return;
    }

    if (emailOtpSecondsRemaining <= 0) {
      setEmailMessage({ text: "This OTP has expired. Request a new code.", type: "error" });
      return;
    }

    const normalizedEmail = newEmail.trim().toLowerCase();
    setIsChangingEmail(true);
    try {
      await verifyEmailOtp(emailOtpToken, emailOtpCode, normalizedEmail, "email_change");
      await updateEmail(auth, normalizedEmail);
      await setDoc(doc(db, "users", user.id), {
        email: normalizedEmail,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await refreshUser();
      setEmailMessage({ text: "Email updated successfully.", type: "success" });
      resetEmailForm();
    } catch (error) {
      console.error("Email update failed:", error);
      setEmailMessage({ text: error instanceof Error ? error.message : "Failed to update email.", type: "error" });
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!auth.currentUser) {
      setMessage({ text: "You need to be signed in to change your password.", type: "error" });
      return;
    }

    if (!currentPassword) {
      setMessage({ text: "Enter your current password.", type: "error" });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ text: "New password must be at least 6 characters.", type: "error" });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ text: "New password and confirmation do not match.", type: "error" });
      return;
    }

    setIsChangingPassword(true);
    try {
      const factorsResponse = await supabase.auth.mfa.listFactors();
      if (factorsResponse.error) throw factorsResponse.error;
      setFactors(factorsResponse.data.totp ?? []);

      const passwordMfaFactor = (factorsResponse.data.totp ?? []).find((factor) => factor.status === "verified");
      if (passwordMfaFactor && !passwordMfaCode.trim()) {
        setMessage({ text: "Enter the code from your authenticator app.", type: "error" });
        return;
      }

      if (passwordMfaFactor) {
        const challenge = await supabase.auth.mfa.challenge({ factorId: passwordMfaFactor.id });
        if (challenge.error) throw challenge.error;

        const verify = await supabase.auth.mfa.verify({
          factorId: passwordMfaFactor.id,
          challengeId: challenge.data.id,
          code: passwordMfaCode.trim(),
        });
        if (verify.error) throw verify.error;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword,
      });
      if (error) throw error;
      setMessage({ text: "Password updated successfully.", type: "success" });
      resetPasswordForm();
    } catch (error) {
      console.error("Password update failed:", error);
      setMessage({ text: error instanceof Error ? error.message : "Failed to update password.", type: "error" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const startMfaEnrollment = async () => {
    setMfaBusy(true);
    setMfaMessage(null);
    setVerificationCode("");
    setRemovingFactor(null);
    setRemoveCode("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (error) throw error;

      setEnrollFactorId(data.id);
      setEnrollQr(data.totp.qr_code);
      setEnrollSecret(data.totp.secret);
      setShowMfaEnroll(true);
    } catch (error) {
      console.error("MFA enrollment failed:", error);
      setMfaMessage({ text: error instanceof Error ? error.message : "Could not start authenticator setup.", type: "error" });
    } finally {
      setMfaBusy(false);
    }
  };

  const cancelMfaEnrollment = async () => {
    if (enrollFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: enrollFactorId }).catch(() => undefined);
    }
    setShowMfaEnroll(false);
    setEnrollFactorId("");
    setEnrollQr("");
    setEnrollSecret("");
    setVerificationCode("");
  };

  const startRemoveFactor = (factor: TotpFactor) => {
    setMfaMessage(null);
    setShowMfaEnroll(false);
    setRemovingFactor(factor);
    setRemoveCode("");
  };

  const cancelRemoveFactor = () => {
    setRemovingFactor(null);
    setRemoveCode("");
  };

  const removeMfaFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!removingFactor || !removeCode) return;

    setMfaBusy(true);
    setMfaMessage(null);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: removingFactor.id });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId: removingFactor.id,
        challengeId: challenge.data.id,
        code: removeCode.trim(),
      });
      if (verify.error) throw verify.error;

      const unenroll = await supabase.auth.mfa.unenroll({ factorId: removingFactor.id });
      if (unenroll.error) throw unenroll.error;

      setMfaMessage({ text: "Authenticator app removed.", type: "success" });
      setRemovingFactor(null);
      setRemoveCode("");
      await loadFactors();
    } catch (error) {
      console.error("MFA removal failed:", error);
      setMfaMessage({ text: error instanceof Error ? error.message : "Could not remove authenticator app.", type: "error" });
    } finally {
      setMfaBusy(false);
    }
  };

  const verifyMfaEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollFactorId || !verificationCode) return;

    setMfaBusy(true);
    setMfaMessage(null);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: enrollFactorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challenge.data.id,
        code: verificationCode.trim(),
      });
      if (verify.error) throw verify.error;

      setMfaMessage({ text: "Authenticator app enrolled successfully.", type: "success" });
      setShowMfaEnroll(false);
      setEnrollFactorId("");
      setEnrollQr("");
      setEnrollSecret("");
      setVerificationCode("");
      await loadFactors();
    } catch (error) {
      console.error("MFA verification failed:", error);
      setMfaMessage({ text: error instanceof Error ? error.message : "Invalid authentication code.", type: "error" });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleTrustedDeviceToggle = async (enabled: boolean) => {
    if (!user?.id) return;

    setTrustedDeviceBusy(true);
    setTrustedDeviceMessage(null);
    try {
      await updateTrustedDevicePreference(user.id, enabled);
      setTrustedDeviceEnabled(enabled);
      await refreshUser();
      setTrustedDeviceMessage({
        type: "success",
        text: enabled
          ? "Trusted-device skipping is enabled."
          : "Trusted-device skipping is off. Saved trusted devices were cleared.",
      });
    } catch (error) {
      console.error("Trusted device preference update failed:", error);
      setTrustedDeviceMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not update trusted-device settings.",
      });
    } finally {
      setTrustedDeviceBusy(false);
    }
  };

  const verifiedFactors = factors.filter((factor) => factor.status === "verified");

  return (
    <div className="space-y-6">
      <section id="email-security" className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 scroll-mt-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-gray-400" />
              Password
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Change your password by confirming your current password first.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setShowPasswordForm(true);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            <Lock className="h-3.5 w-3.5" />
            Change Password
          </button>
        </div>

        {message && (
          <div className={`mt-4 p-4 rounded-2xl text-sm font-medium flex items-center gap-2 ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}>
            {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {showPasswordForm && (
          <form onSubmit={handlePasswordChange} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-[#1b1b1b] dark:text-white transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-[#1b1b1b] dark:text-white transition-colors"
              />
              {newPassword && (
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
                            ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {check.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-[#1b1b1b] dark:text-white transition-colors"
              />
            </div>
            {verifiedFactors.length > 0 && (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Authenticator Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={passwordMfaCode}
                  onChange={(event) => setPasswordMfaCode(event.target.value.replace(/\s/g, "").slice(0, 6))}
                  className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-[#1b1b1b] dark:text-white transition-colors"
                  placeholder="123456"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Required because this account has an authenticator app enrolled.
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
              <button
                type="submit"
                disabled={isChangingPassword}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1b1b1b] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
              >
                {isChangingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Password
              </button>
              <button
                type="button"
                onClick={resetPasswordForm}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-gray-400" />
              Email
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Verify a one-time password sent to the new email before changing it.
            </p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{user?.email || "No email set"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmailMessage(null);
              setShowEmailForm(true);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            <Mail className="h-3.5 w-3.5" />
            Change Email
          </button>
        </div>

        {emailMessage && (
          <div className={`mt-4 p-4 rounded-2xl text-sm font-medium flex items-center gap-2 ${
            emailMessage.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}>
            {emailMessage.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {emailMessage.text}
          </div>
        )}

        {showEmailForm && (
          <form onSubmit={emailOtpToken ? handleConfirmEmailChange : handleStartEmailChange} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">New Email Address</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(event) => {
                  setNewEmail(event.target.value);
                  setEmailOtpToken("");
                  setEmailOtpCode("");
                  setEmailOtpExpiresAt(0);
                  setEmailMessage(null);
                }}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-[#1b1b1b] dark:text-white transition-colors"
                placeholder="name@example.com"
              />
            </div>
            {emailOtpToken && (
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Email OTP</label>
                  <span className={`text-xs font-semibold ${emailOtpSecondsRemaining > 0 ? "text-gray-500 dark:text-gray-400" : "text-[#1b1b1b] dark:text-white"}`}>
                    {emailOtpSecondsRemaining > 0 ? `Expires in ${formatOtpCountdown(emailOtpSecondsRemaining)}` : "Expired"}
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={emailOtpCode}
                  onChange={(event) => setEmailOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-[#1b1b1b] dark:text-white transition-colors"
                  placeholder="123456"
                />
                <button
                  type="button"
                  disabled={isChangingEmail}
                  onClick={() => {
                    const normalizedEmail = newEmail.trim().toLowerCase();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                      setEmailMessage({ text: "Enter a valid email address.", type: "error" });
                      return;
                    }
                    requestEmailChangeOtp(normalizedEmail);
                  }}
                  className="text-xs font-semibold text-[#1b1b1b] hover:text-[#1b1b1b] disabled:opacity-50 dark:text-white"
                >
                  Request new OTP
                </button>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
              <button
                type="submit"
                disabled={isChangingEmail}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1b1b1b] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
              >
                {isChangingEmail && <Loader2 className="w-4 h-4 animate-spin" />}
                {emailOtpToken ? "Verify OTP and Save Email" : "Send OTP"}
              </button>
              <button
                type="button"
                onClick={resetEmailForm}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-gray-400" />
              Trusted Devices
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Allow trusted browsers to skip authenticator codes for 30 days. A new device or location will still require a code.
            </p>
            <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              {activeTrustedDevices.length} trusted {activeTrustedDevices.length === 1 ? "device" : "devices"} active.
            </p>
          </div>

          <label className="flex shrink-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
            <input
              type="checkbox"
              checked={trustedDeviceEnabled}
              disabled={trustedDeviceBusy}
              onChange={(event) => handleTrustedDeviceToggle(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#1b1b1b] focus:ring-[#1b1b1b] disabled:opacity-50"
            />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Skip on trusted devices
            </span>
          </label>
        </div>

        {activeTrustedDevices.length > 0 && (
          <div className="mt-4 space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            {activeTrustedDevices.map((device) => (
              <div key={device.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium text-gray-900 dark:text-gray-100">{device.label || "Trusted browser"}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Trusted until {formatEnrollmentDate(device.trustedUntil)}
                </span>
              </div>
            ))}
          </div>
        )}

        {trustedDeviceMessage && (
          <div className={`mt-4 p-4 rounded-2xl text-sm font-medium flex items-center gap-2 ${
            trustedDeviceMessage.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}>
            {trustedDeviceMessage.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {trustedDeviceMessage.text}
          </div>
        )}
      </section>

      <section className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-gray-400" />
              Authenticator App
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Enroll Google Authenticator or any compatible authentication app using a QR code.
            </p>
          </div>
          <button
            type="button"
            onClick={startMfaEnrollment}
            disabled={mfaBusy}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1b1b1b] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {mfaBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
            Enroll App
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          {loadingFactors ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-12 rounded-xl" />
              <SkeletonBlock className="h-12 rounded-xl" />
            </div>
          ) : verifiedFactors.length > 0 ? (
            <div className="space-y-2">
              {verifiedFactors.map((factor) => (
                <div key={factor.id} className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <span className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <Smartphone className="w-4 h-4 text-green-600" />
                      {factor.friendly_name || "Authenticator app"}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <CalendarClock className="w-3.5 h-3.5" />
                      Enrolled {formatEnrollmentDate(factor.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Active
                    </span>
                    <button
                      type="button"
                      onClick={() => startRemoveFactor(factor)}
                      disabled={mfaBusy}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No authenticator app is enrolled yet.</p>
          )}
        </div>

        {mfaMessage && (
          <div className={`mt-4 p-4 rounded-2xl text-sm font-medium flex items-center gap-2 ${
            mfaMessage.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}>
            {mfaMessage.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {mfaMessage.text}
          </div>
        )}

        {showMfaEnroll && (
          <form onSubmit={verifyMfaEnrollment} className="mt-5 grid gap-5 rounded-2xl border border-gray-200 dark:border-white/15 bg-gray-100/60 dark:bg-white/5 p-5">
            <div className="grid gap-5 md:grid-cols-[auto_1fr]">
              {enrollQr && (
                <div className="bg-white rounded-2xl p-3 border border-gray-200 w-max">
                  <img src={qrImageSrc(enrollQr)} alt="Authenticator app QR code" className="w-44 h-44" />
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Scan this QR code in your authentication app.</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    After scanning, enter the 6-digit code from the app to activate it.
                  </p>
                </div>
                {enrollSecret && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Manual setup key</label>
                    <code className="block break-all rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
                      {enrollSecret}
                    </code>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Authentication Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\s/g, ""))}
                    className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-[#1b1b1b] dark:text-white transition-colors"
                    placeholder="123456"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={mfaBusy || !verificationCode}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1b1b1b] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
              >
                {mfaBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify and Enable
              </button>
              <button
                type="button"
                onClick={cancelMfaEnrollment}
                disabled={mfaBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {removingFactor && (
          <form onSubmit={removeMfaFactor} className="mt-5 grid gap-4 rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 p-5">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Remove authenticator app?</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Enter the 6-digit code from {removingFactor.friendly_name || "your authenticator app"} to remove it from this account.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Authentication Code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={removeCode}
                onChange={(event) => setRemoveCode(event.target.value.replace(/\s/g, ""))}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-[#1b1b1b] dark:text-white transition-colors"
                placeholder="123456"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={mfaBusy || !removeCode}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {mfaBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Remove App
              </button>
              <button
                type="button"
                onClick={cancelRemoveFactor}
                disabled={mfaBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {user?.role === "customer" && (
        <section className="rounded-3xl border border-red-200 bg-red-50/60 p-6 dark:border-red-900/50 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 dark:text-red-200">Delete account</h3>
              <p className="mt-1 text-sm text-red-800/80 dark:text-red-300/80">
                This permanently removes your login, profile, contact details, profile image, feedback, referral record,
                trusted-device data, scan history, rewards, stamps, points, and promotion progress. A store keeps only a
                de-identified loyalty-card marker with the store and original join date; it cannot be linked back to you.
                See <Link to="/data-deletion" className="font-semibold underline">Data Deletion</Link> and{" "}
                <Link to="/privacy" className="font-semibold underline">Privacy Policy</Link> for full details.
              </p>

              {deletionStep === "start" && (
                <button
                  type="button"
                  onClick={requestDeletionOtp}
                  disabled={isDeletingAccount}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Start permanent deletion
                </button>
              )}

              {deletionStep === "otp" && (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-semibold text-red-900 dark:text-red-200">Step 1: Email OTP</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={deletionOtpCode}
                      onChange={(event) => setDeletionOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      className="min-w-0 flex-1 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-red-500 dark:border-red-900 dark:bg-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={verifyDeletionOtpCode}
                      disabled={isDeletingAccount || deletionOtpCode.length !== 6}
                      className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeletingAccount ? "Verifying…" : "Verify OTP"}
                    </button>
                  </div>
                  <button type="button" onClick={requestDeletionOtp} disabled={isDeletingAccount} className="text-xs font-semibold text-red-700 underline dark:text-red-300">
                    Send a new code
                  </button>
                </div>
              )}

              {deletionStep === "credentials" && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-200">Step 2: Password and username</p>
                  <input
                    type="password"
                    value={deletionPassword}
                    onChange={(event) => setDeletionPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Current password"
                    className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-red-500 dark:border-red-900 dark:bg-gray-900 dark:text-white"
                  />
                  <input
                    value={deletionUsername}
                    onChange={(event) => setDeletionUsername(event.target.value)}
                    autoComplete="username"
                    placeholder="Exact username"
                    className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-red-500 dark:border-red-900 dark:bg-gray-900 dark:text-white"
                  />
                  <label className="flex items-start gap-2 text-sm text-red-900 dark:text-red-200">
                    <input
                      type="checkbox"
                      checked={deletionAcknowledged}
                      onChange={(event) => setDeletionAcknowledged(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-red-300 accent-red-700"
                    />
                    <span>I understand this deletion is permanent, cannot be undone, and removes all rewards.</span>
                  </label>
                  <button
                    type="button"
                    onClick={deleteAccount}
                    disabled={isDeletingAccount || !deletionPassword || !deletionUsername.trim() || !deletionAcknowledged}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {isDeletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Permanently delete account and rewards
                  </button>
                </div>
              )}

              {deleteMessage && (
                <p className={`mt-3 text-sm font-medium ${deleteMessage.type === "success" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>{deleteMessage.text}</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
