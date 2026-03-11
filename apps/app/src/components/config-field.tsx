/**
 * config-field.tsx — React port of the 19 Lit field renderers from config-field.ts.
 *
 * Each renderer is a plain function (props: FieldRenderProps) => JSX.Element.
 * Styling uses Tailwind utility classes + CSS custom properties from base.css.
 *
 * Also exports:
 *  - defaultRenderers map (field type name -> renderer)
 *  - ConfigField wrapper component (label + renderer + help + errors)
 */

import React, { useCallback, useRef, useState } from "react";
import type { DynamicValue } from "../types";
import type { FieldRenderer, FieldRenderProps } from "./config-catalog";
import { resolveDynamic } from "./config-catalog";
import { FormFieldStack } from "./FormFieldStack";
import {
  hasStream555ChannelIcon,
  Stream555ChannelIcon,
} from "./Stream555ChannelIcon";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
} from "./ui/Icons";
import { Select } from "./ui/Select";
import { Switch } from "./ui/Switch";
import { Textarea } from "./ui/Textarea";
import { cn } from "./ui/utils";

// ── Action binding helper ──────────────────────────────────────────────

/**
 * Resolve DynamicValue params and fire the onAction callback.
 * No-ops when the binding or onAction is missing.
 */
function fireAction(props: FieldRenderProps, eventName: string): void {
  const binding = props.hint.on?.[eventName];
  if (!binding || !props.onAction) return;

  // Resolve any DynamicValue params against a state snapshot built from the
  // current field value (keyed by the field's own key).  The resolveDynamic
  // function handles both literal values and { path } references.
  let resolvedParams: Record<string, unknown> | undefined;
  if (binding.params) {
    const state: Record<string, unknown> = { [props.key]: props.value };
    resolvedParams = {};
    for (const [k, v] of Object.entries(binding.params)) {
      resolvedParams[k] = resolveDynamic(v as DynamicValue, state);
    }
  }

  void props.onAction(binding.action, resolvedParams);
}

// ── Shared Tailwind class constants ─────────────────────────────────────

type ConfigFieldUiMode = NonNullable<FieldRenderProps["uiMode"]>;

const LEGACY_INPUT_CLS =
  "w-full px-3 py-2 border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] box-border h-[36px] rounded-sm placeholder:text-[var(--muted)] placeholder:opacity-60";

const LEGACY_INPUT_ERROR_CLS =
  "w-full px-3 py-2 border border-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_3%,var(--card))] text-[13px] font-[var(--mono)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] box-border h-[36px] rounded-sm placeholder:text-[var(--muted)] placeholder:opacity-60";

const MINIMAL_INPUT_CLS =
  "h-11 w-full rounded-[20px] border border-white/10 bg-black/22 px-4 text-sm text-white/88 transition-colors outline-none placeholder:text-white/30 focus:border-white/18 focus-visible:ring-2 focus-visible:ring-white/16";

const MINIMAL_INPUT_ERROR_CLS =
  "h-11 w-full rounded-[20px] border border-danger/45 bg-danger/10 px-4 text-sm text-white/88 transition-colors outline-none placeholder:text-white/30 focus:border-danger/60 focus-visible:ring-2 focus-visible:ring-danger/20";

const MINIMAL_TEXTAREA_CLS =
  "min-h-[112px] w-full rounded-[20px] border border-white/10 bg-black/22 px-4 py-3 text-sm text-white/88 outline-none transition-colors placeholder:text-white/30 focus:border-white/18 focus-visible:ring-2 focus-visible:ring-white/16";

const MINIMAL_TEXTAREA_ERROR_CLS =
  "min-h-[112px] w-full rounded-[20px] border border-danger/45 bg-danger/10 px-4 py-3 text-sm text-white/88 outline-none transition-colors placeholder:text-white/30 focus:border-danger/60 focus-visible:ring-2 focus-visible:ring-danger/20";

const LEGACY_TEXTAREA_CLS =
  "w-full min-h-[100px] resize-y rounded-sm border border-[var(--border)] bg-[var(--card)] px-2.5 py-[7px] text-[13px] font-[var(--mono)] transition-all placeholder:text-[var(--muted)] placeholder:opacity-60 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

const LEGACY_TEXTAREA_ERROR_CLS =
  "w-full min-h-[100px] resize-y rounded-sm border border-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_3%,var(--card))] px-2.5 py-[7px] text-[13px] font-[var(--mono)] transition-all placeholder:text-[var(--muted)] placeholder:opacity-60 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

const LEGACY_ACTION_BUTTON_CLS =
  "rounded-sm border border-[var(--border)] bg-[var(--bg-hover)] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]";

const MINIMAL_ACTION_BUTTON_CLS =
  "rounded-xl border border-white/12 bg-black/35 text-white/78 hover:border-white/20 hover:bg-white/[0.06] hover:text-white";

function isMinimalMode(uiMode?: FieldRenderProps["uiMode"]): uiMode is "minimal" {
  return uiMode === "minimal";
}

function inputCls(
  hasError: boolean,
  uiMode: ConfigFieldUiMode = "legacy",
): string {
  if (uiMode === "minimal") {
    return hasError ? MINIMAL_INPUT_ERROR_CLS : MINIMAL_INPUT_CLS;
  }
  return hasError ? LEGACY_INPUT_ERROR_CLS : LEGACY_INPUT_CLS;
}

function textareaCls(
  hasError: boolean,
  uiMode: ConfigFieldUiMode = "legacy",
): string {
  if (uiMode === "minimal") {
    return hasError ? MINIMAL_TEXTAREA_ERROR_CLS : MINIMAL_TEXTAREA_CLS;
  }
  return hasError ? LEGACY_TEXTAREA_ERROR_CLS : LEGACY_TEXTAREA_CLS;
}

function actionButtonCls(
  uiMode: ConfigFieldUiMode = "legacy",
  extra?: string,
): string {
  return cn(uiMode === "minimal" ? MINIMAL_ACTION_BUTTON_CLS : LEGACY_ACTION_BUTTON_CLS, extra);
}

function sanitizeFieldLabel(label: string, fieldKey: string): string {
  if (!hasStream555ChannelIcon(fieldKey)) return label;
  return label.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D◎◇✖×●○•\s-]+/u, "").trim();
}

function selectionCardCls(
  selected: boolean,
  disabled: boolean,
  uiMode: ConfigFieldUiMode = "legacy",
): string {
  if (uiMode === "minimal") {
    return cn(
      "justify-between rounded-[20px] border px-4 py-3 text-left backdrop-blur-xl",
      selected
        ? "border-accent/34 bg-accent/14 text-white shadow-[0_14px_36px_rgba(0,0,0,0.28)]"
        : "border-white/10 bg-black/22 text-white/82 hover:border-white/18 hover:bg-white/[0.05]",
      disabled && "pointer-events-none opacity-50",
    );
  }
  return cn(
    "justify-between rounded-[18px] border px-3.5 py-3 text-left",
    selected
      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_7%,var(--card))] text-[var(--text)]"
      : "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--bg-hover)]",
    disabled && "pointer-events-none opacity-50",
  );
}

