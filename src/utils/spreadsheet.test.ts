import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readXlsxGrid } from './spreadsheet'

const readSheetMock = vi.hoisted(() => vi.fn())

vi.mock('read-excel-file/browser', () => ({ readSheet: readSheetMock }))

function fakeFile(name: string, size = 128): File {
  return { name, size } as File
}

describe('readXlsxGrid', () => {
  beforeEach(() => readSheetMock.mockReset())

  it('normalizes empty and boolean cells while preserving dates and numbers', async () => {
    const date = new Date('2026-07-01T00:00:00.000Z')
    readSheetMock.mockResolvedValue([['日期', '金额', '已确认'], [date, 12.5, true], [null, 0, false]])

    await expect(readXlsxGrid(fakeFile('sample.xlsx'))).resolves.toEqual([
      ['日期', '金额', '已确认'],
      [date, 12.5, 'true'],
      ['', 0, 'false'],
    ])
  })

  it('rejects legacy .xls before parsing', async () => {
    await expect(readXlsxGrid(fakeFile('legacy.xls'))).rejects.toThrow('仅支持 .xlsx')
    expect(readSheetMock).not.toHaveBeenCalled()
  })

  it('rejects files larger than the import limit', async () => {
    await expect(readXlsxGrid(fakeFile('huge.xlsx', 20 * 1024 * 1024 + 1))).rejects.toThrow('超过 20 MB')
    expect(readSheetMock).not.toHaveBeenCalled()
  })
})
