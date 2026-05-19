#!/usr/bin/env tsx
// api-snapshot.ts — dump the public API surface of src/ + app/ to a deterministic JSON file.
//
// Output: scripts/refactor/snapshots/<UTC-timestamp>.json
//
// Two consecutive runs against the same git SHA produce byte-identical JSON modulo the
// `generated_at` field. Diff two snapshots to see what changed in the API surface.

import {
  Project,
  type ClassDeclaration,
  type FunctionDeclaration,
  type MethodDeclaration,
} from "ts-morph"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { execSync } from "node:child_process"

interface MethodRecord {
  name: string
  static: boolean
  signature: string
}

type ExportKind = "class" | "function" | "interface" | "type" | "const" | "enum"

interface ExportRecord {
  file: string
  kind: ExportKind
  name: string
  methods?: MethodRecord[]
  signature?: string
  shape?: string
}

const ROOT = process.cwd()
const OUTPUT_DIR = join(ROOT, "scripts/refactor/snapshots")
const SCAN_PREFIXES = ["src/", "app/"]

function getGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim()
  } catch {
    return "unknown"
  }
}

function relPath(absPath: string): string {
  return relative(ROOT, absPath).replace(/\\/g, "/")
}

function isFromOurSources(file: string): boolean {
  return SCAN_PREFIXES.some((p) => file.startsWith(p))
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function buildMethodRecord(method: MethodDeclaration): MethodRecord {
  const params = method
    .getParameters()
    .map((p) => p.getText())
    .join(", ")
  const returnType = method.getReturnTypeNode()?.getText() ?? "void"
  const name = method.getName()
  const isStatic = method.isStatic()
  const isAsync = method.isAsync()
  const typeParams = method.getTypeParameters()
  const generics = typeParams.length > 0 ? `<${typeParams.map((t) => t.getText()).join(", ")}>` : ""
  const signature = normalize(
    `${isAsync ? "async " : ""}${name}${generics}(${params}): ${returnType}`
  )
  return { name, static: isStatic, signature }
}

function classMethods(cls: ClassDeclaration): MethodRecord[] {
  const out: MethodRecord[] = []
  for (const method of cls.getMethods()) {
    const scope = method.getScope()
    if (scope === "private" || scope === "protected") continue
    out.push(buildMethodRecord(method))
  }
  return out.sort((a, b) => {
    if (a.static !== b.static) return a.static ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function buildFunctionSignature(fn: FunctionDeclaration): string {
  const params = fn
    .getParameters()
    .map((p) => p.getText())
    .join(", ")
  const returnType = fn.getReturnTypeNode()?.getText() ?? "void"
  const name = fn.getName() ?? "<anonymous>"
  const isAsync = fn.isAsync()
  const typeParams = fn.getTypeParameters()
  const generics = typeParams.length > 0 ? `<${typeParams.map((t) => t.getText()).join(", ")}>` : ""
  return normalize(
    `${isAsync ? "async " : ""}function ${name}${generics}(${params}): ${returnType}`
  )
}

function collectExports(project: Project): ExportRecord[] {
  const records: ExportRecord[] = []

  for (const sf of project.getSourceFiles()) {
    const file = relPath(sf.getFilePath())
    if (!isFromOurSources(file)) continue

    for (const cls of sf.getClasses()) {
      if (!cls.isExported()) continue
      const name = cls.getName()
      if (!name) continue
      records.push({ file, kind: "class", name, methods: classMethods(cls) })
    }

    for (const fn of sf.getFunctions()) {
      if (!fn.isExported()) continue
      const name = fn.getName()
      if (!name) continue
      records.push({
        file,
        kind: "function",
        name,
        signature: buildFunctionSignature(fn),
      })
    }

    for (const iface of sf.getInterfaces()) {
      if (!iface.isExported()) continue
      records.push({
        file,
        kind: "interface",
        name: iface.getName(),
        shape: normalize(iface.getText()),
      })
    }

    for (const ta of sf.getTypeAliases()) {
      if (!ta.isExported()) continue
      records.push({
        file,
        kind: "type",
        name: ta.getName(),
        shape: normalize(ta.getTypeNode()?.getText() ?? ""),
      })
    }

    for (const en of sf.getEnums()) {
      if (!en.isExported()) continue
      records.push({
        file,
        kind: "enum",
        name: en.getName(),
        shape: en
          .getMembers()
          .map((m) => m.getName())
          .sort()
          .join(","),
      })
    }

    for (const vs of sf.getVariableStatements()) {
      if (!vs.isExported()) continue
      for (const decl of vs.getDeclarations()) {
        const typeNode = decl.getTypeNode()
        // Prefer explicit annotation; fall back to inferred type (slower but complete).
        const typeText = typeNode ? typeNode.getText() : decl.getType().getText(decl)
        records.push({
          file,
          kind: "const",
          name: decl.getName(),
          signature: normalize(typeText),
        })
      }
    }
  }

  records.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file)
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
    return a.name.localeCompare(b.name)
  })

  return records
}

function main(): void {
  const tsConfigFilePath = join(ROOT, "tsconfig.json")
  process.stderr.write(`[api-snapshot] loading project from ${tsConfigFilePath}\n`)
  const project = new Project({ tsConfigFilePath })
  process.stderr.write(`[api-snapshot] loaded ${project.getSourceFiles().length} source files\n`)

  const exportsList = collectExports(project)
  process.stderr.write(`[api-snapshot] collected ${exportsList.length} exported symbols\n`)

  const snapshot = {
    generated_at: new Date().toISOString(),
    sha: getGitSha(),
    export_count: exportsList.length,
    exports: exportsList,
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const filename = new Date().toISOString().replace(/[:.]/g, "-") + ".json"
  const outPath = join(OUTPUT_DIR, filename)
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n")
  process.stderr.write(`[api-snapshot] wrote ${relPath(outPath)}\n`)
  process.stdout.write(outPath + "\n")
}

main()
