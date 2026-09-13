import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Navigation from "./components/Navigation";
import OnboardingDialog from "./components/OnboardingDialog";
import RoleSelectDialog from "./components/RoleSelectDialog";
import { UserConfigProvider, useUserConfig } from "@/contexts/UserConfigContext";
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

import FactoryReset from "./pages/FactoryReset";
import Meal from "./pages/Meal";
import TeacherPage from "./pages/TeacherPage";
import TeacherAccount from "./pages/TeacherAccount";
import IOSInstallGuide from "./pages/IOSInstallGuide";
import IOSChromeInstallGuide from "./pages/IOSChromeInstallGuide";
import AppDownloadPage from "./pages/AppDownloadPage";
import Privacy from "./pages/Privacy";
import BetaTesterPage from "./pages/BetaTesterPage";
import { getPumasiCookie, setPumasiCookie, hasPumasiRedirectCookie, clearPumasiRedirectCookie } from "@/lib/pumasiCookie";
import { isMaintenanceBypassed, getMaintenanceBypassCookie } from "@/lib/browserDetect";
import { useGlobalNotificationWatcher } from "@/lib/notificationService";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/admin/factory-reset"} component={FactoryReset} />
      <Route path={"/meal"} component={Meal} />
      <Route path={"/teacher/account"} component={TeacherAccount} />
      <Route path={"/teacher-account"} component={TeacherAccount} />
      <Route path={"/teacher"} component={TeacherPage} />
      <Route path={"/teachers"} component={TeacherPage} />
      <Route path={"/ios-install-guide"} component={IOSInstallGuide} />
      <Route path={"/ios-chrome-install-guide"} component={IOSChromeInstallGuide} />
      <Route path={"/download"} component={AppDownloadPage} />
      <Route path={"/privacy"} component={Privacy} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isValidating, userRole, refreshRole, publicSettings, grade, classNum, studentNumber, studentName, teacherName } = useUserConfig();
  const [location, setLocation] = useLocation();

  // 전역 알림 감시: 모바일 복귀 / 화면 켜짐 / 탭 전환(0ms) 즉시 서버 동기화 및 푸시/토스트 표출
  useGlobalNotificationWatcher({
    role: userRole,
    grade,
    classNum,
    studentNumber,
    studentName,
    teacherName
  });
  const [isBetaTester, setIsBetaTester] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        if (sessionStorage.getItem('pumasi_session_view') === 'timetable') return false;
      } catch {}
    }
    return hasPumasiRedirectCookie();
  });

  const isTeacherRoute = location.startsWith("/teacher");
  const isAdminRoute = location.startsWith("/admin");
  const isMealRoute = location.startsWith("/meal");
  const isDownloadRoute = location === "/download";
  const isIOSGuideRoute = location === "/ios-install-guide" || location === "/ios-chrome-install-guide";
  const isPrivacyRoute = location === "/privacy";



  // 사이트 디자인설정 동적 적용 (제목 + 파비콘 + PWA 아이콘)
  useEffect(() => {
    fetch('/api/settings/public')
      .then(res => res.ok ? res.json() : null)
      .then(settings => {
        if (!settings) return;
        if (settings.site_title) {
          document.title = settings.site_title;
        }
        if (settings.site_favicon_url) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = settings.site_favicon_url;
        }
        const pwaIcon = settings.pwa_app_icon_url || settings.site_favicon_url || '/icon.svg';
        if (pwaIcon) {
          let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
          if (!appleLink) {
            appleLink = document.createElement('link');
            appleLink.rel = 'apple-touch-icon';
            document.head.appendChild(appleLink);
          }
          appleLink.href = pwaIcon;
        }

        const pwaTitle = settings.pwa_app_title || settings.site_title;
        if (pwaTitle) {
          let metaTitle = document.querySelector("meta[name='apple-mobile-web-app-title']") as HTMLMetaElement;
          if (!metaTitle) {
            metaTitle = document.createElement('meta');
            metaTitle.name = 'apple-mobile-web-app-title';
            document.head.appendChild(metaTitle);
          }
          metaTitle.content = pwaTitle;
        }
      })
      .catch(() => {}); // 실패 시 기본값 유지
  }, []);


  // IP 강제 지정 오픈 베타테스터: 클라이언트 쿠키 발급/갱신 및 품앗이 모드 즉시 활성화
  useEffect(() => {
    if (publicSettings?.is_force_beta_tester && !isAdminRoute) {
      setPumasiCookie();
      try { sessionStorage.removeItem('pumasi_session_view'); } catch {}
      setIsBetaTester(true);
    }
  }, [publicSettings?.is_force_beta_tester, isAdminRoute]);

  // /pumasi 경로 직접 접근 시 세션 해제 및 품앗이 화면 진입
  useEffect(() => {
    if (location === "/pumasi") {
      try { sessionStorage.removeItem('pumasi_session_view'); } catch {}
      setIsBetaTester(true);
    }
  }, [location]);

  // ── 교사 리다이렉트 ──────────────────────────────────────────────────────────
  // Rules of Hooks: 모든 useEffect는 반드시 어떠한 conditional return보다도 앞에 선언되어야 함!
  // 동작:
  //   1) 아래 동기 블록에서 return null → Dashboard가 단 한 프레임도 렌더되지 않음
  //   2) 이 useEffect가 실행 → setLocation("/teacher") → wouter 상태 업데이트
  //   3) 다음 렌더에서 /teacher 경로로 TeacherPage 렌더
  useEffect(() => {
    if (!isValidating && userRole === "teacher" && !isTeacherRoute && !isAdminRoute && !isMealRoute && !isPrivacyRoute) {
      setLocation("/teacher");
    }
  }, [isValidating, userRole, isTeacherRoute, isAdminRoute, isMealRoute, isPrivacyRoute]);

  // ── 점검 모드 확인 (Edge 통과 후 클라이언트 3-Layer detect() 판정) ─────────────
  const isMaintenanceActive = Boolean(
    !isAdminRoute &&
    !isPrivacyRoute &&
    publicSettings?.maintenance_mode?.active &&
    !publicSettings?.is_whitelisted &&
    !isMaintenanceBypassed(publicSettings)
  );

  if (isMaintenanceActive) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-red-100 p-8 flex flex-col items-center">
          {publicSettings?.site_favicon_url ? (
            <img 
              src={publicSettings.site_favicon_url} 
              alt="Logo" 
              className="w-16 h-16 object-contain mb-6"
            />
          ) : (
            <div className="text-red-500 mb-6 flex items-center justify-center">
              <ShieldAlert className="w-14 h-14" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">사이트 점검 중</h1>
          <p className="text-gray-600 mb-6 whitespace-pre-wrap">
            {publicSettings?.maintenance_mode?.message || "서버 점검 중입니다. 잠시 후 다시 접속해주세요."}
          </p>
          {publicSettings?.maintenance_mode?.endTime && (
            <p className="text-xs text-gray-400">
              점검 종료 예정: {new Date(publicSettings.maintenance_mode.endTime).toLocaleString('ko-KR')}
            </p>
          )}
        </div>
      </div>
    );
  }

  // 학기 키 검증 완료 전 — 아무 데이터도 렌더링하지 않음 (단, /privacy는 독립 접근 허용)
  if (isValidating && !isPrivacyRoute) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
          <div style={{ marginBottom: '8px', fontSize: '24px' }}>⏳</div>
          로딩 중...
        </div>
      </div>
    );
  }


  // useEffect(위)가 setLocation을 실행하기 전 1프레임 동안 null을 반환하여
  // Dashboard가 절대 보이지 않도록 막는다.
  if (userRole === "teacher" && !isTeacherRoute && !isAdminRoute && !isMealRoute && !isPrivacyRoute) {
    return null;
  }

  // Google Play 비공개 테스터(오픈채팅 품앗이) 쿠키가 존재하는 경우 전용 오목 페이지 렌더링
  if (isBetaTester && !isAdminRoute) {
    return (
      <>
        <Toaster />
        <BetaTesterPage
          onBack={() => {
            clearPumasiRedirectCookie();
            setIsBetaTester(false);
          }}
          hideBack={Boolean(publicSettings?.is_force_beta_tester)}
        />
      </>
    );
  }

  return (
    <>
      <Toaster />
      {!isAdminRoute && location !== "/admin/factory-reset" && location !== "/meal" && location !== "/teacher/account" && !isIOSGuideRoute && !isDownloadRoute && !isPrivacyRoute && (
        <div className={location === "/" || isTeacherRoute ? "sm:hidden" : ""}>
          <Navigation />
        </div>
      )}
      {/* 역할 미선택 시 역할 선택 다이얼로그 — 다운로드/가이드/개인정보 페이지에서는 숨김 */}
      {!isDownloadRoute && !isIOSGuideRoute && !isPrivacyRoute && (
        <RoleSelectDialog
          onRoleSelected={() => refreshRole()}
          onBetaSelected={() => {
            setPumasiCookie();
            setIsBetaTester(true);
          }}
        />
      )}
      {!isPrivacyRoute && <OnboardingDialog />}
      <Router />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <UserConfigProvider>
          <TooltipProvider>
            <AppContent />
          </TooltipProvider>
        </UserConfigProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
