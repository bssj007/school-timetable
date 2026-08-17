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

  // 쿠키 역할이 teacher이면 자동으로 /teacher로 리다이렉트 (지연 없음)
  useEffect(() => {
    if (!isValidating && userRole === "teacher" && !location.startsWith("/teacher") && !location.startsWith("/admin")) {
      setLocation("/teacher");
    }
  }, [isValidating, userRole, location]);

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

  return (
    <>
      <Toaster />
      {location !== "/admin" && location !== "/admin/factory-reset" && location !== "/meal" && location !== "/teacher" && (
        <div className={location === "/" ? "md:hidden" : ""}>
          <Navigation />
        </div>
      )}
      {/* 역할 미선택 시 도엄말 먹이주는 역할 선택 다이얼로그 */}
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