function SelectionCardButton({
  label,
  description,
  selected,
  disabled,
  uiMode = "legacy",
  onClick,
}: {
  label: string;
  description?: string;
  selected: boolean;
  disabled: boolean;
  uiMode?: ConfigFieldUiMode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={selectionCardCls(selected, disabled, uiMode)}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium leading-none">{label}</span>
        </span>
        {description ? (
          <span
            className={cn(
              "mt-1 block text-xs leading-relaxed",
              uiMode === "minimal" ? "text-white/52" : "text-[var(--muted)]",
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "ml-3 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected
            ? uiMode === "minimal"
              ? "border-accent/50 bg-accent/16 text-accent"
              : "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground,#0b0d12)]"
            : uiMode === "minimal"
              ? "border-white/14 text-transparent"
              : "border-[var(--border)] text-transparent",
        )}
        aria-hidden="true"
      >
        <CheckIcon className="h-3 w-3" />
      </span>
    </Button>
  );
}

// ── 1. Text ─────────────────────────────────────────────────────────────

/** Single-line text input. Fallback renderer for unresolved field types. */
export function renderTextField(props: FieldRenderProps) {
  const value = props.isSet ? String(props.value ?? "") : "";
  const placeholder =
    (props.hint.placeholder as string | undefined) ?? "Enter value...";

  return (
    <Input
      className={inputCls(!!props.errors?.length, props.uiMode)}
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      data-config-key={props.key}
      data-field-type="text"
      disabled={props.readonly}
      onChange={(e) => {
        props.onChange(e.target.value);
        fireAction(props, "change");
      }}
      onBlur={() => fireAction(props, "blur")}
      onClick={() => fireAction(props, "click")}
    />
  );
}

// ── 2. Password ─────────────────────────────────────────────────────────

/** Masked password input with show/hide toggle and async onReveal for server-backed decryption. */
export function renderPasswordField(props: FieldRenderProps) {
  return <PasswordFieldInner fp={props} />;
}

function PasswordFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const maskedValue = props.isSet ? String(props.value ?? "") : "";
  const placeholder = props.isSet
    ? `Current: ${maskedValue || "********"}  (leave blank to keep)`
    : ((props.hint.placeholder as string | undefined) ?? "Enter value...");

  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onReveal = props.onReveal;
  const VisibilityIcon = visible ? EyeOffIcon : EyeIcon;
  const visibilityLabel = visible ? "Hide" : "Show";

  const handleToggle = useCallback(async () => {
    const input = inputRef.current;
    if (!input) return;

    if (visible) {
      // Currently showing -- hide it
      setVisible(false);
      return;
    }

    // Reveal: fetch the real value from the server
    if (onReveal) {
      setBusy(true);
      const realValue = await onReveal();
      setBusy(false);
      if (realValue != null) {
        setVisible(true);
        input.value = realValue;
      }
    } else {
      // Fallback: just toggle type (shows whatever is in the input)
      setVisible(true);
    }
  }, [visible, onReveal]);

  if (!isMinimalMode(props.uiMode)) {
    return (
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          className={cn(inputCls(!!props.errors?.length, props.uiMode), "flex-1")}
          type={visible ? "text" : "password"}
          defaultValue=""
          placeholder={placeholder}
          data-config-key={props.key}
          data-field-type="password"
          onChange={(e) => {
            props.onChange(e.target.value);
            fireAction(props, "change");
          }}
          onBlur={() => fireAction(props, "blur")}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(actionButtonCls(props.uiMode), "min-w-[88px] shrink-0")}
          onClick={() => {
            void handleToggle();
            fireAction(props, "click");
          }}
          title={visible ? "Hide value" : "Reveal value"}
        >
          {busy ? (
            "Loading..."
          ) : (
            <>
              <VisibilityIcon className="h-3.5 w-3.5" />
              <span>{visibilityLabel}</span>
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        className={cn(inputCls(!!props.errors?.length, props.uiMode), "flex-1")}
        type={visible ? "text" : "password"}
        defaultValue=""
        placeholder={placeholder}
        data-config-key={props.key}
        data-field-type="password"
        onChange={(e) => {
          props.onChange(e.target.value);
          fireAction(props, "change");
        }}
        onBlur={() => fireAction(props, "blur")}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-w-[88px] shrink-0"
        onClick={() => {
          void handleToggle();
          fireAction(props, "click");
        }}
        title={visible ? "Hide value" : "Reveal value"}
      >
        {busy ? (
          "Loading..."
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <VisibilityIcon className="h-3.5 w-3.5" />
            <span>{visibilityLabel}</span>
          </span>
        )}
      </Button>
    </div>
  );
}

// ── 3. Number ───────────────────────────────────────────────────────────

/** Numeric input with min/max/step attributes derived from schema and hints. */
export function renderNumberField(props: FieldRenderProps) {
  return <NumberFieldInner fp={props} />;
}

function NumberFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const minVal =
    props.schema.minimum ?? (props.hint.min as number | undefined) ?? undefined;
  const maxVal =
    props.schema.maximum ?? (props.hint.max as number | undefined) ?? undefined;
  const stepVal = (props.hint.step as number | undefined) ?? 1;
  const unit = props.hint.unit as string | undefined;
  const placeholder =
    (props.hint.placeholder as string | undefined) ?? "Enter number...";

  const initial = props.isSet ? String(props.value ?? "") : "";
  const [val, setVal] = useState(initial);

  const hasRange = minVal != null || maxVal != null;

  const step = (direction: 1 | -1) => {
    const current = val === "" ? 0 : Number(val);
    if (Number.isNaN(current)) return;
    let next = current + direction * stepVal;
    if (minVal != null && next < minVal) next = minVal;
    if (maxVal != null && next > maxVal) next = maxVal;
    const s = String(next);
    setVal(s);
    props.onChange(s);
    fireAction(props, "change");
  };

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {!props.readonly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(actionButtonCls(props.uiMode), "h-11 px-3 font-mono text-sm")}
            onClick={() => step(-1)}
          >
            −
          </Button>
        )}
        <Input
          className={`${inputCls(!!props.errors?.length, props.uiMode)} ${unit ? "flex-1" : "w-full"} text-center`}
          type="number"
          value={val}
          placeholder={placeholder}
          min={minVal}
          max={maxVal}
          step={stepVal}
          data-config-key={props.key}
          data-field-type="number"
          disabled={props.readonly}
          onChange={(e) => {
            setVal(e.target.value);
            props.onChange(e.target.value);
            fireAction(props, "change");
          }}
          onBlur={() => fireAction(props, "blur")}
          onClick={() => fireAction(props, "click")}
        />
        {!props.readonly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(actionButtonCls(props.uiMode), "h-11 px-3 font-mono text-sm")}
            onClick={() => step(1)}
          >
            +
          </Button>
        )}
        {unit && (
          <span className="text-[11px] text-[var(--muted)] font-medium shrink-0 min-w-[20px]">
            {unit}
          </span>
        )}
      </div>
      {hasRange && (
        <div className="text-[10px] text-[var(--muted)] mt-0.5 opacity-70">
          {minVal != null && maxVal != null
            ? `Range: ${minVal}–${maxVal}${unit ? ` ${unit}` : ""}`
            : minVal != null
              ? `Min: ${minVal}${unit ? ` ${unit}` : ""}`
              : `Max: ${maxVal}${unit ? ` ${unit}` : ""}`}
        </div>
      )}
    </div>
  );
}

