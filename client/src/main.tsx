import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { agent } from "@/lib/browserDetect";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { initGlobalErrorHandlers, checkAndReportD1Error } from "./lib/autoErrorReporter";
import "./index.css";

// 글로벌 오류 핸들러 등록 (앱 마운트 전)
initGlobalErrorHandlers();

if ('serviceWorker' in navigator && typeof window !== 'undefined') {
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  const isMobile = agent.isMobile;

  // PWA 환경이거나 모바일인 경우에만 PWA 오프라인 지원 및 백그라운드 푸시용 Service Worker 등록
  if (isPWA || isMobile) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(registration => {
        console.log('SW registered: ', registration);
      }).catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
    });
  } else {
    // 일반 데스크톱 브라우저: 푸시 알림 및 PWA 설치 제외, 리소스 정리
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) {
        registration.unregister();
      }
    }).catch(() => {});

    const manifestLink = document.querySelector("link[rel='manifest']");
    if (manifestLink) {
      manifestLink.remove();
    }
  }
}

// 모바일/데스크톱 환경별 분기 처리
if (typeof window !== 'undefined') {
  // 데스크톱 환경에서는 manifest 태그를 선제적으로 제거 (주소창 설치 유도 아이콘 방지)
  if (agent.isDesktop) {
    const manifestLink = document.querySelector("link[rel='manifest']");
    if (manifestLink) {
      manifestLink.remove();
    }
  }

  // Firefox 브라우저 감지 시 html 태그에 클래스 주입 (전용 비대증 방지 CSS 룰 연동)
  if (agent.isFirefox) {
    document.documentElement.classList.add('is-firefox');
  }

  // 앱(PWA standalone 또는 WebView)으로 실행 중인 경우 세션 쿠키 설정 (서버 로그 및 ip_profiles에 앱 접속 이력 기록)
  if (agent.isInstalledApp) {
    document.cookie = "sj_app_mode=1; path=/; SameSite=Lax";
  }


  // Register beforeinstallprompt as early as possible, BEFORE React renders.
  // Samsung Internet & Chromium fire this event early or during PWA validation.
  // Storing it globally guarantees AppDownloadPage & Dashboard can always access it.
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    (window as any).__deferredPwaPrompt = e;
    try {
      window.dispatchEvent(new CustomEvent('pwa-prompt-ready', { detail: e }));
    } catch {}
  });
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    checkAndReportD1Error(error, "React Query Cache");
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    checkAndReportD1Error(error, "React Mutation Cache");
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// AUTO-MIGRATION removed: The migrate_db endpoint previously dropped student_profiles,
// destroying all elective data. Migration should only be triggered manually from the Admin panel.

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
