/**
 * pumasiCookie.ts
 * Google Play Android 비공개 테스트(품앗이) 전용 순수 쿠키 유틸리티
 * 
 * 쿠키 분리 구조:
 * 1. TIMER_COOKIE_NAME ('sj_beta_pumasi_time'): 최초 참여 타임스탬프 보관 (30일 유지, 시간표 복귀 시에도 영구 보존)
 * 2. REDIRECT_COOKIE_NAME ('sj_beta_pumasi_redirect'): 사이트 접속 시 품앗이 화면 자동 진입 여부 플래그 (시간표 복귀 시 삭제)
 * 3. COOKIE_NAME ('sj_beta_pumasi'): 하위 호환 쿠키명 (시간표 복귀 시 삭제)
 * 
 * 기준: Google Play 비공개 테스트 14일 연속 참여 기준
 */

export const TIMER_COOKIE_NAME = 'sj_beta_pumasi_time';
export const REDIRECT_COOKIE_NAME = 'sj_beta_pumasi_redirect';
export const COOKIE_NAME = 'sj_beta_pumasi';
export const STORAGE_KEY = 'sj_beta_pumasi_time';
export const REQUIRED_DAYS = 14;
export const REQUIRED_MS = REQUIRED_DAYS * 24 * 60 * 60 * 1000; // 14일 (1,209,600,000 ms)
export const PUMASI_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30일 (1달) 보관

export interface PumasiStatus {
  isPumasi: boolean;
  firstAccessTime: number | null;
  elapsedMs: number;
  remainingMs: number;
  exactPercent: number; // 0 ~ 100
  daysPassed: number;
  daysRemaining: number;
  isComplete: boolean;
  startDateText: string;
  elapsedText: string;
  remainingText: string;
}