// ── 4. Boolean ──────────────────────────────────────────────────────────

/** Pill-shaped toggle switch. Accepts boolean or string 'true'/'false' values. */
export function renderBooleanField(props: FieldRenderProps) {
  return <BooleanFieldInner fp={props} />;
}

function BooleanFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const val =
    props.value === true || props.value === "true" || props.value === "1";
  const initialVal = props.isSet
    ? val
    : props.schema.default === true || props.schema.default === "true";

  const [localVal, setLocalVal] = useState(initialVal);

  if (!isMinimalMode(props.uiMode)) {
    return (
      <div
        className="flex items-center gap-3"
        data-config-key={props.key}
        data-field-type="boolean"
      >
        <Switch
          checked={localVal}
          disabled={props.readonly}
          className={cn(
            "h-8 w-14 rounded-full",
            localVal
              ? "border-[var(--warning,#f39c12)] bg-[color-mix(in_srgb,var(--warning,#f39c12)_28%,transparent)]"
              : "border-[var(--border)] bg-[var(--bg-hover)]",
          )}
          onCheckedChange={(next) => {
            setLocalVal(next);
            props.onChange(String(next));
            fireAction(props, "change");
          }}
          onClick={() => fireAction(props, "click")}
        />
        <span className={cn("text-[13px]", localVal ? "text-[var(--warning,#f39c12)]" : "text-[var(--muted)]")}>
          {localVal ? "Enabled" : "Disabled"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3"
      data-config-key={props.key}
      data-field-type="boolean"
    >
      <Switch
        checked={localVal}
        disabled={props.readonly}
        onCheckedChange={(next) => {
          setLocalVal(next);
          props.onChange(String(next));
          fireAction(props, "change");
        }}
        onClick={() => fireAction(props, "click")}
      />
      <span className={cn("text-sm", localVal ? "text-white/88" : "text-white/56")}>
        {localVal ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}

// ── 5. URL ──────────────────────────────────────────────────────────────

/** URL input with type="url" browser validation. */
export function renderUrlField(props: FieldRenderProps) {
  const value = props.isSet ? String(props.value ?? "") : "";
  const placeholder =
    (props.hint.placeholder as string | undefined) ??
    (props.schema.default != null
      ? `Default: ${props.schema.default}`
      : "https://...");

  return (
    <Input
      className={inputCls(!!props.errors?.length, props.uiMode)}
      type="url"
      defaultValue={value}
      placeholder={placeholder}
      data-config-key={props.key}
      data-field-type="url"
      disabled={props.readonly}
      onChange={(e) => {
        props.onChange(e.target.value);
        fireAction(props, "change");
      }}
      onBlur={() => fireAction(props, "blur")}
      onClick={() => fireAction(props, "click")}
    />
  );
}

// ── 6. Select ───────────────────────────────────────────────────────────

/** Dropdown select. Options from hint.options or schema.enum. */
export function renderSelectField(props: FieldRenderProps) {
  const enhancedOptions = (props.hint as Record<string, unknown>).options as
    | Array<{ value: string; label: string; description?: string }>
    | undefined;

  const plainOptions: string[] =
    (props.schema.enum as string[]) ??
    props.schema.oneOf?.map((o) => String(o.const ?? o.description ?? "")) ??
    [];

  const allOptions = enhancedOptions
    ? enhancedOptions.map((o) => ({
        value: o.value,
        label: o.label,
        description: o.description,
      }))
    : plainOptions.map((o) => ({
        value: o,
        label: o,
        description: undefined as string | undefined,
      }));

  const value = props.isSet ? String(props.value ?? "") : "";
  const effectiveValue = value || String(props.schema.default ?? "");
  const useSearch = allOptions.length >= 5;
  const listId = `dl-${props.key}`;

  if (useSearch) {
    return (
      <SearchableSelectInner
        fp={props}
        options={allOptions}
        effectiveValue={effectiveValue}
        listId={listId}
      />
    );
  }

  return (
    <Select
      className={`${inputCls(!!props.errors?.length, props.uiMode)} appearance-auto pr-10`}
      defaultValue={effectiveValue}
      data-config-key={props.key}
      data-field-type="select"
      disabled={props.readonly}
      onChange={(e) => {
        props.onChange(e.target.value);
        fireAction(props, "change");
      }}
      onBlur={() => fireAction(props, "blur")}
      onClick={() => fireAction(props, "click")}
    >
      {!props.required && <option value="">-- none --</option>}
      {allOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
          {opt.description ? ` — ${opt.description}` : ""}
        </option>
      ))}
    </Select>
  );
}

function SearchableSelectInner({
  fp: props,
  options,
  effectiveValue,
}: {
  fp: FieldRenderProps;
  options: Array<{ value: string; label: string; description?: string }>;
  effectiveValue: string;
  listId: string;
}) {
  const matchingOpt = options.find((o) => o.value === effectiveValue);
  const [inputVal, setInputVal] = useState(
    matchingOpt?.label ?? effectiveValue,
  );
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = filter
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(filter.toLowerCase()) ||
          o.value.toLowerCase().includes(filter.toLowerCase()),
      )
    : options;

  const select = useCallback(
    (opt: { value: string; label: string }) => {
      props.onChange(opt.value);
      setInputVal(opt.label);
      setOpen(false);
      setFilter("");
      fireAction(props, "change");
    },
    [props],
  );

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button that looks like a select */}
      <Button
        type="button"
        variant="outline"
        className={cn(
          inputCls(!!props.errors?.length, props.uiMode),
          "h-11 w-full justify-between px-4 text-left font-normal",
        )}
        disabled={props.readonly}
        onClick={() => {
          setOpen(!open);
          setFilter("");
        }}
        data-config-key={props.key}
        data-field-type="select"
      >
        <span className={inputVal ? "" : "text-[var(--muted)] opacity-60"}>
          {inputVal || "Select..."}
        </span>
        <span className="text-[var(--muted)] text-[10px] shrink-0">
          {open ? "\u25B2" : "\u25BC"}
        </span>
      </Button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-[280px] overflow-hidden rounded-[20px] border border-white/10 bg-black/78 shadow-2xl backdrop-blur-xl">
          {/* Search input */}
          <div className="border-b border-white/10 p-2">
            <Input
              ref={inputRef}
              className={cn(
                isMinimalMode(props.uiMode)
                  ? "w-full rounded-[14px] border border-white/10 bg-black/24 px-3 py-2 text-xs text-white/80 outline-none focus:border-white/18 focus-visible:ring-2 focus-visible:ring-white/16"
                  : "w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[12px] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] box-border rounded-sm placeholder:text-[var(--muted)] placeholder:opacity-60",
              )}
              type="text"
              value={filter}
              placeholder={`Search ${options.length} options...`}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  setFilter("");
                } else if (e.key === "Enter" && filtered.length === 1) {
                  select(filtered[0]);
                }
              }}
            />
          </div>
          {/* Options list */}
          <div className="overflow-y-auto flex-1">
            {!props.required && (
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-xs italic transition-colors",
                  isMinimalMode(props.uiMode)
                    ? "text-white/52 hover:bg-white/[0.05]"
                    : "text-[var(--muted)] hover:bg-[var(--bg-hover)]",
                )}
                onClick={() => {
                  props.onChange("");
                  setInputVal("");
                  setOpen(false);
                  setFilter("");
                  fireAction(props, "change");
                }}
              >
                -- none --
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-white/46">
                No matches
              </div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-xs transition-colors",
                  isMinimalMode(props.uiMode)
                    ? "hover:bg-white/[0.05]"
                    : "hover:bg-[var(--bg-hover)]",
                  opt.value === effectiveValue
                    ? isMinimalMode(props.uiMode)
                      ? "bg-white/[0.08] font-medium text-white"
                      : "bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))] font-medium text-[var(--text)]"
                    : "",
                )}
                onClick={() => select(opt)}
              >
                {opt.label}
                {opt.description && (
                  <span
                    className={cn(
                      "ml-1.5 text-[11px]",
                      isMinimalMode(props.uiMode)
                        ? "text-white/42"
                        : "text-[var(--muted)]",
                    )}
                  >
                    {opt.description}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div
            className={cn(
              "border-t px-3 py-2 text-[10px]",
              isMinimalMode(props.uiMode)
                ? "border-white/10 text-white/46"
                : "border-[var(--border)] text-[var(--muted)]",
            )}
          >
            {filtered.length} of {options.length} options
          </div>
        </div>
      )}
    </div>
  );
}

