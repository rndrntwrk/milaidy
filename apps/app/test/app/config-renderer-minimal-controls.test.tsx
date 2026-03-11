// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import {
  ConfigRenderer,
  defaultRegistry,
} from "../../src/components/config-renderer.js";

const searchableOptions = [
  { value: "alpha", label: "Alpha" },
  { value: "bravo", label: "Bravo" },
  { value: "charlie", label: "Charlie" },
  { value: "delta", label: "Delta" },
  { value: "echo", label: "Echo" },
  { value: "foxtrot", label: "Foxtrot" },
];

const schema = {
  type: "object",
  properties: {
    channel: {
      type: "string",
      enum: searchableOptions.map((option) => option.value),
    },
    advanced_field: {
      type: "string",
    },
  },
} as const;

const hints = {
  channel: {
    label: "Channel",
    group: "Channels",
    type: "select",
    options: searchableOptions,
  },
  advanced_field: {
    label: "Advanced field",
    advanced: true,
  },
} as const;

function collectNodeText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    return node.map(collectNodeText).join("");
  }
  if (
    node &&
    typeof node === "object" &&
    "children" in node &&
    Array.isArray((node as { children?: unknown[] }).children)
  ) {
    return collectNodeText((node as { children: unknown[] }).children);
  }
  return "";
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  return root.find(
    (node) =>
      node.type === "button" &&
      collectNodeText(node.children).includes(label),
  );
}

function Harness({
  onChange,
}: {
  onChange?: (key: string, value: unknown) => void;
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>({});

  return (
    <ConfigRenderer
      schema={schema}
      hints={hints}
      values={values}
      registry={defaultRegistry}
      renderMode="minimal"
      onChange={(key, value) => {
        setValues((current) => ({ ...current, [key]: value }));
        onChange?.(key, value);
      }}
    />
  );
}

describe("ConfigRenderer minimal-mode control chrome", () => {
  it("collapses and expands the Channels group with the shared button primitive", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<Harness />);
    });

    expect(
      tree!.root.findAll(
        (node) => node.props["data-config-key"] === "channel",
      ).length,
    ).toBeGreaterThan(0);

    await act(async () => {
      findButtonByText(tree!.root, "Channels").props.onClick();
    });

    expect(
      tree!.root.findAll(
        (node) => node.props["data-config-key"] === "channel",
      ).length,
    ).toBe(0);
  });

  it("reveals advanced fields when the advanced toggle is opened", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<Harness />);
    });

    expect(
      tree!.root.findAll(
        (node) => node.props["data-config-key"] === "advanced_field",
      ).length,
    ).toBe(0);

    await act(async () => {
      findButtonByText(tree!.root, "Advanced settings").props.onClick();
    });

    expect(
      tree!.root.findAll(
        (node) => node.props["data-config-key"] === "advanced_field",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("uses the searchable select interaction path for larger option sets", async () => {
    const onChange = vi.fn();

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<Harness onChange={onChange} />);
    });

    const selectTrigger = tree!.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-config-key"] === "channel" &&
        node.props["data-field-type"] === "select",
    );

    await act(async () => {
      selectTrigger.props.onClick();
    });

    await act(async () => {
      findButtonByText(tree!.root, "Foxtrot").props.onClick();
    });

    expect(onChange).toHaveBeenCalledWith("channel", "foxtrot");
  });
});
