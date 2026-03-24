// 티스토리 계정 관리 훅

import { useState, useRef, useCallback } from 'react';
import { safeJsonParse } from '../utils/api';
import type { TistoryAccount, AddAccountStatus, SavedCredential } from '../types/blog';

// 쿠키 신선도 계산: savedAt 기준 경과 시간으로 판단
export type CookieFreshness = 'fresh' | 'warning' | 'expired';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function getCookieFreshness(savedAt: string): CookieFreshness {
  const elapsed = Date.now() - new Date(savedAt).getTime();
  if (elapsed >= TWENTY_FOUR_HOURS_MS) return 'expired';
  if (elapsed >= SIX_HOURS_MS) return 'warning';
  return 'fresh';
}

export function useTistoryAccounts() {
  const [accounts, setAccounts] = useState<TistoryAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [addingAccount, setAddingAccount] = useState(false);
  const [addAccountStatus, setAddAccountStatus] = useState<AddAccountStatus | null>(null);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [savedCredentials, setSavedCredentials] = useState<SavedCredential[]>([]);
  const [saveCredentialChecked, setSaveCredentialChecked] = useState(true);
  const loginSessionIdRef = useRef<string | null>(null);

  // 계정 목록 로드 함수
  const fetchAccounts = useCallback(async (selectEmail?: string) => {
    try {
      setLoadingAccounts(true);
      const response = await fetch('/auth/accounts');
      const result = await safeJsonParse(response);
      if (!result.ok || !result.data) {
        console.error('Failed to fetch accounts:', result.error);
        return;
      }
      const data = result.data as { success: boolean; accounts: TistoryAccount[] };
      console.log('Fetched accounts:', data);
      if (data.success) {
        setAccounts(data.accounts);
        // 특정 계정 선택 또는 첫 번째 계정 자동 선택
        if (selectEmail) {
          setSelectedAccount(selectEmail);
        } else if (data.accounts.length > 0) {
          setSelectedAccount((prev) => prev || data.accounts[0].userEmail);
        }
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // 저장된 자격증명 목록 로드
  const fetchCredentials = useCallback(async () => {
    try {
      const response = await fetch('/auth/credentials');
      const result = await safeJsonParse(response);
      if (!result.ok || !result.data) return;
      const data = result.data as { success: boolean; credentials: SavedCredential[] };
      if (data.success) {
        setSavedCredentials(data.credentials);
      }
    } catch (error) {
      console.error('Failed to fetch credentials:', error);
    }
  }, []);

  // 저장된 자격증명 선택 시 이메일/비밀번호 자동입력
  const handleSelectCredential = useCallback(async (email: string) => {
    if (!email) return;
    setNewAccountEmail(email);
    try {
      const response = await fetch(`/auth/credentials/${encodeURIComponent(email)}`);
      const result = await safeJsonParse(response);
      if (!result.ok || !result.data) return;
      const data = result.data as { success: boolean; credential: { email: string; password: string } };
      if (data.success && data.credential) {
        setNewAccountPassword(data.credential.password);
      }
    } catch (error) {
      console.error('Failed to fetch credential:', error);
    }
  }, []);

  // 계정 추가 (자동 로그인)
  const handleAddAccountAuto = async () => {
    if (!newAccountEmail || !newAccountPassword) {
      setAddAccountStatus({ message: '이메일과 비밀번호를 입력해주세요.' });
      return;
    }

    setAddingAccount(true);
    setAddAccountStatus({ message: '로그인 중...' });

    try {
      const response = await fetch('/auth/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newAccountEmail,
          password: newAccountPassword,
        }),
      });

      const result = await safeJsonParse(response);
      if (!result.ok || !result.data) {
        setAddAccountStatus({ message: result.error || '로그인 실패' });
        return;
      }
      const data = result.data as { success: boolean; message?: string };

      if (data.success) {
        // 자격증명 저장 체크 시 별도 저장 (test-login에서도 저장하지만 체크 해제 시 삭제)
        if (!saveCredentialChecked) {
          try {
            await fetch(`/auth/credentials?email=${encodeURIComponent(newAccountEmail)}`, { method: 'DELETE' });
          } catch { /* 무시 */ }
        }

        setAddAccountStatus({ message: '계정 추가 완료!' });
        console.log('Auto login success, refreshing accounts...');
        // 계정 목록 + 자격증명 목록 새로고침
        await Promise.all([fetchAccounts(newAccountEmail), fetchCredentials()]);
        // 모달 닫기
        setTimeout(() => {
          setShowAddAccountModal(false);
          setAddAccountStatus(null);
          setNewAccountEmail('');
          setNewAccountPassword('');
        }, 1000);
      } else {
        setAddAccountStatus({ message: data.message || '로그인 실패. 2FA 사용 시 수동 로그인을 이용하세요.' });
        console.log('Auto login failed:', data.message);
      }
    } catch (error) {
      setAddAccountStatus({ message: '서버 연결에 실패했습니다.' });
      console.error(error);
    } finally {
      setAddingAccount(false);
    }
  };

  // 계정 추가 (수동 로그인 - 2FA 지원)
  const handleAddAccountManual = async () => {
    if (!newAccountEmail) {
      setAddAccountStatus({ message: '이메일을 입력해주세요.' });
      return;
    }

    setAddingAccount(true);
    setAddAccountStatus({ message: '브라우저 창 열기 중...' });

    try {
      const response = await fetch('/auth/start-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newAccountEmail }),
      });

      const result = await safeJsonParse(response);
      if (!result.ok || !result.data) {
        throw new Error(result.error || '로그인 시작 실패');
      }

      const data = result.data as { sessionId?: string; liveViewUrl?: string };
      const { sessionId, liveViewUrl } = data;

      if (!sessionId) {
        throw new Error('세션 ID를 받지 못했습니다.');
      }

      loginSessionIdRef.current = sessionId;

      if (liveViewUrl) {
        setAddAccountStatus({
          message: '라이브 뷰에서 카카오 로그인을 완료해주세요.',
          liveViewUrl,
        });
        window.open(liveViewUrl, 'browserbase-login', 'width=1300,height=800');
      } else {
        setAddAccountStatus({ message: '브라우저에서 로그인을 완료해주세요.' });
      }

      // 폴링 (3분 + 여유시간)
      const maxPollingTime = 200000;
      const pollingInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        try {
          const statusResponse = await fetch(`/auth/login-status/${sessionId}`);
          const statusResult = await safeJsonParse(statusResponse);
          if (!statusResult.ok || !statusResult.data) {
            console.error('Polling error:', statusResult.error);
            continue;
          }
          const statusData = statusResult.data as { message: string; liveViewUrl?: string; completed?: boolean; success?: boolean; status?: string };

          setAddAccountStatus({
            message: statusData.message,
            liveViewUrl: statusData.liveViewUrl || liveViewUrl,
          });

          if (statusData.completed) {
            loginSessionIdRef.current = null;
            if (statusData.success) {
              setAddAccountStatus({ message: '계정 추가 완료!' });
              console.log('Manual login success, refreshing accounts...');
              // 계정 목록 새로고침
              await fetchAccounts(newAccountEmail);
              setTimeout(() => {
                setShowAddAccountModal(false);
                setAddAccountStatus(null);
                setNewAccountEmail('');
                setNewAccountPassword('');
              }, 1000);
            } else {
              setAddAccountStatus({ message: statusData.message });
              console.log('Manual login failed:', statusData.message);
            }
            return;
          }

          if (statusData.status === 'failed' || statusData.status === 'timeout') {
            loginSessionIdRef.current = null;
            setAddAccountStatus({ message: statusData.message });
            return;
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }
      }

      setAddAccountStatus({ message: '시간 초과. 다시 시도해주세요.' });
    } catch (error) {
      setAddAccountStatus({ message: error instanceof Error ? error.message : '오류 발생' });
      console.error(error);
    } finally {
      setAddingAccount(false);
    }
  };

  // 계정 삭제
  const handleDeleteAccount = async (email: string) => {
    if (!confirm(`${email} 계정을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`/auth/cookies?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });

      const result = await safeJsonParse(response);
      if (!result.ok || !result.data) {
        alert(result.error || '계정 삭제에 실패했습니다.');
        return;
      }
      const data = result.data as { success: boolean };
      if (data.success) {
        setAccounts(accounts.filter((a) => a.userEmail !== email));
        if (selectedAccount === email) {
          setSelectedAccount(accounts.length > 1 ? accounts.find((a) => a.userEmail !== email)?.userEmail || null : null);
        }
      }
    } catch (error) {
      alert('계정 삭제에 실패했습니다.');
      console.error(error);
    }
  };

  return {
    accounts,
    selectedAccount,
    setSelectedAccount,
    loadingAccounts,
    addingAccount,
    addAccountStatus,
    showAddAccountModal,
    setShowAddAccountModal,
    newAccountEmail,
    setNewAccountEmail,
    newAccountPassword,
    setNewAccountPassword,
    handleAddAccountAuto,
    handleAddAccountManual,
    handleDeleteAccount,
    setAddAccountStatus,
    fetchAccounts,
    savedCredentials,
    saveCredentialChecked,
    setSaveCredentialChecked,
    fetchCredentials,
    handleSelectCredential,
  };
}