// ── 7. Textarea ─────────────────────────────────────────────────────────

/** Multi-line text input with auto-resize. Auto-detected for maxLength > 200. */
export function renderTextareaField(props: FieldRenderProps) {
  return <TextareaFieldInner fp={props} />;
}

function TextareaFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const value = props.isSet ? String(props.value ?? "") : "";
  const placeholder =
    (props.hint.placeholder as string | undefined) ?? "Enter text...";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Check if field-sizing is supported — if so, CSS handles it
    if (globalThis.CSS?.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(72, el.scrollHeight)}px`;
  }, []);

  return (
    <Textarea
      ref={textareaRef}
      className={cn(textareaCls(!!props.errors?.length, props.uiMode), "max-h-[400px]")}
      style={{ fieldSizing: "content" } as React.CSSProperties}
      defaultValue={value}
      placeholder={placeholder}
      data-config-key={props.key}
      data-field-type="textarea"
      disabled={props.readonly}
      onChange={(e) => {
        props.onChange(e.target.value);
        fireAction(props, "change");
        autoResize();
      }}
      onBlur={() => fireAction(props, "blur")}
      onClick={() => fireAction(props, "click")}
      onFocus={autoResize}
    />
  );
}

// ── 8. Email ────────────────────────────────────────────────────────────

/** Email input with type="email" browser validation. */
export function renderEmailField(props: FieldRenderProps) {
  const value = props.isSet ? String(props.value ?? "") : "";
  const placeholder =
    (props.hint.placeholder as string | undefined) ?? "user@example.com";

  return (
    <Input
      className={inputCls(!!props.errors?.length, props.uiMode)}
      type="email"
      defaultValue={value}
      placeholder={placeholder}
      data-config-key={props.key}
      data-field-type="email"
      disabled={props.readonly}
      onChange={(e) => {
        props.onChange(e.target.value);
        fireAction(props, "change");
      }}
      onBlur={() => fireAction(props, "blur")}
      onClick={() => fireAction(props, "click")}
    />
  );
}

// ── 9. Color ────────────────────────────────────────────────────────────

/** Color picker swatch paired with a hex text input. */
export function renderColorField(props: FieldRenderProps) {
  return <ColorFieldInner fp={props} />;
}

function ColorFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const initial = props.isSet ? String(props.value ?? "#000000") : "#000000";
  const [color, setColor] = useState(initial);

  const handleChange = (newColor: string) => {
    setColor(newColor);
    props.onChange(newColor);
    fireAction(props, "change");
  };

  return (
    <div className="flex items-center gap-2">
      <input
        className={cn(
          "h-11 w-14 cursor-pointer rounded-[18px] border p-1 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-[14px]",
          props.uiMode === "minimal"
            ? "border-white/10 bg-black/22"
            : "border-[var(--border)] bg-[var(--card)]",
        )}
        type="color"
        value={color}
        data-config-key={props.key}
        data-field-type="color"
        disabled={props.readonly}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => fireAction(props, "blur")}
        onClick={() => fireAction(props, "click")}
      />
      <Input
        className={`${inputCls(!!props.errors?.length, props.uiMode)} flex-1`}
        type="text"
        value={color}
        placeholder="#000000"
        data-config-key={props.key}
        data-field-type="color-text"
        disabled={props.readonly}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => fireAction(props, "blur")}
        onClick={() => fireAction(props, "click")}
      />
    </div>
  );
}

// ── 10. Radio ───────────────────────────────────────────────────────────

/** Vertical radio button group. Supports per-option descriptions. */
export function renderRadioField(props: FieldRenderProps) {
  return <RadioFieldInner fp={props} />;
}

function RadioFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const options: Array<{
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
  }> =
    ((props.hint as Record<string, unknown>).options as
      | typeof options
      | undefined) ??
    ((props.schema.enum as string[]) ?? []).map((v) => ({
      value: String(v),
      label: String(v),
    }));

  const initial = props.isSet
    ? String(props.value ?? "")
    : String(props.schema.default ?? "");
  const [selected, setSelected] = useState(initial);

  const handleChange = (val: string) => {
    setSelected(val);
    props.onChange(val);
    fireAction(props, "change");
  };
  return (
    <div
      data-config-key={props.key}
      data-field-type="radio"
      className={cn(
        "grid gap-2",
        isMinimalMode(props.uiMode) ? "sm:grid-cols-2" : "",
      )}
    >
      {options.map((opt) => (
        <SelectionCardButton
          key={opt.value}
          label={opt.label}
          description={opt.description}
          selected={selected === opt.value}
          disabled={Boolean(props.readonly || opt.disabled)}
          uiMode={props.uiMode}
          onClick={() => {
            handleChange(opt.value);
            fireAction(props, "click");
            fireAction(props, "blur");
          }}
        />
      ))}
    </div>
  );
}

// ── 11. Multiselect ─────────────────────────────────────────────────────

/** Checkbox group for selecting multiple values from options. */
export function renderMultiselectField(props: FieldRenderProps) {
  return <MultiselectFieldInner fp={props} />;
}

function MultiselectFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const options: Array<{ value: string; label: string }> =
    ((props.hint as Record<string, unknown>).options as
      | typeof options
      | undefined) ??
    ((props.schema.items?.enum as string[]) ?? []).map((v) => ({
      value: String(v),
      label: String(v),
    }));

  const rawVal = props.isSet ? props.value : [];
  const initialSet = new Set(Array.isArray(rawVal) ? rawVal.map(String) : []);
  const [selected, setSelected] = useState(initialSet);

  const toggle = (optValue: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(optValue)) {
        next.delete(optValue);
      } else {
        next.add(optValue);
      }
      props.onChange([...next]);
      fireAction(props, "change");
      return next;
    });
  };

  const remove = (optValue: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(optValue);
      props.onChange([...next]);
      fireAction(props, "change");
      return next;
    });
  };

  const selectedOptions = options.filter((o) => selected.has(o.value));

  return (
    <div
      className="flex flex-col gap-2"
      data-config-key={props.key}
      data-field-type="multiselect"
    >
      {/* Selected tag pills */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((opt) => (
            <Badge
              key={opt.value}
              variant="accent"
              className="gap-1 normal-case tracking-normal text-[11px]"
            >
              {opt.label}
              {!props.readonly && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-3.5 h-3.5 text-[10px] rounded-full hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
                  onClick={() => remove(opt.value)}
                  aria-label={`Remove ${opt.label}`}
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt) => (
          <SelectionCardButton
            key={opt.value}
            label={opt.label}
            selected={selected.has(opt.value)}
            disabled={Boolean(props.readonly)}
            uiMode={props.uiMode}
            onClick={() => {
              toggle(opt.value);
              fireAction(props, "click");
              fireAction(props, "blur");
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── 12. Date ────────────────────────────────────────────────────────────

/** Native date picker input. */
export function renderDateField(props: FieldRenderProps) {
  const value = props.isSet ? String(props.value ?? "") : "";
  const inputType =
    props.schema.format === "date-time" ? "datetime-local" : "date";

  return (
    <Input
      className={inputCls(!!props.errors?.length, props.uiMode)}
      type={inputType}
      defaultValue={value}
      data-config-key={props.key}
      data-field-type="date"
      disabled={props.readonly}
      onChange={(e) => {
        props.onChange(e.target.value);
        fireAction(props, "change");
      }}
      onBlur={() => fireAction(props, "blur")}
      onClick={() => fireAction(props, "click")}
    />
  );
}

// ── 13. JSON ────────────────────────────────────────────────────────────

/** JSON editor textarea with parse validation on blur. Shows inline error for invalid JSON. */
export function renderJsonField(props: FieldRenderProps) {
  return <JsonFieldInner fp={props} />;
}

function JsonFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const initial = props.isSet ? String(props.value ?? "") : "";
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.trim();
    if (val) {
      try {
        const parsed = JSON.parse(val);
        const jsonStr = JSON.stringify(parsed);
        if (/__proto__|constructor\s*:/.test(jsonStr)) {
          setJsonError("Unsafe JSON: contains dangerous keys");
          return;
        }
        setJsonError(null);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : "Invalid JSON");
      }
    } else {
      setJsonError(null);
    }
    fireAction(props, "blur");
  };

  return (
    <div>
      <Textarea
        className={cn(
          textareaCls(!!jsonError || !!props.errors?.length, props.uiMode),
          "font-mono",
        )}
        defaultValue={initial}
        placeholder='{"key": "value"}'
        rows={6}
        data-config-key={props.key}
        data-field-type="json"
        disabled={props.readonly}
        onChange={(e) => {
          props.onChange(e.target.value);
          fireAction(props, "change");
        }}
        onBlur={handleBlur}
        onClick={() => fireAction(props, "click")}
      />
      {jsonError && (
        <div className="text-[11px] text-[var(--destructive)] mt-1 leading-snug">
          {jsonError}
        </div>
      )}
    </div>
  );
}

// ── 14. Code ────────────────────────────────────────────────────────────

/** Monospaced code editor textarea for templates and snippets. */
export function renderCodeField(props: FieldRenderProps) {
  const value = props.isSet ? String(props.value ?? "") : "";
  const placeholder =
    (props.hint.placeholder as string | undefined) ?? "Enter code...";

  return (
    <Textarea
      className={cn(textareaCls(!!props.errors?.length, props.uiMode), "font-mono")}
      defaultValue={value}
      placeholder={placeholder}
      rows={6}
      data-config-key={props.key}
      data-field-type="code"
      disabled={props.readonly}
      onChange={(e) => {
        props.onChange(e.target.value);
        fireAction(props, "change");
      }}
      onBlur={() => fireAction(props, "blur")}
      onClick={() => fireAction(props, "click")}
    />
  );
}

// ── 15. Array ───────────────────────────────────────────────────────────

/** Add/remove items list. Max 100 items. Parses comma-separated strings. */
export function renderArrayField(props: FieldRenderProps) {
  return <ArrayFieldInner fp={props} />;
}

function ArrayItem({
  index,
  value,
  total,
  hasError,
  uiMode,
  readonly,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onBlur,
}: {
  index: number;
  value: string;
  total: number;
  hasError: boolean;
  uiMode?: ConfigFieldUiMode;
  readonly?: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {!readonly && (
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            className="px-1 py-0 text-[10px] leading-tight text-[var(--muted)] cursor-pointer hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move up"
            aria-label="Move up"
          >
            <ChevronUpIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="px-1 py-0 text-[10px] leading-tight text-[var(--muted)] cursor-pointer hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Move down"
            aria-label="Move down"
          >
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <Input
        className={`${inputCls(hasError, uiMode)} flex-1`}
        type="text"
        value={value}
        placeholder={`Item ${index + 1}`}
        disabled={readonly}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {!readonly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(actionButtonCls(uiMode), "h-[36px] px-2")}
          onClick={onRemove}
          aria-label={`Remove item ${index + 1}`}
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function ArrayFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const rawVal = props.isSet ? props.value : [];
  const initialItems: string[] = Array.isArray(rawVal)
    ? rawVal.map(String)
    : [];
  const [items, setItems] = useState<string[]>(initialItems);

  const updateItems = (nextItems: string[]) => {
    setItems(nextItems);
    props.onChange(nextItems);
    fireAction(props, "change");
  };

  const MAX_ARRAY_ITEMS = 100;
  const addItem = () => {
    if (items.length >= MAX_ARRAY_ITEMS) return;
    updateItems([...items, ""]);
  };

  const removeItem = (index: number) => {
    updateItems(items.filter((_, i) => i !== index));
  };

  const changeItem = (index: number, value: string) => {
    const next = [...items];
    next[index] = value;
    updateItems(next);
  };

  const moveItem = (from: number, to: number) => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateItems(next);
  };

  return (
    <div
      className="flex flex-col gap-1.5"
      data-config-key={props.key}
      data-field-type="array"
    >
      {items.map((item, index) => (
        <ArrayItem
          key={`${index}-${items.length}`}
          index={index}
          value={item}
          total={items.length}
          hasError={!!props.errors?.length}
          uiMode={props.uiMode}
          readonly={props.readonly}
          onChange={(v) => changeItem(index, v)}
          onRemove={() => {
            removeItem(index);
            fireAction(props, "click");
          }}
          onMoveUp={() => moveItem(index, index - 1)}
          onMoveDown={() => moveItem(index, index + 1)}
          onBlur={() => fireAction(props, "blur")}
        />
      ))}
      {!props.readonly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(actionButtonCls(props.uiMode), "self-start border-dashed text-[11px]")}
          onClick={() => {
            addItem();
            fireAction(props, "click");
          }}
        >
          + Add item
        </Button>
      )}
    </div>
  );
}

// ── 16. Key-Value ───────────────────────────────────────────────────────

/** Key-value pair editor with add/remove rows. Blocks prototype pollution keys. */
export function renderKeyValueField(props: FieldRenderProps) {
  return <KeyValueFieldInner fp={props} />;
}

function KeyValueFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const rawVal = props.isSet ? props.value : {};
  const initialPairs: Array<{ key: string; value: string }> =
    rawVal && typeof rawVal === "object" && !Array.isArray(rawVal)
      ? Object.entries(rawVal as Record<string, unknown>).map(([k, v]) => ({
          key: k,
          value: String(v ?? ""),
        }))
      : [];
  const [pairs, setPairs] = useState(initialPairs);

  const emitChange = (next: Array<{ key: string; value: string }>) => {
    setPairs(next);
    const obj: Record<string, string> = {};
    for (const p of next) {
      if (p.key) obj[p.key] = p.value;
    }
    props.onChange(obj);
    fireAction(props, "change");
  };

  const addRow = () => {
    emitChange([...pairs, { key: "", value: "" }]);
  };

  const removeRow = (index: number) => {
    emitChange(pairs.filter((_, i) => i !== index));
  };

  const BLOCKED_KEYS = ["__proto__", "constructor", "prototype"];
  const updateRow = (index: number, field: "key" | "value", val: string) => {
    if (field === "key" && BLOCKED_KEYS.includes(val)) return;
    const next = [...pairs];
    next[index] = { ...next[index], [field]: val };
    emitChange(next);
  };

  return (
    <div
      className="flex flex-col gap-1.5"
      data-config-key={props.key}
      data-field-type="keyvalue"
    >
      {pairs.map((pair, index) => (
        <div
          key={`${pair.key}:${pair.value}`}
          className="flex items-center gap-1"
        >
          <Input
            className={`${inputCls(!!props.errors?.length, props.uiMode)} flex-1`}
            type="text"
            value={pair.key}
            placeholder="Key"
            disabled={props.readonly}
            onChange={(e) => updateRow(index, "key", e.target.value)}
            onBlur={() => fireAction(props, "blur")}
          />
          <Input
            className={`${inputCls(!!props.errors?.length, props.uiMode)} flex-1`}
            type="text"
            value={pair.value}
            placeholder="Value"
            disabled={props.readonly}
            onChange={(e) => updateRow(index, "value", e.target.value)}
            onBlur={() => fireAction(props, "blur")}
          />
          {!props.readonly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(actionButtonCls(props.uiMode), "h-[36px] px-2")}
              onClick={() => {
                removeRow(index);
                fireAction(props, "click");
              }}
              aria-label={`Remove row ${index + 1}`}
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      {!props.readonly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(actionButtonCls(props.uiMode), "self-start border-dashed text-[11px]")}
          onClick={() => {
            addRow();
            fireAction(props, "click");
          }}
        >
          + Add row
        </Button>
      )}
    </div>
  );
}

// ── 17. Datetime ────────────────────────────────────────────────────────

/** Combined date and time picker (datetime-local). */
export function renderDatetimeField(props: FieldRenderProps) {
  const value = props.isSet ? String(props.value ?? "") : "";

  return (
    <Input
      className={inputCls(!!props.errors?.length, props.uiMode)}
      type="datetime-local"
      defaultValue={value}
      data-config-key={props.key}
      data-field-type="datetime"
      disabled={props.readonly}
      onChange={(e) => {
        props.onChange(e.target.value);
        fireAction(props, "change");
      }}
      onBlur={() => fireAction(props, "blur")}
      onClick={() => fireAction(props, "click")}
    />
  );
}

// ── 18. File ────────────────────────────────────────────────────────────

/** File path text input with path traversal guard. */
export function renderFileField(props: FieldRenderProps) {
  const value = props.isSet ? String(props.value ?? "") : "";
  const placeholder =
    (props.hint.placeholder as string | undefined) ?? "/path/to/file";

  return (
    <div>
      <Input
        className={inputCls(!!props.errors?.length, props.uiMode)}
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        data-config-key={props.key}
        data-field-type="file"
        disabled={props.readonly}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes("..")) return; // block path traversal
          props.onChange(v);
          fireAction(props, "change");
        }}
        onBlur={() => fireAction(props, "blur")}
        onClick={() => fireAction(props, "click")}
      />
      <div className="text-[11px] text-[var(--muted)] mt-0.5">
        Enter a file path or browse to select
      </div>
    </div>
  );
}

// ── 19. Custom ──────────────────────────────────────────────────────────

/** Placeholder for plugin-provided custom React components. */
export function renderCustomField(props: FieldRenderProps) {
  const componentName = (props.hint as Record<string, unknown>).component as
    | string
    | undefined;

  return (
    <div
      className="px-3 py-4 border border-dashed border-[var(--border)] bg-[var(--bg-hover)] text-[13px] text-[var(--muted)]"
      data-config-key={props.key}
      data-field-type="custom"
    >
      Custom component: {componentName ?? props.fieldType}
    </div>
  );
}

// ── 20. Markdown ─────────────────────────────────────────────────────────

/**
 * Simple markdown renderer for preview mode.
 * Converts basic markdown patterns to React elements without external dependencies.
 */
function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const blocks = text.split(/\n\n+/);
  const elements: React.ReactNode[] = [];

  blocks.forEach((block) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const lines = trimmed.split("\n");
      const code = lines.slice(1, -1).join("\n");
      elements.push(
        <pre
          key={`code:${code}`}
          className="bg-[var(--bg-hover)] px-3 py-2 rounded-sm overflow-x-auto my-2"
        >
          <code className="font-mono text-[12px]">{code}</code>
        </pre>,
      );
      return;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = processInline(headingMatch[2]);
      const sizes = [
        "text-xl",
        "text-lg",
        "text-base",
        "text-sm",
        "text-sm",
        "text-xs",
      ];
      const cls = `${sizes[level - 1]} font-bold mb-1 mt-2`;
      elements.push(
        React.createElement(
          `h${level}`,
          { key: `heading:${headingMatch[2]}`, className: cls },
          content,
        ),
      );
      return;
    }

    // Unordered list
    if (/^[-*]\s/.test(trimmed)) {
      const items = trimmed.split("\n").filter((l) => /^[-*]\s/.test(l));
      elements.push(
        <ul key={`list:${trimmed}`} className="list-disc pl-4 my-2 space-y-1">
          {items.map((item) => (
            <li key={item}>{processInline(item.replace(/^[-*]\s/, ""))}</li>
          ))}
        </ul>,
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={`paragraph:${trimmed}`} className="my-2">
        {processInline(trimmed)}
      </p>,
    );
  });

  return <>{elements}</>;
}

/**
 * Process inline markdown patterns (bold, italic, code, links).
 */
function processInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // Link: [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const before = remaining.substring(0, linkMatch.index);
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] underline"
        >
          {linkMatch[1]}
        </a>,
      );
      const linkIndex = linkMatch.index ?? 0;
      remaining = remaining.substring(linkIndex + linkMatch[0].length);
      continue;
    }

    // Inline code: `code`
    const codeMatch = remaining.match(/`([^`]+)`/);
    if (codeMatch) {
      const before = remaining.substring(0, codeMatch.index);
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(
        <code
          key={key++}
          className="bg-[var(--bg-hover)] px-1 py-0.5 rounded font-mono text-[12px]"
        >
          {codeMatch[1]}
        </code>,
      );
      const codeIndex = codeMatch.index ?? 0;
      remaining = remaining.substring(codeIndex + codeMatch[0].length);
      continue;
    }

    // Bold: **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const before = remaining.substring(0, boldMatch.index);
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      const boldIndex = boldMatch.index ?? 0;
      remaining = remaining.substring(boldIndex + boldMatch[0].length);
      continue;
    }

    // Italic: *text* or _text_
    const italicMatch = remaining.match(/(\*|_)([^*_]+)\1/);
    if (italicMatch) {
      const before = remaining.substring(0, italicMatch.index);
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      const italicIndex = italicMatch.index ?? 0;
      remaining = remaining.substring(italicIndex + italicMatch[0].length);
      continue;
    }

    // No more patterns found
    parts.push(remaining);
    break;
  }

  return <>{parts}</>;
}

