import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeminiAnalysisResult, Document, DocumentStatus, InvoiceType, Rule, ChatMessage, UserProfile, FundingOpportunity, DocumentOcrMetadata, OcrFieldConfidence, DEFAULT_DIGITAL_STORAGE_ID } from '../types';

const handleGeminiError = (error: unknown): string => {
    console.error("Gemini API Error:", error);
    if (error instanceof Error) {
        if (error.message.includes('API key not valid')) {
            return "Ihr Gemini API-Schlüssel ist ungültig. Bitte überprüfen Sie ihn in den Einstellungen.";
        }
        if (error.message.includes('429')) { // Too Many Requests
            return "Das API-Anfragelimit wurde erreicht. Bitte versuchen Sie es später erneut.";
        }
        if (typeof error === 'object' && error && 'message' in error) {
            const message = (error as { message: string }).message;
            if (message.includes('SAFETY')) {
                return "Die Anfrage wurde aufgrund von Sicherheitseinstellungen blockiert. Versuchen Sie eine andere Formulierung.";
            }
        }
    }
    return "Ein unerwarteter Fehler ist bei der Kommunikation mit der KI aufgetreten. Bitte versuchen Sie es später erneut.";
};

const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};

const GEMINI_MODEL = 'gemini-2.5-pro';

export const createSuggestedFileName = (result: GeminiAnalysisResult, originalExtension: string): string => {
    const { vendor, totalAmount, documentDate } = result;
    const date = new Date(documentDate);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const formattedAmount = (totalAmount ?? 0).toFixed(2).replace('.', ',');
    const cleanVendor = (vendor || 'unbekannt').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'unbekannt';

    return `re_${cleanVendor}_${formattedAmount}€_${month}_${year}.${originalExtension}`;
};

// Applies rules created by the user in the UI.
const applyRules = (result: GeminiAnalysisResult, rules: Rule[]): GeminiAnalysisResult => {
    const textLower = result.textContent.toLowerCase();
    const vendorLower = (result.vendor || "").toLowerCase();
    
    for (const rule of rules) {
        const targetText = rule.conditionType === 'vendor' ? vendorLower : textLower;
        const keywords = rule.conditionValue.split(',').map(k => k.trim().toLowerCase()).filter(Boolean); // Handle multiple keywords with OR logic

        if (keywords.some(keyword => targetText.includes(keyword))) {
            result.invoiceType = rule.invoiceType;
            result.taxCategory = rule.resultCategory;
            return result; // First matching user rule wins
        }
    }
    return result;
};


