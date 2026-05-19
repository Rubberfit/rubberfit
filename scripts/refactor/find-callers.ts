#!/usr/bin/env tsx
// find-callers.ts — list every reference to a TypeScript symbol or file's exports.
//
// Uses ts-morph's type-aware findReferences() — skips string literals and comments
// that incidentally contain the symbol name.
//
// Usage:
//   tsx scripts/refactor/find-callers.ts --symbol <name>
//   tsx scripts/refactor/find-callers.ts --file <relative-path>
//   tsx scripts/refactor/find-callers.ts --symbol <name> --json

import { Project, type Node, type ReferencedSymbol } from "ts-morph"
import { join, relative } from "node:path"

interface Args {
  symbol?: string
  file?: string
  json: boolean
}

interface ReferenceLocation {
  file: string
  line: number
  column: number
  text: string
}

interface DeclarationReport {
  declarationFile: string
  declarationLine: number
  declarationKind: string
  declarationName: string
  references: ReferenceLocation[]
}

const ROOT = process.cwd()
const SCAN_PREFIXES = ["src/", "app/"]

function relPath(absPath: string): string {
  return relative(ROOT, absPath).replace(/\\/g, "/")
}

function isFromOurSources(file: string): boolean {
  return SCAN_PREFIXES.some((p) => file.startsWith(p))
}

function parseArgs(argv: string[]): Args {
  const args: Args = { json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--symbol") args.symbol = argv[++i]
    else if (a === "--file") args.file = argv[++i]
    else if (a === "--json") args.json = true
    else if (a === "--help" || a === "-h") {
      printHelp()
      process.exit(0)
    }
  }
  return args
}

function printHelp(): void {
  process.stderr.write(`
find-callers — list every reference to a TypeScript symbol or file export.

Usage:
  tsx scripts/refactor/find-callers.ts --symbol <name>
  tsx scripts/refactor/find-callers.ts --file <path>
  tsx scripts/refactor/find-callers.ts --symbol <name> --json

Examples:
  tsx scripts/refactor/find-callers.ts --symbol Money
  tsx scripts/refactor/find-callers.ts --symbol PurchaseOrderService
  tsx scripts/refactor/find-callers.ts --file src/entities/value-objects/money.ts
`)
}

function findExportedDeclarationsBySymbol(project: Project, symbol: string): Node[] {
  const matches: Node[] = []
  for (const sf of project.getSourceFiles()) {
    const file = relPath(sf.getFilePath())
    if (!isFromOurSources(file)) continue

    for (const cls of sf.getClasses()) {
      if (cls.isExported() && cls.getName() === symbol) matches.push(cls)
    }
    for (const fn of sf.getFunctions()) {
      if (fn.isExported() && fn.getName() === symbol) matches.push(fn)
    }
    for (const iface of sf.getInterfaces()) {
      if (iface.isExported() && iface.getName() === symbol) matches.push(iface)
    }
    for (const ta of sf.getTypeAliases()) {
      if (ta.isExported() && ta.getName() === symbol) matches.push(ta)
    }
    for (const en of sf.getEnums()) {
      if (en.isExported() && en.getName() === symbol) matches.push(en)
    }
    for (const vs of sf.getVariableStatements()) {
      if (!vs.isExported()) continue
      for (const decl of vs.getDeclarations()) {
        if (decl.getName() === symbol) matches.push(decl)
      }
    }
  }
  return matches
}

