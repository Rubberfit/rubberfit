import { supabase, type Roll } from '@/lib/supabase';

interface CSVRow {
  material_type: string;
  width: string;
  length: string;
  thickness: string;
  color?: string;
  location?: string;
  supplier?: string;
  cost_per_sqft?: string;
  date_received?: string;
  notes?: string;
}

export const csvService = {
  // Parse CSV text to array of objects
  parseCSV(csvText: string): CSVRow[] {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file must have headers and at least one row of data');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length === headers.length) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row);
      }
    }

    return rows;
  },

  // Validate and transform CSV data to Roll format
  transformToRolls(csvRows: CSVRow[]): Partial<Roll>[] {
    return csvRows.map((row, index) => {
      // Validate required fields
      if (!row.material_type || !row.width || !row.length || !row.thickness) {
        throw new Error(`Row ${index + 2}: Missing required fields (material_type, width, length, thickness)`);
      }

      // Parse numeric values
      const width = parseFloat(row.width);
      const length = parseFloat(row.length);
      const thickness = parseFloat(row.thickness);
      const costPerSqft = row.cost_per_sqft ? parseFloat(row.cost_per_sqft) : undefined;

      if (isNaN(width) || isNaN(length) || isNaN(thickness)) {
        throw new Error(`Row ${index + 2}: Width, length, and thickness must be valid numbers`);
      }

      return {
        material_type: row.material_type,
        width,
        length,
        thickness,
        remaining_length: length, // Initially, remaining = original length
        color: row.color || undefined,
        location: row.location || undefined,
        supplier: row.supplier || undefined,
        cost_per_sqft: costPerSqft,
        date_received: row.date_received || new Date().toISOString().split('T')[0],
        notes: row.notes || undefined,
        status: 'active' as const,
      };
    });
  },

  // Upload rolls to Supabase
  async uploadRolls(rolls: Partial<Roll>[]): Promise<{ success: boolean; error?: string; count?: number }> {
    try {
      const { data, error } = await supabase
        .from('rolls')
        .insert(rolls)
        .select();

      if (error) {
        console.error('Error uploading rolls:', error);
        return { success: false, error: error.message };
      }

      return { success: true, count: data?.length || 0 };
    } catch (error) {
      console.error('Error uploading rolls:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload rolls'
      };
    }
  },

  // Process CSV file and upload to database
  async processCSVFile(file: File): Promise<{ success: boolean; error?: string; count?: number }> {
    try {
      const text = await file.text();
      const csvRows = this.parseCSV(text);
      const rolls = this.transformToRolls(csvRows);
      return await this.uploadRolls(rolls);
    } catch (error) {
      console.error('Error processing CSV:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process CSV file'
      };
    }
  },

  // Generate sample CSV template
  generateTemplate(): string {
    const headers = [
      'Material Type',
      'Width',
      'Length',
      'Thickness',
      'Color',
      'Location',
      'Supplier',
      'Cost per Sqft',
      'Date Received',
      'Notes'
    ];

    // Return only headers - no sample data
    return headers.join(',');
  },

  // Download template CSV
  downloadTemplate() {
    const csv = this.generateTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'rubber_rolls_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};