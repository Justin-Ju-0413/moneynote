export type SpreadsheetCell = string | number | Date

const MAX_XLSX_BYTES = 20 * 1024 * 1024

function normalizeCell(value: unknown): SpreadsheetCell {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value
  if (typeof value === 'number' || typeof value === 'string') return value
  return String(value)
}

/** Read the first worksheet from a modern XLSX file in the browser. */
export async function readXlsxGrid(file: File): Promise<SpreadsheetCell[][]> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('仅支持 .xlsx 文件；请先在表格软件中另存为 .xlsx')
  }
  if (file.size > MAX_XLSX_BYTES) {
    throw new Error('Excel 文件超过 20 MB，请拆分后再导入')
  }

  const { readSheet } = await import('read-excel-file/browser')
  const rows = await readSheet(file)
  return rows.map((row) => row.map(normalizeCell))
}
