/**
 * pumasiCookie.ts
 * Google Play Android 비공개 테스트(품앗이) 전용 순수 쿠키 유틸리티
 * 
 * 쿠키명: sj_beta_pumasi
 * 저장값: 최초 참여 ISO 문자열 또는 밀리초 타임스탬프
 * 기준: Google Play 비공개 테스트 14일 연속 참여 기준
 */

const COOKIE_NAME = 'sj_beta_pumasi';
const REQUIRED_DAYS = 14;

export interface PumasiStatus {
  isPumasi: boolean;
  firstAccessTime: number | null;
  daysPassed: number;
  daysRemaining: number;
  isComplete: boolean;
}

/** 쿠키 읽기 */
export function getPumasiCookie(): PumasiStatus {
  if (typeof document === 'undefined') {
    return {
      isPumasi: false,
      firstAccessTime: null,
      daysPassed: 0,
      daysRemaining: REQUIRED_DAYS,
      isComplete: false,
    };
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) {
    return {
      isPumasi: false,
      firstAccessTime: null,
      daysPassed: 0,
      daysRemaining: REQUIRED_DAYS,
      isComplete: false,
    };
  }

  const rawVal = decodeURIComponent(match[1]);
  let timeMs = parseInt(rawVal, 10);
  if (isNaN(timeMs)) {
    timeMs = new Date(rawVal).getTime();
  }

  if (isNaN(timeMs) || timeMs <= 0) {
    timeMs = Date.now();
  }

  const diffMs = Math.max(0, Date.now() - timeMs);
  const daysPassed = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1; // 1일차, 2일차...
  const daysRemaining = Math.max(0, REQUIRED_DAYS - daysPassed);
  const isComplete = daysPassed >= REQUIRED_DAYS;

  return {
    isPumasi: true,
    firstAccessTime: timeMs,
    daysPassed,
    daysRemaining,
    isComplete,
  };
}

/** 쿠키 생성 (기본 60일 유지) */
export function setPumasiCookie(timestamp?: number): void {
  if (typeof document === 'undefined') return;
  const timeMs = timestamp || Date.now();
  const maxAge = 60 * 24 * 60 * 60; // 60일
  document.cookie = `${COOKIE_NAME}=${timeMs}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** 쿠키 삭제 (뒤로가기 시 일반 시간표로 복귀) */
export function clearPumasiCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
