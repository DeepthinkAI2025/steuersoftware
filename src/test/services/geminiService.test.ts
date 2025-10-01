import { describe, it, expect, vi } from 'vitest';
import { analyzeDocument } from '../../../services/geminiService';
import { InvoiceType, Rule } from '../../../types';

// Mock @google/genai
vi.mock('@google/genai', () => {
  const mockGenerateContent = vi.fn();
  const mockChatsCreate = vi.fn(() => ({
    sendMessage: vi.fn(),
  }));

  return {
    GoogleGenAI: vi.fn(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
      chats: {
        create: mockChatsCreate,
      },
    })),
    Type: {
      OBJECT: 'OBJECT',
      BOOLEAN: 'BOOLEAN',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
    },
  };
});

describe('analyzeDocument', () => {
  it('should return a mock response when no API key is provided', async () => {
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    const result = await analyzeDocument(file, [], '');
    expect(result).toBeDefined();
    expect(result.vendor).toBe('Bauhaus');
  });
});
