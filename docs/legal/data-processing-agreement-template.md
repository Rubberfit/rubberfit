# Data Processing Agreement (Template)

> **Status:** Draft template. Not legal advice. Have counsel review
> before execution. Fill bracketed fields and delete guidance notes
> (lines starting with `>`) before sending.

This Data Processing Agreement ("**DPA**") supplements and forms
part of the Master Services Agreement, order form, or online terms
of service ("**Principal Agreement**") between **[Customer Legal
Entity]** ("**Customer**" or "**Controller**") and **Arc & Anchor,
LLC** d/b/a Rubberfit ("**Rubberfit**" or "**Processor**")
(collectively, the "**parties**"). This DPA governs the Processing
of Personal Data by Rubberfit on behalf of the Customer in the
course of providing the Services.

In the event of any conflict between this DPA and the Principal
Agreement with respect to the Processing of Personal Data, this
DPA prevails.

---

## 1. Definitions

Terms not defined here have the meanings given to them in the
Principal Agreement or in applicable Data Protection Law.

- **Applicable Data Protection Law** — all laws and regulations
  applicable to the Processing of Personal Data under the
  Principal Agreement, including (as applicable) Regulation (EU)
  2016/679 ("**GDPR**"), the UK General Data Protection
  Regulation, the California Consumer Privacy Act as amended by
  the CPRA ("**CCPA**"), and analogous state laws.
- **Controller**, **Processor**, **Personal Data**, **Data
  Subject**, **Processing** — as defined in the GDPR (and their
  CCPA equivalents — **Business**, **Service Provider**, **Personal
  Information**, **Consumer**).
- **Sub-processor** — any third party engaged by Rubberfit to
  Process Personal Data on behalf of the Customer.
- **Services** — the Rubberfit cut-planning and inventory
  management platform, as further described in the Principal
  Agreement.

## 2. Scope and Roles

2.1 **Roles.** For Personal Data Rubberfit Processes on Customer's
instructions, Customer is the Controller (or Business) and
Rubberfit is the Processor (or Service Provider). Rubberfit does
not sell Personal Data and does not Process Personal Data for
advertising purposes.

2.2 **Documented Instructions.** Rubberfit Processes Personal Data
only on documented instructions from the Customer, including as
set out in the Principal Agreement, this DPA, and Customer's
configured use of the Services. Rubberfit will promptly notify
Customer if, in its opinion, an instruction infringes Applicable
Data Protection Law.

## 3. Subject Matter, Duration, Nature, and Purpose

| Field | Value |
|---|---|
| Subject matter | Processing of Personal Data in connection with the operation of the Services |
| Duration | The term of the Principal Agreement, plus any retention period required by Section 11 |
| Nature of Processing | Hosting, storage, retrieval, computation, transmission, and backup necessary to provide the Services |
| Purpose of Processing | Provisioning of a cut-planning and inventory management SaaS platform to the Customer |

## 4. Categories of Data Subjects and Personal Data

**Categories of Data Subjects:**
- Customer's employees, contractors, and other authorized users of
  the Services ("**Authorized Users**")
- Customer's customers and vendors, where Customer elects to
  populate such records in the Services (e.g., the `jobs` and
  `purchase_orders` resources)

**Categories of Personal Data:**
- Account identifiers (email address, full name, profile metadata)
- Authentication data (hashed password, MFA factor identifiers,
  OAuth tokens, session tokens) — Rubberfit never has access to
  cleartext passwords
- Usage telemetry (timestamps, role, action taken, request path)
- Customer-entered business records that may contain Personal Data
  (customer names, customer contact details, purchase order
  references)
- Support communications (email, in-app messages)

**Special Categories of Personal Data:** None are required by the
Services. Customer is responsible for not populating the Services
with sensitive/special-category data absent a pre-arranged
addendum.

## 5. Obligations of Rubberfit

Rubberfit will:

a. **Confidentiality.** Ensure persons authorized to Process
   Personal Data have committed themselves to confidentiality or
   are under an appropriate statutory obligation of confidentiality.

b. **Security.** Implement the technical and organizational
   measures described in **Annex A (Security Measures)** below,
   taking into account the state of the art, costs of
   implementation, and the nature, scope, context, and purposes
   of Processing.

c. **Assistance.** Taking into account the nature of the
   Processing and the information available, assist Customer in
   complying with its obligations under Articles 32–36 of GDPR
   (security, breach notification, DPIA, and consultation with
   supervisory authorities).

d. **Data subject rights.** Assist Customer with responding to
   data subject requests for access, rectification, erasure,
   restriction, portability, and objection — either directly
   through the Services' self-service tooling or, where
   applicable, by following Customer's documented instructions.

e. **Return or deletion.** At Customer's choice, delete or return
   all Personal Data after the end of the provision of Services
   (see Section 11).

