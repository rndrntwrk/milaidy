/**
 * Modal for naming and saving a custom /command from selected text.
 */

import { useState, useCallback, useEffect, useRef, useId } from "react";
import { Dialog } from "./ui/Dialog.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { CloseIcon } from "./ui/Icons.js";

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
  const dialogTitleId = useId();
  const inputId = useId();
  const inputLabelId = useId();
  const inputErrorId = useId();

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
      const focusTimeout = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(focusTimeout);
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  }, [handleSubmit]);

  const preview = text.length > 120 ? `${text.slice(0, 120)}...` : text;

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy={dialogTitleId}>
      <Card className="flex w-full max-w-md flex-col overflow-hidden rounded-[28px] border-white/12 bg-[#07090e]/96 shadow-[0_24px_72px_rgba(0,0,0,0.36)]">
        {/* Header */}
        <div className="flex shrink-0 items-center border-b border-white/10 px-5 py-3">
          <span id={dialogTitleId} className="flex-1 text-sm font-bold text-white">Save as /Command</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 px-5 py-4">
          <label id={inputLabelId} htmlFor={inputId} className="text-xs uppercase tracking-[0.18em] text-white/46">Command name</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-white/42" aria-hidden="true">/</span>
            <Input
              id={inputId}
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
              aria-labelledby={inputLabelId}
              aria-describedby={error ? inputErrorId : undefined}
              className="flex-1 rounded-2xl"
            />
          </div>
          {error && <p id={inputErrorId} className="text-xs text-danger" role="alert">{error}</p>}

          <span className="mt-1 text-xs uppercase tracking-[0.18em] text-white/46">Preview</span>
          <pre className="max-h-24 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs whitespace-pre-wrap break-words text-white/58">
            {preview}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="button" variant="default" size="sm" className="rounded-xl" onClick={handleSubmit}>
            Save
          </Button>
        </div>
      </Card>
    </Dialog>
  );
}
