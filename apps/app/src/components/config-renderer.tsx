/**
 * ConfigRenderer — Schema-driven plugin config form (React port).
 *
 * Takes a JSON Schema + ConfigUiHints, resolves each property to a field type
 * via the catalog, and renders via the registry.
 *
 * Phase 2 features (json-render parity):
 *   - Rich visibility: evaluateVisibility() with LogicExpression support
 *   - Validation checks: declarative checks alongside Zod validation
 *   - Actions: onAction() callback for executing catalog actions
 *   - Prompt generation: registry.catalog.prompt() for AI system prompts
 */

import React, {
  type ComponentType,
  type SVGProps,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type { ConfigUiHint } from "../types";
import type {
  FieldRegistry,
  FieldRenderer,
  FieldRenderProps,
  JsonSchemaObject,
  ResolvedField,
} from "./config-catalog";
import {
  defaultCatalog,
  defineRegistry,
  evaluateShowIf,
  evaluateVisibility,
  resolveFields,
  runValidation,
} from "./config-catalog";
import { ConfigField } from "./config-field";
import {
  ActivityIcon,
  AgentIcon,
  ArbitrumIcon,
  BaseChainIcon,
  BellIcon,
  BookIcon,
  BrainIcon,
  BroadcastIcon,
  CalendarIcon,
  ChartIcon,
  ChevronRightIcon,
  CloudIcon,
  CodeIcon,
  ConnectionIcon,
  CreditIcon,
  DatabaseIcon,
  DocumentIcon,
  EditIcon,
  EthereumIcon,
  FlaskIcon,
  FolderIcon,
  GlobeIcon,
  KeyIcon,
  LightningIcon,
  LockIcon,
  MegaphoneIcon,
  MicIcon,
  MonitorIcon,
  OperatorIcon,
  OutputIcon,
  PackageIcon,
  PhoneIcon,
  RestartIcon,
  RulerIcon,
  SettingsIcon,
  ShieldIcon,
  SolanaIcon,
  SparkIcon,
  ThreadsIcon,
  VideoIcon,
  WalletIcon,
  XBrandIcon,
} from "./ui/Icons";

// ── Props ──────────────────────────────────────────────────────────────

export interface ConfigRendererProps {
  /** JSON Schema describing the config structure (type: "object"). */
  schema: JsonSchemaObject | null;
  /** UI rendering hints keyed by property name. */
  hints?: Record<string, ConfigUiHint>;
  /** Current config values keyed by property name. */
  values?: Record<string, unknown>;
  /** Which keys currently have values set (for status dots). */
  setKeys?: Set<string>;
  /** Field registry (catalog + renderers + action handlers). */
  registry: FieldRegistry;
  /** Plugin ID (used for revealing sensitive values via API). */
  pluginId?: string;
  /** Callback to reveal a sensitive field's real value. */
  revealSecret?: (pluginId: string, key: string) => Promise<string | null>;
  /** Callback when a field value changes. */
  onChange?: (key: string, value: unknown) => void;
  /** Render function for each field — receives renderProps and the resolved renderer. */
  renderField?: (
    renderProps: FieldRenderProps,
    renderer: FieldRenderer,
  ) => React.ReactNode;
  /** Show a validation error summary above the form fields when errors exist. Defaults to true. */
  showValidationSummary?: boolean;
  /** Visual mode for embedded config surfaces. Defaults to legacy schema chrome. */
  renderMode?: "minimal" | "legacy";
  /** Partial theme overrides for plugin UI tokens. */
  theme?: Partial<import("../types").PluginUiTheme>;
}

/** Handle exposed by ConfigRenderer via ref for parent-driven validation. */
export interface ConfigRendererHandle {
  /** Run validation on all visible fields. Returns true if the form is valid (no errors). */
  validateAll: () => boolean;
}

// ── Group icons ────────────────────────────────────────────────────────

type GroupIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const GROUP_ICONS: Record<string, GroupIconComponent> = {
  // Auth & Security
  auth: KeyIcon,
  authentication: KeyIcon,
  security: ShieldIcon,
  permissions: LockIcon,
  "api keys": KeyIcon,
  // Connection & Network
  connection: ConnectionIcon,
  network: GlobeIcon,
  api: CodeIcon,
  webhook: MegaphoneIcon,
  // Models & AI
  models: AgentIcon,
  model: AgentIcon,
  "ai models": AgentIcon,
  "text generation": AgentIcon,
  embeddings: BrainIcon,
  // Behavior & Config
  behavior: SettingsIcon,
  configuration: SettingsIcon,
  general: SettingsIcon,
  defaults: SettingsIcon,
  advanced: SettingsIcon,
  features: SparkIcon,
  // Time & Scheduling
  timing: ActivityIcon,
  scheduling: CalendarIcon,
  // Storage & Data
  storage: DatabaseIcon,
  bucket: PackageIcon,
  paths: FolderIcon,
  output: OutputIcon,
  repository: BookIcon,
  // Communication
  messaging: ThreadsIcon,
  channels: BroadcastIcon,
  chatrooms: ThreadsIcon,
  voice: MicIcon,
  speech: MicIcon,
  "speech-to-text": MicIcon,
  // Identity
  identity: OperatorIcon,
  "client identity": OperatorIcon,
  session: OperatorIcon,
  // Display & Media
  display: MonitorIcon,
  media: VideoIcon,
  // Notifications
  notifications: BellIcon,
  logging: DocumentIcon,
  // Finance & Trading
  trading: ChartIcon,
  "risk management": ShieldIcon,
  wallet: WalletIcon,
  payment: CreditIcon,
  pricing: CreditIcon,
  // Blockchain
  blockchain: ConnectionIcon,
  ethereum: EthereumIcon,
  solana: SolanaIcon,
  base: BaseChainIcon,
  arbitrum: ArbitrumIcon,
  bsc: ConnectionIcon,
  testnets: FlaskIcon,
  "dex config": ChartIcon,
  // Social
  posting: EditIcon,
  "x/twitter authentication": KeyIcon,
  "x/twitter behavior": XBrandIcon,
  // System
  limits: RulerIcon,
  providers: CloudIcon,
  commands: CodeIcon,
  actions: LightningIcon,
  policies: DocumentIcon,
  autonomy: AgentIcon,
  "background jobs": RestartIcon,
  "n8n connection": ConnectionIcon,
  app: PhoneIcon,
};

function groupIcon(group: string): GroupIconComponent {
  return GROUP_ICONS[group.toLowerCase()] ?? SettingsIcon;
}

// ── Width → Tailwind column span ───────────────────────────────────────

function widthClass(width: "full" | "half" | "third"): string {
  switch (width) {
    case "half":
      return "col-span-6 sm:col-span-3";
    case "third":
      return "col-span-6 sm:col-span-2";
    default:
      return "col-span-6";
  }
}

// ── Validation Summary ─────────────────────────────────────────────────

interface ValidationSummaryProps {
  /** Map of field key to its error messages. */
  fieldErrors: Map<string, string[]>;
  /** Map of field key to its display label. */
  fieldLabels: Map<string, string>;
  /** Plugin ID for scoping field IDs. */
  pluginId?: string;
}

function ValidationSummary({
  fieldErrors,
  fieldLabels,
  pluginId,
}: ValidationSummaryProps) {
  const errorEntries = [...fieldErrors.entries()].filter(
    ([, errors]) => errors.length > 0,
  );
  const totalErrors = errorEntries.length;

  if (totalErrors === 0) return null;

  const handleFieldClick = (key: string) => {
    const el = document.getElementById(
      pluginId ? `field-${pluginId}-${key}` : `field-${key}`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div
      className="mb-4 border border-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_6%,transparent)] px-4 py-3 rounded-sm"
      role="alert"
    >
      <div className="text-[13px] font-semibold text-[var(--destructive)] mb-2">
        {totalErrors} {totalErrors === 1 ? "field needs" : "fields need"}{" "}
        attention
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-1">
        {errorEntries.map(([key]) => (
          <li key={key}>
            <button
              type="button"
              className="text-[12px] text-[var(--destructive)] cursor-pointer bg-transparent border-none p-0 hover:underline transition-all text-left flex items-center gap-1.5"
              onClick={() => handleFieldClick(key)}
            >
              <ChevronRightIcon className="h-3.5 w-3.5 opacity-60" />
              <span>{fieldLabels.get(key) ?? key}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Theme mapping ──────────────────────────────────────────────────────

/** Maps PluginUiTheme keys to CSS variable names. */
const THEME_TO_CSS: Record<keyof import("../types").PluginUiTheme, string> = {
  fieldGap: "--plugin-field-gap",
  groupGap: "--plugin-group-gap",
  sectionPadding: "--plugin-section-padding",
  labelSize: "--plugin-label-size",
  helpSize: "--plugin-help-size",
  errorSize: "--plugin-error-size",
  labelColor: "--plugin-label",
  helpColor: "--plugin-help",
  errorColor: "--plugin-error",
  borderColor: "--plugin-border",
  focusRing: "--plugin-focus-ring",
  inputHeight: "--plugin-input-height",
  maxFieldWidth: "--plugin-max-field-width",
};

// ── Component ──────────────────────────────────────────────────────────

export const ConfigRenderer = forwardRef<
  ConfigRendererHandle,
  ConfigRendererProps
>(function ConfigRenderer(
  {
    schema,
    hints = {},
    values = {},
    setKeys = new Set(),
    registry,
    pluginId = "",
    revealSecret,
    onChange,
    renderField: renderFieldOverride,
    showValidationSummary = true,
    renderMode = "legacy",
    theme,
  }: ConfigRendererProps,
  ref,
) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [groupOpenState, setGroupOpenState] = useState<Record<string, boolean>>(
    {},
  );
  const [fieldErrors, setFieldErrors] = useState<Map<string, string[]>>(
    new Map(),
  );

  // ── Validation pipeline (4 stages) ──────────────────────────────────

  const validateField = useCallback(
    (field: ResolvedField, value: unknown): string[] => {
      const errors: string[] = [];

      // 1. Required check
      if (field.required && (value == null || value === "")) {
        errors.push("This field is required.");
      }

      // 2. Zod validation
      if (value != null && value !== "") {
        const result = registry.catalog.validate(field.fieldType, value);
        if (!result.success) {
          errors.push(...result.error.issues.map((i) => i.message));
        }
      }

      // 3. Pattern validation from hints
      if (field.hint.pattern && typeof value === "string" && value) {
        try {
          // Guard against ReDoS: reject overly long or nested-quantifier patterns
          const pat = field.hint.pattern;
          if (pat.length <= 200 && !/([+*])\)?[+*]/.test(pat)) {
            if (!new RegExp(pat).test(value)) {
              errors.push(field.hint.patternError ?? "Invalid format.");
            }
          }
        } catch {
          // invalid regex in hint — skip
        }
      }

      // 4. Declarative validation checks (json-render style)
      if (field.validation) {
        const checkResult = runValidation(
          field.validation,
          value,
          values,
          registry.catalog.functions,
        );
        if (!checkResult.valid) {
          errors.push(...checkResult.errors);
        }
      }

      return errors;
    },
    [registry, values],
  );

  // ── Visibility evaluation ────────────────────────────────────────────

  const isFieldVisible = useCallback(
    (field: ResolvedField): boolean => {
      // Hidden fields are never visible
      if (field.hidden) return false;

      // Rich visibility condition (json-render style) takes priority
      if (field.visible !== undefined) {
        return evaluateVisibility(field.visible, values);
      }

      // Legacy showIf fallback
      return evaluateShowIf(field.showIf, values);
    },
    [values],
  );

  // ── Field change handler ─────────────────────────────────────────────

  const handleFieldChange = useCallback(
    (field: ResolvedField, value: unknown): void => {
      // Validate and store errors
      const errors = validateField(field, value);
      setFieldErrors((prev) => {
        const next = new Map(prev);
        if (errors.length > 0) {
          next.set(field.key, errors);
        } else {
          next.delete(field.key);
        }
        return next;
      });

      onChange?.(field.key, value);
    },
    [validateField, onChange],
  );

  const toggleGroupOpen = useCallback((group: string) => {
    setGroupOpenState((prev) => ({
      ...prev,
      [group]: !(prev[group] ?? true),
    }));
  }, []);

  // ── Action execution ─────────────────────────────────────────────────

  const executeAction = useCallback(
    async (
      action: string,
      params?: Record<string, unknown>,
    ): Promise<unknown> => {
      const handler = registry.resolveAction(action);
      if (!handler) {
        console.warn(`[config-renderer] No handler for action: ${action}`);
        return undefined;
      }
      return handler(params ?? {}, values);
    },
    [registry, values],
  );

  // ── Build render props for a field ───────────────────────────────────

  const buildRenderProps = useCallback(
    (field: ResolvedField): FieldRenderProps => {
      const isSensitive = field.hint.sensitive === true;
      return {
        key: field.key,
        value: values[field.key],
        schema: field.schema,
        hint: field.hint,
        fieldType: field.fieldType,
        onChange: (value: unknown) => handleFieldChange(field, value),
        isSet: setKeys.has(field.key),
        required: field.required,
        errors: fieldErrors.get(field.key),
        readonly: field.readonly,
        uiMode: renderMode,
        onReveal:
          isSensitive && revealSecret && pluginId
            ? () => revealSecret(pluginId, field.key)
            : undefined,
        onAction: (action: string, params?: Record<string, unknown>) =>
          executeAction(action, params),
      };
    },
    [
      values,
      setKeys,
      fieldErrors,
      handleFieldChange,
      revealSecret,
      pluginId,
      executeAction,
    ],
  );

  // ── Render a single field ────────────────────────────────────────────

  const renderField = useCallback(
    (field: ResolvedField) => {
      const rp = buildRenderProps(field);
      const renderer = registry.resolveOrFallback(field.fieldType);

      if (renderFieldOverride) {
        return (
          <div key={field.key} className={widthClass(field.width)}>
            {renderFieldOverride(rp, renderer)}
          </div>
        );
      }

      return (
        <div key={field.key} className={widthClass(field.width)}>
          <ConfigField
            renderProps={rp}
            renderer={renderer}
            pluginId={pluginId}
          />
        </div>
      );
    },
    [buildRenderProps, registry, renderFieldOverride, pluginId],
  );

  // ── Resolve and partition fields ─────────────────────────────────────

  const { groups, advanced, showHeaders, allVisibleFields } = useMemo(() => {
    if (!schema)
      return {
        groups: new Map<string, ResolvedField[]>(),
        advanced: [] as ResolvedField[],
        showHeaders: false,
        allVisibleFields: [] as ResolvedField[],
      };

    const catalog = registry.catalog;
    const allFields = resolveFields(schema, hints, catalog);

    // Filter: hidden fields, showIf + rich visibility conditions
    const visibleFields = allFields.filter(isFieldVisible);

    const generalFields = visibleFields.filter((f) => !f.advanced);
    const advancedFields = visibleFields.filter((f) => f.advanced);

    // Group general fields, sort required-unconfigured to the top within each group
    const fieldGroups = new Map<string, ResolvedField[]>();
    for (const f of generalFields) {
      const g = fieldGroups.get(f.group) ?? [];
      g.push(f);
      fieldGroups.set(f.group, g);
    }
    for (const [, fields] of fieldGroups) {
      fields.sort((a, b) => {
        const aEmpty =
          a.required && (values[a.key] == null || values[a.key] === "");
        const bEmpty =
          b.required && (values[b.key] == null || values[b.key] === "");
        if (aEmpty && !bEmpty) return -1;
        if (!aEmpty && bEmpty) return 1;
        return (a.hint.order ?? 999) - (b.hint.order ?? 999);
      });
    }

    return {
      groups: fieldGroups,
      advanced: advancedFields,
      showHeaders: fieldGroups.size > 1,
      allVisibleFields: visibleFields,
    };
  }, [schema, hints, registry, isFieldVisible, values]);

  // ── Field labels for validation summary ────────────────────────────

  const fieldLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const field of allVisibleFields) {
      labels.set(field.key, field.hint.label ?? field.key);
    }
    return labels;
  }, [allVisibleFields]);

  // ── Validate all visible fields ────────────────────────────────────

  const validateAll = useCallback((): boolean => {
    const nextErrors = new Map<string, string[]>();
    for (const field of allVisibleFields) {
      const errors = validateField(field, values[field.key]);
      if (errors.length > 0) {
        nextErrors.set(field.key, errors);
      }
    }
    setFieldErrors(nextErrors);
    return nextErrors.size === 0;
  }, [allVisibleFields, validateField, values]);

  // ── Expose validateAll to parent via ref ───────────────────────────

  useImperativeHandle(ref, () => ({ validateAll }), [validateAll]);

  // ── Configuration progress ─────────────────────────────────────────

  const configProgress = useMemo(() => {
    const total = allVisibleFields.length;
    if (total === 0) return null;
    const isConfigured = (f: ResolvedField) => {
      if (setKeys.has(f.key)) return true;
      const v = values[f.key];
      return v != null && v !== "";
    };
    const configured = allVisibleFields.filter(isConfigured).length;
    const requiredTotal = allVisibleFields.filter((f) => f.required).length;
    const requiredSet = allVisibleFields.filter(
      (f) => f.required && isConfigured(f),
    ).length;
    return { total, configured, requiredTotal, requiredSet };
  }, [allVisibleFields, values, setKeys]);

  // ── Theme style ────────────────────────────────────────────────────

  const themeStyle = useMemo(() => {
    if (!theme) return undefined;
    const style: Record<string, string> = {};
    for (const [key, value] of Object.entries(theme)) {
      const cssVar = THEME_TO_CSS[key as keyof typeof THEME_TO_CSS];
      if (cssVar && value) {
        style[cssVar] = value;
      }
    }
    return Object.keys(style).length > 0 ? style : undefined;
  }, [theme]);

  // ── Empty state ──────────────────────────────────────────────────────

  if (!schema) {
    return (
      <div className="text-xs text-[var(--muted)] italic py-3">
        No schema provided.
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────

  const minimalChrome = renderMode !== "legacy";

  return (
    <div style={themeStyle}>
      {/* Progress indicator */}
      {!minimalChrome &&
        configProgress &&
        configProgress.requiredTotal > 0 &&
        configProgress.requiredSet < configProgress.requiredTotal && (
          <div className="mb-4 px-3.5 py-2.5 border border-[var(--warning,#f39c12)] bg-[color-mix(in_srgb,var(--warning,#f39c12)_6%,transparent)] rounded-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-semibold text-[var(--warning,#f39c12)]">
                {configProgress.requiredSet}/{configProgress.requiredTotal}{" "}
                required fields configured
              </span>
              <span className="text-[11px] text-[var(--muted)]">
                {configProgress.configured}/{configProgress.total} total
              </span>
            </div>
            <div className="w-full h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--warning,#f39c12)] rounded-full transition-all duration-300"
                style={{
                  width: `${(configProgress.requiredSet / configProgress.requiredTotal) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

      {showValidationSummary && fieldErrors.size > 0 ? (
        <ValidationSummary
          fieldErrors={fieldErrors}
          fieldLabels={fieldLabels}
          pluginId={pluginId}
        />
      ) : null}

      {[...groups.entries()].map(([group, fields], groupIndex) => {
        const normalizedGroup = group.trim().toLowerCase();
        const displayGroup =
          normalizedGroup === "destinations" ? "Channels" : group;
        const GroupIcon = groupIcon(displayGroup);
        const isCollapsibleGroup =
          normalizedGroup === "destinations" || normalizedGroup === "channels";
        const isGroupOpen = isCollapsibleGroup
          ? (groupOpenState[group] ?? true)
          : true;
        const visibleChannelCount = fields.filter((field) =>
          /^STREAM555_DEST_[A-Z0-9]+_ENABLED$/i.test(field.key),
        ).length;
        const channelBaseCount = new Set(
          fields
            .map((field) =>
              field.key.match(
                /^(STREAM555_DEST_[A-Z0-9]+)_(?:ENABLED|RTMP_URL|STREAM_KEY)$/i,
              ),
            )
            .filter((match): match is RegExpMatchArray => Boolean(match))
            .map((match) => match[1]),
        ).size;
        const groupCount =
          isCollapsibleGroup &&
          (channelBaseCount > 0 || visibleChannelCount > 0)
            ? Math.max(channelBaseCount, visibleChannelCount)
            : fields.length;

        return (
          <div key={group} className={groupIndex > 0 ? "mt-5" : ""}>
            {(!minimalChrome ? showHeaders || isCollapsibleGroup : isCollapsibleGroup) &&
              (isCollapsibleGroup ? (
                <button
                  type="button"
                  className={
                    minimalChrome
                      ? "group mb-3 flex w-full items-center gap-3 border-none bg-transparent p-0 text-left"
                      : "group mb-3 flex w-full items-center gap-2 border-none bg-transparent p-0 text-left"
                  }
                  onClick={() => toggleGroupOpen(group)}
                  aria-expanded={isGroupOpen}
                >
                  <ChevronRightIcon
                    className={
                      minimalChrome
                        ? `h-3.5 w-3.5 text-white/42 transition-transform duration-200 group-hover:text-white/70 ${isGroupOpen ? "rotate-90" : ""}`
                        : `h-3.5 w-3.5 text-[var(--muted)] transition-transform duration-200 group-hover:text-[var(--text)] ${isGroupOpen ? "rotate-90" : ""}`
                    }
                  />
                  <span className={minimalChrome ? "inline-flex text-base leading-none opacity-80" : "inline-flex text-base leading-none"}>
                    <GroupIcon className="h-[18px] w-[18px]" />
                  </span>
                  <span
                    className={
                      minimalChrome
                        ? "text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62"
                        : "text-[12px] font-bold uppercase tracking-wider text-[var(--text)] opacity-70"
                    }
                  >
                    {displayGroup}
                  </span>
                  <span
                    className={
                      minimalChrome
                        ? "inline-flex min-h-6 min-w-[1.75rem] items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-white/58"
                        : "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold bg-[var(--accent-subtle,rgba(255,255,255,0.05))] text-[var(--accent)] border border-[var(--border)] rounded-sm"
                    }
                  >
                    {groupCount}
                  </span>
                  <span className={minimalChrome ? "ml-1 h-px flex-1 bg-white/10" : "ml-1 h-px flex-1 bg-[var(--border)]"} />
                </button>
              ) : (
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex text-base leading-none">
                    <GroupIcon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--text)] opacity-70">
                    {displayGroup}
                  </span>
                  <span className="flex-1 h-px bg-[var(--border)] ml-1" />
                </div>
              ))}
              {isGroupOpen && (
                <div className="grid grid-cols-6 gap-x-5 gap-y-0">
                  {fields.map((f) => renderField(f))}
                </div>
              )}
            </div>
          );
        })}

      {advanced.length > 0 && (
        <div className={minimalChrome ? "mt-6 border-t border-white/10 pt-4" : "mt-5 border-t border-[var(--border)] pt-4"}>
          <button
            type="button"
            className={
              minimalChrome
                ? "group mb-3 flex w-full items-center gap-3 cursor-pointer select-none"
                : "group mb-3 flex items-center gap-2 cursor-pointer select-none"
            }
            onClick={() => setAdvancedOpen((prev) => !prev)}
          >
            <ChevronRightIcon
              className={
                minimalChrome
                  ? `h-3.5 w-3.5 text-white/42 transition-transform duration-200 group-hover:text-white/70 ${advancedOpen ? "rotate-90" : ""}`
                  : `h-3.5 w-3.5 text-[var(--muted)] transition-transform duration-200 group-hover:text-[var(--text)] ${advancedOpen ? "rotate-90" : ""}`
              }
            />
            <span
              className={
                minimalChrome
                  ? "text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62 transition-colors group-hover:text-white/82"
                  : "text-[12px] font-bold uppercase tracking-wider text-[var(--muted)] transition-colors group-hover:text-[var(--text)]"
              }
            >
              {minimalChrome ? "Advanced settings" : "Advanced"}
            </span>
            <span
              className={
                minimalChrome
                  ? "inline-flex min-h-6 min-w-[1.75rem] items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-white/58"
                  : "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold bg-[var(--accent-subtle,rgba(255,255,255,0.05))] text-[var(--accent)] border border-[var(--border)] rounded-sm"
              }
            >
              {advanced.length}
            </span>
            <span className={minimalChrome ? "ml-1 h-px flex-1 bg-white/10" : "ml-1 h-px flex-1 bg-[var(--border)] opacity-50"} />
          </button>
          {advancedOpen && (
            <div className="grid grid-cols-6 gap-x-5 gap-y-0 pt-1 animate-[cr-slide_var(--duration-normal,200ms)_ease]">
              {advanced.map((f) => renderField(f))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── Default registry ───────────────────────────────────────────────────

// Import actual field renderers
import { defaultRenderers } from "./config-field";

/** The default registry wiring defaultCatalog → defaultRenderers. */
export const defaultRegistry = defineRegistry(defaultCatalog, defaultRenderers);

// ── useConfigValidation hook ────────────────────────────────────────────

/**
 * Convenience hook that creates a ref for ConfigRenderer and exposes
 * a `validateAll()` function the parent can call before submitting.
 *
 * @example
 * ```tsx
 * const { configRef, validateAll } = useConfigValidation();
 *
 * const handleSave = () => {
 *   if (!validateAll()) return; // form has errors
 *   // proceed with save
 * };
 *
 * return <ConfigRenderer ref={configRef} ... />;
 * ```
 */
export function useConfigValidation() {
  const configRef = React.useRef<ConfigRendererHandle>(null);

  const validateAll = useCallback((): boolean => {
    if (!configRef.current) return true;
    return configRef.current.validateAll();
  }, []);

  return { configRef, validateAll };
}
