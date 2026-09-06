import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { initGlobalErrorHandlers } from "./lib/autoErrorReporter";
import "./index.css";

// 글로벌 오류 핸들러 등록 (앱 마운트 전)
initGlobalErrorHandlers();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

// ── UA 기반 디바이스 클래스 주입 (React 마운트 전) ───────────────────────────
// 모바일 UA → is-mobile, PC UA (데스크톱 모드 포함) → is-pc
// Tailwind의 md: 브레이크포인트가 창 너비가 아닌 UA에 따라 동작하도록 함
if (typeof window !== 'undefined') {
  const ua = navigator.userAgent;
  // 표준 모바일 UA 패턴 (데스크톱 모드 시 UA가 바뀌어 아래에 매칭되지 않음)
  const mobileUA =
    /Mobile|Android|iPhone|iPod|BlackBerry|Windows Phone|Opera Mini|IEMobile|SamsungBrowser/i.test(ua);
  // iPadOS 13+: "MacIntel" + maxTouchPoints 로 감지 (UA에서 iPad 제거됨)
  const isiPad =
    /iPad/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobileBrowser = mobileUA || isiPad;
  document.documentElement.classList.add(isMobileBrowser ? 'is-mobile' : 'is-pc');
}

if (typeof window !== 'undefined') {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

  // Track PWA Installation Status
  if (isStandalone) {
    document.cookie = "pwa_standalone=1; max-age=31536000; path=/";
  }

  // Register beforeinstallprompt as early as possible, BEFORE React renders.
  // Samsung Internet fires this event very early on page load.
  // If we only listen inside a useEffect, the event will already be gone by the time
  // React mounts. Storing it globally guarantees Dashboard can always access it.
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|SamsungBrowser/i.test(navigator.userAgent);
    if (isMobile) {
      (window as any).__deferredPwaPrompt = e;
    }
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
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
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