/**
 * Helper to handle plain text without additional patterns.
 */
function processSimpleInline(text: string, key: number): React.ReactNode {
  return <span key={key}>{text}</span>;
}

function MarkdownFieldInner(props: FieldRenderProps) {
  const [preview, setPreview] = useState(false);
  const value = typeof props.value === "string" ? props.value : "";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 mb-1">
        <Button
          type="button"
          variant={!preview ? "secondary" : "outline"}
          size="sm"
          className={`h-8 px-3 text-[11px] ${
            !preview
              ? ""
              : "text-[var(--muted)] hover:text-[var(--txt)]"
          }`}
          onClick={() => setPreview(false)}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant={preview ? "secondary" : "outline"}
          size="sm"
          className={`h-8 px-3 text-[11px] ${
            preview
              ? ""
              : "text-[var(--muted)] hover:text-[var(--txt)]"
          }`}
          onClick={() => setPreview(true)}
        >
          Preview
        </Button>
      </div>
      {preview ? (
        <div
          className="min-h-[100px] px-3 py-2 border border-[var(--border)] bg-[var(--surface)] text-[13px] leading-relaxed"
          data-config-key={props.key}
          data-field-type="markdown"
        >
          {value ? (
            renderMarkdown(value)
          ) : (
            <span className="text-[var(--muted)] italic">
              Nothing to preview
            </span>
          )}
        </div>
      ) : (
        <Textarea
          className={`${textareaCls(!!props.errors?.length, props.uiMode)} h-auto resize-y font-[var(--mono)]`}
          defaultValue={value}
          placeholder={props.hint.placeholder ?? "Markdown content..."}
          data-config-key={props.key}
          data-field-type="markdown"
          disabled={props.readonly}
          onChange={(e) => {
            props.onChange(e.target.value);
            fireAction(props, "change");
          }}
          onBlur={() => fireAction(props, "blur")}
        />
      )}
    </div>
  );
}
/** Markdown textarea with Edit/Preview toggle. */
export const renderMarkdownField: FieldRenderer = (props) => (
  <MarkdownFieldInner {...props} />
);

