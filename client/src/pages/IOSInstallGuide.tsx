import { useLocation } from "wouter";

// ── iOS 버전 감지 ─────────────────────────────────────────────────────────────
// iOS 26+부터 Apple이 UA의 OS 버전을 동결(freeze)함 → "CPU iPhone OS 18_x" 처럼 구버전이 표시됨
// 대신 Safari의 "Version/26.x" 헤더는 실제 메이저 버전을 노출하므로, 두 값 중 큰 것을 사용
function detectIOSVersion(): number {
  if (typeof window === "undefined") return 0;
  const ua = navigator.userAgent;
  const osVer  = parseInt(/os (\d+)/i.exec(ua.toLowerCase())?.[1]  ?? "0", 10);
  const safVer = parseInt(/version\/(\d+)/i.exec(ua)?.[1]          ?? "0", 10);
  return Math.max(osVer, safVer);
}

// ── 공유 SVG ──────────────────────────────────────────────────────────────────
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  );
}

// ── 홈화면추가 SVG ─────────────────────────────────────────────────────────────
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

// ── Step 번호 배지 ────────────────────────────────────────────────────────────
function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-extrabold shrink-0">
      {n}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider() {
  return <div className="border-t border-gray-100" />;
}

// ── iOS 26+ 4단계 안내 ────────────────────────────────────────────────────────
function Guide26() {
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
                <span className="text-gray-400 text-sm font-bold">‹</span>
              </div>
              <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center">
                <span className="text-gray-400 text-sm font-bold">›</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center">
                <span className="text-gray-400 text-base">↻</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center ring-2 ring-blue-300 shadow-lg">
                <span className="text-white text-sm font-black">···</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 팝업에서 공유 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">팝업 메뉴에서 <span className="font-black">공유</span>를 탭하세요</p>
          <p className="text-sm text-gray-500 mt-0.5">···를 누르면 나타나는 작은 메뉴에서 공유 선택</p>
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-4 py-3 bg-blue-50">
              <ShareIcon className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="text-sm font-bold text-blue-600">공유</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="text-sm text-gray-400">북마크에 추가</span>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 공유 시트 하단 '더 보기' */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">하단 액션 바 맨 오른쪽 <span className="font-black">더 보기</span>를 탭하세요</p>
          <p className="text-sm text-gray-500 mt-0.5">공유 시트 하단 버튼 바의 맨 오른쪽</p>
          {/* 액션 바 일러스트 */}
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {/* 상단 앱 아이콘 행 — 기본 색상 (하이라이트 없음) */}
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-100">
              {[
                { label: "News",   bg: "bg-red-100",  content: <span className="text-red-500 text-xs font-black">N</span> },
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
            <div className="flex items-center gap-0 divide-x divide-gray-100 bg-white">
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

              {/* 더 보기 — 셀 내부에 SVG 애노테이션 (원 + 돼지꼬리) */}
              <div
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 relative"
                style={{ overflow: 'visible' }}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span className="text-[9px] text-gray-400">더 보기</span>

                {/*
                  강조 원 + 돼지꼬리 화살표
                  · preserveAspectRatio="none" → viewBox가 실제 셀 크기에 정확히 맞게 늘어남
                  · viewBox "0 0 60 42" 기준:
                      - 타원: cx=30 cy=21 rx=28 ry=19 (셀 전체를 감쌈)
                      - 돼지꼬리: 원 상단(30,2)에서 시작 → 오른쪽으로 스윙 → 루프
                      - 화살촉 V: 원 상단을 가리키며 아래쪽으로 뾰족
                */}
                <svg
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: '100%',
                    overflow: 'visible', pointerEvents: 'none',
                  }}
                  viewBox="0 0 60 42"
                  preserveAspectRatio="none"
                  fill="none"
                >
                  {/* 강조 타원 — 셀 전체를 감쌈 */}
                  <ellipse cx="30" cy="21" rx="28" ry="19" stroke="#ef4444" strokeWidth="2.5"/>

                  {/* 직선 화살표 줄기 — 원 상단(30,2)에서 위로 */}
                  <line
                    x1="30" y1="-18"
                    x2="30" y2="2"
                    stroke="#ef4444"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* 화살촉 — V자 */}
                  <polyline
                    points="24,-8 30,2 36,-8"
                    stroke="#ef4444"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
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
          <p className="text-base font-bold text-gray-900">목록에서 <span className="font-black">'홈 화면에 추가'</span>를 탭하세요</p>
          <p className="text-sm text-gray-500 mt-0.5">더 보기 목록을 아래로 스크롤하면 나타납니다</p>
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {[
              { label: "즐겨찾기에 추가", highlight: false },
              { label: "홈 화면에 추가",  highlight: true  },
              { label: "마크업",          highlight: false },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${item.highlight ? "bg-blue-50" : ""} ${i > 0 ? "border-t border-gray-100" : ""}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${item.highlight ? "bg-blue-100" : "bg-gray-100"}`}>
                  {item.highlight ? (
                    <AddToHomeIcon className="w-4 h-4 text-blue-600" strokeWidth="2.5" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  )}
                </div>
                <span className={`text-sm font-medium ${item.highlight ? "text-blue-600 font-bold" : "text-gray-500"}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* Step 5 — Web App으로 열기 + 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={5} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">'Web App으로 열기' 켜고 <span className="font-black">추가</span> 탭</p>
          <p className="text-sm text-gray-500 mt-0.5">앱처럼 전체화면으로 실행하려면 반드시 켜세요</p>
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-700">Web App으로 열기</span>
            <div className="w-12 h-7 bg-green-500 rounded-full flex items-center justify-end px-0.5 shadow-inner shrink-0">
              <div className="w-6 h-6 bg-white rounded-full shadow" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">▶ 토글 켠 뒤 오른쪽 위 <span className="font-semibold">추가</span> 탭</p>
        </div>
      </div>
    </div>
  );
}


