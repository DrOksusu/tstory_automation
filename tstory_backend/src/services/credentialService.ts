// 카카오 자격증명 CRUD 서비스

import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../utils/crypto';

const prisma = new PrismaClient();

/**
 * 자격증명 저장 (이미 존재하면 업데이트) - 소유자별 분리
 */
export async function saveCredential(email: string, password: string, ownerEmail?: string): Promise<void> {
  const owner = ownerEmail || email;
  console.log(`[saveCredential] 시작: ${email}, owner: ${owner}`);

  let encryptedPassword: string;
  try {
    encryptedPassword = encrypt(password);
    console.log(`[saveCredential] 암호화 성공, 길이: ${encryptedPassword.length}`);
  } catch (error) {
    console.error('[saveCredential] 암호화 실패:', error);
    throw error;
  }

  try {
    await prisma.kakaoCredential.upsert({
      where: { ownerEmail_userEmail: { ownerEmail: owner, userEmail: email } },
      update: { encryptedPassword },
      create: {
        ownerEmail: owner,
        userEmail: email,
        encryptedPassword,
      },
    });
    console.log(`[saveCredential] DB 저장 완료: ${email}, owner: ${owner}`);
  } catch (error) {
    console.error('[saveCredential] DB 저장 실패:', error);
    throw error;
  }
}

/**
 * 특정 이메일의 자격증명 조회 (복호화) - 소유자별 분리
 */
export async function getCredential(email: string, ownerEmail?: string): Promise<{ email: string; password: string } | null> {
  const owner = ownerEmail || email;
  const credential = await prisma.kakaoCredential.findUnique({
    where: { ownerEmail_userEmail: { ownerEmail: owner, userEmail: email } },
  });

  if (!credential) {
    return null;
  }

  try {
    const password = decrypt(credential.encryptedPassword);
    return { email: credential.userEmail, password };
  } catch (error) {
    console.error(`자격증명 복호화 실패: ${email}`, error);
    return null;
  }
}

/**
 * 저장된 자격증명 목록 (비밀번호 제외) - 소유자별 필터링
 */
export async function getAllCredentials(ownerEmail?: string): Promise<Array<{ userEmail: string; savedAt: Date }>> {
  const whereClause = ownerEmail ? { ownerEmail } : {};
  const credentials = await prisma.kakaoCredential.findMany({
    where: whereClause,
    select: {
      userEmail: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  return credentials.map((c) => ({
    userEmail: c.userEmail,
    savedAt: c.updatedAt,
  }));
}

/**
 * 자격증명 삭제 - 소유자별 분리
 */
export async function deleteCredential(email: string, ownerEmail?: string): Promise<boolean> {
  try {
    const owner = ownerEmail || email;
    await prisma.kakaoCredential.delete({
      where: { ownerEmail_userEmail: { ownerEmail: owner, userEmail: email } },
    });
    console.log(`자격증명 삭제 완료: ${email}, owner: ${owner}`);
    return true;
  } catch {
    return false;
  }
}
