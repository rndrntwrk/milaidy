export interface PiCredentialProvider {
  getDefaultModelSpec(): Promise<string | null>;
  hasCredentials(provider: string): boolean;
  getApiKey(provider: string): string | undefined;
}

function envKeyForProvider(provider: string): string {
  const normalized = provider.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (normalized === "OPENAI") return "OPENAI_API_KEY";
  if (normalized === "ANTHROPIC") return "ANTHROPIC_API_KEY";
  if (normalized === "GEMINI" || normalized === "GOOGLE") {
    return "GOOGLE_GENERATIVE_AI_API_KEY";
  }
  return `${normalized}_API_KEY`;
}

export async function createPiCredentialProvider(): Promise<PiCredentialProvider> {
  return {
    async getDefaultModelSpec(): Promise<string | null> {
      const raw = process.env.PI_AI_MODEL_SPEC?.trim();
      return raw ? raw : null;
    },

    hasCredentials(provider: string): boolean {
      const key = envKeyForProvider(provider);
      return Boolean(process.env[key]?.trim());
    },

    getApiKey(provider: string): string | undefined {
      const key = envKeyForProvider(provider);
      const value = process.env[key]?.trim();
      return value ? value : undefined;
    },
  };
}