export const analyzeDocument = async (file: File, rules: Rule[], apiKey: string): Promise<GeminiAnalysisResult> => {
    if (!apiKey) {
        console.warn("API key not found. Using a mock response for document analysis.");
        await new Promise(resolve => setTimeout(resolve, 1500));
        const randomAmount = Math.random() * 200 + 10;
        const mockResult: GeminiAnalysisResult = {
            isInvoice: !file.name.toLowerCase().includes('bestätigung'),
            isOrderConfirmation: file.name.toLowerCase().includes('bestätigung'),
            isEmailBody: file.name.toLowerCase().includes('email'),
            documentDate: new Date().toISOString(),
            textContent: `Dies ist ein simulierter OCR-Text für die Datei ${file.name}.\nRechnungsnummer: 12345\nBetrag: ${randomAmount.toFixed(2)} EUR\nDatum: ${new Date().toLocaleDateString('de-DE')}\nFirma: ${file.name.toLowerCase().includes('zoe') ? 'ZOE Solar' : 'Bauhaus' }`,
            vendor: file.name.toLowerCase().includes('zoe') ? 'ZOE Solar' : 'Bauhaus',
            totalAmount: randomAmount,
            vatAmount: file.name.toLowerCase().includes('zoe') ? 0 : randomAmount * 0.19,
            invoiceNumber: `RE-${Math.floor(Math.random() * 100000)}`,
            invoiceType: InvoiceType.INCOMING,
            taxCategory: 'Sonstiges',
            averageConfidence: Math.round(80 + Math.random() * 15),
            pageCount: 1,
            fieldConfidences: [],
            warnings: [],
            suggestedStorageLocationId: DEFAULT_DIGITAL_STORAGE_ID,
        };
        const ruledResult = applyRules(mockResult, rules);
        const finalMockResult = ensureExtendedAnalysisData(ruledResult);
        if (!finalMockResult.invoiceType) finalMockResult.invoiceType = InvoiceType.INCOMING;
        if (!finalMockResult.taxCategory || finalMockResult.taxCategory === '') finalMockResult.taxCategory = 'Sonstiges';
        return finalMockResult;
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
        const imagePart = await fileToGenerativePart(file);

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: {
                parts: [
                    imagePart,
                    { text: `Analysiere das Dokument sorgfältig. Führe eine OCR durch, um den gesamten Text zu extrahieren. Identifiziere Rechnungsdatum, Rechnungsnummer, Verkäufer, Bruttobetrag und MwSt.-Betrag. Klassifiziere als Eingangsrechnung (Ausgabe) oder Ausgangsrechnung (Einnahme). Basierend auf dem Verkäufer und dem Inhalt, schlage eine passende Steuerkategorie vor. Beispiele: 'Material/Waren' für Baumärkte, 'Kraftstoff' für Tankstellen, 'Photovoltaik' für Solaranlagen ohne MwSt., 'Einnahmen' für Rechnungen mit MwSt. von Energieunternehmen. Nutze 'Sonstiges' nur, wenn keine spezifischere Kategorie passt. Gib ausschließlich das JSON-Objekt zurück.` }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isInvoice: { type: Type.BOOLEAN },
                        isOrderConfirmation: { type: Type.BOOLEAN },
                        isEmailBody: { type: Type.BOOLEAN },
                        documentDate: { type: Type.STRING },
                        textContent: { type: Type.STRING },
                        vendor: { type: Type.STRING },
                        totalAmount: { type: Type.NUMBER },
                        vatAmount: { type: Type.NUMBER },
                        invoiceNumber: { type: Type.STRING },
                        invoiceType: { type: Type.STRING, enum: [InvoiceType.INCOMING, InvoiceType.OUTGOING] },
                        taxCategory: { type: Type.STRING }
                    },
                    required: ["isInvoice", "isOrderConfirmation", "isEmailBody", "documentDate", "textContent", "vendor", "totalAmount", "vatAmount", "invoiceNumber", "invoiceType", "taxCategory"],
                },
            },
        });
        
        const jsonStr = response.text.trim();
        const rawResult: GeminiAnalysisResult = JSON.parse(jsonStr);

        const ruledResult = applyRules(rawResult, rules);
        const finalResult = ensureExtendedAnalysisData(ruledResult);

        if (!finalResult.invoiceType) finalResult.invoiceType = InvoiceType.INCOMING;
        if (!finalResult.taxCategory || finalResult.taxCategory === '') finalResult.taxCategory = 'Sonstiges';

        return finalResult;
    } catch (error) {
        throw new Error(handleGeminiError(error));
    }
};

const clampConfidence = (value: number | undefined): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 65;
    return Math.max(10, Math.min(100, Math.round(value)));
};

const describeConfidence = (value: number): string => {
    if (value >= 90) return 'Sehr hoch';
    if (value >= 75) return 'Stark';
    if (value >= 60) return 'Mittel';
    return 'Gering';
};

const buildDefaultFieldConfidences = (result: GeminiAnalysisResult): OcrFieldConfidence[] => {
    return [
        {
            field: 'vendor',
            value: result.vendor || '',
            confidence: clampConfidence(result.vendor ? 92 : 65),
        },
        {
            field: 'invoiceNumber',
            value: result.invoiceNumber || '',
            confidence: clampConfidence(result.invoiceNumber ? 88 : 60),
        },
        {
            field: 'documentDate',
            value: result.documentDate || '',
            confidence: clampConfidence(result.documentDate ? 87 : 60),
        },
        {
            field: 'totalAmount',
            value: typeof result.totalAmount === 'number' ? result.totalAmount.toFixed(2) : '',
            confidence: clampConfidence(result.totalAmount ? 90 : 58),
        },
        {
            field: 'vatAmount',
            value: typeof result.vatAmount === 'number' ? result.vatAmount.toFixed(2) : '',
            confidence: clampConfidence(result.vatAmount ? 82 : 55),
        },
        {
            field: 'invoiceType',
            value: result.invoiceType,
            confidence: clampConfidence(86),
        },
        {
            field: 'taxCategory',
            value: result.taxCategory || 'Sonstiges',
            confidence: clampConfidence(result.taxCategory && result.taxCategory !== 'Sonstiges' ? 78 : 65),
        },
    ].map(field => ({
        ...field,
        confidenceDescription: describeConfidence(field.confidence),
    }));
};

