import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const REPO_ROOT = path.resolve(__dirname, "../..")
const ACTIONS_DIR = path.join(REPO_ROOT, "app/actions")

const RECOVERY_ALLOWLIST = new Map<string, ReadonlySet<string>>([
  [
    "app/actions/billing.ts",
    new Set([
      "createOrganizationFromOnboarding",
      "createCheckoutSession",
      "createBillingPortalSession",
      "leaveOrganization",
    ]),
  ],
])

interface ActionFunction {
  file: string
  name: string
  body: ts.Block
  sourceFile: ts.SourceFile
}

function relPosix(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).replace(/\\/g, "/")
}

function actionFiles(): string[] {
  return fs
    .readdirSync(ACTIONS_DIR)
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => path.join(ACTIONS_DIR, entry))
    .sort()
}

function actionFunctions(absPath: string): ActionFunction[] {
  const sourceText = fs.readFileSync(absPath, "utf8")
  const sourceFile = ts.createSourceFile(absPath, sourceText, ts.ScriptTarget.Latest, true)
  const file = relPosix(absPath)
  const functions: ActionFunction[] = []

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      functions.push({
        file,
        name: statement.name.text,
        body: statement.body,
        sourceFile,
      })
    }
  }

  return functions
}

function isRecoveryAllowlisted(action: ActionFunction): boolean {
  return RECOVERY_ALLOWLIST.get(action.file)?.has(action.name) ?? false
}

function statementText(statement: ts.Statement, sourceFile: ts.SourceFile): string {
  return statement.getText(sourceFile)
}

describe("billing action subscription guard", () => {
  it("requires active subscription immediately after authentication outside recovery actions", () => {
    const failures: string[] = []

    for (const filePath of actionFiles()) {
      for (const action of actionFunctions(filePath)) {
        const statements = action.body.statements
        for (let i = 0; i < statements.length; i++) {
          const current = statements[i]
          if (!current) continue
          if (!statementText(current, action.sourceFile).includes("await requireAuthenticatedUser(")) {
            continue
          }
          if (isRecoveryAllowlisted(action)) continue

          const next = statements[i + 1]
          if (!next || !statementText(next, action.sourceFile).includes("requireActiveSubscription")) {
            failures.push(`${action.file}:${action.name}`)
          }
        }
      }
    }

    expect(failures).toEqual([])
  })
})