function findExportedDeclarationsByFile(project: Project, filePath: string): Node[] {
  // Try direct lookup; fall back to fuzzy match by suffix.
  const direct = project.getSourceFile(filePath)
  const sf =
    direct ??
    project.getSourceFiles().find((s) => relPath(s.getFilePath()) === filePath.replace(/\\/g, "/"))
  if (!sf) {
    process.stderr.write(`[find-callers] file not found in project: ${filePath}\n`)
    return []
  }
  const out: Node[] = []
  for (const cls of sf.getClasses()) if (cls.isExported()) out.push(cls)
  for (const fn of sf.getFunctions()) if (fn.isExported()) out.push(fn)
  for (const iface of sf.getInterfaces()) if (iface.isExported()) out.push(iface)
  for (const ta of sf.getTypeAliases()) if (ta.isExported()) out.push(ta)
  for (const en of sf.getEnums()) if (en.isExported()) out.push(en)
  for (const vs of sf.getVariableStatements()) {
    if (vs.isExported()) for (const decl of vs.getDeclarations()) out.push(decl)
  }
  return out
}

function nameOf(node: Node): string {
  type WithName = { getName?: () => string | undefined }
  return (node as unknown as WithName).getName?.() ?? "<anonymous>"
}

function findReferencesSafe(decl: Node): ReferencedSymbol[] {
  type WithFindRefs = { findReferences?: () => ReferencedSymbol[] }
  const fn = (decl as unknown as WithFindRefs).findReferences
  if (!fn) return []
  try {
    return fn.call(decl)
  } catch (err) {
    process.stderr.write(
      `[find-callers] findReferences failed for ${nameOf(decl)}: ${(err as Error).message}\n`
    )
    return []
  }
}

function collectReferences(decls: Node[]): DeclarationReport[] {
  const out: DeclarationReport[] = []
  for (const decl of decls) {
    const declSf = decl.getSourceFile()
    const declStart = decl.getStartLineNumber()
    const declFile = relPath(declSf.getFilePath())
    const report: DeclarationReport = {
      declarationFile: declFile,
      declarationLine: declStart,
      declarationKind: decl.getKindName(),
      declarationName: nameOf(decl),
      references: [],
    }

    for (const sym of findReferencesSafe(decl)) {
      for (const ref of sym.getReferences()) {
        const node = ref.getNode()
        const sf = node.getSourceFile()
        const file = relPath(sf.getFilePath())
        const start = node.getStart()
        const { line, column } = sf.getLineAndColumnAtPos(start)
        // Skip the declaration's own name occurrence
        if (file === declFile && line === declStart) continue
        const lineText = sf.getFullText().split("\n")[line - 1] ?? ""
        report.references.push({ file, line, column, text: lineText.trim() })
      }
    }

    report.references.sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file)
      if (a.line !== b.line) return a.line - b.line
      return a.column - b.column
    })

    out.push(report)
  }
  return out
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (!args.symbol && !args.file) {
    process.stderr.write("[find-callers] need --symbol <name> or --file <path>\n")
    printHelp()
    process.exit(1)
  }

  const tsConfigFilePath = join(ROOT, "tsconfig.json")
  process.stderr.write("[find-callers] loading project...\n")
  const project = new Project({ tsConfigFilePath })
  process.stderr.write(`[find-callers] loaded ${project.getSourceFiles().length} source files\n`)

  const decls = args.symbol
    ? findExportedDeclarationsBySymbol(project, args.symbol)
    : findExportedDeclarationsByFile(project, args.file as string)

  if (decls.length === 0) {
    process.stderr.write(
      `[find-callers] no exported declaration matched ${args.symbol ?? args.file}\n`
    )
    process.exit(1)
  }

  process.stderr.write(
    `[find-callers] resolving references for ${decls.length} declaration(s)...\n`
  )
  const reports = collectReferences(decls)

  if (args.json) {
    process.stdout.write(JSON.stringify(reports, null, 2) + "\n")
    return
  }

  for (const d of reports) {
    const fileCount = new Set(d.references.map((r) => r.file)).size
    process.stdout.write(
      `\n${d.declarationFile}:${d.declarationLine}  ${d.declarationName} (${d.declarationKind}) — ${d.references.length} reference(s) in ${fileCount} file(s)\n`
    )
    for (const r of d.references) {
      process.stdout.write(`  ↳ ${r.file}:${r.line}:${r.column}  ${r.text}\n`)
    }
  }
}

main()