const deriveDefaultWarnings = (result: GeminiAnalysisResult, averageConfidence: number): string[] => {
    const warnings = result.warnings ? [...result.warnings] : [];
    if (result.isOrderConfirmation && !result.isInvoice && !warnings.some(w => w.includes('Bestell'))) {
        warnings.push('Analyse deutet auf eine Bestellbestätigung ohne Rechnung hin.');
    }
    if (result.isEmailBody && !result.isInvoice && !warnings.some(w => w.includes('E-Mail'))) {
        warnings.push('Dokument wirkt wie eine E-Mail – bitte prüfen, ob ein offizieller Beleg vorliegt.');
    }
    if (!result.invoiceNumber && !warnings.some(w => w.includes('Rechnungsnummer'))) {
        warnings.push('Keine eindeutige Rechnungsnummer erkannt.');
    }
    if (!result.totalAmount || result.totalAmount <= 0) {
        warnings.push('Kein gültiger Bruttobetrag erkannt.');
    }
    if (averageConfidence < 75) {
        warnings.push('OCR-Qualität liegt unter 75 %. Felder bitte manuell prüfen.');
    }
    return warnings;
};

const ensureExtendedAnalysisData = (result: GeminiAnalysisResult): GeminiAnalysisResult => {
    const baseFields = result.fieldConfidences && result.fieldConfidences.length > 0
        ? result.fieldConfidences.map(field => ({
            ...field,
            confidence: clampConfidence(field.confidence),
            confidenceDescription: field.confidenceDescription || describeConfidence(clampConfidence(field.confidence)),
        }))
        : buildDefaultFieldConfidences(result);

    const synchronizedFields = baseFields.map(field => {
        switch (field.field) {
            case 'vendor':
                return { ...field, value: result.vendor || '' };
            case 'invoiceNumber':
                return { ...field, value: result.invoiceNumber || '' };
            case 'documentDate':
                return { ...field, value: result.documentDate || '' };
            case 'totalAmount':
                return {
                    ...field,
                    value: typeof result.totalAmount === 'number' ? result.totalAmount.toFixed(2) : field.value,
                };
            case 'vatAmount':
                return {
                    ...field,
                    value: typeof result.vatAmount === 'number' ? result.vatAmount.toFixed(2) : field.value,
                };
            case 'invoiceType':
                return { ...field, value: result.invoiceType };
            case 'taxCategory':
                return { ...field, value: result.taxCategory || 'Sonstiges' };
            default:
                return field;
        }
    });

    const avg = synchronizedFields.length > 0
        ? Number((synchronizedFields.reduce((sum, field) => sum + field.confidence, 0) / synchronizedFields.length).toFixed(2))
        : clampConfidence(result.averageConfidence);

    const averageConfidence = typeof result.averageConfidence === 'number'
        ? Number(result.averageConfidence.toFixed(2))
        : avg;

    const warnings = deriveDefaultWarnings(result, averageConfidence);

    return {
        ...result,
        fieldConfidences: synchronizedFields,
        averageConfidence,
        warnings,
        suggestedStorageLocationId: result.suggestedStorageLocationId || DEFAULT_DIGITAL_STORAGE_ID,
    };
};

export const buildOcrMetadataFromAnalysis = (analysis: GeminiAnalysisResult): DocumentOcrMetadata => {
    const enriched = ensureExtendedAnalysisData(analysis);
    return {
        averageConfidence: enriched.averageConfidence ?? 85,
        analysedAt: new Date(),
        engineVersion: GEMINI_MODEL,
        pageCount: enriched.pageCount,
        fields: enriched.fieldConfidences ?? [],
        warnings: enriched.warnings,
    };
};