f. **Audits.** Make available to Customer information necessary
   to demonstrate compliance with this DPA, and allow for and
   contribute to audits — including inspections — conducted by
   Customer or an independent auditor mandated by Customer,
   subject to the audit terms in Section 12.

## 6. Sub-processors

6.1 **General authorization.** Customer authorizes Rubberfit's use
of the Sub-processors listed below, provided Rubberfit:

- enters into a written agreement with each Sub-processor imposing
  data protection obligations no less protective than those in
  this DPA; and
- remains liable to Customer for the acts and omissions of its
  Sub-processors in their Processing of Personal Data.

6.2 **Current Sub-processors.**

| Sub-processor | Purpose | Processing Location | Certifications |
|---|---|---|---|
| Supabase, Inc. | Database, file storage, authentication (PostgreSQL + GoTrue + Storage) | AWS `us-east-1` (default) — region selectable on Enterprise plans | SOC 2 Type II, HIPAA (BAA available) |
| Vercel, Inc. | Application hosting, edge compute, static asset delivery | Global edge network (primary: IAD1) | SOC 2 Type II, ISO 27001 |
| Resend, Inc. | Transactional email (receipts, password resets, alerts) | United States | SOC 2 Type II |
| Google LLC | OAuth sign-in (only if Customer enables it) | Global | ISO 27001, ISO 27017, ISO 27018, SOC 2 Type II |

6.3 **Notice of changes.** Rubberfit will notify Customer at least
**30 days** in advance of adding or replacing a Sub-processor.
Customer may object in writing within that period on reasonable
data protection grounds. If the parties cannot agree on a
resolution, Customer may terminate the affected Services for
convenience and receive a pro-rata refund of fees prepaid for the
unused term.

## 7. International Transfers

Where Rubberfit transfers Personal Data originating in the
European Economic Area, the United Kingdom, or Switzerland to a
country not recognized as providing an adequate level of data
protection, the parties agree that such transfers are governed by
the **EU Standard Contractual Clauses (2021/914)** — Module Two
(Controller to Processor) — which are incorporated into this DPA
by reference. For UK-origin data, the **International Data
Transfer Addendum** issued by the UK ICO applies. For
Switzerland-origin data, the Swiss FDPIC-approved adaptations
apply.

The annexes to the SCCs are deemed populated with the information
set out in Sections 3, 4, 6, and Annex A of this DPA.

## 8. Data Subject Rights

8.1 **Direct requests.** If Rubberfit receives a request directly
from a Data Subject in relation to Customer's Personal Data,
Rubberfit will, unless legally prohibited, promptly forward the
request to Customer and will not respond to the request except on
Customer's documented instructions.

8.2 **Assistance.** Rubberfit provides the following self-service
mechanisms that Customer can use to respond to Data Subject
requests:

- **Access/export:** Customer administrators can export a user's
  account and activity data from the admin console.
- **Rectification:** Authorized Users can update their own profile
  data; administrators can rectify on behalf of their users.
- **Erasure:** Self-service account deletion is available from the
  account settings page. Administrator-initiated deletion is also
  supported.

Where self-service is not sufficient, Rubberfit will assist within
**thirty (30) days** of a written request to
`privacy@arcandanchor.com`.

## 9. Personal Data Breach

9.1 **Notification.** Rubberfit will notify Customer **without
undue delay, and in any event within seventy-two (72) hours**,
after becoming aware of a Personal Data Breach affecting Customer
Personal Data.

9.2 **Content of notice.** The notification will contain, to the
extent known at the time:

a. the nature of the Personal Data Breach, including the
   categories and approximate number of Data Subjects and Personal
   Data records concerned;
b. the likely consequences of the breach;
c. measures taken or proposed to address the breach and mitigate
   its effects; and
d. the name and contact details of the Rubberfit Data Protection
   point of contact.

9.3 **Rubberfit will not make unilateral disclosures** to Data
Subjects or supervisory authorities about a breach affecting
Customer Personal Data except as legally required.

## 10. CCPA / US State Law Addendum

Where Rubberfit Processes Personal Information of California (or
comparable state) consumers on Customer's behalf:

a. Rubberfit is a **Service Provider** and will not sell or share
   Personal Information.
b. Rubberfit will not retain, use, or disclose Personal Information
   for any purpose other than for the specific purpose of
   performing the Services, or as otherwise permitted by the CCPA.
c. Rubberfit will not combine Personal Information received from
   Customer with Personal Information received from or on behalf
   of any other person or collected from Rubberfit's own
   interaction with a consumer, except as permitted by the CCPA.
d. Rubberfit certifies that it understands these restrictions and
   will comply with them.

## 11. Return and Deletion

11.1 Upon termination or expiration of the Services, Rubberfit
will:

a. cease Processing Personal Data within ten (10) business days
   except as necessary to provide the return/deletion below;
b. at Customer's written election, return a copy of all Customer
   Personal Data in a structured, commonly-used, machine-readable
   format; and
