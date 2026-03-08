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

// Android WebAPK Auto-Redirect (Only fires in non-standalone browser mode to avoid infinite loops)
if (typeof window !== 'undefined') {
  const isAndroid = /android/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  const isInAppBrowser = /KAKAOTALK|NAVER|FBAN|FBAV|Instagram|Line|Twitter|DaumApp/i.test(navigator.userAgent);
  const isSamsungBrowser = /SamsungBrowser/i.test(navigator.userAgent);

  const hasPwaCookie = typeof document !== 'undefined' && document.cookie.includes('pwa_standalone=1');

  // Track PWA Installation Status
  if (isStandalone) {
    document.cookie = "pwa_standalone=1; max-age=31536000; path=/";
  }

  // If on Android, in a standard browser, and not already standalone, attempt to launch intent
  if (isAndroid && !isStandalone && !isInAppBrowser) {
    const attempted = sessionStorage.getItem('pwa_redirect_attempted');

    // If we KNOW they installed it (has cookie), or if it's their first time loading in Chrome
    if (hasPwaCookie || (!attempted && !isSamsungBrowser)) {
      if (!attempted) {
        sessionStorage.setItem('pwa_redirect_attempted', 'true');
        const fallbackUrl = encodeURIComponent(window.location.href);
        const host = window.location.host;
        const protocol = window.location.protocol.replace(':', '');

        // If we know they have it, we use a generic intent to let Android pick the WebAPK regardless of browser (Chrome/Samsung).
        // If we don't know, we target Chrome specifically to handle the "Add to Homescreen" prompt seamlessly.
        const intentUrl = hasPwaCookie
          ? `intent://${host}/#Intent;scheme=${protocol};S.browser_fallback_url=${fallbackUrl};end`
          : `intent://${host}/#Intent;scheme=${protocol};package=com.android.chrome;S.browser_fallback_url=${fallbackUrl};end`;

        setTimeout(() => {
          window.location.href = intentUrl;
        }, 100);
      }
    }
  }
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