// ── 21. Checkbox Group ───────────────────────────────────────────────────

function CheckboxGroupInner(props: FieldRenderProps) {
  const selected = new Set(
    Array.isArray(props.value)
      ? (props.value as string[])
      : typeof props.value === "string" && props.value
        ? props.value.split(",").map((s) => s.trim())
        : [],
  );
  const options: Array<{
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
  }> =
    props.hint.options ??
    (props.schema.enum as string[] | undefined)?.map((v) => ({
      value: v,
      label: v,
    })) ??
    [];

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    props.onChange([...next]);
    fireAction(props, "change");
  };

  return (
    <div
      className="flex flex-col gap-2"
      data-config-key={props.key}
      data-field-type="checkbox-group"
    >
      {options.map((opt) => (
        <SelectionCardButton
          key={opt.value}
          label={opt.label}
          description={opt.description}
          selected={selected.has(opt.value)}
          disabled={Boolean(props.readonly || opt.disabled)}
          uiMode={props.uiMode}
          onClick={() => {
            toggle(opt.value);
            fireAction(props, "click");
            fireAction(props, "blur");
          }}
        />
      ))}
      {options.length === 0 && (
        <span className="text-[11px] text-[var(--muted)] italic">
          No options defined
        </span>
      )}
    </div>
  );
}
/** Vertical checkbox list with per-option descriptions and accent highlighting. */
export const renderCheckboxGroupField: FieldRenderer = (props) => (
  <CheckboxGroupInner {...props} />
);

