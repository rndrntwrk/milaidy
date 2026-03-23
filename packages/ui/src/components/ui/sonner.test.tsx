import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

import { Toaster } from "./sonner";

describe("Toaster (sonner)", () => {
  it("renders without crashing", () => {
    const { container } = render(<Toaster />);
    expect(container).toBeTruthy();
  });

  it("renders with custom props without crashing", () => {
    const { container } = render(<Toaster position="top-right" />);
    expect(container).toBeTruthy();
  });
});
