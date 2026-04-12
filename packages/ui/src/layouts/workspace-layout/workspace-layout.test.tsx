import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  disableTestRenderer,
  enableTestRenderer,
  installMatchMedia,
  SidebarProbe,
} from "../layout-test-utils";
import { WorkspaceLayout } from "./workspace-layout";

describe("WorkspaceLayout", () => {
  beforeEach(() => {
    enableTestRenderer();
  });

  afterEach(() => {
    disableTestRenderer();
  });

  it("renders outside headers ahead of the main content region", () => {
    installMatchMedia(true);

    render(
      <WorkspaceLayout
        sidebar={<SidebarProbe mobileTitle="Browse" />}
        contentHeader={<div>Tabs</div>}
        headerPlacement="outside"
      >
        <div>Content</div>
      </WorkspaceLayout>,
    );

    const main = screen.getByRole("main");
    const header = screen.getByText("Tabs");

    expect(main).not.toContainElement(header);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders inside headers within the scrollable main region", () => {
    installMatchMedia(true);

    render(
      <WorkspaceLayout
        sidebar={<SidebarProbe mobileTitle="Browse" />}
        contentHeader={<div>Tabs</div>}
        headerPlacement="inside"
      >
        <div>Content</div>
      </WorkspaceLayout>,
    );

    const main = screen.getByRole("main");

    expect(main).toContainElement(screen.getByText("Tabs"));
    expect(main).toContainElement(screen.getByText("Content"));
  });

  it("respects an explicit non-collapsible sidebar override", () => {
    installMatchMedia(true);

    render(
      <WorkspaceLayout
        sidebar={<SidebarProbe mobileTitle="Browse" />}
        sidebarCollapsible={false}
      >
        <div>Content</div>
      </WorkspaceLayout>,
    );

    expect(screen.getByText("collapsible:false")).toBeInTheDocument();
  });
});
