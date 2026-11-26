import { deriveEd25519PublicKey, generateEd25519Keypair } from '@vits/shared-crypto';

export interface ApiConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  libraryTimezone: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtlSec: number;
  jwtRefreshTtlDays: number;
  trustKid: string;
  trustPrivateKeyB64: string;
  trustPublicKeyB64: string;
}

export function loadApiConfig(): ApiConfig {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const isProd = nodeEnv === 'production';

  const jwtAccessSecret =
    process.env['JWT_ACCESS_SECRET'] ?? (isProd ? '' : 'vits-dev-access-secret-change-in-production-32chars');
  const jwtRefreshSecret =
    process.env['JWT_REFRESH_SECRET'] ?? (isProd ? '' : 'vits-dev-refresh-secret-change-in-production-32chars');

  if (isProd && (jwtAccessSecret.length < 24 || jwtRefreshSecret.length < 24)) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set (>= 24 chars) in production.');
  }

  let trustPrivateKeyB64 = process.env['TRUST_PRIVATE_KEY_B64'] ?? '';
  let trustPublicKeyB64 = process.env['TRUST_PUBLIC_KEY_B64'] ?? '';
  if (!trustPrivateKeyB64) {
    if (isProd) {
      throw new Error('TRUST_PRIVATE_KEY_B64 must be configured in production.');
    }
    const generated = generateEd25519Keypair();
    trustPrivateKeyB64 = generated.privateKeyB64;
    trustPublicKeyB64 = generated.publicKeyB64;
  } else if (!trustPublicKeyB64) {
    trustPublicKeyB64 = deriveEd25519PublicKey(trustPrivateKeyB64);
  }

  const rawOrigins = process.env['CORS_ORIGIN'] ?? 'http://localhost:4200,http://localhost:4300,http://localhost:8100';
  const corsOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    port: Number(process.env['PORT'] ?? 3000) || 3000,
    corsOrigins,
    libraryTimezone: process.env['LIBRARY_TIMEZONE'] ?? 'Asia/Manila',
    jwtAccessSecret,
    jwtRefreshSecret,
    jwtAccessTtlSec: Number(process.env['JWT_ACCESS_TTL_SEC'] ?? 900) || 900,
    jwtRefreshTtlDays: Number(process.env['JWT_REFRESH_TTL_DAYS'] ?? 14) || 14,
    trustKid: process.env['TRUST_KEY_KID'] ?? 'vits-ed25519-dev-1',
    trustPrivateKeyB64,
    trustPublicKeyB64,
  };
}
