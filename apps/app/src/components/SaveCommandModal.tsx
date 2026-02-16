/**
 * Modal for naming and saving a custom /command from selected text.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog } from "./ui/Dialog.js";

interface SaveCommandModalProps {
  open: boolean;
  text: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$/;

export function SaveCommandModal({
  open,
  text,
  onSave,
  onClose,
}: SaveCommandModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const validate = useCallback((value: string) => {
    if (!value) return "Name is required";
    if (!NAME_PATTERN.test(value))
      return "Must start with a letter, no spaces (a-z, 0-9, -)";
    return "";
  }, []);

  const handleSubmit = useCallback(() => {
    const err = validate(name);
    if (err) {
      setError(err);
      return;
    }
    onSave(name);
  }, [name, validate, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
      if (e.key === "Escape") onClose();
    },
    [handleSubmit, onClose],
  );

  const preview = text.length > 120 ? `${text.slice(0, 120)}...` : text;

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy="save-command-title">
      <div className="w-full max-w-md border border-border bg-card shadow-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-5 py-3 border-b border-border shrink-0">
          <span id="save-command-title" className="font-bold text-sm flex-1">Save as /Command</span>
          <button
            type="button"
            className="text-muted hover:text-txt text-lg leading-none px-1 cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <label htmlFor="save-cmd-name" className="text-xs text-muted">Command name</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted" aria-hidden="true">/</span>
            <input
              id="save-cmd-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="my-command"
              aria-required="true"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "save-cmd-error" : undefined}
              className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
            />
          </div>
          {error && <p id="save-cmd-error" className="text-xs text-danger" role="alert">{error}</p>}

          <span className="text-xs text-muted mt-1">Preview</span>
          <pre className="text-xs text-muted bg-surface border border-border px-3 py-2 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
            {preview}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            className="px-3 py-1.5 text-xs border border-border text-muted hover:text-txt cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-xs border border-accent bg-accent text-accent-fg hover:opacity-90 cursor-pointer"
            onClick={handleSubmit}
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  );
}
