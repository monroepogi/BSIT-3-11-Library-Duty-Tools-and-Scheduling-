import { randomBytes, timingSafeEqual } from 'node:crypto';
import { argon2id } from '@noble/hashes/argon2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const IS_TEST = process.env['NODE_ENV'] === 'test';
const ARGON_OPTS = IS_TEST ? { t: 1, m: 256, p: 1, dkLen: 32 } : { t: 2, m: 16384, p: 1, dkLen: 32 };

export function hashPasswordArgon2id(password: string): string {
  const salt = randomBytes(16);
  const derived = argon2id(password, salt, ARGON_OPTS);
  return `argon2id$t=${ARGON_OPTS.t},m=${ARGON_OPTS.m},p=${ARGON_OPTS.p}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

export function verifyPasswordArgon2id(password: string, encoded: string): boolean {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'argon2id') {
    return false;
  }
  const params: Record<string, number> = {};
  for (const segment of parts[1].split(',')) {
    const [k, v] = segment.split('=');
    params[k] = Number(v);
  }
  const salt = hexToBytes(parts[2]);
  const expected = hexToBytes(parts[3]);
  const actual = argon2id(password, salt, {
    t: params['t'] || 2,
    m: params['m'] || 16384,
    p: params['p'] || 1,
    dkLen: expected.length,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
