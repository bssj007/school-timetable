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
import { useEffect } from "react";

import FactoryReset from "./pages/FactoryReset";
import Meal from "./pages/Meal";
import TeacherPage from "./pages/TeacherPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/admin/factory-reset"} component={FactoryReset} />
      <Route path={"/meal"} component={Meal} />
      <Route path={"/teacher"} component={TeacherPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isValidating, userRole, refreshRole } = useUserConfig();
  const [location, setLocation] = useLocation();

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
        if (settings.pwa_app_icon_url) {
          let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
          if (!appleLink) {
            appleLink = document.createElement('link');
            appleLink.rel = 'apple-touch-icon';
            document.head.appendChild(appleLink);
          }
          appleLink.href = settings.pwa_app_icon_url;
        }
      })
      .catch(() => {}); // 실패 시 기본값 유지
  }, []);

  // 학기 키 검증 완료 전 — 아무 데이터도 렌더링하지 않음
  if (isValidating) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
          <div style={{ marginBottom: '8px', fontSize: '24px' }}>⏳</div>
          로딩 중...
        </div>
      </div>
    );
  }

  // ── 교사 쿠키 확인 후 리다이렉트 — 렌더링 전 동기 처리 ──────────────────
  // isValidating 완료 시점에 렌더 트리에 Router(Dashboard)가 올라가기 전에 체크.
  // useEffect는 렌더 후 실행이므로 Dashboard가 한 프레임 보이는 문제를 막기 위해
  // 렌더 시점에 직접 분기한다.
  const isTeacherRoute = location.startsWith("/teacher");
  const isAdminRoute = location.startsWith("/admin");

  if (userRole === "teacher" && !isTeacherRoute && !isAdminRoute) {
    // wouter의 Redirect 컴포넌트 대신 location을 직접 교체
    // (렌더 중 setLocation 호출은 금지 → window.history로 즉시 교체)
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/teacher");
    }
    return null; // 이번 프레임은 아무것도 렌더하지 않음, 다음 렌더에서 /teacher로 표시
  }

  return (
    <>
      <Toaster />
      {!isAdminRoute && location !== "/admin/factory-reset" && location !== "/meal" && !isTeacherRoute && (
        <div className={location === "/" ? "md:hidden" : ""}>
          <Navigation />
        </div>
      )}
      {/* 역할 미선택 시 역할 선택 다이얼로그 */}
      <RoleSelectDialog onRoleSelected={() => refreshRole()} />
      <OnboardingDialog />
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
