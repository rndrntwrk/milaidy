export type ProStreamerFeedbackTone =
  | "info"
  | "success"
  | "warning"
  | "error";

export type ProStreamerFeedbackTarget =
  | "toast"
  | "go-live-inline"
  | "action-log-inline"
  | "modal";

export type ProStreamerToastFeedback = {
  target: "toast";
  tone: ProStreamerFeedbackTone;
  message: string;
  ttlMs?: number;
};

export type ProStreamerGoLiveInlineFeedback = {
  target: "go-live-inline";
  tone: ProStreamerFeedbackTone;
  message: string;
};

export type ProStreamerActionLogInlineFeedback = {
  target: "action-log-inline";
  tone: ProStreamerFeedbackTone;
  title?: string;
  message: string;
  actionLabel?: string;
};

export type ProStreamerModalFeedback = {
  target: "modal";
  tone: ProStreamerFeedbackTone;
  title?: string;
  message: string;
};

export type ProStreamerFeedback =
  | ProStreamerToastFeedback
  | ProStreamerGoLiveInlineFeedback
  | ProStreamerActionLogInlineFeedback
  | ProStreamerModalFeedback;

export interface ProStreamerFeedbackSinks {
  showToast: (feedback: ProStreamerToastFeedback) => void;
  showGoLiveInline: (
    feedback: ProStreamerGoLiveInlineFeedback | ProStreamerModalFeedback,
  ) => void;
  showActionLogInline: (feedback: ProStreamerActionLogInlineFeedback) => void;
  showModal: (feedback: ProStreamerModalFeedback) => void;
  openActionLog: () => void;
}

export function routeProStreamerFeedback(
  feedback: ProStreamerFeedback,
  sinks: ProStreamerFeedbackSinks,
): ProStreamerFeedbackTarget {
  switch (feedback.target) {
    case "toast":
      sinks.showToast(feedback);
      return feedback.target;
    case "go-live-inline":
      sinks.showGoLiveInline(feedback);
      return feedback.target;
    case "action-log-inline":
      sinks.showActionLogInline(feedback);
      sinks.openActionLog();
      return feedback.target;
    case "modal":
      sinks.showModal(feedback);
      return feedback.target;
    default: {
      const exhaustiveCheck: never = feedback;
      return exhaustiveCheck;
    }
  }
}
