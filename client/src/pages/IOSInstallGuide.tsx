import React, { useState, useEffect } from "react";
import { agent } from "@/lib/browserDetect";
import { useLocation } from "wouter";
import { SafariLogo } from "@/components/SafariLogo";
import { toast } from "sonner";

// ── detect() 결과 직접 참조 ──────────────────────────────────────────────────
const { isIPad, isIPhone, iosVersion } = agent;

// ── 공통 SVG 아이콘 ───────────────────────────────────────────────────────────
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  );
}

function AddToHomeIcon({ className, strokeWidth = "2" }: { className?: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 17h7M17.5 14v7"/>
    </svg>
  );
}

function AddToHomeLegacyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function IOSShareButton({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white border border-gray-300 shadow-2xs text-[#007aff] shrink-0 align-middle ${className}`}
      aria-label="iOS 공유 버튼"
    >
      <ShareIcon className="w-4 h-4" />
    </span>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-extrabold shrink-0">
      {n}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-100" />;
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-amber-50/90 border border-amber-200/80 p-3 text-xs text-amber-900 flex items-start gap-2.5">
      <span className="text-base shrink-0 leading-none">💡</span>
      <div className="flex-1 leading-relaxed font-medium">{children}</div>
    </div>
  );
}

function AppIconPreview({ appIconUrl, appTitle }: { appIconUrl: string; appTitle: string }) {
  return (
    <div className="mt-3.5 rounded-2xl border border-gray-200 bg-gray-50 p-3 flex items-center gap-3.5 shadow-2xs">
      <img
        src={appIconUrl}
        alt={appTitle}
        className="w-12 h-12 rounded-2xl shadow-sm object-cover bg-white border border-gray-200/80 shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).src = "/icon.svg"; }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-gray-900 truncate">{appTitle}</p>
        <p className="text-xs text-gray-400 mt-0.5">홈 화면에 생성될 PWA 앱 아이콘</p>
      </div>
    </div>
  );
}

interface GuideProps {
  appTitle: string;
  appIconUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// iPad 안내 섹션
// ─────────────────────────────────────────────────────────────────────────────

// ── iPadOS 26+ 안내 ──────────────────────────────────────────────────────────
function GuideIPadNew({ appTitle, appIconUrl }: GuideProps) {
  return (
    <div className="space-y-5">
      {/* Step 1 — 상단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900 flex items-center flex-wrap gap-1.5">
            <span>상단 주소창 옆</span>
            <span className="font-black inline-flex items-center gap-1.5 align-middle">
              '공유'
              <IOSShareButton />
            </span>
            <span>버튼을 누르세요</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">주소창 오른쪽 끝, ↑ 박스 아이콘</p>
          {/* iPad 주소창 일러스트 */}
          <div className="mt-3 bg-gray-100 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-gray-200">
            <div className="flex-1 bg-white rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs text-gray-400 border border-gray-200">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="truncate">{appTitle}</span>
            </div>
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-white border-2 border-red-500 flex items-center justify-center shadow-sm">
                <ShareIcon className="w-4 h-4 text-blue-500" />
              </div>
              <div className="absolute -inset-1 rounded-xl border-2 border-red-400 pointer-events-none" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 하단 더 보기 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">공유 시트 하단 <span className="font-black text-red-500">더 보기</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">앱 행 오른쪽 끝 버튼이 아닌, 가장 하단의 더 보기</p>

          {/* 액션 바 일러스트 — iPad 최적화 */}
          <div className="mt-4 rounded-2xl border border-gray-200 shadow-sm max-w-sm" style={{ overflow: 'visible' }}>
            {/* 상단 앱 아이콘 행 */}
            <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-2xl overflow-hidden">
              {[
                { label: "News",     bg: "bg-red-100",  content: <span className="text-red-500 text-sm font-black">N</span> },
                { label: "미리 알림", bg: "bg-blue-50",  content: <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
                { label: "더 보기",  bg: "bg-gray-100", content: <span className="text-gray-500 text-sm font-black">···</span> },
              ].map((app, i) => (
                <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                  <div className={`w-11 h-11 rounded-xl ${app.bg} flex items-center justify-center`}>{app.content}</div>
                  <span className="text-[10px] text-gray-400">{app.label}</span>
                </div>
              ))}
            </div>
            {/* 하단 액션 바 */}
            <div className="flex items-center divide-x divide-gray-100 bg-white rounded-b-2xl overflow-hidden" style={{ overflow: 'visible' }}>
              {[
                { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>, label: "복사" },
                { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>, label: "북마크" },
                { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, label: "읽기" },
              ].map((action, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 py-3">
                  {action.icon}
                  <span className="text-[10px] text-gray-400">{action.label}</span>
                </div>
              ))}
              {/* 더 보기 셀 — 타원 강조 */}
              <div className="flex-1 flex items-center justify-center py-2" style={{ overflow: 'visible' }}>
                <div className="relative flex flex-col items-center">
                  <svg
                    className="absolute pointer-events-none"
                    style={{ bottom: 'calc(100% + 2px)', left: '50%', transform: 'translateX(-50%)' }}
                    width="14" height="22" viewBox="0 0 14 22" fill="none"
                  >
                    <line x1="7" y1="22" x2="7" y2="5" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
                    <polyline points="2,14 7,5 12,14" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div className="flex flex-col items-center gap-1.5 px-5 py-2.5 border-2 border-red-400 rounded-full">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                    <span className="text-[11px] text-gray-600 font-semibold">더 보기</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 홈 화면에 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">목록에서 <span className="font-black">'홈 화면에 추가'</span>를 누르세요</p>
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {[
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, label: "AirPlay" },
              { icon: <AddToHomeIcon className="w-5 h-5 text-gray-800" />, label: "홈 화면에 추가", highlight: true },
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, label: "메일로 링크 보내기" },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${item.highlight ? "bg-blue-50 border-l-4 border-blue-500" : "border-b border-gray-100"}`}>
                {item.icon}
                <span className={`text-sm ${item.highlight ? "text-blue-700 font-bold" : "text-gray-700"}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 4 — 웹 앱 토글 + 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={4} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900"><span className="font-black">'웹 앱으로 열기'</span> 켜고 <span className="font-black">'추가'</span> 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">iPadOS 26+에서는 웹 앱 모드를 활성화해야 해요</p>
          <div className="mt-3 rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
            <span className="text-sm font-medium text-gray-800">웹 앱으로 열기</span>
            <div className="w-11 h-6 bg-green-500 rounded-full flex items-center justify-end pr-0.5">
              <div className="w-5 h-5 bg-white rounded-full shadow" />
            </div>
          </div>
          {/* PWA 앱 로고 미리보기 */}
          <AppIconPreview appIconUrl={appIconUrl} appTitle={appTitle} />
        </div>
      </div>
    </div>
  );
}

// ── iPadOS 13~25 안내 ────────────────────────────────────────────────────────
function GuideIPad13_25({ appTitle, appIconUrl }: GuideProps) {
  return (
    <div className="space-y-5">
      {/* Step 1 — 상단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900 flex items-center flex-wrap gap-1.5">
            <span>상단 주소창 옆</span>
            <span className="font-black inline-flex items-center gap-1.5 align-middle">
              '공유'
              <IOSShareButton />
            </span>
            <span>버튼을 누르세요</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">주소창 오른쪽 끝, ↑ 박스 아이콘</p>
          <div className="mt-3 bg-gray-100 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-gray-200">
            <div className="flex-1 bg-white rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs text-gray-400 border border-gray-200">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="truncate">{appTitle}</span>
            </div>
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-white border-2 border-red-500 flex items-center justify-center shadow-sm">
                <ShareIcon className="w-4 h-4 text-blue-500" />
              </div>
              <div className="absolute -inset-1 rounded-xl border-2 border-red-400 pointer-events-none" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 홈 화면에 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">공유 창에서 <span className="font-black">'홈 화면에 추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">목록을 아래로 스크롤하여 찾으세요</p>
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {[
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, label: "AirPlay" },
              { icon: <AddToHomeIcon className="w-5 h-5 text-gray-800" />, label: "홈 화면에 추가", highlight: true },
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, label: "메일로 링크 보내기" },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${item.highlight ? "bg-blue-50 border-l-4 border-blue-500" : "border-b border-gray-100"}`}>
                {item.icon}
                <span className={`text-sm ${item.highlight ? "text-blue-700 font-bold" : "text-gray-700"}`}>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">목록에 보이지 않으면 '동작 편집...'에서 추가할 수 있어요</p>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 위 <span className="font-black">'추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 앱 아이콘이 추가됩니다!</p>
          <AppIconPreview appIconUrl={appIconUrl} appTitle={appTitle} />
        </div>
      </div>
    </div>
  );
}

// ── iPad iOS 12 이하 안내 (iOS 7~12) ─────────────────────────────────────────
function GuideIPad12({ appTitle, appIconUrl }: GuideProps) {
  return (
    <div className="space-y-5">
      {/* Step 1 — 상단 우측 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900 flex items-center flex-wrap gap-1.5">
            <span>상단 주소창 오른쪽</span>
            <span className="font-black inline-flex items-center gap-1.5 align-middle">
              '공유'
              <IOSShareButton />
            </span>
            <span>버튼을 누르세요</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">상단 바 오른쪽 끝에 있는 ↑ 박스 아이콘</p>
          <div className="mt-3 bg-gray-100 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-gray-200">
            <div className="flex-1 bg-white rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs text-gray-400 border border-gray-200">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="truncate">{appTitle}</span>
            </div>
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-white border-2 border-red-500 flex items-center justify-center shadow-sm">
                <ShareIcon className="w-4 h-4 text-blue-500" />
              </div>
              <div className="absolute -inset-1 rounded-xl border-2 border-red-400 pointer-events-none" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 가로 스크롤로 '홈 화면에 추가' 찾기 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">공유 팝업창 하단 줄에서 <span className="font-black text-blue-600">'홈 화면에 추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">맨 아래 회색 사각형 아이콘 줄을 넘겨 [+] 모양 아이콘 선택</p>

          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-gray-50 p-3.5 space-y-2.5 max-w-sm">
            <p className="text-[10px] text-gray-400 font-semibold mb-1">맨 아래 회색 아이콘 줄을 왼쪽으로 스와이프</p>
            <div className="flex items-center gap-3 overflow-x-auto py-1">
              {[
                { name: "책갈피 추가", icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> },
                { name: "홈 화면에 추가", highlight: true, icon: <AddToHomeLegacyIcon className="w-5 h-5 text-blue-600" /> },
                { name: "복사", icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> },
              ].map((act, i) => (
                <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center relative ${act.highlight ? "bg-blue-50 border-2 border-red-500 shadow-sm" : "bg-white border border-gray-200"}`}>
                    {act.icon}
                    {act.highlight && (
                      <div className="absolute -inset-1 rounded-2xl border-2 border-red-400 pointer-events-none" />
                    )}
                  </div>
                  <span className={`text-[10px] text-center max-w-[56px] leading-tight ${act.highlight ? "text-blue-700 font-extrabold" : "text-gray-600 font-medium"}`}>
                    {act.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 위 <span className="font-black">'추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 앱 아이콘이 추가됩니다!</p>
          <AppIconPreview appIconUrl={appIconUrl} appTitle={appTitle} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// iPhone 안내 섹션
// ─────────────────────────────────────────────────────────────────────────────

// ── iPhone iOS 26+ 안내 (iPhone 17 / iOS 26+) ────────────────────────────────
function Guide26({ appTitle, appIconUrl }: GuideProps) {
  return (
    <div className="space-y-5">
      {/* Step 1 — 하단 ··· 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">하단 오른쪽 <span className="font-black">···</span> 버튼을 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">화면 아래 툴바 오른쪽 끝 점 세 개 아이콘</p>
          {/* 툴바 일러스트 */}
          <div className="mt-3 bg-gray-900 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </div>
              <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
            <div className="flex-1 bg-gray-700 rounded-lg px-3 py-1.5 flex items-center justify-center">
              <span className="text-gray-300 text-xs truncate">{appTitle}</span>
            </div>
            {/* ··· 버튼 강조 */}
            <div className="relative">
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                <span className="text-white font-black text-sm leading-none">···</span>
              </div>
              <div className="absolute -inset-1 rounded-xl border-2 border-red-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 공유 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900 flex items-center flex-wrap gap-1.5">
            <span>메뉴에서</span>
            <span className="font-black inline-flex items-center gap-1.5 align-middle">
              '공유'
              <IOSShareButton />
            </span>
            <span>를 누르세요</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">펼쳐진 메뉴에서 공유 아이콘을 찾으세요</p>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 하단 더 보기 */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">공유 시트 하단 <span className="font-black text-red-500">더 보기</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">앱 행 오른쪽 끝 버튼이 아닌, 가장 하단의 더 보기</p>

          {/* 액션 바 일러스트 */}
          <div className="mt-3 rounded-2xl border border-gray-200 shadow-sm max-w-xs" style={{ overflow: 'visible' }}>
            {/* 상단 앱 아이콘 행 */}
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-100 rounded-t-2xl overflow-hidden">
              {[
                { label: "News",    bg: "bg-red-100",  content: <span className="text-red-500 text-xs font-black">N</span> },
                { label: "미리 알림", bg: "bg-blue-50", content: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
                { label: "더 보기", bg: "bg-gray-100", content: <span className="text-gray-500 text-xs font-black">···</span> },
              ].map((app, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5 shrink-0">
                  <div className={`w-9 h-9 rounded-xl ${app.bg} flex items-center justify-center`}>{app.content}</div>
                  <span className="text-[9px] text-gray-400">{app.label}</span>
                </div>
              ))}
            </div>
            {/* 하단 액션 바 */}
            <div className="flex items-center divide-x divide-gray-100 bg-white rounded-b-2xl overflow-hidden" style={{ overflow: 'visible' }}>
              {[
                { icon: <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>, label: "복사" },
                { icon: <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>, label: "북마크" },
                { icon: <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, label: "읽기" },
              ].map((action, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 py-1.5">
                  {action.icon}
                  <span className="text-[9px] text-gray-400">{action.label}</span>
                </div>
              ))}
              {/* 더 보기 셀 — 타원 강조 */}
              <div className="flex-1 flex items-center justify-center py-1.5" style={{ overflow: 'visible' }}>
                <div className="relative flex flex-col items-center">
                  <svg
                    className="absolute pointer-events-none"
                    style={{ bottom: 'calc(100% + 2px)', left: '50%', transform: 'translateX(-50%)' }}
                    width="12" height="18" viewBox="0 0 12 18" fill="none"
                  >
                    <line x1="6" y1="18" x2="6" y2="4" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
                    <polyline points="2,11 6,4 10,11" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div className="flex flex-col items-center gap-0.5 px-4 py-1.5 border-2 border-red-400 rounded-full">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                    <span className="text-[9px] text-gray-500 font-medium">더 보기</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 4 — 홈 화면에 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={4} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">목록에서 <span className="font-black">'홈 화면에 추가'</span>를 누르세요</p>
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {[
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, label: "AirPlay" },
              { icon: <AddToHomeIcon className="w-5 h-5 text-gray-800" />, label: "홈 화면에 추가", highlight: true },
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, label: "메일로 링크 보내기" },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${item.highlight ? "bg-blue-50 border-l-4 border-blue-500" : "border-b border-gray-100"}`}>
                {item.icon}
                <span className={`text-sm ${item.highlight ? "text-blue-700 font-bold" : "text-gray-700"}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 5 — 웹 앱 토글 + 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={5} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900"><span className="font-black">'웹 앱으로 열기'</span> 켜고 <span className="font-black">'추가'</span> 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">iOS 26+에서는 웹 앱 모드를 활성화해야 해요</p>
          <div className="mt-3 rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
            <span className="text-sm font-medium text-gray-800">웹 앱으로 열기</span>
            <div className="w-11 h-6 bg-green-500 rounded-full flex items-center justify-end pr-0.5">
              <div className="w-5 h-5 bg-white rounded-full shadow" />
            </div>
          </div>
          {/* PWA 앱 로고 미리보기 */}
          <AppIconPreview appIconUrl={appIconUrl} appTitle={appTitle} />
        </div>
      </div>
    </div>
  );
}

// ── iPhone iOS 15~25 안내 ─────────────────────────────────────────────────────
function Guide15({ appTitle, appIconUrl }: GuideProps) {
  return (
    <div className="space-y-5">
      {/* Step 1 — 하단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900 flex items-center flex-wrap gap-1.5">
            <span>화면 하단 가운데</span>
            <span className="font-black inline-flex items-center gap-1.5 align-middle">
              '공유'
              <IOSShareButton />
            </span>
            <span>버튼을 누르세요</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">하단 툴바 가운데, ↑ 박스 모양 아이콘</p>
          <div className="mt-3 bg-gray-900 rounded-2xl px-4 py-3 flex items-center justify-around gap-2">
            {[
              <svg key="0" viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
              <svg key="1" viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
              <div key="2" className="relative">
                <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-600 flex items-center justify-center">
                  <ShareIcon className="w-4 h-4 text-white" />
                </div>
                <div className="absolute -inset-1 rounded-xl border-2 border-red-400 pointer-events-none" />
              </div>,
              <svg key="3" viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
              <svg key="4" viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
            ].map((icon, i) => (
              <div key={i} className="flex items-center justify-center w-8 h-8">{icon}</div>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 홈 화면에 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900"><span className="font-black">'홈 화면에 추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">공유 창 목록을 아래로 스크롤하세요</p>
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {[
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, label: "AirPlay" },
              { icon: <AddToHomeIcon className="w-5 h-5 text-gray-800" />, label: "홈 화면에 추가", highlight: true },
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, label: "메일로 링크 보내기" },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${item.highlight ? "bg-blue-50 border-l-4 border-blue-500" : "border-b border-gray-100"}`}>
                {item.icon}
                <span className={`text-sm ${item.highlight ? "text-blue-700 font-bold" : "text-gray-700"}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 위 <span className="font-black">'추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 바로가기 앱 아이콘이 추가됩니다!</p>
          <AppIconPreview appIconUrl={appIconUrl} appTitle={appTitle} />
        </div>
      </div>
    </div>
  );
}

// ── iPhone iOS 13~14 안내 ─────────────────────────────────────────────────────
function Guide13_14({ appTitle, appIconUrl }: GuideProps) {
  return (
    <div className="space-y-5">
      {/* Step 1 — 하단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900 flex items-center flex-wrap gap-1.5">
            <span>화면 하단 가운데</span>
            <span className="font-black inline-flex items-center gap-1.5 align-middle">
              '공유'
              <IOSShareButton />
            </span>
            <span>버튼을 누르세요</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">주소창은 화면 위에 있고, 공유(↑ 박스)는 맨 아래 툴바 가운데에 있어요</p>

          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-gray-50">
            {/* 상단 주소창 */}
            <div className="bg-gray-200/80 px-3 py-2 border-b border-gray-200 flex items-center gap-2">
              <div className="flex-1 bg-white rounded-lg px-2.5 py-1 flex items-center justify-between text-xs text-gray-500 shadow-xs">
                <span className="truncate">{appTitle}</span>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              </div>
            </div>

            {/* 웹페이지 콘텐츠 영역 (미니 프리뷰) */}
            <div className="py-4 px-3 flex flex-col items-center justify-center text-center">
              <p className="text-[11px] text-gray-400">{appTitle} 웹페이지 화면</p>
            </div>

            {/* 하단 고정 툴바 */}
            <div className="bg-gray-100 border-t border-gray-200 px-4 py-2 flex items-center justify-around gap-2">
              {[
                <svg key="0" viewBox="0 0 24 24" className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
                <svg key="1" viewBox="0 0 24 24" className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
                <div key="2" className="relative">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-300 flex items-center justify-center shadow-2xs">
                    <ShareIcon className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="absolute -inset-1 rounded-xl border-2 border-red-400 pointer-events-none" />
                </div>,
                <svg key="3" viewBox="0 0 24 24" className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
                <svg key="4" viewBox="0 0 24 24" className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 8h13v13H8z"/></svg>,
              ].map((icon, i) => (
                <div key={i} className="flex items-center justify-center w-8 h-8">{icon}</div>
              ))}
            </div>
          </div>

          <div className="mt-2.5">
            <TipBox>
              툴바가 보이지 않으면 화면을 <strong>위로 살짝 올리거나</strong> 화면 가장 <strong>아래쪽을 터치</strong>하세요.
            </TipBox>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 홈 화면에 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900"><span className="font-black">'홈 화면에 추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">공유 창 목록을 아래로 스크롤하세요</p>
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {[
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, label: "AirPlay" },
              { icon: <AddToHomeIcon className="w-5 h-5 text-gray-800" />, label: "홈 화면에 추가", highlight: true },
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, label: "메일로 링크 보내기" },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${item.highlight ? "bg-blue-50 border-l-4 border-blue-500" : "border-b border-gray-100"}`}>
                {item.icon}
                <span className={`text-sm ${item.highlight ? "text-blue-700 font-bold" : "text-gray-700"}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 위 <span className="font-black">'추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 바로가기 앱 아이콘이 추가됩니다!</p>
          <AppIconPreview appIconUrl={appIconUrl} appTitle={appTitle} />
        </div>
      </div>
    </div>
  );
}

// ── iPhone iOS 12 이하 안내 (iOS 7~12) ───────────────────────────────────────
function Guide12({ appTitle, appIconUrl }: GuideProps) {
  return (
    <div className="space-y-5">
      {/* Step 1 — 하단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900 flex items-center flex-wrap gap-1.5">
            <span>화면 하단 가운데</span>
            <span className="font-black inline-flex items-center gap-1.5 align-middle">
              '공유'
              <IOSShareButton />
            </span>
            <span>버튼을 누르세요</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">화면 맨 아래 툴바 가운데 있는 ↑ 박스 아이콘</p>

          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-gray-50">
            {/* 하단 고정 툴바 */}
            <div className="bg-gray-100 px-4 py-2.5 flex items-center justify-around gap-2">
              {[
                <svg key="0" viewBox="0 0 24 24" className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
                <svg key="1" viewBox="0 0 24 24" className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
                <div key="2" className="relative">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-300 flex items-center justify-center shadow-2xs">
                    <ShareIcon className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="absolute -inset-1 rounded-xl border-2 border-red-400 pointer-events-none" />
                </div>,
                <svg key="3" viewBox="0 0 24 24" className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
                <svg key="4" viewBox="0 0 24 24" className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 8h13v13H8z"/></svg>,
              ].map((icon, i) => (
                <div key={i} className="flex items-center justify-center w-8 h-8">{icon}</div>
              ))}
            </div>
          </div>

          <div className="mt-2.5">
            <TipBox>
              툴바가 숨겨져 있다면 화면을 <strong>위로 살짝 스크롤</strong>하세요.
            </TipBox>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 가로 스크롤로 '홈 화면에 추가' 찾기 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">아래 회색 아이콘 줄에서 <span className="font-black text-blue-600">'홈 화면에 추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">맨 아래 회색 사각형 아이콘 줄을 왼쪽으로 넘겨 [+] 모양 아이콘 선택</p>

          {/* iOS 7~12 클래식 공유 창 일러스트 */}
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-gray-50 p-3.5 space-y-3">
            {/* 1행: AirDrop 배너 */}
            <div className="bg-white/90 rounded-xl px-3 py-2 border border-gray-100 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 7l-5-5-5 5M7 17l5 5 5-5"/></svg>
              </div>
              <span className="text-[11px] text-gray-600 font-medium truncate">AirDrop으로 바로 공유</span>
            </div>

            {/* 2행: 컬러 앱 아이콘 행 */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {[
                { name: "메시지", bg: "bg-green-500", icon: <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                { name: "Mail", bg: "bg-blue-500", icon: <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
                { name: "메모", bg: "bg-amber-400", icon: <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
              ].map((app, i) => (
                <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                  <div className={`w-10 h-10 rounded-xl ${app.bg} flex items-center justify-center shadow-xs`}>
                    {app.icon}
                  </div>
                  <span className="text-[10px] text-gray-500">{app.name}</span>
                </div>
              ))}
            </div>

            {/* 3행: 흑백 액션 아이콘 행 (가로 스크롤) */}
            <div className="pt-2 border-t border-gray-200/80">
              <p className="text-[10px] text-gray-400 font-semibold mb-1.5 flex items-center gap-1">
                <span>맨 아래 회색 아이콘 줄을 왼쪽으로 스와이프</span>
                <span className="text-blue-500">→</span>
              </p>
              <div className="flex items-center gap-3 overflow-x-auto py-1">
                {[
                  { name: "책갈피 추가", icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> },
                  { name: "홈 화면에 추가", highlight: true, icon: <AddToHomeLegacyIcon className="w-5 h-5 text-blue-600" /> },
                  { name: "복사", icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> },
                  { name: "프린트", icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> },
                ].map((act, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center relative ${act.highlight ? "bg-blue-50 border-2 border-red-500 shadow-sm" : "bg-white border border-gray-200"}`}>
                      {act.icon}
                      {act.highlight && (
                        <div className="absolute -inset-1 rounded-2xl border-2 border-red-400 pointer-events-none" />
                      )}
                    </div>
                    <span className={`text-[10px] text-center max-w-[56px] leading-tight ${act.highlight ? "text-blue-700 font-extrabold" : "text-gray-600 font-medium"}`}>
                      {act.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 위 <span className="font-black">'추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 바로가기 앱 아이콘이 추가됩니다!</p>
          <AppIconPreview appIconUrl={appIconUrl} appTitle={appTitle} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 타입 및 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

type DeviceMode = "iphone" | "ipad";
type IPhoneVersion = "ios26" | "ios15_25" | "ios13_14" | "ios12_under";
type IPadVersion = "ipad26" | "ipad13_25" | "ipad12_under";

export default function IOSInstallGuide() {
  const [, setLocation] = useLocation();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  // Chrome 브라우저 여부 감지
  const isChrome = agent.browserKey === "chrome" || agent.isIOSChrome;

  const handleCopyUrl = async () => {
    const urlToCopy = window.location.origin;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = urlToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("사이트 주소가 복사되었습니다! Safari 주소창에 붙여넣어 주세요.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("주소 복사에 실패했습니다. 브라우저 주소창의 URL을 직접 복사해 주세요.");
    }
  };

  // 디자인설정 비동기 로드
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    fetch("/api/settings/public")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSettings(data))
      .catch(() => {});
  }, []);

  const appTitle = settings?.pwa_app_title || "성지수행";
  const appIconUrl = settings?.pwa_app_icon_url || settings?.site_favicon_url || "/icon.svg";

  // 자동 감지: 기기 구분 (iPad / iPhone)
  const detectedDevice: DeviceMode = isIPad ? "ipad" : "iphone";

  // 자동 감지: iPhone OS 버전
  const detectedIPhoneVer: IPhoneVersion = (() => {
    if (iosVersion >= 26) return "ios26";
    if (iosVersion >= 15) return "ios15_25";
    if (iosVersion >= 13) return "ios13_14";
    if (iosVersion > 0) return "ios12_under";
    return "ios26"; // 데스크톱/기타 접속 시 최신 버전 기본
  })();

  // 자동 감지: iPad OS 버전
  const detectedIPadVer: IPadVersion = (() => {
    if (iosVersion >= 26) return "ipad26";
    if (iosVersion >= 13) return "ipad13_25";
    if (iosVersion > 0) return "ipad12_under";
    return "ipad26";
  })();

  // ── IP별 디버그 모드 상태 ─────────────────────────────────────────────────────
  const isDebug = !!settings?.access_debug_mode_hit;
  const [debugMode, setDebugMode] = useState<"auto" | "manual">("auto");

  // 수동 선택용 상태 (디버그 모드에서만 조작 가능)
  const [manualDevice, setManualDevice] = useState<DeviceMode>(detectedDevice);
  const [manualIPhoneVer, setManualIPhoneVer] = useState<IPhoneVersion>(detectedIPhoneVer);
  const [manualIPadVer, setManualIPadVer] = useState<IPadVersion>(detectedIPadVer);

  // 디버그 사용자 접속 시 관리페이지에서 설정한 기본 모드(manual 등) 반영
  useEffect(() => {
    if (settings?.access_debug_mode_hit) {
      if (settings.access_debug_default_mode === "manual") {
        setDebugMode("manual");
      }
    }
  }, [settings?.access_debug_mode_hit, settings?.access_debug_default_mode]);

  const isManual = isDebug && debugMode === "manual";
  const effectiveDevice: DeviceMode = isManual ? manualDevice : detectedDevice;
  const effectiveIPhoneVer: IPhoneVersion = isManual ? manualIPhoneVer : detectedIPhoneVer;
  const effectiveIPadVer: IPadVersion = isManual ? manualIPadVer : detectedIPadVer;

  const iphoneTabs: { id: IPhoneVersion; label: string }[] = [
    { id: "ios26", label: "iOS 26+ (iPhone 17+)" },
    { id: "ios15_25", label: "iOS 15~25" },
    { id: "ios13_14", label: "iOS 13~14" },
    { id: "ios12_under", label: "iOS 12 이하" },
  ];

  const ipadTabs: { id: IPadVersion; label: string }[] = [
    { id: "ipad26", label: "iPadOS 26+" },
    { id: "ipad13_25", label: "iPadOS 13~25" },
    { id: "ipad12_under", label: "iOS 12 이하" },
  ];

  // 헤더 감지 뱃지 텍스트
  const detectedSummary = (() => {
    if (isIPad) {
      if (iosVersion >= 26) return "iPad (iPadOS 26+)";
      if (iosVersion >= 13) return `iPad (iPadOS ${iosVersion})`;
      if (iosVersion > 0) return `iPad (iOS ${iosVersion})`;
      return "iPad (iPadOS)";
    }
    if (isIPhone) {
      if (iosVersion >= 26) return "iOS 26+ (iPhone 17+)";
      if (iosVersion >= 15) return `iOS 15~25 (iOS ${iosVersion})`;
      if (iosVersion >= 13) return `iOS 13~14 (iOS ${iosVersion})`;
      if (iosVersion > 0) return `iOS 12 이하 (iOS ${iosVersion})`;
      return "iPhone (iOS)";
    }
    return "iOS 26+";
  })();

  const displaySummary = (() => {
    if (isManual) {
      if (manualDevice === "ipad") {
        const t = ipadTabs.find((x) => x.id === manualIPadVer);
        return `[수동선택] iPad · ${t?.label || ""}`;
      } else {
        const t = iphoneTabs.find((x) => x.id === manualIPhoneVer);
        return `[수동선택] iPhone · ${t?.label || ""}`;
      }
    }
    return detectedSummary;
  })();

  const guideProps: GuideProps = { appTitle, appIconUrl };

  // 기기별 바인딩된 가이드 GIF 에셋 ID 조회
  const guideBindings: Record<string, string> = settings?.iphone_pwa_guide_bindings || {};
  const boundAssetId = effectiveDevice === "ipad"
    ? guideBindings[effectiveIPadVer]
    : guideBindings[effectiveIPhoneVer];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div
        className="bg-black px-5 pb-3.5 flex-shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* 뒤로 가기 */}
          <button
            onClick={() => {
              if (showGuide) {
                setShowGuide(false);
              } else if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                setLocation("/");
              }
            }}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 active:bg-white/20 transition-colors cursor-pointer"
            aria-label="뒤로 가기"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          {/* PWA 앱 로고 (관리페이지 디자인설정 PWA 로고 사용) */}
          <div className="relative shrink-0">
            <img
              src={appIconUrl}
              alt={appTitle}
              className="w-9 h-9 rounded-xl object-cover shadow-sm bg-white border border-white/20"
              onError={(e) => { (e.target as HTMLImageElement).src = "/icon.svg"; }}
            />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-black border border-white/30 flex items-center justify-center shadow-xs">
              <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.77M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/>
              </svg>
            </div>
          </div>

          <div className="min-w-0">
            <h1 className="text-base font-extrabold text-white leading-tight truncate">
              {appTitle} 홈 화면에 추가
            </h1>
            {isDebug && (
              <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1.5 truncate">
                <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${isManual ? "bg-amber-400" : "bg-green-400 animate-pulse"}`} />
                <span>{displaySummary}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 디버그 모드 상태 바 (IP 등록된 기기에서만 노출) */}
      {isDebug && showGuide && (
        <div className="bg-amber-500/15 border-b border-amber-500/25 px-5 py-2 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 font-black text-amber-950 shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              🛠️ 디버그 모드
            </span>
            <span className="text-[11px] font-mono text-amber-900/70 truncate">
              ({settings?.client_ip || "IP 일치"})
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-amber-950 font-bold">모드:</span>
            <div className="inline-flex rounded-lg bg-black/10 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setDebugMode("auto")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  debugMode === "auto"
                    ? "bg-white text-gray-950 shadow-xs font-black"
                    : "text-amber-950/70 hover:text-black"
                }`}
              >
                ⚡ 자동 감지
              </button>
              <button
                type="button"
                onClick={() => setDebugMode("manual")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  debugMode === "manual"
                    ? "bg-amber-600 text-white shadow-xs font-black"
                    : "text-amber-950/70 hover:text-black"
                }`}
              >
                🛠️ 수동 선택
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수동 선택 모드 선택 시 수동선택 버튼(기기 전환 + 버전 탭) 표시 */}
      {isManual && showGuide && (
        <div className="bg-gray-900 px-5 pt-3 pb-3 border-b border-gray-800 shrink-0 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-gray-400">기기 전환</span>
            <div className="flex items-center bg-white/10 p-0.5 rounded-xl border border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setManualDevice("iphone")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  manualDevice === "iphone"
                    ? "bg-white text-black shadow-xs font-black"
                    : "text-gray-300 hover:text-white"
                }`}
              >
                iPhone
              </button>
              <button
                type="button"
                onClick={() => setManualDevice("ipad")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  manualDevice === "ipad"
                    ? "bg-white text-black shadow-xs font-black"
                    : "text-gray-300 hover:text-white"
                }`}
              >
                iPad
              </button>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar flex items-center gap-1.5 pt-0.5">
            {manualDevice === "iphone"
              ? iphoneTabs.map((tab) => {
                  const isActive = manualIPhoneVer === tab.id;
                  const isAuto = isIPhone && detectedIPhoneVer === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setManualIPhoneVer(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                        isActive
                          ? "bg-amber-400 text-gray-950 font-black shadow-sm"
                          : "bg-white/10 text-gray-300 hover:bg-white/20"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {isAuto && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="현재 감지된 기기 버전" />
                      )}
                    </button>
                  );
                })
              : ipadTabs.map((tab) => {
                  const isActive = manualIPadVer === tab.id;
                  const isAuto = isIPad && detectedIPadVer === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setManualIPadVer(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                        isActive
                          ? "bg-amber-400 text-gray-950 font-black shadow-sm"
                          : "bg-white/10 text-gray-300 hover:bg-white/20"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {isAuto && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="현재 감지된 기기 버전" />
                      )}
                    </button>
                  );
                })}
          </div>
        </div>
      )}

      {!showGuide ? (
        /* 안내 시작 전 인트로 화면 (큰 애플 로고 + 부연 설명 + 1분 설치방법 보기 버튼) */
        <div className="flex-1 overflow-y-auto flex flex-col justify-between px-6 py-8 sm:py-12 max-w-md mx-auto w-full text-center">
          <div className="flex-1 flex flex-col items-center justify-center my-auto py-6">
            {/* 세련되고 큰 애플 로고 */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-black text-white flex items-center justify-center shadow-2xl shadow-black/20 mb-6 transition-transform active:scale-95">
              <svg viewBox="0 0 24 24" className="w-12 h-12 sm:w-14 sm:h-14" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.77M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/>
              </svg>
            </div>

            {/* 타이틀 */}
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mb-4">
              {appTitle} 홈 화면에 추가
            </h2>

            {/* Chrome 접속 시 Safari 권장 안내 배너 */}
            {isChrome && (
              <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 mb-6 text-left flex items-start gap-3.5 shadow-xs">
                <SafariLogo className="w-12 h-12 shrink-0 mt-0.5 drop-shadow-sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-amber-900">Safari 브라우저 권장</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">Chrome 감지</span>
                  </div>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed break-keep">
                    이 설명서는 Safari 기준입니다. Chrome 환경에서는 PWA 기능이 제한될 수 있으므로, 아래 주소를 복사하여 <strong>Safari로 다시 열어주세요.</strong>
                  </p>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="px-3 py-1.5 bg-[#0071E3] hover:bg-[#0077ED] active:bg-[#005BB5] text-white rounded-xl font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      {copied ? "✓ 주소 복사 완료!" : "주소 복사하기"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocation("/ios-chrome-install-guide")}
                      className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-xl font-bold text-xs shadow-2xs hover:bg-amber-100 active:scale-95 transition-all cursor-pointer"
                    >
                      Chrome 전용 가이드 보기
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 부연 설명 (유저 요청 100% 반영) */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 mb-8 text-center shadow-xs">
              <p className="text-slate-700 text-sm sm:text-[15px] leading-relaxed font-medium break-keep">
                성지수행은 AppStore에 출시되지 않았기 때문에 간단한 설치방법을 따라 다운받으셔야 합니다. 오래 걸리지 않습니다.
              </p>
            </div>

            {/* 1분 설치방법 보기 버튼 */}
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="w-full h-14 bg-black hover:bg-gray-900 active:scale-[0.98] text-white font-bold text-base sm:text-lg rounded-2xl shadow-xl shadow-black/10 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
            >
              <span>1분 설치방법 보기</span>
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className="pt-4">
            <p className="text-xs text-slate-400">
              Safari 브라우저의 기본 기능을 통해 안전하게 추가됩니다.
            </p>
          </div>
        </div>
      ) : (
        /* 스크롤 가능한 단계 안내 본문 (자동 감지 또는 수동 선택 기반 분기) */
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 max-w-lg mx-auto">
            {boundAssetId ? (
              /* 바인딩된 경우: 기존 설명서를 GIF로 완전히 대체 */
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-md bg-black/5 flex items-center justify-center">
                  <img
                    src={`/api/guide-assets?id=${boundAssetId}`}
                    alt={`${effectiveDevice === "ipad" ? "iPad" : "iPhone"} PWA 설치 가이드 GIF`}
                    className="w-full h-auto object-contain rounded-2xl max-h-[75vh]"
                  />
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5 text-xs text-slate-600 text-center font-medium leading-relaxed shadow-2xs">
                  💡 위 GIF 애니메이션 안내에 따라 Safari 브라우저에서 홈 화면에 추가를 진행해 주세요.
                </div>
              </div>
            ) : effectiveDevice === "ipad" ? (
              effectiveIPadVer === "ipad26" ? (
                <GuideIPadNew {...guideProps} />
              ) : effectiveIPadVer === "ipad13_25" ? (
                <GuideIPad13_25 {...guideProps} />
              ) : (
                <GuideIPad12 {...guideProps} />
              )
            ) : effectiveIPhoneVer === "ios26" ? (
              <Guide26 {...guideProps} />
            ) : effectiveIPhoneVer === "ios15_25" ? (
              <Guide15 {...guideProps} />
            ) : effectiveIPhoneVer === "ios13_14" ? (
              <Guide13_14 {...guideProps} />
            ) : (
              <Guide12 {...guideProps} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
