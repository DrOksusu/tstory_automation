// 카카오 자격증명 CRUD 서비스

import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../utils/crypto';

const prisma = new PrismaClient();

/**
 * 자격증명 저장 (이미 존재하면 업데이트)
 */
export async function saveCredential(email: string, password: string): Promise<void> {
  console.log(`[saveCredential] 시작: ${email}`);

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
      where: { userEmail: email },
      update: { encryptedPassword },
      create: {
        userEmail: email,
        encryptedPassword,
      },
    });
    console.log(`[saveCredential] DB 저장 완료: ${email}`);
  } catch (error) {
    console.error('[saveCredential] DB 저장 실패:', error);
    throw error;
  }
}

/**
 * 특정 이메일의 자격증명 조회 (복호화)
 */
export async function getCredential(email: string): Promise<{ email: string; password: string } | null> {
  const credential = await prisma.kakaoCredential.findUnique({
    where: { userEmail: email },
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
 * 저장된 모든 자격증명 목록 (비밀번호 제외)
 */
export async function getAllCredentials(): Promise<Array<{ userEmail: string; savedAt: Date }>> {
  const credentials = await prisma.kakaoCredential.findMany({
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
 * 자격증명 삭제
 */
export async function deleteCredential(email: string): Promise<boolean> {
  try {
    await prisma.kakaoCredential.delete({
      where: { userEmail: email },
    });
    console.log(`자격증명 삭제 완료: ${email}`);
    return true;
  } catch {
    return false;
  }
}
