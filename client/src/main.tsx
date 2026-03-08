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

  // If on Android, in a standard browser, and not already standalone, attempt to launch intent
  // Note: Modern browsers require a user gesture to fire an intent, but we can try opening the fallback intent implicitly
  // which prompts "Open in App" or auto-intercepts if the WebAPK is strongly bound.
  // We exclude SamsungBrowser because forcing package=com.android.chrome kicks them out of their browser entirely.
  if (isAndroid && !isStandalone && !isInAppBrowser && !isSamsungBrowser) {
    // Only attempt once per session to avoid annoying the user if they explicitly chose to stay in Chrome
    if (!sessionStorage.getItem('pwa_redirect_attempted')) {
      sessionStorage.setItem('pwa_redirect_attempted', 'true');
      const currentUrl = encodeURIComponent(window.location.href);
      // Constructing an Android intent. host=www.example.com etc isn't perfectly dynamic without parsing location
      const fallbackUrl = encodeURIComponent(window.location.href);
      const host = window.location.host;
      // Provide an intent link. Note package is generic Chrome since WebAPK packages are randomized hash names,
      // but Chrome handles the intent resolution and pops open the PWA if matched.
      const intentUrl = `intent://${host}/#Intent;scheme=${window.location.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${fallbackUrl};end`;

      // Briefly wait for DOM to be ready just in case
      setTimeout(() => {
        window.location.href = intentUrl;
      }, 500);
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
