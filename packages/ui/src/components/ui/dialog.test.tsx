import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./dialog";

describe("Dialog", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
    delete document.body.dataset.miladyDialogOpen;
    delete (window as Window & { __MILADY_OPEN_DIALOG_COUNT__?: number })
      .__MILADY_OPEN_DIALOG_COUNT__;
  });

  it("renders trigger button", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("opens content on trigger click", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Title</DialogTitle>
            <DialogDescription>My Description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("My Description")).toBeInTheDocument();
  });

  it("shows title and description", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Title</DialogTitle>
            <DialogDescription>Test Description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test Description")).toBeInTheDocument();
  });

  it("close button is rendered inside content", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("can hide the default close button", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText("Close")).toBeNull();
  });

  it("does not mark the body when content is mounted closed", async () => {
    render(
      <Dialog open={false}>
        <DialogContent forceMount>
          <DialogHeader>
            <DialogTitle>Closed Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    await waitFor(() => {
      expect(document.body.dataset.miladyDialogOpen).toBeUndefined();
    });
  });

  it("marks the body only while the dialog is open", async () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent forceMount>
          <DialogHeader>
            <DialogTitle>Tracked Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    expect(document.body.dataset.miladyDialogOpen).toBeUndefined();

    fireEvent.click(screen.getByText("Open"));
    await waitFor(() => {
      expect(document.body.dataset.miladyDialogOpen).toBe("true");
    });

    fireEvent.click(screen.getByText("Close"));
    await waitFor(() => {
      expect(document.body.dataset.miladyDialogOpen).toBeUndefined();
    });
  });
});
