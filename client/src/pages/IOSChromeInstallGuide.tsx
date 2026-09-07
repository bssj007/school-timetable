import React, { useState, useEffect } from "react";
import { agent } from "@/lib/browserDetect";
import { useLocation } from "wouter";

// ── 공통 SVG 아이콘 ───────────────────────────────────────────────────────────
function ChromeLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <circle cx="12" cy="12" r="10" fill="#ffffff" />
      <path d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.33 2.5L5.34 5.5A9.96 9.96 0 0 1 12 2Z" fill="#EA4335"/>
      <path d="M12 22a10 10 0 0 1-8.66-5l2.33-4a5 5 0 0 0 4.33 2.5h4.33l-2.33 4A9.96 9.96 0 0 1 12 22Z" fill="#34A853"/>
      <path d="M22 12a10 10 0 0 1-1.34 5l-2.33-4A5 5 0 0 0 14 12V7h4.66A9.96 9.96 0 0 1 22 12Z" fill="#FBBC05"/>
      <circle cx="12" cy="12" r="4" fill="#4285F4"/>
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  );
}

function AddToHomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 17h7M17.5 14v7"/>
    </svg>
  );
}

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-extrabold shrink-0 shadow-md">
      {n}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-100" />;
}

export default function IOSChromeInstallGuide() {
  const [, setLocation] = useLocation();
  const [settings, setSettings] = useState<any>(null);
  const [deviceTab, setDeviceTab] = useState<"iphone" | "ipad">(agent.isIPad ? "ipad" : "iphone");

  useEffect(() => {
    fetch("/api/settings/public")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSettings(data))
      .catch(() => {});
  }, []);

  const appTitle = settings?.pwa_app_title || "성지수행";
  const appIconUrl = settings?.pwa_app_icon_url || settings?.site_favicon_url || "/icon.svg";

  function handleComplete() {
    localStorage.setItem("download_page_dismissed", "1");
    setLocation("/");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-gray-900 selection:bg-blue-100">
      {/* ── 상단 헤더 바 ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-2xs">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              setLocation("/download");
            }
          }}
          className="flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors py-1 px-2 rounded-lg hover:bg-gray-100 active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>뒤로</span>
        </button>

        <div className="flex items-center gap-2">
          <ChromeLogo className="w-5 h-5 shadow-xs rounded-full" />
          <span className="font-bold text-sm text-gray-900">Chrome PWA 가이드</span>
        </div>

        <button
          onClick={handleComplete}
          className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors py-1 px-2.5 rounded-lg bg-blue-50 border border-blue-200 active:scale-95"
        >
          사이트로
        </button>
      </header>

      {/* ── 본문 콘텐츠 ────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* 앱 타이틀 카드 */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
          <img
            src={appIconUrl}
            alt={appTitle}
            className="w-16 h-16 rounded-2xl shadow-md object-cover border border-gray-100 shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).src = "/icon.svg"; }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-lg font-black text-gray-900 tracking-tight">{appTitle}</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                iOS Chrome
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Google Chrome에서도 홈 화면에 추가하여 독립 앱 모드로 편리하게 이용할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 기기 선택 탭 (iPhone vs iPad) */}
        <div className="flex bg-gray-200/80 p-1 rounded-2xl border border-gray-300/60">
          <button
            type="button"
            onClick={() => setDeviceTab("iphone")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              deviceTab === "iphone"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            📱 iPhone Chrome
          </button>
          <button
            type="button"
            onClick={() => setDeviceTab("ipad")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              deviceTab === "ipad"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            💻 iPad Chrome
          </button>
        </div>

        {/* ── 단계별 가이드 박스 ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-6">
          <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
            <span>설치 3단계 안내</span>
            <span className="text-xs font-medium text-gray-400 font-normal">iOS 16.4+ 지원</span>
          </h2>

          {/* Step 1 */}
          <div className="flex items-start gap-3.5">
            <StepBadge n={1} />
            <div className="flex-1">
              <p className="text-sm font-extrabold text-gray-900 leading-snug">
                Chrome {deviceTab === "ipad" ? "상단 주소창" : "주소창 또는 하단 바"}의 <span className="text-blue-600 font-black">'공유'</span> 또는 <span className="text-blue-600 font-black">'···'</span> 메뉴를 누르세요
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {deviceTab === "ipad"
                  ? "화면 상단 주소창 우측 끝에 있는 ↑ 공유 아이콘을 누릅니다."
                  : "주소창 오른쪽의 공유(↑) 아이콘 또는 오른쪽 하단의 더보기(···) 버튼을 누릅니다."}
              </p>

              {/* 주소창 시뮬레이션 UI */}
              <div className="mt-3 bg-gray-50 rounded-2xl p-3 border border-gray-200 flex items-center gap-2">
                <div className="flex-1 bg-white rounded-xl px-3 py-1.5 flex items-center justify-between border border-gray-200 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-xs text-gray-700 font-medium truncate">
                    <span className="text-green-600">🔒</span>
                    <span className="truncate">{window.location.host}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center ring-2 ring-blue-400">
                      <ShareIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
                      <DotsIcon className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Divider />

          {/* Step 2 */}
          <div className="flex items-start gap-3.5">
            <StepBadge n={2} />
            <div className="flex-1">
              <p className="text-sm font-extrabold text-gray-900 leading-snug">
                메뉴 목록에서 <span className="text-blue-600 font-black">'홈 화면에 추가'</span>를 찾아 누르세요
              </p>
              <p className="text-xs text-gray-500 mt-1">
                공유 시트나 메뉴 창을 아래로 스크롤하면 사각형에 ＋가 그려진 옵션이 있습니다.
              </p>

              {/* 메뉴 항목 시뮬레이션 UI */}
              <div className="mt-3 bg-gray-50 rounded-2xl p-3 border border-gray-200">
                <div className="bg-white rounded-xl p-2.5 border-2 border-blue-400 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <AddToHomeIcon className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-gray-900">홈 화면에 추가</span>
                  </div>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                    여기를 탭
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Divider />

          {/* Step 3 */}
          <div className="flex items-start gap-3.5">
            <StepBadge n={3} />
            <div className="flex-1">
              <p className="text-sm font-extrabold text-gray-900 leading-snug">
                오른쪽 상단 <span className="text-blue-600 font-black">'추가'</span> 버튼을 눌러 완료합니다
              </p>
              <p className="text-xs text-gray-500 mt-1">
                아이폰/아이패드 바탕화면에 바로가기 앱 아이콘이 생성됩니다.
              </p>

              {/* 추가 확인 모의 UI */}
              <div className="mt-3 bg-gray-50 rounded-2xl p-3 border border-gray-200 flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium">취소</span>
                <span className="text-xs font-bold text-gray-800 truncate px-2">{appTitle}</span>
                <span className="text-xs font-black text-blue-600 bg-blue-100 px-2.5 py-1 rounded-lg">추가</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 유용한 팁 & 참고사항 ────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 flex items-start gap-3 shadow-2xs">
            <span className="text-base shrink-0 leading-none">💡</span>
            <div className="leading-relaxed">
              <strong className="font-extrabold">Safari 브라우저와의 차이점:</strong>
              <p className="mt-0.5 text-amber-800">
                사파리는 화면 맨 하단 중앙의 공유 버튼을 이용하지만, <strong>Google Chrome은 주소창 우측의 공유 버튼이나 우측 메뉴(···)</strong>에 '홈 화면에 추가'가 위치해 있습니다.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 text-xs text-blue-900 flex items-start gap-3 shadow-2xs">
            <span className="text-base shrink-0 leading-none">🚀</span>
            <div className="leading-relaxed">
              <strong className="font-extrabold">독립 전체화면 앱 실행:</strong>
              <p className="mt-0.5 text-blue-800">
                홈 화면에 추가된 아이콘으로 실행하면 Chrome 주소창과 탭 표시줄이 사라져 더 넓고 쾌적한 네이티브 앱 형태로 이용하실 수 있습니다.
              </p>
            </div>
          </div>
        </div>

        {/* 하단 완료 및 사이트 이동 버튼 */}
        <div className="pt-2 pb-6">
          <button
            onClick={handleComplete}
            className="w-full h-14 bg-gray-900 hover:bg-black text-white font-bold text-base rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
          >
            <span>확인 완료 · 사이트로 이동</span>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </main>
    </div>
  );
}
