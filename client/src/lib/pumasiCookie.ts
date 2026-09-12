/**
 * pumasiCookie.ts
 * Google Play Android 비공개 테스트(품앗이) 전용 순수 쿠키 유틸리티
 * 
 * 쿠키명: sj_beta_pumasi
 * 저장값: 최초 참여 ISO 문자열 또는 밀리초 타임스탬프
 * 기준: Google Play 비공개 테스트 14일 연속 참여 기준
 */

const COOKIE_NAME = 'sj_beta_pumasi';
export const REQUIRED_DAYS = 14;
export const REQUIRED_MS = REQUIRED_DAYS * 24 * 60 * 60 * 1000; // 14일 (1,209,600,000 ms)

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

/** 쿠키 읽기 및 정밀 상태 계산 */
export function getPumasiCookie(now: number = Date.now()): PumasiStatus {
  if (typeof document === 'undefined') {
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

  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) {
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

  const rawVal = decodeURIComponent(match[1]);
  let timeMs = parseInt(rawVal, 10);
  if (isNaN(timeMs)) {
    timeMs = new Date(rawVal).getTime();
  }

  if (isNaN(timeMs) || timeMs <= 0) {
    timeMs = now;
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
