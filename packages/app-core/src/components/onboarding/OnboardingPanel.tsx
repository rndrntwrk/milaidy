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
    <div className="flex flex-col justify-center py-10 pr-14 pl-0 relative z-10 max-md:p-4">
      <div 
        className="bg-[rgba(10,14,20,0.16)] backdrop-blur-[40px] backdrop-saturate-[1.4] border border-[rgba(255,255,255,0.18)] rounded-[10px] py-[36px] px-[32px] flex flex-col gap-0 shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] max-h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden animate-[onboarding-panel-enter_0.6s_cubic-bezier(0.25,0.46,0.45,0.94)_both]" 
        ref={panelRef}
      >
        {children}
      </div>
    </div>
  );
}
