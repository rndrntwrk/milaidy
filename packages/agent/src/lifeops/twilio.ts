export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromPhoneNumber: string;
}

export interface TwilioDeliveryResult {
  ok: boolean;
  status: number | null;
  sid?: string;
  error?: string;
}

function encodeBasicAuth(accountSid: string, authToken: string): string {
  return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

export function readTwilioCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TwilioCredentials | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const fromPhoneNumber = env.TWILIO_PHONE_NUMBER?.trim();
  if (!accountSid || !authToken || !fromPhoneNumber) {
    return null;
  }
  return {
    accountSid,
    authToken,
    fromPhoneNumber,
  };
}

async function sendTwilioRequest(args: {
  credentials: TwilioCredentials;
  path: string;
  payload: URLSearchParams;
}): Promise<TwilioDeliveryResult> {
  const { credentials, path, payload } = args;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}${path}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodeBasicAuth(
          credentials.accountSid,
          credentials.authToken,
        )}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
    };
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: data.message ?? `HTTP ${response.status}`,
      };
    }
    return {
      ok: true,
      status: response.status,
      sid: data.sid,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendTwilioSms(args: {
  credentials: TwilioCredentials;
  to: string;
  body: string;
}): Promise<TwilioDeliveryResult> {
  const { credentials, to, body } = args;
  return sendTwilioRequest({
    credentials,
    path: "/Messages.json",
    payload: new URLSearchParams({
      To: to,
      From: credentials.fromPhoneNumber,
      Body: body,
    }),
  });
}

export async function sendTwilioVoiceCall(args: {
  credentials: TwilioCredentials;
  to: string;
  message: string;
}): Promise<TwilioDeliveryResult> {
  const { credentials, to, message } = args;
  return sendTwilioRequest({
    credentials,
    path: "/Calls.json",
    payload: new URLSearchParams({
      To: to,
      From: credentials.fromPhoneNumber,
      Twiml: `<Response><Say>${message}</Say></Response>`,
    }),
  });
}
