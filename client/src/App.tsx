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
import { ShieldAlert } from "lucide-react";

import FactoryReset from "./pages/FactoryReset";
import Meal from "./pages/Meal";
import TeacherPage from "./pages/TeacherPage";
import TeacherAccount from "./pages/TeacherAccount";

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
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isValidating, userRole, refreshRole, publicSettings, grade } = useUserConfig();
  const [location, setLocation] = useLocation();

  const isTeacherRoute = location.startsWith("/teacher");
  const isAdminRoute = location.startsWith("/admin");

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

  // ── 점검 모드 감지 시 강제 새로고침 (Edge 차단 페이지로 전환 및 메모리 클리어) ──────
  useEffect(() => {
    if (isAdminRoute) return;
    if (publicSettings?.maintenance_mode?.active && !publicSettings?.is_whitelisted) {
      window.location.reload();
    }
  }, [publicSettings, isAdminRoute]);

  // ── 교사 리다이렉트 ──────────────────────────────────────────────────────────
  // Rules of Hooks: useEffect는 반드시 conditional return 앞에 선언해야 함.
  // 동작:
  //   1) 아래 동기 블록에서 return null → Dashboard가 단 한 프레임도 렌더되지 않음
  //   2) 이 useEffect가 실행 → setLocation("/teacher") → wouter 상태 업데이트
  //   3) 다음 렌더에서 /teacher 경로로 TeacherPage 렌더
  useEffect(() => {
    if (!isValidating && userRole === "teacher" && !isTeacherRoute && !isAdminRoute) {
      setLocation("/teacher");
    }
  }, [isValidating, userRole, isTeacherRoute, isAdminRoute]);

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

  // ── 교사 쿠키 확인 후 리다이렉트 — Dashboard 플래시 방지 ─────────────────
  // useEffect(위)가 setLocation을 실행하기 전 1프레임 동안 null을 반환하여
  // Dashboard가 절대 보이지 않도록 막는다.
  if (userRole === "teacher" && !isTeacherRoute && !isAdminRoute) {
    return null;
  }

  return (
    <>
      <Toaster />
      {!isAdminRoute && location !== "/admin/factory-reset" && location !== "/meal" && location !== "/teacher/account" && (
        <div className={location === "/" || isTeacherRoute ? "md:hidden" : ""}>
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
