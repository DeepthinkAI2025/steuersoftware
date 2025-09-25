import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendDocumentsToLexoffice } from '../../../services/lexofficeService'
import { Document, DocumentSource, DocumentStatus, InvoiceType } from '../../../types'

// Mock environment variables
const mockMetaEnv = {
  VITE_LEXOFFICE_ENABLE_REAL_API: 'false',
  VITE_LEXOFFICE_API_KEY: '',
  VITE_LEXOFFICE_API_BASE: 'https://api.lexoffice.io'
};

// Mock the import.meta.env
vi.mock('import.meta', () => ({
  env: mockMetaEnv
}));

describe('Lexoffice Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment to simulation mode
    mockMetaEnv.VITE_LEXOFFICE_ENABLE_REAL_API = 'false'
    mockMetaEnv.VITE_LEXOFFICE_API_KEY = ''
  })

  describe('sendDocumentsToLexoffice', () => {
    const mockDocument: Document = {
      id: 'test-doc-1',
      name: 'Test Document',
      date: new Date('2023-01-15'),
      year: 2023,
      quarter: 1,
      source: DocumentSource.MANUAL,
      status: DocumentStatus.OK,
      fileUrl: 'test-file.pdf',
      totalAmount: 100,
      vatAmount: 19,
      vendor: 'Test Vendor',
      invoiceType: InvoiceType.INCOMING,
      storageLocationId: 'test-storage',
      tags: ['test'],
      linkedTransactionIds: []
    }

    it('should handle empty document list', async () => {
      const result = await sendDocumentsToLexoffice({
        documents: []
      })

      expect(result.successIds).toHaveLength(0)
      expect(result.failed).toHaveLength(0)
      expect(result.mode).toBeDefined()
    })

    it('should process documents in simulation mode', async () => {
      const result = await sendDocumentsToLexoffice({
        documents: [mockDocument]
      })

      expect(result.successIds).toBeDefined()
      expect(result.failed).toBeDefined()
      expect(result.mode).toBeDefined()
      expect(result.successIds.length + result.failed.length).toBe(1)
    })
  })
})