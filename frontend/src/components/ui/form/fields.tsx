"use client";

import { useId, type ReactNode } from "react";

/** Các ô nhập dùng class `.form-group` / `.form-input` của khu quản trị. */

interface BaseProps {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
}

function Wrap({ id, label, required, hint, error, children }: BaseProps & { id: string; children: ReactNode }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true" className="form-required-mark"> *</span>}
      </label>
      {children}
      {hint && !error && <small className="form-field-hint">{hint}</small>}
      {error && <small role="alert" className="form-field-error">{error}</small>}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  type = "text",
  placeholder,
  maxLength,
  autoComplete,
  inputMode,
  ...base
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "tel" | "email" | "password" | "date" | "time" | "url";
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel";
}) {
  const id = useId();
  return (
    <Wrap id={id} {...base}>
      <input
        id={id}
        className="form-input"
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        required={base.required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={base.error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Wrap>
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = "any",
  placeholder,
  ...base
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Wrap id={id} {...base}>
      <input
        id={id}
        className="form-input"
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        required={base.required}
        aria-invalid={base.error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Wrap>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  ...base
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Wrap id={id} {...base}>
      <select
        id={id}
        className="form-input"
        value={value}
        required={base.required}
        aria-invalid={base.error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function TextAreaField({
  value,
  onChange,
  rows = 3,
  maxLength,
  placeholder,
  ...base
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Wrap id={id} {...base}>
      <textarea
        id={id}
        className="form-input"
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        required={base.required}
        aria-invalid={base.error ? true : undefined}
        style={{ resize: "vertical" }}
        onChange={(event) => onChange(event.target.value)}
      />
    </Wrap>
  );
}

export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="form-group form-checkbox-group">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

/** Lưới 2 cột cho biểu mẫu (tự xuống 1 cột trên màn hình hẹp). */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="admin-form-grid">{children}</div>;
}
