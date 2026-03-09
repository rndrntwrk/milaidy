import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type {
  StreamEventEnvelope,
  TriggerSummary,
  WorkbenchTask,
  WorkbenchTodo,
} from "../api-client";
import { ChatAvatar } from "./ChatAvatar";
import { formatTime } from "./shared/format";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import {
  AgentIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  MicIcon,
  SystemIcon,
} from "./ui/Icons";

function getEventText(event: StreamEventEnvelope): string {
  const payload = event.payload as Record<
    string,
    string | number | boolean | null | object | undefined
  >;
  const text = payload.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  const preview = payload.preview;
  if (typeof preview === "string" && preview.trim()) return preview.trim();
  const reason = payload.reason;
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  return event.stream ? `${event.stream} event` : event.type;
}

function getEventTone(event: StreamEventEnvelope): string {
  if (event.type === "heartbeat_event") return "text-accent";
  if (event.stream === "error") return "text-danger";
  if (
    event.stream === "action" ||
    event.stream === "tool" ||
    event.stream === "provider"
  ) {
    return "text-ok";
  }
  if (event.stream === "assistant") return "text-accent";
  return "text-white/52";
}

function isThoughtStream(stream: string | undefined): boolean {
  return stream === "assistant" || stream === "evaluator";
}

function isActionStream(stream: string | undefined): boolean {
  return stream === "action" || stream === "tool" || stream === "provider";
}

interface AutonomousPanelProps {
  mobile?: boolean;
  onClose?: () => void;
}

