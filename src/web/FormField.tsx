import { useId } from "react";

type FormFieldProps = {
  label: string;
  type: "text" | "email" | "password";
  value: string;
  /** Rendered under the input, for a rule the viewer should know before submitting. */
  hint?: string;
  autoComplete?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

/**
 * One labelled input.
 *
 * The hint is tied to the input with `aria-describedby` rather than placed inside the label,
 * so a screen reader announces the field by its name and reads the rule after it.
 */
export default function FormField({
  label,
  type,
  value,
  hint,
  autoComplete,
  disabled,
  onChange,
}: FormFieldProps) {
  const inputId = useId();
  const hintId = useId();

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="field__input"
        type={type}
        value={value}
        aria-describedby={hint === undefined ? undefined : hintId}
        autoComplete={autoComplete}
        disabled={disabled}
        required
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {hint === undefined ? null : (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}
