import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const SIZE_TEXT_MAX = 200
const LABEL_MAX = 200

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateCutHistorySelectionProps {
  selectionIndex: number
  sizeValue?: number | null
  sizeText?: string | null
  label?: string | null
}

export interface CutHistorySelectionSnapshot {
  selectionIndex: number
  sizeValue: number | null
  sizeText: string | null
  label: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * One ordered selection from a cut job — the operator's choice of part
 * size + label at a given position in the job's selection list.
 *
 * Lives as a value-object collection on `CutHistory`. NOT a separate
 * entity:
 *   • No public ID. The DB row's `id` is a repo-internal detail; the
 *     identity here is `(cutHistoryId, selectionIndex)`.
 *   • Immutable after construction. Selections are set when the parent
 *     `CutHistory` is created and never modified afterward — the
 *     repository deletes-and-reinserts the whole collection on save.
 *   • Schema-level cascade delete from the parent reflects this domain
 *     coupling.
 *
 * Source: cut_history_selection table.
 */
export class CutHistorySelection {
  public readonly selectionIndex: number
  public readonly sizeValue: number | null
  public readonly sizeText: string | null
  public readonly label: string | null

  private constructor(
    selectionIndex: number,
    sizeValue: number | null,
    sizeText: string | null,
    label: string | null
  ) {
    this.selectionIndex = selectionIndex
    this.sizeValue = sizeValue
    this.sizeText = sizeText
    this.label = label
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateCutHistorySelectionProps): CutHistorySelection {
    if (!Number.isInteger(props.selectionIndex) || props.selectionIndex < 0) {
      throw new InvalidEntityError(
        "CutHistorySelection",
        "selectionIndex must be a non-negative integer"
      )
    }
    if (props.sizeValue !== null && props.sizeValue !== undefined) {
      if (!Number.isInteger(props.sizeValue)) {
        throw new InvalidEntityError("CutHistorySelection", "sizeValue must be an integer")
      }
    }
    const sizeText = trimOptional(props.sizeText, "sizeText", SIZE_TEXT_MAX, "CutHistorySelection")
    const label = trimOptional(props.label, "label", LABEL_MAX, "CutHistorySelection")

    return new CutHistorySelection(props.selectionIndex, props.sizeValue ?? null, sizeText, label)
  }

  static fromSnapshot(s: CutHistorySelectionSnapshot): CutHistorySelection {
    return new CutHistorySelection(s.selectionIndex, s.sizeValue, s.sizeText, s.label)
  }

  // ─── Equality ────────────────────────────────────────────────────────────

  equals(other: CutHistorySelection | null | undefined): boolean {
    if (!other) return false
    return (
      this.selectionIndex === other.selectionIndex &&
      this.sizeValue === other.sizeValue &&
      this.sizeText === other.sizeText &&
      this.label === other.label
    )
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): CutHistorySelectionSnapshot {
    return {
      selectionIndex: this.selectionIndex,
      sizeValue: this.sizeValue,
      sizeText: this.sizeText,
      label: this.label,
    }
  }
}