export function AutonomousPanel({
  mobile = false,
  onClose,
}: AutonomousPanelProps) {
  const {
    agentStatus,
    autonomousEvents,
    workbench,
    workbenchLoading,
    workbenchTasksAvailable,
    workbenchTriggersAvailable,
    workbenchTodosAvailable,
    chatAvatarVisible,
    chatAgentVoiceMuted,
    chatAvatarSpeaking,
    setState,
  } = useApp();

  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [triggersCollapsed, setTriggersCollapsed] = useState(false);
  const [todosCollapsed, setTodosCollapsed] = useState(false);
  const [eventsCollapsed, setEventsCollapsed] = useState(false);

  const events = useMemo(
    () => autonomousEvents.slice(-120).reverse(),
    [autonomousEvents],
  );
  const latestThought = useMemo(
    () =>
      autonomousEvents
        .slice()
        .reverse()
        .find((event) => isThoughtStream(event.stream)),
    [autonomousEvents],
  );
  const latestAction = useMemo(
    () =>
      autonomousEvents
        .slice()
        .reverse()
        .find((event) => isActionStream(event.stream)),
    [autonomousEvents],
  );

  const isAgentStopped = agentStatus?.state === "stopped" || !agentStatus;
  const tasks = workbench?.tasks ?? [];
  const triggers = workbench?.triggers ?? [];
  const todos = workbench?.todos ?? [];

  return (
    <aside
      className="hidden h-full flex-col border-l border-white/10 bg-white/[0.03] font-body text-[13px] lg:flex lg:min-w-[320px] lg:w-[320px] xl:min-w-[420px] xl:w-[420px]"
      data-testid="autonomous-panel"
    >
      <div className="flex items-start justify-between gap-2 border-b border-white/10 px-3 py-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.22em] text-white/44">
            {mobile ? "Status" : "Autonomous Loop"}
          </div>
          <div className="mt-1 text-[12px] text-white/54">
            {agentStatus?.state === "running"
              ? "Live stream connected"
              : `Agent state: ${agentStatus?.state ?? "offline"}`}
          </div>
        </div>
        {mobile && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Close autonomous panel"
          >
            <CloseIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isAgentStopped ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-white/45">Agent not running</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="border-b border-white/10 px-3 py-3">
            <div className="mb-2 text-xs uppercase tracking-[0.22em] text-white/40">
              Current
            </div>
            <div className="grid gap-2">
              <Card className="border-white/8 bg-white/[0.03]">
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
                    <SystemIcon className="h-3.5 w-3.5" />
                    Latest summary
                  </div>
                  <div className="text-sm text-white/82">
                    {latestThought
                      ? getEventText(latestThought)
                      : "No summary events yet"}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/8 bg-white/[0.03]">
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
                    <AgentIcon className="h-3.5 w-3.5" />
                    Latest action
                  </div>
                  <div className="text-sm text-white/82">
                    {latestAction
                      ? getEventText(latestAction)
                      : "No action events yet"}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="border-b border-white/10">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/42 transition-colors hover:bg-white/[0.04]"
              onClick={() => setEventsCollapsed(!eventsCollapsed)}
            >
              <span>Event Stream ({events.length})</span>
              {eventsCollapsed ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
            {!eventsCollapsed && (
              <div className="space-y-2 px-3 pb-3">
                {events.length === 0 ? (
                  <div className="py-2 text-sm text-white/45">No events yet</div>
                ) : (
                  events.map((event) => (
                    <Card
                      key={event.eventId}
                      className="border-white/8 bg-white/[0.03]"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[11px] uppercase tracking-[0.18em] ${getEventTone(event)}`}
                          >
                            {event.stream ?? event.type}
                          </span>
                          <span className="text-[11px] text-white/36">
                            {formatTime(event.ts, { fallback: "—" })}
                          </span>
                        </div>
                        <div className="mt-1 break-words text-[12px] text-white/74">
                          {getEventText(event)}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>

          {workbenchLoading ? (
            <div className="flex items-center justify-center py-5">
              <p className="text-white/45">Loading workbench&hellip;</p>
            </div>
          ) : (
            <>
              {workbenchTasksAvailable && (
                <div className="border-b border-white/10">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/42 transition-colors hover:bg-white/[0.04]"
                    onClick={() => setTasksCollapsed(!tasksCollapsed)}
                  >
                    <span>Tasks ({tasks.length})</span>
                    {tasksCollapsed ? (
                      <ChevronRightIcon className="h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4" />
                    )}
                  </button>
                  {!tasksCollapsed && (
                    <div className="space-y-2 px-3 py-2">
                      {tasks.length === 0 ? (
                        <div className="py-2 text-sm text-white/45">No tasks</div>
                      ) : (
                        tasks.map((task: WorkbenchTask) => (
                          <Card key={task.id} className="border-white/8 bg-white/[0.03]">
                            <CardContent className="flex gap-2 p-3">
                              <input
                                type="checkbox"
                                checked={task.isCompleted}
                                readOnly
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div
                                  className={`text-white/84 ${
                                    task.isCompleted ? "line-through opacity-60" : ""
                                  }`}
                                >
                                  {task.name}
                                </div>
                                {task.tags.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {task.tags.map((tag: string) => (
                                      <span
                                        key={tag}
                                        className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/48"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {workbenchTriggersAvailable && (
                <div className="border-b border-white/10">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/42 transition-colors hover:bg-white/[0.04]"
                    onClick={() => setTriggersCollapsed(!triggersCollapsed)}
                  >
                    <span>Triggers ({triggers.length})</span>
                    {triggersCollapsed ? (
                      <ChevronRightIcon className="h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4" />
                    )}
                  </button>
                  {!triggersCollapsed && (
                    <div className="space-y-2 px-3 py-2">
                      {triggers.length === 0 ? (
                        <div className="py-2 text-sm text-white/45">No triggers</div>
                      ) : (
                        triggers.map((trigger: TriggerSummary) => (
                          <Card key={trigger.id} className="border-white/8 bg-white/[0.03]">
                            <CardContent className="space-y-1 p-3">
                              <div className="text-white/84">{trigger.displayName}</div>
                              <div className="text-[11px] text-white/44">
                                {trigger.triggerType} · {trigger.enabled ? "enabled" : "disabled"} · runs {" "}
                                {trigger.runCount}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {workbenchTodosAvailable && (
                <div className="border-b border-white/10">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/42 transition-colors hover:bg-white/[0.04]"
                    onClick={() => setTodosCollapsed(!todosCollapsed)}
                  >
                    <span>Todos ({todos.length})</span>
                    {todosCollapsed ? (
                      <ChevronRightIcon className="h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4" />
                    )}
                  </button>
                  {!todosCollapsed && (
                    <div className="space-y-2 px-3 py-2">
                      {todos.length === 0 ? (
                        <div className="py-2 text-sm text-white/45">No todos</div>
                      ) : (
                        todos.map((todo: WorkbenchTodo) => (
                          <Card
                            key={todo.id}
                            className="border-white/8 bg-white/[0.03]"
                          >
                            <CardContent className="flex items-start gap-2 p-3">
                              <input
                                type="checkbox"
                                checked={todo.isCompleted}
                                readOnly
                                className="mt-0.5"
                              />
                              <div
                                className={`flex-1 text-white/82 ${
                                  todo.isCompleted ? "line-through opacity-60" : ""
                                }`}
                              >
                                {todo.name}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="border-t border-white/10 px-3 py-3">
        <div className="mb-2 text-xs uppercase tracking-[0.22em] text-white/40">
          Chat Controls
        </div>

        <Card
          className={`${mobile ? "h-[300px]" : "h-[260px] xl:h-[320px] 2xl:h-[420px]"} relative overflow-hidden border-white/10 bg-white/[0.03]`}
        >
          {chatAvatarVisible ? (
            <ChatAvatar isSpeaking={chatAvatarSpeaking} />
          ) : (
            <div className="flex h-full w-full items-end justify-center pb-5 text-xs text-white/45">
              Avatar hidden
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-2 pt-2">
          <div className="text-[10px] leading-relaxed text-white/44">
            Channel profile is selected automatically from message channel type.
            Voice messages always use fast compact mode for lower latency.
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="sm"
              variant={chatAvatarVisible ? "secondary" : "outline"}
              onClick={() => setState("chatAvatarVisible", !chatAvatarVisible)}
              title={chatAvatarVisible ? "Hide avatar" : "Show avatar"}
            >
              {chatAvatarVisible ? (
                <EyeIcon className="h-4 w-4" />
              ) : (
                <EyeOffIcon className="h-4 w-4" />
              )}
              Avatar
            </Button>

            <Button
              size="sm"
              variant={chatAgentVoiceMuted ? "outline" : "secondary"}
              onClick={() => setState("chatAgentVoiceMuted", !chatAgentVoiceMuted)}
              title={
                chatAgentVoiceMuted ? "Unmute agent voice" : "Mute agent voice"
              }
            >
              <MicIcon className="h-4 w-4" />
              Voice
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