// ── iOS 15~25 3단계 안내 ───────────────────────────────────────────────────────
function Guide15() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">하단 가운데 공유 버튼을 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">화면 <span className="font-semibold text-gray-700">아래 가운데</span>의 공유(↑) 아이콘</p>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex flex-col items-center gap-1.5">
            <p className="text-xs text-blue-400 font-medium">화면 아래쪽 중앙</p>
            <div className="flex items-center gap-2">
              <ShareIcon className="w-6 h-6 text-blue-500" />
              <span className="text-blue-600 font-bold">공유</span>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">스크롤 후 '홈 화면에 추가' 탭</p>
          <p className="text-sm text-gray-500 mt-0.5">공유 메뉴를 아래로 스크롤하면 나타납니다</p>
          <div className="mt-3 flex justify-center">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-200 flex items-center justify-center">
                <AddToHomeIcon className="w-5 h-5 text-gray-600" />
              </div>
              <span className="text-gray-700 font-bold">홈 화면에 추가</span>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 위 '추가'를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 앱 아이콘이 추가됩니다!</p>
        </div>
      </div>
    </div>
  );
}

// ── iOS 14 이하 3단계 안내 ────────────────────────────────────────────────────
function Guide14() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 상단 공유 버튼을 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">화면 <span className="font-semibold text-gray-700">오른쪽 위</span>의 공유(↑) 아이콘</p>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex flex-col items-center gap-1.5">
            <p className="text-xs text-blue-400 font-medium">화면 위쪽 오른쪽</p>
            <div className="flex items-center gap-2">
              <ShareIcon className="w-6 h-6 text-blue-500" />
              <span className="text-blue-600 font-bold">공유</span>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">스크롤 후 '홈 화면에 추가' 탭</p>
          <p className="text-sm text-gray-500 mt-0.5">공유 메뉴를 아래로 스크롤하면 나타납니다</p>
          <div className="mt-3 flex justify-center">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-200 flex items-center justify-center">
                <AddToHomeIcon className="w-5 h-5 text-gray-600" />
              </div>
              <span className="text-gray-700 font-bold">홈 화면에 추가</span>
            </div>
          </div>
        </div>
      </div>

      <Divider />

      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 위 '추가'를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 앱 아이콘이 추가됩니다!</p>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function IOSInstallGuide() {
  const [, setLocation] = useLocation();
  const iosVersion = detectIOSVersion();
  const isIOS26Plus = iosVersion >= 26;
  const isIOS15Plus = iosVersion >= 15;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div
        className="bg-black px-6 flex-shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div className="pb-3 flex items-center gap-3">
          {/* 뒤로 가기 */}
          <button
            onClick={() => setLocation("/")}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 active:bg-white/20 transition-colors"
            aria-label="뒤로 가기"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          {/* Apple 로고 */}
          <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" fill="white">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.77M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/>
          </svg>
          <div>
            <h1 className="text-base font-extrabold text-white leading-tight">홈 화면에 앱 추가하기</h1>
            {/* iOS 버전 — 부제목 대체 */}
            <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block shrink-0" />
              {isIOS26Plus ? "iOS 26+ (iPhone 17+)" : isIOS15Plus ? "iOS 15~25" : "iOS 14 이하"}
            </p>
          </div>
        </div>
      </div>


      {/* 스크롤 가능한 단계 안내 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {isIOS26Plus ? <Guide26 /> : isIOS15Plus ? <Guide15 /> : <Guide14 />}
        </div>
      </div>


    </div>
  );
}
