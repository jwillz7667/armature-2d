import { useState, type ReactElement, type ReactNode } from 'react';
import type { CurveType } from '@marionette/format/types';

export const fieldLabel = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 'any',
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  disabled?: boolean;
}): ReactElement {
  return (
    <label className="authoring-field">
      <span>{fieldLabel(label)}</span>
      <input
        type="number"
        disabled={disabled}
        required
        key={`${value}:${min}:${max}`}
        defaultValue={value}
        min={min}
        max={max}
        step={step}
        onBlur={(event) => {
          const input = event.currentTarget;
          const next = input.valueAsNumber;
          if (Number.isFinite(next) && input.validity.valid && next !== value) onChange(next);
          else input.value = String(value);
        }}
      />
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <label className="authoring-field">
      <span>{fieldLabel(label)}</span>
      <input
        key={value}
        defaultValue={value}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim();
          if (next && next !== value) onChange(next);
          else event.currentTarget.value = value;
        }}
      />
    </label>
  );
}

export function ChoiceInput<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly T[];
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <label className="authoring-field">
      <span>{fieldLabel(label)}</span>
      <select
        value={value}
        onChange={(event) => {
          const found = choices.find((c) => c === event.currentTarget.value);
          if (found !== undefined) onChange(found);
        }}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {fieldLabel(choice)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): ReactElement {
  return (
    <label className="authoring-field">
      <span>{fieldLabel(label)}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function Group({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}): ReactElement {
  return (
    <details className="authoring-group" open={open}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

export function CurveInput({
  curve,
  onChange,
}: {
  curve: CurveType;
  onChange: (value: CurveType) => void;
}): ReactElement {
  const kind = typeof curve === 'string' ? curve : 'bezier';
  return (
    <div>
      <ChoiceInput
        label="Easing"
        value={kind}
        choices={['linear', 'stepped', 'bezier']}
        onChange={(value) =>
          onChange(
            value === 'linear' || value === 'stepped'
              ? value
              : { type: 'bezier', cx1: 0.25, cy1: 0.1, cx2: 0.25, cy2: 1 },
          )
        }
      />
      {typeof curve !== 'string' &&
        (['cx1', 'cy1', 'cx2', 'cy2'] as const).map((field) => (
          <NumberInput
            key={field}
            label={field}
            value={curve[field]}
            {...(field.startsWith('cx') ? { min: 0, max: 1 } : {})}
            onChange={(value) => onChange({ ...curve, [field]: value })}
          />
        ))}
    </div>
  );
}

// Discrete commands can fail validation. Keep the error next to the editing action, and let the
// caller use the same runner for inputs and buttons without swallowing an unhandled rejection.
export function useAuthoringError(): {
  error: ReactElement | null;
  run: (operation: () => void) => void;
} {
  const [message, setMessage] = useState('');
  return {
    error: message ? (
      <p role="alert" style={{ color: '#ffad9e' }}>
        {message}
      </p>
    ) : null,
    run: (operation) => {
      try {
        operation();
        setMessage('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'The edit could not be applied.');
      }
    },
  };
}
