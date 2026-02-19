import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px) or (hover: none)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT || window.matchMedia("(hover: none)").matches);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT || window.matchMedia("(hover: none)").matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
