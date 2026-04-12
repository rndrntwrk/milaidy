import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  disableTestRenderer,
  enableTestRenderer,
  installMatchMedia,
} from "../layout-test-utils";
import { ContentLayout } from "./content-layout";

describe("ContentLayout", () => {
  beforeEach(() => {
    enableTestRenderer();
  });

  afterEach(() => {
    disableTestRenderer();
  });

  it("renders its header inside the main content column", () => {
    installMatchMedia(true);

    render(
      <ContentLayout contentHeader={<div>Filters</div>}>
        <div>Body</div>
      </ContentLayout>,
    );

    const main = screen.getByRole("main");

    expect(main).toContainElement(screen.getByText("Filters"));
    expect(main).toContainElement(screen.getByText("Body"));
  });

  it("strips outer content padding when rendered in modal mode", () => {
    installMatchMedia(true);

    const { rerender } = render(
      <ContentLayout contentHeader={<div>Filters</div>}>
        <div>Body</div>
      </ContentLayout>,
    );

    expect(screen.getByRole("main").className).toContain("px-4");

    rerender(
      <ContentLayout contentHeader={<div>Filters</div>} inModal>
        <div>Body</div>
      </ContentLayout>,
    );

    expect(screen.getByRole("main").className).not.toContain("px-4");
    expect(screen.getByRole("main").className).not.toContain("sm:px-6");
  });
});
