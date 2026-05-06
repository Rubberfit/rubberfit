import * as React from "react"
import { AlertTriangle } from "lucide-react"

import { cn } from "@/app/lib/utils"

/**
 * Phase 2 form primitives. See
 * `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md`.
 *
 * These wrap the existing shadcn `<Input>` / `<Select>` /
 * `<Switch>` / `<Checkbox>` controls. They contribute the
 * label / helper / error / required-marker structure plus the
 * mono-uppercase eyebrow language. They do NOT re-style the
 * underlying controls — the controls already use Phase 1
 * tokens (`--ring`, `--input`, `--primary`).
 */

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visible field label. */
  label: React.ReactNode
  /** `htmlFor` on the label + `id` on the rendered control. */
  htmlFor?: string
  /** Show a signal-orange `*` after the label. */
  required?: boolean
  /** Inline helper line beneath the control. Hidden when `error` is set. */
  helperText?: React.ReactNode
  /** Error message — when present, helperText is suppressed and the wrapper sets `data-invalid`. */
  errorText?: React.ReactNode
  /** The actual control (`<Input>`, `<Select>`, etc.). */
  children: React.ReactNode
}

/**
 * Field wrapper that renders the mono uppercase label, an optional
 * required marker, the control, and helper / error text.
 *
 * Callers wire `aria-invalid` and `aria-describedby` on the control
 * themselves — `FormField` exposes the right ids via the `htmlFor`
 * prop and a derived helper / error id, but does not inject props.
 *
 *   <FormField label="Display name" htmlFor="display-name" required helperText="…">
 *     <Input id="display-name" aria-describedby="display-name-helper" />
 *   </FormField>
 */
export function FormField({
  label,
  htmlFor,
  required,
  helperText,
  errorText,
  children,
  className,
  ...props
}: FormFieldProps) {
  const isInvalid = Boolean(errorText)
  const helperId = htmlFor && helperText ? `${htmlFor}-helper` : undefined
  const errorId = htmlFor && errorText ? `${htmlFor}-error` : undefined

  return (
    <div
      data-slot="form-field"
      data-invalid={isInvalid || undefined}
      className={cn("flex w-full flex-col gap-2", className)}
      {...props}
    >
      <label
        htmlFor={htmlFor}
        className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] leading-4 text-foreground/80"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 align-top text-primary">
            *
          </span>
        ) : null}
      </label>
      {children}
      {errorText ? (
        <p
          id={errorId}
          role="alert"
          className="mt-0 flex items-center gap-1.5 text-xs leading-4 font-medium text-foreground"
        >
          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
          <span>{errorText}</span>
        </p>
      ) : helperText ? (
        <p id={helperId} className="mt-0 text-xs leading-4 text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}

/** Vertical stack of fields inside a section. */
export function FormFieldGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="form-field-group" className={cn("space-y-5", className)} {...props} />
}

/** Two-up paired fields, mobile-first. */
export function FormFieldRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="form-field-row"
      className={cn("grid gap-4 sm:grid-cols-2", className)}
      {...props}
    />
  )
}

export interface FormFieldsetProps extends React.HTMLAttributes<HTMLElement> {
  /** When the fieldset is the first within a `<FormSectionHeader>` content slot, suppress the top border. Defaults to `false`. */
  isFirst?: boolean
}

/**
 * Sub-section inside a section. Adds a hairline top border to
 * separate it from the previous fieldset, unless `isFirst`.
 */
export function FormFieldset({ className, isFirst, ...props }: FormFieldsetProps) {
  return (
    <section
      data-slot="form-fieldset"
      className={cn("pt-6", isFirst ? "first:pt-0" : "border-t border-border-subtle", className)}
      {...props}
    />
  )
}
