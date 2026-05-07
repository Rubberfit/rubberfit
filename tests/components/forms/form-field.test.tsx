/**
 * Phase 2 form primitives — unit tests for the wrapper structure.
 * Spec: `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md`.
 *
 * What this pins:
 *   - `FormField` renders the label tied to the control via `htmlFor`.
 *   - Required marker shows when `required` is set.
 *   - Helper text is suppressed once an error is set (mutual exclusion).
 *   - The wrapper exposes `data-invalid` when an error is present so
 *     parent surfaces can style the section consistently.
 *   - `FormFieldRow` and `FormFieldGroup` render with the expected slots
 *     so DOM-test selectors keep working in PR 2-4.
 *   - `FormSectionHeader` renders the eyebrow + chosen heading level.
 *
 * Uses plain Vitest assertions; the project doesn't pull in jest-dom.
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import {
  FormField,
  FormFieldGroup,
  FormFieldRow,
  FormFieldset,
  FormSectionHeader,
  FormActions,
} from "@/app/components/ui/forms"

describe("FormField", () => {
  it("renders label tied to the control via htmlFor", () => {
    render(
      <FormField label="Display name" htmlFor="display-name">
        <input id="display-name" />
      </FormField>
    )
    const label = screen.getByText("Display name")
    expect(label.tagName).toBe("LABEL")
    expect(label.getAttribute("for")).toBe("display-name")
  })

  it("renders the required marker when required is set", () => {
    render(
      <FormField label="Email" htmlFor="email" required>
        <input id="email" />
      </FormField>
    )
    const marker = screen.getByText("*")
    expect(marker.getAttribute("aria-hidden")).toBe("true")
  })

  it("does not render a required marker by default", () => {
    render(
      <FormField label="Phone" htmlFor="phone">
        <input id="phone" />
      </FormField>
    )
    expect(screen.queryByText("*")).toBeNull()
  })

  it("shows helper text and not error text by default", () => {
    render(
      <FormField label="Name" htmlFor="name" helperText="Visible to teammates">
        <input id="name" />
      </FormField>
    )
    expect(screen.getByText("Visible to teammates")).not.toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    const wrapper = screen.getByText("Name").closest('[data-slot="form-field"]')
    expect(wrapper?.getAttribute("data-invalid")).toBeNull()
  })

  it("suppresses helper text when error text is provided and exposes data-invalid", () => {
    render(
      <FormField
        label="Name"
        htmlFor="name"
        helperText="Visible to teammates"
        errorText="Name is required"
      >
        <input id="name" />
      </FormField>
    )
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Name is required")
    expect(screen.queryByText("Visible to teammates")).toBeNull()
    const wrapper = screen.getByText("Name").closest('[data-slot="form-field"]')
    expect(wrapper?.getAttribute("data-invalid")).toBe("true")
  })
})

describe("FormFieldGroup / FormFieldRow / FormFieldset", () => {
  it("FormFieldGroup renders a div with the form-field-group slot", () => {
    render(
      <FormFieldGroup>
        <span>child</span>
      </FormFieldGroup>
    )
    const group = screen.getByText("child").parentElement
    expect(group?.getAttribute("data-slot")).toBe("form-field-group")
  })

  it("FormFieldRow renders a grid container", () => {
    render(
      <FormFieldRow>
        <span>a</span>
        <span>b</span>
      </FormFieldRow>
    )
    const row = screen.getByText("a").parentElement
    expect(row?.getAttribute("data-slot")).toBe("form-field-row")
  })

  it("FormFieldset renders a section element with the fieldset slot", () => {
    render(
      <FormFieldset>
        <span>contents</span>
      </FormFieldset>
    )
    const section = screen.getByText("contents").parentElement
    expect(section?.tagName).toBe("SECTION")
    expect(section?.getAttribute("data-slot")).toBe("form-fieldset")
  })
})

describe("FormSectionHeader", () => {
  it("renders the eyebrow, title (h2 by default), and description", () => {
    render(
      <FormSectionHeader
        eyebrow="Inventory"
        title="Materials catalog"
        description="Records the materials your team cuts."
      />
    )
    expect(screen.getByText("Inventory")).not.toBeNull()
    const heading = screen.getByText("Materials catalog")
    expect(heading.tagName).toBe("H2")
    expect(screen.getByText(/Records the materials/)).not.toBeNull()
  })

  it("supports h3 via the `as` prop for nested fieldsets", () => {
    render(<FormSectionHeader title="Sub-section" as="h3" />)
    expect(screen.getByText("Sub-section").tagName).toBe("H3")
  })
})

describe("FormActions", () => {
  it("renders Save and Cancel buttons with default labels", () => {
    render(<FormActions />)
    expect(screen.getByRole("button", { name: "Save" })).not.toBeNull()
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeNull()
  })

  it("renders the saved-state caption when provided", () => {
    render(<FormActions savedHint="Last saved 2m ago" />)
    expect(screen.getByText("Last saved 2m ago")).not.toBeNull()
  })

  it("disables save when saveDisabled is set", () => {
    render(<FormActions saveDisabled />)
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
  })

  it("disables both buttons while isSaving is true", () => {
    render(<FormActions isSaving />)
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement
    const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(cancel.disabled).toBe(true)
  })
})