// ── 22. Group ────────────────────────────────────────────────────────────

/** Fieldset container with legend label. */
export const renderGroupField: FieldRenderer = (props) => {
  const value = typeof props.value === "string" ? props.value : "";
  return (
    <fieldset
      className="border border-[var(--border)] px-4 py-3 bg-[var(--surface)]"
      data-config-key={props.key}
      data-field-type="group"
    >
      <legend className="text-[12px] font-semibold text-[var(--muted)] px-1.5">
        {props.hint.label ?? props.key}
      </legend>
      <Textarea
        className={`${textareaCls(!!props.errors?.length, props.uiMode)} min-h-[60px] h-auto resize-y`}
        defaultValue={value}
        placeholder={props.hint.placeholder ?? "Group configuration..."}
        disabled={props.readonly}
        onChange={(e) => {
          props.onChange(e.target.value);
          fireAction(props, "change");
        }}
        onBlur={() => fireAction(props, "blur")}
      />
    </fieldset>
  );
};

// ── 23. Table ────────────────────────────────────────────────────────────

function TableFieldInner(props: FieldRenderProps) {
  const MAX_TABLE_ROWS = 50;
  const columns: Array<{ key: string; label: string }> = ((
    props.hint as Record<string, unknown>
  ).columns as Array<{ key: string; label: string }>) ?? [
    { key: "key", label: "Key" },
    { key: "value", label: "Value" },
  ];

  const rawRows = Array.isArray(props.value)
    ? (props.value as Record<string, string>[])
    : [];
  const [rows, setRows] = useState<Record<string, string>[]>(
    rawRows.length > 0
      ? rawRows
      : [Object.fromEntries(columns.map((c) => [c.key, ""]))],
  );

  const emit = (next: Record<string, string>[]) => {
    setRows(next);
    props.onChange(next.filter((r) => columns.some((c) => r[c.key]?.trim())));
    fireAction(props, "change");
  };

  const updateCell = (rowIdx: number, colKey: string, val: string) => {
    if (["__proto__", "constructor", "prototype"].includes(colKey)) return;
    const next = [...rows];
    next[rowIdx] = { ...next[rowIdx], [colKey]: val };
    emit(next);
  };

  const addRow = () => {
    if (rows.length >= MAX_TABLE_ROWS) return;
    emit([...rows, Object.fromEntries(columns.map((c) => [c.key, ""]))]);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    emit(rows.filter((_, i) => i !== idx));
  };

  return (
    <div
      className="flex flex-col gap-1.5"
      data-config-key={props.key}
      data-field-type="table"
    >
      <div className="border border-[var(--border)] overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-[var(--surface)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left text-[11px] font-semibold text-[var(--muted)] px-3 py-1.5 border-b border-[var(--border)]"
                >
                  {col.label}
                </th>
              ))}
              <th className="w-[36px] border-b border-[var(--border)]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={JSON.stringify(row)}
                className="border-b border-[var(--border)] last:border-b-0"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-1 py-0.5">
                    <Input
                      className="h-9 w-full border-transparent bg-transparent px-2 py-1 text-[13px] focus:border-white/12 focus:bg-white/[0.04] focus-visible:ring-0"
                      value={row[col.key] ?? ""}
                      placeholder={col.label}
                      disabled={props.readonly}
                      onChange={(e) => updateCell(ri, col.key, e.target.value)}
                    />
                  </td>
                ))}
                <td className="text-center">
                  {!props.readonly && rows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-[var(--muted)] hover:text-[var(--destructive)]"
                      onClick={() => removeRow(ri)}
                      title="Remove row"
                    >
                      &times;
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!props.readonly && rows.length < MAX_TABLE_ROWS && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start h-8 px-0 text-[11px] text-[var(--accent)] hover:bg-transparent hover:underline"
          onClick={addRow}
        >
          + Add row
        </Button>
      )}
    </div>
  );
}
/** Tabular data editor with configurable columns. Max 50 rows. */
export const renderTableField: FieldRenderer = (props) => (
  <TableFieldInner {...props} />
);