c. delete all Customer Personal Data from Rubberfit's production
   systems within **thirty (30) days** of the termination date
   (the "**Deletion Deadline**"), and delete from backups within
   the ordinary backup-retention window, which does not exceed
   **ninety (90) days**.

11.2 Rubberfit may retain Personal Data to the extent required by
law, and only for the period and purpose required by that law.

## 12. Audit

12.1 **Documentation.** Rubberfit will make available to Customer,
on request, the then-current SOC 2 Type II report (or equivalent
third-party attestation) covering its Sub-processors and, to the
extent it maintains them, its own independent audit reports.

12.2 **Audits.** Where mandatory under Applicable Data Protection
Law, Customer (or an independent auditor on reasonable prior
written notice of at least thirty (30) days) may audit Rubberfit's
compliance with this DPA, provided that:

a. audits occur no more than once per twelve-month period except
   following a confirmed Personal Data Breach;
b. audits are conducted during normal business hours and in a
   manner that does not unreasonably disrupt the Services;
c. the auditor signs a confidentiality undertaking no less
   protective than the Principal Agreement; and
d. Customer bears its own and the auditor's costs.

## 13. Liability

The limitations of liability set out in the Principal Agreement
apply to any claims arising under this DPA.

## 14. Term, Governance, and Miscellaneous

14.1 This DPA takes effect on the Effective Date of the Principal
Agreement and remains in effect for the term of the Principal
Agreement, plus any period during which Rubberfit continues to
Process Personal Data under Section 11.

14.2 If any provision of this DPA is held invalid, the remaining
provisions remain in full force and effect.

14.3 This DPA is governed by the law and jurisdiction specified in
the Principal Agreement, except that the SCCs are governed by the
law specified within them.

---

## Annex A — Technical and Organizational Measures

Rubberfit implements the following controls, subject to ongoing
review. This is a current snapshot as of **[Effective Date]**.

### A.1 Access control and authentication

- Per-tenant row-level security (RLS) on every tenant-scoped
  table; every query is filtered by `auth.uid()` at the database
  layer.
- Role-based access control (RBAC) for Authorized Users, with
  roles enforced at the route-protection and permission layers
  (`admin`, `manager`, `supervisor`, `cutter`, `member`, `viewer`).
- Multi-factor authentication (TOTP) available to all Authorized
  Users; Customer administrators can require it account-wide.
- Sessions use short-lived access tokens and rotating refresh
  tokens; session revocation is immediate.

### A.2 Encryption

- **In transit:** TLS 1.2+ required on every external endpoint;
  HSTS enabled.
- **At rest:** AES-256 encryption for the primary database,
  object storage, and all backups (inherited from Supabase + AWS).
- **Application-level:** passwords are hashed using a modern
  password hashing function (bcrypt via GoTrue); cleartext
  passwords are never stored or logged.

### A.3 Change management and SDLC

- All code changes are subject to peer review and automated
  checks (typecheck, lint, unit + integration tests) before
  merge.
- Production deployments are triggered from a protected branch;
  each deployment is automatically rolled back on health-check
  failure.
- Database migrations are version-controlled and applied
  idempotently; destructive migrations require explicit
  approval.

### A.4 Monitoring, logging, and incident response

- Structured application and request logs are retained for 30
  days; security-relevant events (auth failures, privilege
  changes, deletions) are retained for at least 12 months.
- Automated alerting on uptime, error rate, and security signals
  (failed login thresholds, role-change spikes).
- Written incident response runbook; Rubberfit maintains a
  security point of contact reachable at
  `support@rubberfit.app`.

### A.5 Personnel

- Background checks on personnel with production access, subject
  to local law.
- Security awareness training at onboarding and annually.
- Production access is limited to named personnel, authenticated
  via SSO + MFA, and logged.

### A.6 Sub-processor oversight

- Sub-processors are selected with regard to their own security
  controls and attestations (see Section 6).
- Sub-processor access to Personal Data is scoped to the minimum
  necessary to operate the Services.

### A.7 Business continuity

- Daily encrypted backups with point-in-time recovery for the
  primary database (inherited from Supabase).
- Documented restore procedures tested at least annually.
- Recovery Time Objective (RTO): 4 hours. Recovery Point
  Objective (RPO): 1 hour.

---

## Annex B — Signatures

**Customer**

| Field | Value |
|---|---|
| Legal entity | `[Customer Legal Entity]` |
| Signatory name | `[Name]` |
| Title | `[Title]` |
| Signature | `_______________________` |
| Date | `[YYYY-MM-DD]` |

**Rubberfit (Arc & Anchor, LLC)**

| Field | Value |
|---|---|
| Signatory name | `[Name]` |
| Title | `[Title]` |
| Signature | `_______________________` |
| Date | `[YYYY-MM-DD]` |

---

*Template revision: v0.1 — 2026-04-20. Track changes in
`docs/legal/` on Git.*
