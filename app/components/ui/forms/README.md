# forms/

Phase 2 form primitives for Settings + Admin surfaces. See the
locked spec at
`docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md`.

These components contribute the **structure** around a control —
mono uppercase eyebrow labels, helper / error text patterns,
required-marker convention, section headers, per-section
Save/Cancel rows. They do **not** re-style the underlying shadcn
controls (`<Input>`, `<Select>`, `<Switch>`, `<Checkbox>`,
`<Textarea>`); those already use Phase 1 tokens
(`--ring`, `--input`, `--primary`).

## Components (PR 1 — shipped)

| Component           | Purpose                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `FormField`         | Field wrapper: mono label + required marker + control slot + helper / error text.          |
| `FormFieldGroup`    | Vertical stack of fields inside a section (`space-y-5`).                                   |
| `FormFieldRow`      | Two-up paired fields, mobile-first (`grid sm:grid-cols-2`).                                |
| `FormFieldset`      | Sub-section inside a section. Hairline top border separates it from the previous fieldset. |
| `FormSectionHeader` | Eyebrow + Manrope H2 + muted Inter description. Used at the top of a section.              |
| `FormActions`       | Per-section Save / Cancel row with a left-aligned saved-state caption.                     |

## Usage

```tsx
import {
  FormField,
  FormFieldGroup,
  FormFieldRow,
  FormSectionHeader,
  FormActions,
} from "@/app/components/ui/forms"
import { Input } from "@/app/components/ui/input"

<FormSectionHeader
  eyebrow="Organization"
  title="Tenant details"
  description="Names and timezone used across receipts and notifications."
/>
<FormFieldGroup>
  <FormFieldRow>
    <FormField label="Display name" htmlFor="display-name" required>
      <Input id="display-name" defaultValue="Acme Cuts" />
    </FormField>
    <FormField label="Legal name" htmlFor="legal-name">
      <Input id="legal-name" />
    </FormField>
  </FormFieldRow>
</FormFieldGroup>
<FormActions
  savedHint="Last saved 2m ago"
  onSave={handleSave}
  onCancel={handleReset}
  saveDisabled={!isDirty}
/>
```

## Out of scope

- Switch / checkbox / radio styling — the existing shadcn primitives
  already use Phase 1 tokens; future work composes them inside
  `FormField` rather than re-implementing them.
- Inline cell-edit table primitives (Materials catalog stays a
  `DataTable` + drawer per the spec).
- Form state management — components are uncontrolled wrappers.
  Pages own their own form state.
