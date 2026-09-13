import React, { useState, useEffect } from "react";
import { agent, checkIsChromePWASupported } from "@/lib/browserDetect";
import { useLocation } from "wouter";
import { SafariLogo } from "@/components/SafariLogo";
import { toast } from "sonner";

// ── 공통 SVG 아이콘 ───────────────────────────────────────────────────────────
function ChromeLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <circle cx="12" cy="12" r="10" fill="#ffffff" />
      <path d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.33 2.5L5.34 5.5A9.96 9.96 0 0 1 12 2Z" fill="#EA4335"/>
      <path d="M12 22a10 10 0 0 1-8.66-5l2.33-4a5 5 0 0 0 4.33 2.5h4.33l-2.33 4A9.96 9.96 0 0 1 12 22Z" fill="#34A853"/>
      <path d="M22 12a10 10 0 0 1-1.34 5l-2.33-4A5 5 0 0 0 14 12V7h4.66A9.96 9.96 0 0 1 22 12Z" fill="#FBBC05"/>
      <circle cx="12" cy="4" r="4" fill="#4285F4"/>
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
  const [isSupported, setIsSupported] = useState<boolean>(() => checkIsChromePWASupported());
  const [copied, setCopied] = useState(false);

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

  const showDebugToggle = Boolean(
    settings?.access_debug_mode_hit ||
    (typeof window !== "undefined" &&
      (window.location.search.includes("debug") ||
        window.location.search.includes("unsupported") ||
        window.location.search.includes("supported")))
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-gray-900 selection:bg-blue-100">
      {/* ── 상단 헤더 바 ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-2xs">
        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
            } else {
              setLocation("/");
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
          {isSupported ? (
            <ChromeLogo className="w-5 h-5 shadow-xs rounded-full" />
          ) : (
            <SafariLogo className="w-5 h-5 shadow-xs rounded-md" />
          )}
          <span className="font-bold text-sm text-gray-900">
            {isSupported ? "Chrome PWA 가이드" : "Safari로 열기 안내"}
          </span>
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
              {isSupported ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                  iOS Chrome
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                  Safari 권장
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              {isSupported
                ? "Google Chrome에서도 홈 화면에 추가하여 독립 앱 모드로 편리하게 이용할 수 있습니다."
                : "현재 Chrome 환경에서는 홈 화면 추가(PWA) 기능이 지원되지 않아 Safari 브라우저 사용을 권장합니다."}
            </p>
          </div>
        </div>

        {/* ── PWA 지원 여부에 따른 조건부 분기 ──────────────────────────────── */}
        {!isSupported ? (
          /* [CASE 1] PWA 미지원 Chrome 환경: Safari 로고 및 Safari로 다시 열기 안내 */
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm text-center space-y-6">
            {/* Safari 로고 */}
            <div className="flex justify-center pt-2">
              <div className="relative inline-block">
                <SafariLogo className="w-24 h-24 drop-shadow-xl transition-transform hover:scale-105 active:scale-95 duration-200" />
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-black shadow-md border-2 border-white">
                  !
                </div>
              </div>
            </div>

            {/* 제목 및 부제목 */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                <span>⚠️</span>
                <span>Chrome PWA 미지원 환경</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                Safari로 다시 열어주세요
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed max-w-sm mx-auto break-keep">
                현재 접속하신 <strong>Chrome 브라우저</strong>에서는 홈 화면 추가(PWA 앱 설치) 기능이 지원되지 않습니다.
                <br />
                기본 브라우저인 <strong className="text-blue-600 font-bold">Safari</strong>로 열어주시면 바로 홈 화면에 앱을 추가하실 수 있습니다.
              </p>
            </div>

            {/* 원클릭 사이트 주소 복사 버튼 */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="w-full h-14 bg-[#0071E3] hover:bg-[#0077ED] active:bg-[#005BB5] text-white font-bold text-base rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] cursor-pointer"
              >
                {copied ? (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>주소가 복사되었습니다!</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>사이트 주소 복사하기</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-gray-400 mt-2">
                주소를 복사한 뒤 Safari 앱 주소창에 붙여넣어 주세요.
              </p>
            </div>

            {/* Safari 이동 3단계 초간단 안내 */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 text-left space-y-3.5 shadow-2xs">
              <h3 className="text-xs font-black text-gray-900 flex items-center gap-1.5 border-b border-gray-200 pb-2.5">
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-black">i</span>
                <span>Safari에서 설치하는 초간단 3단계</span>
              </h3>

              <div className="flex items-start gap-3 text-xs text-gray-700">
                <span className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">1</span>
                <div>
                  <strong className="font-bold text-gray-900">주소 복사</strong>
                  <p className="text-gray-500 text-[11px] mt-0.5">위의 <span className="text-blue-600 font-semibold">'사이트 주소 복사하기'</span> 버튼을 탭합니다.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-gray-700">
                <span className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">2</span>
                <div>
                  <strong className="font-bold text-gray-900">Safari 앱 열기</strong>
                  <p className="text-gray-500 text-[11px] mt-0.5">홈 화면에서 <span className="text-blue-600 font-semibold">Safari(나침반)</span> 앱을 실행합니다.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-gray-700">
                <span className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">3</span>
                <div>
                  <strong className="font-bold text-gray-900">붙여넣기 및 홈 화면 추가</strong>
                  <p className="text-gray-500 text-[11px] mt-0.5">주소창에 붙여넣어 접속 후 하단 중앙 <span className="text-blue-600 font-semibold">공유(↑) 버튼 → '홈 화면에 추가'</span>를 누릅니다.</p>
                </div>
              </div>
            </div>

            {/* Chrome에서 계속 이용하기 */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleComplete}
                className="w-full py-3 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors hover:bg-gray-100 rounded-xl"
              >
                앱 설치 없이 Chrome에서 계속 이용하기 →
              </button>
            </div>
          </div>
        ) : (
          /* [CASE 2] PWA 지원 Chrome 환경 (iOS 16.4+): 3단계 Chrome 설치 안내 */
          <>
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
                        <span className="truncate">{typeof window !== "undefined" ? window.location.host : "school.com"}</span>
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
            <div className="pt-2 pb-2">
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
          </>
        )}

        {/* ── 디버그/테스트 모드 전환 바 (관리자 디버그 활성 시 또는 URL에 debug/unsupported 포함 시) ── */}
        {showDebugToggle && (
          <div className="rounded-2xl bg-gray-100/90 border border-gray-200 p-3 flex items-center justify-between text-xs text-gray-600 shadow-2xs mt-2">
            <div className="flex items-center gap-1.5 font-bold text-gray-700">
              <span>🛠️ 테스트 모드:</span>
              <span className={isSupported ? "text-blue-600" : "text-amber-600"}>
                {isSupported ? "Chrome 지원 (16.4+)" : "Chrome 미지원 (Safari 안내)"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSupported((prev) => !prev)}
              className="px-3 py-1 bg-white border border-gray-300 rounded-xl font-bold text-gray-800 shadow-2xs hover:bg-gray-50 active:scale-95 transition-all"
            >
              {isSupported ? "미지원(Safari안내) 보기" : "지원(3단계안내) 보기"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
