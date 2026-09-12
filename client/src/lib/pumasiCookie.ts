/**
 * pumasiCookie.ts
 * Google Play Android 비공개 테스트(품앗이) 전용 순수 쿠키 유틸리티
 * 
 * 쿠키명: sj_beta_pumasi
 * 저장값: 최초 참여 ISO 문자열 또는 밀리초 타임스탬프
 * 기준: Google Play 비공개 테스트 14일 연속 참여 기준
 */

const COOKIE_NAME = 'sj_beta_pumasi';
const STORAGE_KEY = 'sj_beta_pumasi_time';
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

/**
 * 저장된 품앗이 최초 시작 타임스탬프 조회 (쿠키 및 localStorage 상호 백업)
 * 브라우저 세션 만료, 쿠키 휘발 등에도 최초 시작 시간이 절대로 리셋되지 않도록 보호
 */
export function getStoredPumasiTime(): number | null {
  if (typeof document === 'undefined') return null;

  // 1. 쿠키에서 읽기
  let timeFromCookie: number | null = null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (match) {
    const rawVal = decodeURIComponent(match[1]);
    let parsed = parseInt(rawVal, 10);
    if (isNaN(parsed)) parsed = new Date(rawVal).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      timeFromCookie = parsed;
    }
  }

  // 2. localStorage에서 읽기
  let timeFromStorage: number | null = null;
  try {
    const rawStorage = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(COOKIE_NAME);
    if (rawStorage) {
      let parsed = parseInt(rawStorage, 10);
      if (isNaN(parsed)) parsed = new Date(rawStorage).getTime();
      if (!isNaN(parsed) && parsed > 0) {
        timeFromStorage = parsed;
      }
    }
  } catch {}

  // 3. 둘 다 존재하는 경우: 더 이른(과거) 시간을 보존하여 참여 진행률 손실 방지
  if (timeFromCookie && timeFromStorage) {
    const earliest = Math.min(timeFromCookie, timeFromStorage);
    if (timeFromCookie !== earliest) {
      setPumasiCookie(earliest);
    }
    return earliest;
  }

  // 4. 쿠키만 존재하는 경우: localStorage로 동기화 백업
  if (timeFromCookie) {
    try {
      localStorage.setItem(STORAGE_KEY, String(timeFromCookie));
      localStorage.setItem(COOKIE_NAME, String(timeFromCookie));
    } catch {}
    return timeFromCookie;
  }

  // 5. localStorage만 존재하는 경우: 쿠키 복원
  if (timeFromStorage) {
    const maxAge = PUMASI_COOKIE_MAX_AGE;
    const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${timeFromStorage}; path=/; max-age=${maxAge}; expires=${expires}; SameSite=Lax`;
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

/** 쿠키 생성 (1달 동안 보관, 기존 타임스탬프 존재 시 절대 리셋되지 않음) */
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
  document.cookie = `${COOKIE_NAME}=${timeMs}; path=/; max-age=${maxAge}; expires=${expires}; SameSite=Lax`;

  try {
    localStorage.setItem(STORAGE_KEY, String(timeMs));
    localStorage.setItem(COOKIE_NAME, String(timeMs));
  } catch {}
}

/** 쿠키 및 로컬스토리지 삭제 (뒤로가기 시 일반 시간표로 복귀) */
export function clearPumasiCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COOKIE_NAME);
  } catch {}
}
