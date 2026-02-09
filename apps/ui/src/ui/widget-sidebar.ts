/**
 * Right sidebar for viewing goals and tasks.
 *
 * Read-only view with collapsible sections for Goals and Tasks.
 * Shows status messages when agent is off or plugins aren't loaded.
 */

import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { WorkbenchGoal, WorkbenchTodo } from "./api-client.js";

@customElement("widget-sidebar")
export class WidgetSidebar extends LitElement {
  @property({ type: Array }) goals: WorkbenchGoal[] = [];
  @property({ type: Array }) todos: WorkbenchTodo[] = [];
  @property({ type: Boolean }) loading = false;
  @property({ type: Boolean }) agentRunning = false;
  @property({ type: Boolean }) goalsAvailable = false;
  @property({ type: Boolean }) todosAvailable = false;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 260px;
      min-width: 260px;
      border-left: 1px solid var(--border);
      background: var(--bg);
      overflow-y: auto;
      font-size: 13px;
    }

    .sidebar-toolbar {
      padding: 6px 8px;
      display: flex;
      justify-content: flex-end;
    }

    .refresh-btn {
      border: none;
      background: none;
      color: var(--text-muted, #64748b);
      cursor: pointer;
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .refresh-btn:hover {
      background: var(--hover, #f1f5f9);
      color: var(--text);
    }

    details {
      border-bottom: 1px solid var(--border);
    }

    summary {
      padding: 10px 12px;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted, #64748b);
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    summary:hover {
      color: var(--text);
    }

    summary .count {
      font-weight: 400;
      font-size: 11px;
      background: var(--badge-bg, #f1f5f9);
      color: var(--badge-text, #475569);
      padding: 1px 6px;
      border-radius: 999px;
    }

    .section-content {
      padding: 0 8px 8px;
    }

    .item-card {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      margin-bottom: 4px;
    }

    .item-card:hover {
      background: var(--hover, #f1f5f9);
    }

    .item-check {
      margin-top: 2px;
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1.5px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }

    .item-check.done {
      background: var(--accent, #6366f1);
      border-color: var(--accent, #6366f1);
      color: white;
    }

    .item-info {
      flex: 1;
      min-width: 0;
    }

    .item-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-name.completed {
      text-decoration: line-through;
      opacity: 0.5;
    }

    .item-desc {
      font-size: 11px;
      color: var(--text-muted, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }

    .item-badges {
      display: flex;
      gap: 4px;
      margin-top: 3px;
    }

    .badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 4px;
      background: var(--badge-bg, #f1f5f9);
      color: var(--badge-text, #475569);
    }

    .badge.urgent {
      background: #fef2f2;
      color: #dc2626;
      font-weight: 600;
    }

    .badge.priority {
      background: #ede9fe;
      color: #5b21b6;
    }

    .status-msg {
      padding: 12px;
      font-size: 12px;
      color: var(--text-muted, #64748b);
      text-align: center;
      line-height: 1.4;
    }

    .status-msg.warn {
      color: #b45309;
      background: #fffbeb;
      border-radius: 6px;
      margin: 4px 8px;
      padding: 8px;
    }

    .loading-hint {
      padding: 16px;
      text-align: center;
      color: var(--text-muted, #64748b);
      font-size: 12px;
    }
  `;

  private fireRefresh() {
    this.dispatchEvent(new CustomEvent("refresh-sidebar", { bubbles: true, composed: true }));
  }

  private sortedGoals(): WorkbenchGoal[] {
    return [...this.goals].sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      const ap = (typeof a.metadata?.priority === "number" ? a.metadata.priority : 3);
      const bp = (typeof b.metadata?.priority === "number" ? b.metadata.priority : 3);
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
  }

  private sortedTodos(): WorkbenchTodo[] {
    return [...this.todos].sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      const ap = a.priority ?? 3;
      const bp = b.priority ?? 3;
      if (ap !== bp) return ap - bp;
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  render() {
    if (!this.agentRunning) {
      return html`
        <div class="status-msg">Agent is not running. Start the agent to see goals and tasks.</div>
      `;
    }

    if (this.loading && this.goals.length === 0 && this.todos.length === 0) {
      return html`
        <div class="sidebar-toolbar">
          <button class="refresh-btn" @click=${this.fireRefresh} title="Refresh">&#x21bb;</button>
        </div>
        <div class="loading-hint">Loading...</div>
      `;
    }

    const activeGoals = this.sortedGoals().filter((g) => !g.isCompleted);
    const completedGoals = this.sortedGoals().filter((g) => g.isCompleted);
    const activeTodos = this.sortedTodos().filter((t) => !t.isCompleted);
    const completedTodos = this.sortedTodos().filter((t) => t.isCompleted);

    return html`
      <div class="sidebar-toolbar">
        <button class="refresh-btn" @click=${this.fireRefresh} title="Refresh">&#x21bb;</button>
      </div>

      <details open>
        <summary>Goals <span class="count">${activeGoals.length}</span></summary>
        <div class="section-content">
          ${!this.goalsAvailable
            ? html`<div class="status-msg warn">Goals plugin not loaded. Enable @elizaos/plugin-goals to track goals.</div>`
            : activeGoals.length === 0 && completedGoals.length === 0
              ? html`<div class="status-msg">No goals yet. Goals will appear here when the agent creates them.</div>`
              : ""}
          ${activeGoals.map(
            (g) => html`
              <div class="item-card">
                <div class="item-check">&nbsp;</div>
                <div class="item-info">
                  <div class="item-name">${g.name}</div>
                  ${g.description
                    ? html`<div class="item-desc">${g.description}</div>`
                    : ""}
                  <div class="item-badges">
                    ${g.tags.map((t) => html`<span class="badge">${t}</span>`)}
                    ${typeof g.metadata?.priority === "number"
                      ? html`<span class="badge priority">P${g.metadata.priority}</span>`
                      : ""}
                  </div>
                </div>
              </div>
            `,
          )}
          ${completedGoals.map(
            (g) => html`
              <div class="item-card">
                <div class="item-check done">&#x2713;</div>
                <div class="item-info">
                  <div class="item-name completed">${g.name}</div>
                </div>
              </div>
            `,
          )}
        </div>
      </details>

      <details open>
        <summary>Tasks <span class="count">${activeTodos.length}</span></summary>
        <div class="section-content">
          ${!this.todosAvailable
            ? html`<div class="status-msg warn">Tasks plugin not loaded. Enable @elizaos/plugin-todo to track tasks.</div>`
            : activeTodos.length === 0 && completedTodos.length === 0
              ? html`<div class="status-msg">No tasks yet. Tasks will appear here when the agent creates them.</div>`
              : ""}
          ${activeTodos.map(
            (t) => html`
              <div class="item-card">
                <div class="item-check">&nbsp;</div>
                <div class="item-info">
                  <div class="item-name">
                    ${t.isUrgent ? html`<span style="color:#dc2626;font-weight:700;">!</span> ` : ""}
                    ${t.name}
                  </div>
                  ${t.description
                    ? html`<div class="item-desc">${t.description}</div>`
                    : ""}
                  <div class="item-badges">
                    ${t.isUrgent ? html`<span class="badge urgent">Urgent</span>` : ""}
                    ${t.priority != null ? html`<span class="badge priority">P${t.priority}</span>` : ""}
                  </div>
                </div>
              </div>
            `,
          )}
          ${completedTodos.map(
            (t) => html`
              <div class="item-card">
                <div class="item-check done">&#x2713;</div>
                <div class="item-info">
                  <div class="item-name completed">${t.name}</div>
                </div>
              </div>
            `,
          )}
        </div>
      </details>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "widget-sidebar": WidgetSidebar;
  }
}
