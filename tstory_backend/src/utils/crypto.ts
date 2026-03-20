// AES-256-GCM 암호화/복호화 유틸리티

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex) {
    // 키 미설정 시 자동 생성 후 경고
    const generated = crypto.randomBytes(32);
    console.warn(
      '⚠️ CREDENTIAL_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. ' +
      '임시 키가 생성되었으나 서버 재시작 시 저장된 자격증명을 복호화할 수 없습니다. ' +
      `키를 설정하세요: CREDENTIAL_ENCRYPTION_KEY=${generated.toString('hex')}`
    );
    return generated;
  }
  return Buffer.from(keyHex, 'hex');
}

// 암호화 키 캐싱 (프로세스 수명 동안 유지)
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (!cachedKey) {
    cachedKey = getEncryptionKey();
  }
  return cachedKey;
}

/**
 * 평문을 AES-256-GCM으로 암호화
 * @returns iv:tag:ciphertext (hex 인코딩)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // iv:tag:ciphertext 형식으로 저장
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * AES-256-GCM 암호문을 복호화
 * @param ciphertext iv:tag:ciphertext (hex 인코딩)
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('잘못된 암호문 형식입니다.');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