export const getDocumentStatusFromAnalysis = (analysis: GeminiAnalysisResult, existingDocuments: Document[] = []): DocumentStatus => {
    const analysisDate = new Date(analysis.documentDate).toDateString();
    
    for (const doc of existingDocuments) {
        if (analysis.invoiceNumber && doc.invoiceNumber && analysis.invoiceNumber.trim().length > 2 &&
            analysis.invoiceNumber.trim().toLowerCase() === doc.invoiceNumber.trim().toLowerCase()) {
            return DocumentStatus.POTENTIAL_DUPLICATE;
        }
        
        const docDate = doc.date.toDateString();
        if (doc.totalAmount && analysis.totalAmount &&
            doc.totalAmount.toFixed(2) === analysis.totalAmount.toFixed(2) &&
            docDate === analysisDate) {
            return DocumentStatus.POTENTIAL_DUPLICATE;
        }
    }

    if (analysis.isOrderConfirmation && !analysis.isInvoice) return DocumentStatus.MISSING_INVOICE;
    if (analysis.isEmailBody && !analysis.isInvoice) return DocumentStatus.SCREENSHOT;
    return DocumentStatus.OK;
};

const formatCurrency = (amount: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

// New function for the Chat Panel
export const getChatResponse = async (apiKey: string, history: ChatMessage[], documents: Document[], rules: Rule[], userProfile: UserProfile, userMessage: string, systemPrompt: string): Promise<string> => {
    if (!apiKey) {
        return "Bitte geben Sie zuerst einen gültigen API-Schlüssel in den Einstellungen ein.";
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Create a comprehensive context from all available data
    const financialSummary = documents.reduce((acc, doc) => {
        if(doc.invoiceType === InvoiceType.INCOMING) {
            acc.expenses += doc.totalAmount || 0;
            acc.vatReclaim += doc.vatAmount || 0;
        } else {
            acc.revenue += doc.totalAmount || 0;
            acc.vatDue += doc.vatAmount || 0;
        }
        return acc;
    }, { revenue: 0, expenses: 0, vatDue: 0, vatReclaim: 0 });

    const financialSummaryContext = `
- Gesamteinnahmen: ${formatCurrency(financialSummary.revenue)}
- Gesamtausgaben: ${formatCurrency(financialSummary.expenses)}
- Abzuführende USt.: ${formatCurrency(financialSummary.vatDue)} (Einnahmen)
- Erstattungsfähige Vorsteuer: ${formatCurrency(financialSummary.vatReclaim)} (Ausgaben)
- Steuerbilanz: ${formatCurrency(financialSummary.vatReclaim - financialSummary.vatDue)}
    `.trim();

    const documentContext = documents.map(d => 
        `- ID: ${d.id}, Name: ${d.name}, Verkäufer: ${d.vendor || 'N/A'}, Betrag: ${d.totalAmount?.toFixed(2) || 'N/A'}€, Datum: ${d.date.toLocaleDateString('de-DE')}, Kategorie: ${d.taxCategory || 'N/A'}`
    ).join('\n');
    
    const rulesContext = rules.map(r => 
        `- WENN ${r.conditionType === 'vendor' ? 'Verkäufer' : 'Textinhalt'} "${r.conditionValue}" enthält, DANN Typ: ${r.invoiceType} & Kategorie: ${r.resultCategory}`
    ).join('\n');

    const userProfileContext = `
- Name: ${userProfile.name || 'Nicht angegeben'}
- Steuer-ID: ${userProfile.taxId || 'Nicht angegeben'}
- USt-IdNr.: ${userProfile.vatId || 'Nicht angegeben'}
- Steuernummer: ${userProfile.taxNumber || 'Nicht angegeben'}
- Unternehmensform: ${userProfile.companyForm || 'Nicht angegeben'}
    `.trim();

    const systemInstruction = `${systemPrompt}
    ---
    AKTUELLE DATEN AUS DER ANWENDUNG:

    BENUTZERPROFIL:
    ${userProfileContext}

    FINANZÜBERSICHT:
    ${financialSummaryContext}

    AUTOMATISIERUNGS-REGELN:
    ${rulesContext}

    VERFÜGBARE DOKUMENTE:
    ${documentContext || 'Keine Dokumente vorhanden.'}
    ---
    `;

    try {
        const chat = ai.chats.create({
            model: GEMINI_MODEL,
            config: { systemInstruction },
            history: history.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.rawContent || msg.content }] // Use rawContent to ensure clean history
            })),
        });

        const response: GenerateContentResponse = await chat.sendMessage({ message: userMessage });
        return response.text;
    } catch (error) {
        return handleGeminiError(error);
    }
};

