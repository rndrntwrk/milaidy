import type { OnboardingStep } from "@miladyai/app-core/state";
import { type ReactNode, useEffect, useRef } from "react";

interface OnboardingPanelProps {
  step: OnboardingStep;
  children: ReactNode;
}

export function OnboardingPanel({ step, children }: OnboardingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef(step);

  // Re-trigger entry animation on step change
  useEffect(() => {
    if (prevStepRef.current !== step && panelRef.current) {
      const panel = panelRef.current;
      panel.style.animation = "none";
      // Force reflow
      void panel.offsetHeight;
      panel.style.animation = "";

      // Re-trigger children stagger
      panel.querySelectorAll<HTMLElement>(":scope > *").forEach((child) => {
        child.style.animation = "none";
        void child.offsetHeight;
        child.style.animation = "";
      });
    }
    prevStepRef.current = step;
  }, [step]);

  return (
    <div className="absolute right-0 top-0 bottom-0 z-10 flex min-h-0 w-full max-w-[min(100%,30rem)] flex-col items-end justify-center py-[clamp(1rem,5vh,2.25rem)] pr-[clamp(1rem,3.6vw,3rem)] pl-0 max-lg:max-w-[min(100%,27rem)] max-lg:pr-7 max-md:relative max-md:max-w-none max-md:items-stretch max-md:justify-end max-md:px-4 max-md:pb-4 max-md:pt-2">
      <div
        className="onboarding-panel relative isolate flex max-h-full min-h-0 w-full max-w-[28.5rem] flex-col gap-0 overflow-x-hidden overflow-y-auto rounded-[20px] border border-[var(--onboarding-panel-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012)_26%,transparent_52%),linear-gradient(180deg,rgba(11,14,20,0.18),rgba(11,14,20,0.04)),var(--onboarding-panel-bg)] py-[clamp(1.35rem,3.2vw,1.95rem)] px-[clamp(1rem,2.7vw,1.35rem)] shadow-[0_24px_56px_rgba(0,0,0,0.22)] ring-1 ring-white/6 backdrop-blur-[30px] backdrop-saturate-[1.18] before:pointer-events-none before:absolute before:inset-[1px] before:rounded-[calc(20px-1px)] before:bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_22%)] before:content-[''] animate-[onboarding-panel-enter_0.6s_cubic-bezier(0.25,0.46,0.45,0.94)_both] max-md:max-h-[min(60dvh,calc(100dvh-8.5rem))] max-md:max-w-none max-md:rounded-[16px] max-md:before:rounded-[calc(16px-1px)]"
        ref={panelRef}
      >
        {children}
      </div>
    </div>
  );
}