/** 기간(ms)을 'X일 Y시간 Z분 W초' 형식으로 포맷 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0일 0시간 0분 0초';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return `${days}일 ${hours}시간 ${minutes}분 ${seconds}초`;
}

/** 날짜(ms)를 'YYYY.MM.DD HH:mm:ss' 형식으로 포맷 */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}.${month}.${date} ${hours}:${minutes}:${seconds}`;
}

/** 타이머 정보만 안전하게 쿠키 및 localStorage에 보관 (리다이렉션 쿠키는 건드리지 않음) */
function saveTimerCookieOnly(timeMs: number): void {
  if (typeof document === 'undefined') return;
  const maxAge = PUMASI_COOKIE_MAX_AGE;
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  document.cookie = `${TIMER_COOKIE_NAME}=${timeMs}; path=/; max-age=${maxAge}; expires=${expires}; SameSite=Lax`;
  try {
    localStorage.setItem(STORAGE_KEY, String(timeMs));
  } catch {}
}

/**
 * 저장된 품앗이 최초 시작 타임스탬프 조회 (쿠키 및 localStorage 상호 백업)
 * 브라우저 세션 만료, 쿠키 휘발 등에도 최초 시작 시간이 절대로 리셋되지 않도록 보호
 */
export function getStoredPumasiTime(): number | null {
  if (typeof document === 'undefined') return null;

  // 1. 타이머 쿠키(sj_beta_pumasi_time)에서 읽기 우선, 없으면 레거시 sj_beta_pumasi 확인
  let timeFromCookie: number | null = null;
  const timerMatch = document.cookie.match(new RegExp(`(?:^|; )${TIMER_COOKIE_NAME}=([^;]*)`));
  if (timerMatch) {
    const rawVal = decodeURIComponent(timerMatch[1]);
    let parsed = parseInt(rawVal, 10);
    if (isNaN(parsed)) parsed = new Date(rawVal).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      timeFromCookie = parsed;
    }
  }

  // 레거시 쿠키 확인 (숫자 타임스탬프인 경우에만 승계)
  if (!timeFromCookie) {
    const legacyMatch = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
    if (legacyMatch) {
      const rawVal = decodeURIComponent(legacyMatch[1]);
      let parsed = parseInt(rawVal, 10);
      if (isNaN(parsed)) parsed = new Date(rawVal).getTime();
      if (!isNaN(parsed) && parsed > 100000000000) { // 1973년 이후 유효 타임스탬프
        timeFromCookie = parsed;
      }
    }
  }

  // 2. localStorage에서 읽기
  let timeFromStorage: number | null = null;
  try {
    const rawStorage = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(COOKIE_NAME);
    if (rawStorage) {
      let parsed = parseInt(rawStorage, 10);
      if (isNaN(parsed)) parsed = new Date(rawStorage).getTime();
      if (!isNaN(parsed) && parsed > 100000000000) {
        timeFromStorage = parsed;
      }
    }
  } catch {}

  // 3. 둘 다 존재하는 경우: 더 이른(과거) 시간을 보존하여 참여 진행률 손실 방지
  if (timeFromCookie && timeFromStorage) {
    const earliest = Math.min(timeFromCookie, timeFromStorage);
    saveTimerCookieOnly(earliest);
    return earliest;
  }

  // 4. 쿠키만 존재하는 경우: localStorage로 동기화 백업
  if (timeFromCookie) {
    saveTimerCookieOnly(timeFromCookie);
    return timeFromCookie;
  }

  // 5. localStorage만 존재하는 경우: 타이머 쿠키 복원
  if (timeFromStorage) {
    saveTimerCookieOnly(timeFromStorage);
    return timeFromStorage;
  }

  return null;
}

/** 쿠키 읽기 및 정밀 상태 계산 */
export function getPumasiCookie(now: number = Date.now()): PumasiStatus {
  const timeMs = getStoredPumasiTime();

  if (!timeMs) {
    return {
      isPumasi: false,
      firstAccessTime: null,
      elapsedMs: 0,
      remainingMs: REQUIRED_MS,
      exactPercent: 0,
      daysPassed: 0,
      daysRemaining: REQUIRED_DAYS,
      isComplete: false,
      startDateText: '-',
      elapsedText: '0일 0시간 0분 0초',
      remainingText: '14일 0시간 0분 0초',
    };
  }

  const elapsedMs = Math.max(0, now - timeMs);
  const remainingMs = Math.max(0, REQUIRED_MS - elapsedMs);
  const exactPercent = Math.min(100, (elapsedMs / REQUIRED_MS) * 100);
  const daysPassed = Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1;
  const daysRemaining = Math.max(0, REQUIRED_DAYS - Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
  const isComplete = elapsedMs >= REQUIRED_MS;

  return {
    isPumasi: true,
    firstAccessTime: timeMs,
    elapsedMs,
    remainingMs,
    exactPercent,
    daysPassed,
    daysRemaining,
    isComplete,
    startDateText: formatDateTime(timeMs),
    elapsedText: formatDuration(elapsedMs),
    remainingText: isComplete ? '완료' : formatDuration(remainingMs),
  };
}

/**
 * 자동 리다이렉션 쿠키 존재 여부 확인
 * - sj_beta_pumasi_redirect 가 존재하거나
 * - 레거시 sj_beta_pumasi 쿠키가 활성 상태인 경우 true
 * - 뒤로가기 클릭으로 쿠키가 제거된 경우에는 false 반환
 */
export function hasPumasiRedirectCookie(): boolean {
  if (typeof document === 'undefined') return false;

  const redirectMatch = document.cookie.match(new RegExp(`(?:^|; )${REDIRECT_COOKIE_NAME}=([^;]*)`));
  if (redirectMatch && redirectMatch[1] && redirectMatch[1] !== '0') {
    return true;
  }

  const legacyMatch = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (legacyMatch && legacyMatch[1] && legacyMatch[1] !== '') {
    return true;
  }

  return false;
}

/**
 * 자동 리다이렉션 쿠키만 제거 (시간표로 돌아가기 시 호출)
 * - 타이머 쿠키(sj_beta_pumasi_time)와 localStorage의 시작 시간은 안전하게 보존됨
 * - 자동 리다이렉션 쿠키(sj_beta_pumasi_redirect, sj_beta_pumasi)만 max-age=0으로 삭제
 */
export function clearPumasiRedirectCookie(): void {
  if (typeof document === 'undefined') return;

  const expired = 'path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  document.cookie = `${REDIRECT_COOKIE_NAME}=; ${expired}`;
  document.cookie = `${COOKIE_NAME}=; ${expired}`;

  try {
    sessionStorage.setItem('pumasi_session_view', 'timetable');
  } catch {}
}

/**
 * 쿠키 생성 (타이머 쿠키 보존 및 자동 리다이렉션 쿠키 발급)
 * - 타이머 쿠키(sj_beta_pumasi_time)는 기존 타임스탬프가 있으면 절대 리셋되지 않음
 * - 리다이렉션 쿠키(sj_beta_pumasi_redirect, sj_beta_pumasi)를 활성화
 */
export function setPumasiCookie(timestamp?: number): void {
  if (typeof document === 'undefined') return;

  // 타임스탬프가 지정되지 않은 경우 기존 보관값을 우선 탐색하여 리셋 방지
  let timeMs = timestamp;
  if (!timeMs) {
    const existing = getStoredPumasiTime();
    timeMs = existing || Date.now();
  }

  const maxAge = PUMASI_COOKIE_MAX_AGE; // 30일 (1달)
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();

  // 1. 타이머 쿠키 저장 (영구 보존 대상)
  saveTimerCookieOnly(timeMs);

  // 2. 자동 리다이렉션 쿠키 저장 (뒤로가기 시 삭제 대상)
  document.cookie = `${REDIRECT_COOKIE_NAME}=1; path=/; max-age=${maxAge}; expires=${expires}; SameSite=Lax`;
  document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${maxAge}; expires=${expires}; SameSite=Lax`;

  try {
    sessionStorage.removeItem('pumasi_session_view');
  } catch {}
}

/** 전체 품앗이 쿠키 및 로컬스토리지 완전 초기화 (공장초기화 등에서 사용 가능) */
export function clearPumasiCookie(): void {
  if (typeof document === 'undefined') return;
  const expired = 'path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  document.cookie = `${REDIRECT_COOKIE_NAME}=; ${expired}`;
  document.cookie = `${COOKIE_NAME}=; ${expired}`;
  document.cookie = `${TIMER_COOKIE_NAME}=; ${expired}`;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COOKIE_NAME);
    sessionStorage.removeItem('pumasi_session_view');
  } catch {}
}
