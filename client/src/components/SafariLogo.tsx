import React from "react";

interface SafariLogoProps {
  className?: string;
}

/**
 * Apple Safari 공식 나침반 스타일 SVG 로고
 */
export function SafariLogo({ className = "w-16 h-16" }: SafariLogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Safari 브라우저 로고"
    >
      <defs>
        {/* 사파리 메인 블루 그라디언트 배경 */}
        <linearGradient id="safari-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#25A0F5" />
          <stop offset="50%" stopColor="#0D7EF2" />
          <stop offset="100%" stopColor="#0066E0" />
        </linearGradient>

        {/* 나침반 바늘 상단 (빨강) */}
        <linearGradient id="safari-needle-red" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF453A" />
          <stop offset="100%" stopColor="#D70015" />
        </linearGradient>

        {/* 나침반 바늘 하단 (화이트/그레이) */}
        <linearGradient id="safari-needle-white" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E5E5EA" />
        </linearGradient>

        {/* 원형 입체 그림자 */}
        <filter id="safari-shadow-effect" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* 외부 흰색 둥근 사각 아이콘 베이스 (iOS 앱 아이콘 스타일) */}
      <rect width="100" height="100" rx="22" fill="#FFFFFF" />

      {/* 나침반 다이얼 원형 블루 배경 */}
      <circle cx="50" cy="50" r="41" fill="url(#safari-bg-grad)" filter="url(#safari-shadow-effect)" />

      {/* 내부 다이얼 트랙 링 */}
      <circle cx="50" cy="50" r="37.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" />

      {/* 24개 나침반 눈금선 (15도 간격) */}
      {[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345].map((deg) => (
        <line
          key={deg}
          x1="50"
          y1={deg % 90 === 0 ? "14.5" : deg % 45 === 0 ? "15.5" : "17"}
          x2="50"
          y2={deg % 90 === 0 ? "20" : deg % 45 === 0 ? "19" : "18.5"}
          stroke={
            deg % 90 === 0
              ? "rgba(255,255,255,0.95)"
              : deg % 45 === 0
              ? "rgba(255,255,255,0.75)"
              : "rgba(255,255,255,0.45)"
          }
          strokeWidth={deg % 90 === 0 ? "2" : deg % 45 === 0 ? "1.4" : "0.9"}
          strokeLinecap="round"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}

      {/* 나침반 바늘 (45도 기울임: 공식 Safari 아이콘 고유 각도) */}
      <g transform="rotate(45 50 50)">
        {/* 북쪽 바늘 (빨강) */}
        <polygon points="50,15 56,50 44,50" fill="url(#safari-needle-red)" />
        {/* 북쪽 바늘 우측 3D 명암 효과 */}
        <polygon points="50,15 44,50 50,50" fill="#B3000F" opacity="0.35" />

        {/* 남쪽 바늘 (화이트) */}
        <polygon points="50,85 56,50 44,50" fill="url(#safari-needle-white)" />
        {/* 남쪽 바늘 좌측 3D 명암 효과 */}
        <polygon points="50,85 50,50 56,50" fill="#AEAEB2" opacity="0.35" />

        {/* 중앙 고정 핀 */}
        <circle cx="50" cy="50" r="4.2" fill="rgba(0,0,0,0.18)" />
        <circle cx="50" cy="50" r="2.8" fill="#FFFFFF" />
        <circle cx="50" cy="50" r="1.3" fill="#8E8E93" />
      </g>
    </svg>
  );
}

export default SafariLogo;
