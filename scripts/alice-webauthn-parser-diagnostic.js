// Read-only DevTools expression: synthetic bytes, no credential ceremony or network.
// This checks native JSON conversion only, not registration or real discovery.
(() => {
  if (typeof globalThis.PublicKeyCredential?.parseRequestOptionsFromJSON !== "function") {
    return JSON.stringify({ supported: false });
  }
  const encode = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const idBytes = new Uint8Array([0, 255, 128, 1, 254, 127, 2, 253, 64, 192, 3, 252, 63, 129, 4, 251]);
  const challengeBytes = new Uint8Array(32);
  for (let i = 0; i < challengeBytes.length; i += 1) challengeBytes[i] = i;
  const cases = [[], ["internal"], ["usb", "nfc"], ["hybrid"]].map((transports) => {
    const parsed = PublicKeyCredential.parseRequestOptionsFromJSON({
      challenge: encode(challengeBytes),
      rpId: "alice.rndrntwrk.com",
      timeout: 300000,
      userVerification: "required",
      allowCredentials: [{ type: "public-key", id: encode(idBytes), transports }],
    });
    const actualId = Array.from(new Uint8Array(parsed.allowCredentials[0].id));
    const actualChallenge = Array.from(new Uint8Array(parsed.challenge));
    return {
      rpId: parsed.rpId,
      userVerification: parsed.userVerification,
      timeout: parsed.timeout,
      allowedCount: parsed.allowCredentials.length,
      idBytesMatch: actualId.length === idBytes.length && actualId.every((value, i) => value === idBytes[i]),
      challengeBytesMatch: actualChallenge.length === challengeBytes.length && actualChallenge.every((value, i) => value === challengeBytes[i]),
      transportsMatch: JSON.stringify(parsed.allowCredentials[0].transports) === JSON.stringify(transports),
      transports: parsed.allowCredentials[0].transports,
    };
  });
  return JSON.stringify({ supported: true, syntheticOnly: true, cases });
})()
