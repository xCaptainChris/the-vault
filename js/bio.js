// Face ID / Touch ID unlock for parents (WebAuthn platform authenticator, checked on this device).
// This only replaces typing the PIN on the lock screen; the PIN always still works. Nothing is sent
// to the server: a successful Face ID check (user verification) on the saved credential unlocks.
import * as storage from './storage.js';

const KEY = 'bioCred';
let available = null;           // null = not checked yet

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export const bioName = () => (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? 'Face ID' : 'fingerprint / face unlock');

export async function checkBio() {
  if (available !== null) return available;
  try {
    available = !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) { available = false; }
  return available;
}
export const bioAvailable = () => available === true;

export function bioFor(parentId) {
  const c = storage.get(KEY);
  return c && c.parentId === parentId ? c : null;
}
export function forgetBio() { storage.del(KEY); }

// Must be called from a tap (iOS requires a user gesture). Resolves true when set up.
export async function enrollBio(parent) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rand(32),
    rp: { name: 'The Vault' },
    user: { id: rand(16), name: `${parent.name} · The Vault`, displayName: parent.name },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000,
    attestation: 'none',
  } });
  if (!cred) return false;
  storage.set(KEY, { parentId: parent.id, id: b64u(cred.rawId), at: new Date().toISOString() });
  return true;
}

// Resolves true when the person passed Face ID for the saved credential.
export async function verifyBio(parentId) {
  const c = bioFor(parentId);
  if (!c) return false;
  const res = await navigator.credentials.get({ publicKey: {
    challenge: rand(32),
    allowCredentials: [{ type: 'public-key', id: unb64u(c.id), transports: ['internal'] }],
    userVerification: 'required',
    timeout: 60000,
  } });
  if (!res || b64u(res.rawId) !== c.id) return false;
  // Authenticator data byte 32 holds the flags: 0x01 user present, 0x04 user verified.
  const flags = new Uint8Array(res.response.authenticatorData)[32];
  return (flags & 0x05) === 0x05;
}
