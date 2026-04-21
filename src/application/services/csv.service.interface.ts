import type { Roll } from "@/src/infrastructure/models/database.types"

export interface CSVRow {
  material_type: string
  width: string
  length: string
  thickness: string
  color?: string
  location?: string
  supplier?: string
  cost_per_sqft?: string
  date_received?: string
  notes?: string
}

export interface ICsvService {
  parseCSV(csvText: string): CSVRow[]
  transformToRolls(csvRows: CSVRow[]): Partial<Roll>[]
  uploadRolls(rolls: Partial<Roll>[]): Promise<{ success: boolean; error?: string; count?: number }>
  processCSVFile(file: File): Promise<{ success: boolean; error?: string; count?: number }>
  generateTemplate(): string
  downloadTemplate(): void
}
