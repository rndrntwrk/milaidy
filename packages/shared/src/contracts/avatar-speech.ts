export const AVATAR_FACE_VISEMES = [
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
] as const;

export type AvatarFaceViseme = (typeof AVATAR_FACE_VISEMES)[number];

export const AVATAR_FACE_EXPRESSIONS = [
  "relaxed",
  "happy",
  "sad",
  "angry",
  "surprised",
] as const;

export type AvatarFaceExpression = (typeof AVATAR_FACE_EXPRESSIONS)[number];

export interface AvatarSpeechCapabilities {
  speechMotionPath?: string | null;
  supportedVisemes: AvatarFaceViseme[];
  supportedExpressions: AvatarFaceExpression[];
  advancedFaceDriver: boolean;
}

export interface AvatarSpeechManifest {
  avatarKey: string;
  version: 1;
  capabilities: AvatarSpeechCapabilities;
}

export interface AvatarFaceFrame {
  sessionId: string;
  avatarKey: string;
  speaking: boolean;
  ended?: boolean;
  mouthOpen: number;
  visemes?: Partial<Record<AvatarFaceViseme, number>>;
  expressions?: Partial<Record<AvatarFaceExpression, number>>;
  sequence?: number;
}