// ── Default renderers map ───────────────────────────────────────────────

export const defaultRenderers: Record<string, FieldRenderer> = {
  text: renderTextField,
  password: renderPasswordField,
  number: renderNumberField,
  boolean: renderBooleanField,
  url: renderUrlField,
  select: renderSelectField,
  textarea: renderTextareaField,
  email: renderEmailField,
  color: renderColorField,
  radio: renderRadioField,
  multiselect: renderMultiselectField,
  date: renderDateField,
  json: renderJsonField,
  code: renderCodeField,
  array: renderArrayField,
  keyvalue: renderKeyValueField,
  datetime: renderDatetimeField,
  file: renderFileField,
  custom: renderCustomField,
  markdown: renderMarkdownField,
  "checkbox-group": renderCheckboxGroupField,
  group: renderGroupField,
  table: renderTableField,
};

// ── ConfigField wrapper component ───────────────────────────────────────

/**
 * Wraps a field renderer with the standard label row, env key display,
 * help text, and error messages.
 */
export function ConfigField({
  renderProps,
  renderer,
  pluginId,
}: {
  renderProps: FieldRenderProps;
  renderer: FieldRenderer;
  pluginId?: string;
}) {
  const label = sanitizeFieldLabel(renderProps.hint.label ?? renderProps.key, renderProps.key);
  const envKey = renderProps.key;
  const labelDiffersFromKey = label !== envKey;
  const errors = renderProps.errors ?? [];
  const hasError = errors.length > 0;

  const renderFn =
    renderer ??
    defaultRenderers[renderProps.fieldType] ??
    defaultRenderers.text;

  const uiMode = renderProps.uiMode ?? "legacy";
  const fieldHelp = renderProps.hint.help ?? renderProps.schema.description;
  const channelIcon = hasStream555ChannelIcon(renderProps.key) ? (
    <Stream555ChannelIcon fieldKey={renderProps.key} />
  ) : null;
  const helpContent =
    fieldHelp || labelDiffersFromKey ? (
      <div className="space-y-1">
        {fieldHelp ? <div>{fieldHelp}</div> : null}
        {labelDiffersFromKey ? (
          <code
            className={cn(
              "block text-[10px] uppercase tracking-[0.18em]",
              uiMode === "minimal" ? "text-white/34" : "text-[var(--muted)]",
            )}
          >
            {envKey}
          </code>
        ) : null}
      </div>
    ) : undefined;

  if (uiMode !== "minimal") {
    return (
      <div
        id={
          pluginId
            ? `field-${pluginId}-${renderProps.key}`
            : `field-${renderProps.key}`
        }
        className={cn(
          "py-2.5",
          renderProps.readonly ? "opacity-50 pointer-events-none" : "",
          renderProps.required && !renderProps.isSet
            ? "border-l-2 border-[var(--warning,#f39c12)] pl-3"
            : "",
        )}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            {channelIcon}
            <span className="text-[13px] font-semibold leading-tight text-[var(--text)]">
              {label}
            </span>
          </div>
          {renderProps.required && !renderProps.isSet ? (
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--warning,#f39c12)]">
              Required
            </span>
          ) : null}
          {renderProps.isSet ? (
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--ok,#2d8a4e)]">
              Configured
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          {renderFn(renderProps)}
          {fieldHelp ? (
            <div className="text-[11px] leading-snug text-[var(--muted)]">
              {fieldHelp}
            </div>
          ) : null}
          {labelDiffersFromKey ? (
            <code className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] opacity-75">
              {envKey}
            </code>
          ) : null}
          {hasError && (
            <div className="flex flex-col gap-1">
              {errors.map((err) => (
                <div
                  key={err}
                  className="flex items-start gap-2 text-[11px] leading-snug text-[var(--destructive)]"
                >
                  <span className="mt-px shrink-0">&times;</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const labelContent = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        {channelIcon}
        <span className="text-sm font-semibold leading-tight text-white/88">{label}</span>
      </div>
      {renderProps.required && !renderProps.isSet ? (
        <Badge variant="danger" className="px-2 py-0.5 text-[9px] tracking-[0.16em]">
          Required
        </Badge>
      ) : null}
      {renderProps.isSet ? (
        <Badge variant="success" className="px-2 py-0.5 text-[9px] tracking-[0.16em]">
          Configured
        </Badge>
      ) : null}
    </div>
  );

  return (
    <div
      id={
        pluginId
          ? `field-${pluginId}-${renderProps.key}`
          : `field-${renderProps.key}`
      }
      className={cn("py-2.5", renderProps.readonly ? "opacity-50 pointer-events-none" : "")}
    >
      <FormFieldStack label={labelContent} help={helpContent}>
        <div className="space-y-2">
          {renderFn(renderProps)}
          {hasError && (
            <div className="flex flex-col gap-1">
              {errors.map((err) => (
                <div
                  key={err}
                  className="flex items-start gap-2 text-xs leading-snug text-danger"
                >
                  <span className="mt-px shrink-0">&times;</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </FormFieldStack>
    </div>
  );
}
