import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../router";

// Create a non-expired JWT for tests (exp far in the future)
const futureExp = Math.floor(Date.now() / 1000) + 86400;
const mockPayload = btoa(JSON.stringify({ sub: "test", exp: futureExp }));
const MOCK_TOKEN = `header.${mockPayload}.signature`;

beforeEach(() => {
  localStorage.setItem("milady-cloud-token", MOCK_TOKEN);
});

afterEach(() => {
  localStorage.removeItem("milady-cloud-token");
  cleanup();
});

describe("Router", () => {
  it("renders homepage at /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(document.querySelector("#top")).toBeTruthy();
  });

  it("renders dashboard at /dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dashboard")).toBeTruthy();
  });
});
