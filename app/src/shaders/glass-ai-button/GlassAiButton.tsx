import { useEffect, useRef, useState, type CSSProperties } from "react";

import sourceDocument from "./sources/glass-ai-button.html?raw";

export type GlassAiButtonProps = {
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  triggerJarvis?: boolean;
};

export function GlassAiButton({
  className = "",
  style,
  onClick,
  triggerJarvis = true,
}: GlassAiButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [documentVisible, setDocumentVisible] = useState(() => (
    typeof document === "undefined" || !document.hidden
  ));
  // Without IntersectionObserver there is no way to know, so assume visible.
  const [hostVisible, setHostVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "GLASS_AI_BUTTON_CLICK") {
        onClick?.();
        if (triggerJarvis) {
          // Slight delay to allow the satisfying particle burst animation to start
          setTimeout(() => {
            window.dispatchEvent(new Event("jarvis:open"));
          }, 350);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onClick, triggerJarvis]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setHostVisible(entry?.isIntersecting ?? true);
    }, { rootMargin: "80px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const update = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const mounted = hostVisible && documentVisible;

  // A fresh iframe has to load again, so reset `ready` whenever it remounts.
  const [prevMounted, setPrevMounted] = useState(mounted);
  if (prevMounted !== mounted) {
    setPrevMounted(mounted);
    setReady(false);
  }

  return (
    <div
      ref={hostRef}
      className={`threeui-background glass-ai-button${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Interactive glass AI button"
      data-state={!mounted ? "paused" : ready ? "ready" : "loading"}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#a8b0bd",
        pointerEvents: "auto",
        ...style,
      }}
    >
      {mounted ? (
        <iframe
          title="Glass AI Button"
          srcDoc={sourceDocument}
          sandbox="allow-scripts"
          loading="eager"
          onLoad={() => setReady(true)}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            width: "100%",
            height: "100%",
            border: 0,
            background: "#a8b0bd",
            opacity: ready ? 1 : 0,
            pointerEvents: ready ? "auto" : "none",
            transition: "opacity 240ms ease-out",
          }}
        />
      ) : null}
    </div>
  );
}
