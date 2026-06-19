import { doc, getDoc, serverTimestamp, setDoc } from "@/src/lib/dataCompat";
import { db } from "@/src/lib/backend";

export type TrustedLoginDevice = {
  id: string;
  deviceHash: string;
  locationKey: string;
  label: string;
  trustedUntil: string;
  createdAt: string;
  lastUsedAt: string;
};

export type TrustedLoginProfile = {
  skipMfaOnTrustedDevice?: boolean;
  trustedLoginDevices?: TrustedLoginDevice[];
};

const DEVICE_ID_KEY = "perkup:trusted-login-device-id";
const TRUST_DAYS = 30;

const getLocalDeviceId = () => {
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
};

export const getCurrentLoginDevice = async () => {
  const deviceId = getLocalDeviceId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  const locationKey = [timezone, new Date().getTimezoneOffset(), navigator.language || "unknown"].join("|");
  const fingerprint = [
    deviceId,
    navigator.userAgent,
    navigator.platform,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    timezone,
  ].join("|");

  return {
    id: deviceId,
    deviceHash: await sha256(fingerprint),
    locationKey,
    label: `${navigator.platform || "This device"} - ${timezone}`,
  };
};

export const getActiveTrustedDevices = (profile?: TrustedLoginProfile | null) => {
  const trustedDevices = Array.isArray(profile?.trustedLoginDevices) ? profile.trustedLoginDevices : [];
  const now = Date.now();
  return trustedDevices.filter((device) => new Date(device.trustedUntil).getTime() > now);
};

export const findTrustedLoginDevice = async (profile?: TrustedLoginProfile | null) => {
  if (profile?.skipMfaOnTrustedDevice === false) return null;
  const currentDevice = await getCurrentLoginDevice();
  const trustedDevice = getActiveTrustedDevices(profile).find(
    (device) =>
      device.id === currentDevice.id &&
      device.deviceHash === currentDevice.deviceHash &&
      device.locationKey === currentDevice.locationKey,
  );

  return trustedDevice ?? null;
};

export const getMfaPromptReason = async (profile?: TrustedLoginProfile | null) => {
  if (profile?.skipMfaOnTrustedDevice === false) return "Authenticator verification is required for this account.";
  const currentDevice = await getCurrentLoginDevice();
  const activeDevices = getActiveTrustedDevices(profile);
  if (activeDevices.length === 0) return "Enter the code from your authentication app.";

  const sameDevice = activeDevices.some((device) => device.id === currentDevice.id && device.deviceHash === currentDevice.deviceHash);
  if (sameDevice) return "We noticed an attempt to log in from a new location.";
  return "We noticed an attempt to log in from a new device.";
};

export const trustCurrentDeviceForUser = async (userId: string) => {
  const currentDevice = await getCurrentLoginDevice();
  const userRef = doc(db, "users", userId);
  const userDoc = await getDoc(userRef);
  const profile = userDoc.data() as TrustedLoginProfile;
  const activeDevices = getActiveTrustedDevices(profile).filter((device) => device.id !== currentDevice.id);
  const now = new Date();
  const trustedUntil = new Date(now.getTime() + TRUST_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await setDoc(
    userRef,
    {
      trustedLoginDevices: [
        ...activeDevices,
        {
          ...currentDevice,
          trustedUntil,
          createdAt: now.toISOString(),
          lastUsedAt: now.toISOString(),
        },
      ],
      skipMfaOnTrustedDevice: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const updateTrustedDevicePreference = async (userId: string, enabled: boolean) => {
  await setDoc(
    doc(db, "users", userId),
    {
      skipMfaOnTrustedDevice: enabled,
      ...(enabled ? {} : { trustedLoginDevices: [] }),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
