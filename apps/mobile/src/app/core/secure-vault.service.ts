import { inject, Injectable, InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { bytesToBase64Url, generateEd25519Keypair, type Ed25519Keypair } from '@vits/shared-crypto';
import type { DutyCertificateDto, StudentPassCertificateDto, UserProfileDto } from '@vits/shared-types';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface VaultStorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const VAULT_STORAGE_ADAPTER = new InjectionToken<VaultStorageAdapter>('VITS_VAULT_STORAGE_ADAPTER', {
  providedIn: 'root',
  factory: () => ({
    async get(key: string): Promise<string | null> {
      if (Capacitor.isNativePlatform()) {
        const res = await Preferences.get({ key });
        return res.value ?? null;
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
      return null;
    },
    async set(key: string, value: string): Promise<void> {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key, value });
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    },
    async remove(key: string): Promise<void> {
      if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key });
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    },
  }),
});

const KEYS = {
  refreshToken: 'vits.vault.refresh_token',
  profile: 'vits.vault.profile',
  pinHash: 'vits.vault.pin_hash',
  deviceId: 'vits.vault.device_id',
  bootId: 'vits.vault.boot_id',
  keypairPrefix: 'vits.vault.keypair.',
  studentCertPrefix: 'vits.vault.student_cert.',
  oicCertPrefix: 'vits.vault.oic_cert.',
} as const;

@Injectable({ providedIn: 'root' })
export class SecureVaultService {
  private readonly storage = inject(VAULT_STORAGE_ADAPTER);
  private readonly bootTimeWallMs = Date.now();
  private bootIdMemo: string | null = null;

  async getRefreshToken(): Promise<string | null> {
    return this.storage.get(KEYS.refreshToken);
  }

  async setRefreshToken(token: string | null): Promise<void> {
    if (token === null) await this.storage.remove(KEYS.refreshToken);
    else await this.storage.set(KEYS.refreshToken, token);
  }

  async getCachedProfile(): Promise<UserProfileDto | null> {
    const raw = await this.storage.get(KEYS.profile);
    return raw ? (JSON.parse(raw) as UserProfileDto) : null;
  }

  async setCachedProfile(profile: UserProfileDto | null): Promise<void> {
    if (profile === null) await this.storage.remove(KEYS.profile);
    else await this.storage.set(KEYS.profile, JSON.stringify(profile));
  }

  async hasOfflinePin(): Promise<boolean> {
    return (await this.storage.get(KEYS.pinHash)) !== null;
  }

  async setOfflinePin(pin: string): Promise<void> {
    const saltBytes = crypto.getRandomValues(new Uint8Array(12));
    const salt = bytesToBase64Url(saltBytes);
    const digest = bytesToHex(sha256(new TextEncoder().encode(`${salt}:${pin.trim()}`)));
    await this.storage.set(KEYS.pinHash, `${salt}$${digest}`);
  }

  async verifyOfflinePin(pin: string): Promise<boolean> {
    const stored = await this.storage.get(KEYS.pinHash);
    if (!stored || !stored.includes('$')) return false;
    const [salt, expectedDigest] = stored.split('$');
    const actualDigest = bytesToHex(sha256(new TextEncoder().encode(`${salt}:${pin.trim()}`)));
    return expectedDigest === actualDigest;
  }

  async getOrCreateDeviceId(): Promise<string> {
    const existing = await this.storage.get(KEYS.deviceId);
    if (existing) return existing;
    const id = `dev-${crypto.randomUUID()}`;
    await this.storage.set(KEYS.deviceId, id);
    return id;
  }

  async getBootId(): Promise<string> {
    if (this.bootIdMemo) return this.bootIdMemo;
    const existing = await this.storage.get(KEYS.bootId);
    if (existing) {
      this.bootIdMemo = existing;
      return existing;
    }
    const id = `boot-${crypto.randomUUID().slice(0, 8)}`;
    await this.storage.set(KEYS.bootId, id);
    this.bootIdMemo = id;
    return id;
  }

  getMonotonicMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return Math.round(performance.now());
    }
    return Math.max(0, Date.now() - this.bootTimeWallMs);
  }

  async getOrCreateDeviceKeypair(userId: string): Promise<Ed25519Keypair> {
    const key = `${KEYS.keypairPrefix}${userId}`;
    const raw = await this.storage.get(key);
    if (raw) return JSON.parse(raw) as Ed25519Keypair;
    const kp = generateEd25519Keypair();
    await this.storage.set(key, JSON.stringify(kp));
    return kp;
  }

  async saveStudentPassCert(userId: string, cert: StudentPassCertificateDto): Promise<void> {
    await this.storage.set(`${KEYS.studentCertPrefix}${userId}`, JSON.stringify(cert));
  }

  async getStudentPassCert(userId: string): Promise<StudentPassCertificateDto | null> {
    const raw = await this.storage.get(`${KEYS.studentCertPrefix}${userId}`);
    return raw ? (JSON.parse(raw) as StudentPassCertificateDto) : null;
  }

  async saveOicDutyCert(userId: string, cert: DutyCertificateDto): Promise<void> {
    await this.storage.set(`${KEYS.oicCertPrefix}${userId}`, JSON.stringify(cert));
  }

  async getOicDutyCert(userId: string): Promise<DutyCertificateDto | null> {
    const raw = await this.storage.get(`${KEYS.oicCertPrefix}${userId}`);
    return raw ? (JSON.parse(raw) as DutyCertificateDto) : null;
  }

  async clearSessionSecrets(): Promise<void> {
    await Promise.all([
      this.storage.remove(KEYS.refreshToken),
      this.storage.remove(KEYS.profile),
      this.storage.remove(KEYS.pinHash),
    ]);
  }
}
