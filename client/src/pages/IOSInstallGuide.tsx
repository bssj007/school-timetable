import { agent } from "@/lib/browserDetect";

// ── detect() 결과 직접 참조 ──────────────────────────────────────────────────
const { isIPad, isIPhone, iosVersion, isIOS26Plus, isIOS15Plus } = agent;
import { useLocation } from "wouter";

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

// ── iPad 안내 — iPadOS 14~25 ─────────────────────────────────────────────────
// 공유 버튼이 상단 주소창 우측에 항상 노출 (iPhone과 다름)
// 공유 시트에서 목록 스크롤하여 '홈 화면에 추가' 선택
function GuideIPadLegacy() {
  return (
    <div className="space-y-5">
      {/* Step 1 — 상단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">상단 주소창 옆 <span className="font-black">공유</span> 버튼을 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">주소창 오른쪽 끝, ↑ 박스 아이콘</p>
          {/* iPad 주소창 일러스트 */}
          <div className="mt-3 bg-gray-100 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-gray-200">
            <div className="flex-1 bg-white rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs text-gray-400 border border-gray-200">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="truncate">학교 시간표 사이트</span>
            </div>
            {/* 공유 버튼 강조 */}
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-white border-2 border-red-500 flex items-center justify-center shadow-sm">
                <ShareIcon className="w-4 h-4 text-blue-500" />
              </div>
              {/* 빨간 원 강조 */}
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
          <p className="text-base font-bold text-gray-900">공유 시트에서 <span className="font-black">'홈 화면에 추가'</span>를 찾으세요</p>
          <p className="text-sm text-gray-500 mt-0.5">목록을 아래로 스크롤해서 찾으세요</p>
          <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {[
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, label: "공유" },
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, label: "AirPlay" },
              { icon: <AddToHomeIcon className="w-5 h-5 text-gray-800" />, label: "홈 화면에 추가", highlight: true },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${item.highlight ? "bg-blue-50 border-l-4 border-blue-500" : "border-b border-gray-100"}`}>
                {item.icon}
                <span className={`text-sm ${item.highlight ? "text-blue-700 font-bold" : "text-gray-700"}`}>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">보이지 않으면 '동작 편집...'에서 추가할 수 있어요</p>
        </div>
      </div>

      <Divider />

      {/* Step 3 — 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={3} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">오른쪽 위 <span className="font-black">'추가'</span>를 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 앱 아이콘이 추가됩니다!</p>
        </div>
      </div>
    </div>
  );
}

// ── iPad 안내 — iPadOS 26+ ────────────────────────────────────────────────────
// iPhone iOS 26+와 동일하게, 공유 시트 하단에 '더 보기' 버튼이 생김
// 상단 주소창 공유 버튼 → 공유 시트 하단 더 보기 → 홈 화면에 추가
function GuideIPadNew() {
  return (
    <div className="space-y-5">
      {/* Step 1 — 상단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">상단 주소창 옆 <span className="font-black">공유</span> 버튼을 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">주소창 오른쪽 끝, ↑ 박스 아이콘</p>
          {/* iPad 주소창 일러스트 */}
          <div className="mt-3 bg-gray-100 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-gray-200">
            <div className="flex-1 bg-white rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs text-gray-400 border border-gray-200">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="truncate">학교 시간표 사이트</span>
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

          {/* 액션 바 일러스트 — iPad 최적화 (크게) */}
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
              {/* 더 보기 셀 — CSS 타원 강조 (위치 오차 없음) */}
              <div className="flex-1 flex items-center justify-center py-2" style={{ overflow: 'visible' }}>
                <div className="relative flex flex-col items-center">
                  {/* 위쪽 화살표 */}
                  <svg
                    className="absolute pointer-events-none"
                    style={{ bottom: 'calc(100% + 2px)', left: '50%', transform: 'translateX(-50%)' }}
                    width="14" height="22" viewBox="0 0 14 22" fill="none"
                  >
                    <line x1="7" y1="22" x2="7" y2="5" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
                    <polyline points="2,14 7,5 12,14" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {/* 타원 — CSS border + rounded-full */}
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
          <p className="text-base font-bold text-gray-900">목록에서 <span className="font-black">'홈 화면에 추가'</span>를 눌러요</p>
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
        </div>
      </div>
    </div>
  );
}

// ── iPhone iOS 26+ 안내 (iPhone 17 / iOS 26+) ────────────────────────────────
// 공유 버튼이 ··· 메뉴 안에 숨겨짐
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
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </div>
              <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
            <div className="flex-1 bg-gray-700 rounded-lg px-3 py-1.5 flex items-center justify-center">
              <span className="text-gray-300 text-xs truncate">학교 시간표 사이트</span>
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
          <p className="text-base font-bold text-gray-900">메뉴에서 <span className="font-black">'공유'</span>를 누르세요</p>
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
              {/* 더 보기 셀 — CSS 타원 강조 (위치 오차 없음) */}
              <div className="flex-1 flex items-center justify-center py-1.5" style={{ overflow: 'visible' }}>
                <div className="relative flex flex-col items-center">
                  {/* 위쪽 화살표 */}
                  <svg
                    className="absolute pointer-events-none"
                    style={{ bottom: 'calc(100% + 2px)', left: '50%', transform: 'translateX(-50%)' }}
                    width="12" height="18" viewBox="0 0 12 18" fill="none"
                  >
                    <line x1="6" y1="18" x2="6" y2="4" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
                    <polyline points="2,11 6,4 10,11" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {/* 타원 — CSS border + rounded-full */}
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
          <p className="text-base font-bold text-gray-900">목록에서 <span className="font-black">'홈 화면에 추가'</span>를 눌러요</p>
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
        </div>
      </div>
    </div>
  );
}

// ── iPhone iOS 15~25 안내 ─────────────────────────────────────────────────────
function Guide15() {
  return (
    <div className="space-y-5">
      {/* Step 1 — 하단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">화면 하단 가운데 <span className="font-black">공유</span> 버튼을 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">↑ 박스 모양 아이콘</p>
          <div className="mt-3 bg-gray-900 rounded-2xl px-4 py-3 flex items-center justify-around gap-2">
            {[
              <svg key="0" viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
              <svg key="1" viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
              <div key="2" className="relative">
                <ShareIcon className="w-5 h-5 text-white" />
                <div className="absolute -inset-2 rounded-full border-2 border-red-400 pointer-events-none" />
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
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 앱 아이콘이 추가됩니다!</p>
        </div>
      </div>
    </div>
  );
}

// ── iPhone iOS 14 이하 안내 ───────────────────────────────────────────────────
function Guide14() {
  return (
    <div className="space-y-5">
      {/* Step 1 — 상단 공유 버튼 */}
      <div className="flex items-start gap-4">
        <StepBadge n={1} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">주소창 오른쪽 <span className="font-black">공유</span> 버튼을 누르세요</p>
          <p className="text-sm text-gray-500 mt-0.5">상단 주소창 오른쪽 끝 ↑ 박스 아이콘</p>
        </div>
      </div>

      <Divider />

      {/* Step 2 — 홈 화면에 추가 */}
      <div className="flex items-start gap-4">
        <StepBadge n={2} />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900"><span className="font-black">'홈 화면에 추가'</span>를 누르세요</p>
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
          <p className="text-sm text-gray-500 mt-0.5">홈 화면에 앱 아이콘이 추가됩니다!</p>
        </div>
      </div>
    </div>
  );
}

// ── 기기/버전별 레이블 ────────────────────────────────────────────────────────
function deviceLabel(isIpad: boolean): string {
  if (isIpad && iosVersion >= 26) return "iPad (iPadOS 26+)";
  if (isIpad) return "iPad (iPadOS ~25)";
  if (iosVersion >= 26) return "iOS 26+ (iPhone 17+)";
  if (iosVersion >= 15) return "iOS 15~25";
  return "iOS 14 이하";
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function IOSInstallGuide() {
  const [, setLocation] = useLocation();
  // iosVersion, isIOS26Plus, isIOS15Plus — @/lib/browserDetect (agent.iosVersion) 에서 직접 import

  // iPad 우선 분기
  const showIPadGuide = isIPad;

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
            <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block shrink-0" />
              {deviceLabel(showIPadGuide)}
            </p>
          </div>
        </div>
      </div>

      {/* 스크롤 가능한 단계 안내 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {showIPadGuide
            ? isIOS26Plus
              ? <GuideIPadNew />       // iPadOS 26+ — 하단 더보기 경유
              : <GuideIPadLegacy />    // iPadOS ~25  — 스크롤로 홈화면에 추가
            : isIOS26Plus
              ? <Guide26 />
              : isIOS15Plus
                ? <Guide15 />
                : <Guide14 />}
        </div>
      </div>
    </div>
  );
}
