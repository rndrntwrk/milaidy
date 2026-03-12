import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { AvatarSelector } from "../../src/components/AvatarSelector.js";

describe("AvatarSelector preview rendering", () => {
  it("uses the dedicated Alice preview asset for slot 1", async () => {
    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        <AvatarSelector
          selected={1}
          onSelect={() => {}}
          showUpload={false}
          fullWidth
        />,
      );
    });

    const images = renderer?.root.findAllByType("img") ?? [];
    const previewSources = images.map((image) => image.props.src);

    expect(previewSources).toContain("/vrms/previews/alice.png");
    expect(previewSources).not.toContain("/vrms/previews/alice-stage.svg");
    expect(previewSources).not.toContain("/vrms/previews/milady-1.png");
  });
});
