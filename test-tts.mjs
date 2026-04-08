try {
  const mod = await import("@elizaos/plugin-edge-tts/node");
  console.log("node success", Object.keys(mod));
} catch (e) {
  console.error("node fail", e.message);
  try {
    const rootMod = await import("@elizaos/plugin-edge-tts");
    console.log("root success", Object.keys(rootMod));
  } catch (e2) {
    console.error("root fail", e2.message);
  }
}
