import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  disableTestRenderer,
  enableTestRenderer,
  installMatchMedia,
  SidebarProbe,
} from "../layout-test-utils";
import { PageLayout } from "./page-layout";

describe("PageLayout", () => {
  beforeEach(() => {
    enableTestRenderer();
  });

  afterEach(() => {
    disableTestRenderer();
  });

  it("enables the collapsible desktop sidebar by default", () => {
    installMatchMedia(true);

    render(
      <PageLayout sidebar={<SidebarProbe mobileTitle="Browse" />}>
        <div>Content</div>
      </PageLayout>,
    );

    expect(screen.getByText("variant:default")).toBeInTheDocument();
    expect(screen.getByText("collapsible:true")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Browse" }),
    ).not.toBeInTheDocument();
  });

  it("opens the mobile drawer and injects a mobile sidebar clone", () => {
    installMatchMedia(false);

    render(
      <PageLayout sidebar={<SidebarProbe mobileTitle="Browse" />}>
        <div>Content</div>
      </PageLayout>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Browse" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("variant:mobile")).toBeInTheDocument();
    expect(within(dialog).getByText("collapsible:false")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));
    expect(screen.queryByText("variant:mobile")).not.toBeInTheDocument();
  });

  it("renders shared content headers inside the content column", () => {
    installMatchMedia(true);

    render(
      <PageLayout
        sidebar={<SidebarProbe mobileTitle="Browse" />}
        contentHeader={<div>Tabs</div>}
      >
        <div>Content</div>
      </PageLayout>,
    );

    expect(screen.getByText("Tabs")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders the shared footer slot below the content region", () => {
    installMatchMedia(true);

    render(
      <PageLayout
        sidebar={<SidebarProbe mobileTitle="Browse" />}
        footer={<div>Widget slot</div>}
      >
        <div>Content</div>
      </PageLayout>,
    );

    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Widget slot")).toBeInTheDocument();
  });
});
