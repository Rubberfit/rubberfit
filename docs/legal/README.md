# docs/legal/

Customer-facing legal templates. Starting point drafts, not
executed contracts. Counsel should review every template before
it goes out.

## Files

- **data-processing-agreement-template.md** — GDPR/UK GDPR/CCPA
  processor DPA template. Fill bracketed fields, update the
  sub-processor table in Section 6, refresh Annex A if controls
  change, and have counsel sign off before sending. Referenced by
  the Trust & Security page (`app/dashboard/security/`) in the
  FAQ answer "Can we get a DPA?".

## When to update

- A new sub-processor is added, removed, or replaced → update
  Section 6.2 of the DPA template (and give 30 days notice to
  active customers per Section 6.3).
- Controls in Annex A change (e.g., SOC 2 attestation added, MFA
  becomes mandatory, backup RPO changes) → update the relevant
  Annex A subsection and bump the template revision footer.
- Applicable law changes (state privacy laws, new SCCs) → update
  Section 7 / Section 10.

Versioning: bump `v0.X` in the footer of each template on
meaningful edits; minor typo fixes don't need a bump.
