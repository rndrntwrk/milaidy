/**
 * Tool contracts for media actions.
 *
 * Covers GENERATE_IMAGE, GENERATE_VIDEO, GENERATE_AUDIO, and ANALYZE_IMAGE.
 *
 * @module autonomy/tools/schemas/media
 */

import { z } from "zod";
import type { ToolContract } from "../types.js";

// ---------- GENERATE_IMAGE ----------

export const GenerateImageParams = z
  .object({
    prompt: z.string().min(1, "Prompt must not be empty"),
    size: z.string().optional(),
    quality: z.enum(["standard", "hd"]).optional(),
    style: z.enum(["vivid", "natural"]).optional(),
    negativePrompt: z.string().optional(),
  })
  .strict();

export type GenerateImageParams = z.infer<typeof GenerateImageParams>;

export const GENERATE_IMAGE: ToolContract<GenerateImageParams> = {
  name: "GENERATE_IMAGE",
  description: "Generate an image from a text prompt using AI",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: GenerateImageParams,
  requiredPermissions: ["ai:inference", "net:outbound:https"],
  sideEffects: [
    {
      description: "Makes API calls to an AI image generation service",
      resource: "network",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 120_000,
  tags: ["media", "ai", "image"],
};

// ---------- GENERATE_VIDEO ----------

export const GenerateVideoParams = z
  .object({
    prompt: z.string().min(1, "Prompt must not be empty"),
    duration: z.number().positive().optional(),
    aspectRatio: z.string().optional(),
    imageUrl: z.string().url().optional(),
  })
  .strict();

export type GenerateVideoParams = z.infer<typeof GenerateVideoParams>;

export const GENERATE_VIDEO: ToolContract<GenerateVideoParams> = {
  name: "GENERATE_VIDEO",
  description: "Generate a video from a text prompt using AI",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: GenerateVideoParams,
  requiredPermissions: ["ai:inference", "net:outbound:https"],
  sideEffects: [
    {
      description: "Makes API calls to an AI video generation service",
      resource: "network",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 300_000,
  tags: ["media", "ai", "video"],
};

// ---------- GENERATE_AUDIO ----------

export const GenerateAudioParams = z
  .object({
    prompt: z.string().min(1, "Prompt must not be empty"),
    duration: z.number().positive().optional(),
    instrumental: z.boolean().optional(),
    genre: z.string().optional(),
  })
  .strict();

export type GenerateAudioParams = z.infer<typeof GenerateAudioParams>;

export const GENERATE_AUDIO: ToolContract<GenerateAudioParams> = {
  name: "GENERATE_AUDIO",
  description: "Generate audio from a text prompt using AI",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: GenerateAudioParams,
  requiredPermissions: ["ai:inference", "net:outbound:https"],
  sideEffects: [
    {
      description: "Makes API calls to an AI audio generation service",
      resource: "network",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 180_000,
  tags: ["media", "ai", "audio"],
};

// ---------- ANALYZE_IMAGE ----------

export const AnalyzeImageParams = z
  .object({
    imageUrl: z.string().url().optional(),
    imageBase64: z.string().optional(),
    prompt: z.string().optional(),
    maxTokens: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (data) => data.imageUrl !== undefined || data.imageBase64 !== undefined,
    { message: "Either imageUrl or imageBase64 must be provided" },
  );

export type AnalyzeImageParams = z.infer<typeof AnalyzeImageParams>;

export const ANALYZE_IMAGE: ToolContract<AnalyzeImageParams> = {
  name: "ANALYZE_IMAGE",
  description: "Analyze an image using AI vision capabilities",
  version: "1.0.0",
  riskClass: "read-only",
  paramsSchema: AnalyzeImageParams,
  requiredPermissions: ["ai:inference"],
  sideEffects: [],
  requiresApproval: false,
  timeoutMs: 60_000,
  tags: ["media", "ai", "image", "analysis"],
};
