import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Wire synchronous SHA-512 once for both Node/NestJS and Android WebView
ed.hashes.sha512 = sha512;

export interface Ed25519Keypair {
  publicKeyB64: string;
  privateKeyB64: string;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function generateEd25519Keypair(): Ed25519Keypair {
  const { secretKey, publicKey } = ed.keygen();
  return {
    publicKeyB64: bytesToBase64Url(publicKey),
    privateKeyB64: bytesToBase64Url(secretKey),
  };
}

export function deriveEd25519PublicKey(privateKeyB64: string): string {
  return bytesToBase64Url(ed.getPublicKey(base64UrlToBytes(privateKeyB64)));
}

export function signCanonicalPayload(payload: unknown, privateKeyB64: string): string {
  const msg = new TextEncoder().encode(canonicalJson(payload));
  const sig = ed.sign(msg, base64UrlToBytes(privateKeyB64));
  return bytesToBase64Url(sig);
}

export function verifyCanonicalPayload(
  payload: unknown,
  signatureB64: string,
  publicKeyB64: string,
): boolean {
  try {
    const msg = new TextEncoder().encode(canonicalJson(payload));
    const sig = base64UrlToBytes(signatureB64);
    const pub = base64UrlToBytes(publicKeyB64);
    if (sig.length !== 64 || pub.length !== 32) {
      return false;
    }
    return ed.verify(sig, msg, pub);
  } catch {
    return false;
  }
}

export function generateNonceHex(byteLength = 12): string {
  const bytes = ed.etc.randomBytes(byteLength);
  return ed.etc.bytesToHex(bytes);
}