export const findFundingOpportunities = async (apiKey: string, userProfile: UserProfile): Promise<FundingOpportunity[]> => {
     if (!apiKey) {
        console.warn("API key not found. Using mock data for funding opportunities.");
        await new Promise(resolve => setTimeout(resolve, 1500));
        return [
            { id: 'mock-1', title: 'Digital Jetzt – Investitionsförderung für KMU', source: 'BMWK', description: 'Zuschüsse für Investitionen in digitale Technologien sowie in die Qualifizierung der Mitarbeitenden.', eligibilitySummary: 'KMU, 3-499 Mitarbeiter, Investitionsplan erforderlich.', link: 'https://www.bmwk.de/Redaktion/DE/Artikel/Digitale-Welt/digital-jetzt.html' },
            { id: 'mock-2', title: 'KfW-Kredit für Wachstum', source: 'KfW Bankengruppe', description: 'Zinsgünstige Kredite für etablierte mittelständische Unternehmen zur Finanzierung von größeren Vorhaben.', eligibilitySummary: 'Mind. 5 Jahre am Markt, Gruppenumsatz bis 2 Mrd. Euro.', link: 'https://www.kfw.de/inlandsfoerderung/Unternehmen/Erweitern-Festigen/F%C3%B6rderprodukte/KfW-Kredit-f%C3%BCr-Wachstum-(291)/' },
            { id: 'mock-3', title: 'Eingliederungszuschuss (EGZ)', source: 'Bundesagentur für Arbeit', description: 'Zuschuss zum Arbeitsentgelt für die Einstellung von Arbeitnehmer/innen mit Vermittlungshemmnissen.', eligibilitySummary: 'Einstellung von förderungsbedürftigen Personen (z.B. Langzeitarbeitslose).', link: 'https://www.arbeitsagentur.de/unternehmen/finanziell/foerderung-von-arbeitsverhaeltnissen' },
        ];
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
        Du bist ein Experte für deutsche Fördermittel für Unternehmen.
        Basierend auf dem folgenden Unternehmensprofil, führe eine Websuche durch und finde relevante, aktuelle Förderprogramme, Zuschüsse und Kredite in Deutschland.

        Unternehmensprofil:
        - Unternehmensform: ${userProfile.companyForm || 'Nicht angegeben'}
        - Standort: Deutschland (bundesweit)

        Deine Aufgabe:
        1. Finde 5 bis 8 passende Förderprogramme.
        2. Gib für jedes Programm an: Titel, die vergebende Stelle (z.B. KfW, BAFA), eine kurze Beschreibung (ein Satz), eine Zusammenfassung der wichtigsten Voraussetzungen und einen direkten, gültigen Link zur offiziellen Programm-Website.
        3. SEHR WICHTIG: Antworte AUSSCHLIESSLICH mit einem validen JSON-Array-String. Füge keinen einleitenden Text, keine Erklärungen und keine Markdown-Formatierung um das JSON herum hinzu.

        Das JSON-Schema für jedes Objekt im Array muss wie folgt aussehen:
        {
          "id": "eine-eindeutige-id-die-du-generierst",
          "title": "Programmtitel",
          "source": "Vergebende Stelle",
          "description": "Kurze Beschreibung",
          "eligibilitySummary": "Zusammenfassung der Voraussetzungen",
          "link": "https://offizielle-programm-url.de"
        }
    `;

    try {
          const response = await ai.models.generateContent({
              model: GEMINI_MODEL,
           contents: prompt,
           config: {
             tools: [{googleSearch: {}}],
           },
        });

        const jsonStr = response.text.trim();
        // Versuch, das JSON zu parsen, auch wenn es von Markdown umschlossen ist
        const jsonMatch = jsonStr.match(/```json\n([\s\S]*?)\n```/);
        const cleanJsonStr = jsonMatch ? jsonMatch[1] : jsonStr;

        const results: FundingOpportunity[] = JSON.parse(cleanJsonStr);
        return results;

    } catch (error) {
        throw new Error(handleGeminiError(error));
    }
};