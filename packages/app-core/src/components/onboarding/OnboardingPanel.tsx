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
    <div className="absolute right-0 top-0 bottom-0 z-10 flex w-full max-w-[460px] flex-col items-end justify-center py-10 pr-14 pl-0 max-md:relative max-md:max-w-none max-md:items-center max-md:p-4 max-md:pt-0">
      <div
        className="flex w-full flex-col gap-0 overflow-x-hidden overflow-y-auto rounded-[18px] border border-[var(--onboarding-panel-border)] bg-[var(--onboarding-panel-bg)] py-[36px] px-6 shadow-[var(--onboarding-panel-shadow)] backdrop-blur-[40px] backdrop-saturate-[1.4] animate-[onboarding-panel-enter_0.6s_cubic-bezier(0.25,0.46,0.45,0.94)_both] max-h-full max-md:max-h-[50vh] max-md:max-w-[calc(100vw-32px)] max-md:rounded-[16px] max-md:py-6 max-md:px-4"
        ref={panelRef}
      >
        {children}
      </div>
    </div>
  );
}
