import React, { useState, useEffect, useRef } from 'react';
import { Document, ChatMessage, Rule, UserProfile } from '../types';
import { getChatResponse } from '../services/geminiService';
import { XIcon } from './icons/XIcon';
import UserIcon from './icons/UserIcon';
import SparklesIcon from './icons/SparklesIcon';
import FileIcon from './icons/FileIcon';

interface ChatPanelProps {
    apiKey: string;
    lexofficeApiKey: string;
    documents: Document[];
    rules: Rule[];
    userProfile: UserProfile;
    onOpenDocument: (docId: string) => void;
    onClose: () => void;
    systemPrompt: string;
    onImportFromLexoffice?: (dateRange: { start: Date; end: Date }, includeDocuments: boolean) => Promise<void>;
}

const detectLexofficeImportIntent = (message: string) => {
    const normalized = message.toLowerCase();
    if (!normalized.includes('lexoffice')) return null;

    const hasImportVerb = /(importier|import|hole|lade|synchronisiere)/.test(normalized);
    if (!hasImportVerb) return null;

    const yearMatch = message.match(/20\d{2}/);
    if (yearMatch) {
        const year = Number(yearMatch[0]);
        if (!Number.isNaN(year)) {
            const start = new Date(Date.UTC(year, 0, 1));
            const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
            const toIsoDate = (date: Date) => date.toISOString().split('T')[0];
            return {
                dateRange: {
                    start: toIsoDate(start),
                    end: toIsoDate(end),
                },
                includeDocuments: true,
            };
        }
    }

    const now = new Date();
    const startOfYear = new Date(Date.UTC(now.getFullYear(), 0, 1));
    const endOfYear = new Date(Date.UTC(now.getFullYear(), 11, 31, 23, 59, 59, 999));
    const toIsoDate = (date: Date) => date.toISOString().split('T')[0];

    return {
        dateRange: {
            start: toIsoDate(startOfYear),
            end: toIsoDate(endOfYear),
        },
        includeDocuments: true,
    };
};

const ChatPanel: React.FC<ChatPanelProps> = ({ apiKey, lexofficeApiKey, documents, rules, userProfile, onOpenDocument, onClose, systemPrompt, onImportFromLexoffice }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', content: 'Hallo! Ich bin Ihr KI-Steuerassistent. Ich kann Belege analysieren, Lexoffice-Imports für Sie anstoßen und Fragen zu Ihren Finanzen beantworten.', rawContent: 'Hallo! Ich bin Ihr KI-Steuerassistent. Ich kann Belege analysieren, Lexoffice-Imports für Sie anstoßen und Fragen zu Ihren Finanzen beantworten.' }
    ]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleToolUse = async (toolName: string, parameters?: any) => {
        if (toolName === 'send_to_lexoffice') {
            const actionMessage: ChatMessage = { role: 'model', content: 'Verstanden. Starte die Übertragung an Lexoffice...' };
            setMessages(prev => [...prev, actionMessage]);
            setIsLoading(true);

            setTimeout(() => {
                if (!lexofficeApiKey) {
                    const errorMessage: ChatMessage = { role: 'model', content: 'Fehler: Es wurde kein Lexoffice API-Schlüssel gefunden. Bitte fügen Sie ihn in den Einstellungen hinzu.' };
                    setMessages(prev => [...prev, errorMessage]);
                } else {
                    const successMessage: ChatMessage = { role: 'model', content: `Erfolgreich! ${documents.length} Belege wurden an Lexoffice gesendet.` };
                    setMessages(prev => [...prev, successMessage]);
                }
                setIsLoading(false);
            }, 2500);
        } else if (toolName === 'import_from_lexoffice') {
            const actionMessage: ChatMessage = { role: 'model', content: 'Verstanden. Importiere Daten aus Lexoffice...' };
            setMessages(prev => [...prev, actionMessage]);
            setIsLoading(true);

            try {
                if (!lexofficeApiKey) {
                    const errorMessage: ChatMessage = { role: 'model', content: 'Fehler: Es wurde kein Lexoffice API-Schlüssel gefunden. Bitte fügen Sie ihn in den Einstellungen hinzu.' };
                    setMessages(prev => [...prev, errorMessage]);
                    setIsLoading(false);
                    return;
                }

                if (!onImportFromLexoffice) {
                    const errorMessage: ChatMessage = { role: 'model', content: 'Fehler: Der Import kann momentan nicht ausgeführt werden. Bitte versuchen Sie es über den Lexoffice-Bereich.' };
                    setMessages(prev => [...prev, errorMessage]);
                    setIsLoading(false);
                    return;
                }

                if (!parameters?.dateRange) {
                    const errorMessage: ChatMessage = { role: 'model', content: 'Fehler: Kein Zeitraum für den Import angegeben.' };
                    setMessages(prev => [...prev, errorMessage]);
                    setIsLoading(false);
                    return;
                }

                const dateRange = {
                    start: new Date(parameters.dateRange.start),
                    end: new Date(parameters.dateRange.end)
                };
                const includeDocuments = parameters.includeDocuments ?? true;

                await onImportFromLexoffice(dateRange, includeDocuments);

                const successMessage: ChatMessage = { role: 'model', content: 'Import aus Lexoffice erfolgreich abgeschlossen.' };
                setMessages(prev => [...prev, successMessage]);
            } catch (error) {
                const errorMessage: ChatMessage = { role: 'model', content: `Fehler beim Import: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}` };
                setMessages(prev => [...prev, errorMessage]);
            } finally {
                setIsLoading(false);
            }
        }
    };


    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;

        const newUserMessage: ChatMessage = { role: 'user', content: userInput, rawContent: userInput };
        const newMessages = [...messages, newUserMessage];
        setMessages(newMessages);
        setUserInput('');
        setIsLoading(true);

        const importIntent = detectLexofficeImportIntent(userInput);
        if (importIntent) {
            await handleToolUse('import_from_lexoffice', importIntent);
            return;
        }

        try {
            const responseText = await getChatResponse(apiKey, newMessages, documents, rules, userProfile, userInput, systemPrompt);
            
            // Check for tool use command
            try {
                const responseJson = JSON.parse(responseText);
                if (responseJson.tool_use && responseJson.tool_use.name) {
                    await handleToolUse(responseJson.tool_use.name, responseJson.tool_use.parameters);
                    return; // Stop further processing
                }
            } catch (error) {
                // Not a JSON command, proceed as normal text
            }

            const modelResponse: ChatMessage = {
                role: 'model',
                content: responseText,
                rawContent: responseText,
            };
            setMessages(prev => [...prev, modelResponse]);

        } catch (error) {
            console.error(error);
            const errorMessage: ChatMessage = { role: 'model', content: "Es gab ein Problem bei der Anfrage." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const renderWithMarkdown = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);
        return (
            <>
                {parts.map((part, index) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={index}>{part.slice(2, -2)}</strong>;
                    }
                    return <span key={index}>{part}</span>;
                })}
            </>
        );
    };

    const renderMessageContent = (content: string) => {
        const docButtonRegex = /%%DOC_BUTTON\(([^)]+)\)%%/g;
        const parts = content.split(docButtonRegex);

        return (
            <>
                {parts.map((part, index) => {
                    if (index % 2 === 1) { // This is a docId
                        const doc = documents.find(d => d.id === part);
                        return (
                             <button
                                key={index}
                                onClick={() => onOpenDocument(part)}
                                className="flex items-center gap-3 w-full text-left mt-2 bg-blue-50 hover:bg-blue-100 text-blue-800 p-2 rounded-lg transition-colors border border-blue-200"
                            >
                                <FileIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-semibold text-blue-700">Beleg öffnen</span>
                                    <span className="text-sm font-medium truncate">{doc?.name || 'Unbekannt'}</span>
                                </div>
                            </button>
                        );
                    }
                    // This is a regular text part, process for markdown
                    return <span key={index} className="whitespace-pre-wrap">{renderWithMarkdown(part)}</span>;
                })}
            </>
        );
    }

    return (
        <aside className="fixed inset-0 z-40 md:relative md:w-96 md:inset-auto bg-white border-l border-slate-200 flex flex-col h-full flex-shrink-0 transition-all duration-300 transform md:translate-x-0 shadow-2xl md:shadow-none">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                <h3 className="text-lg font-bold text-slate-800">KI-Chat</h3>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><XIcon className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="flex-grow p-4 overflow-y-auto bg-slate-50">
                <div className="space-y-6">
                    {messages.map((msg, index) => (
                        <div key={index} className="flex items-start gap-3">
                           {msg.role === 'model' && (
                               <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                   <SparklesIcon className="w-5 h-5 text-blue-600"/>
                               </div>
                           )}
                           <div className={`w-full max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-lg ml-auto' : 'bg-slate-100 text-slate-800 rounded-bl-lg'}`}>
                               <div className="text-sm">
                                  {renderMessageContent(msg.content)}
                               </div>
                           </div>
                           {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                                    <UserIcon className="w-5 h-5 text-slate-600"/>
                                </div>
                           )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-start gap-3 justify-start">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <SparklesIcon className="w-5 h-5 text-blue-600"/>
                            </div>
                            <div className="max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl bg-slate-100 text-slate-800 rounded-bl-lg">
                                <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></div>
                                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>
            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 flex-shrink-0 bg-white">
                <div className="relative">
                    <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Frage stellen..."
                        className="w-full pl-4 pr-12 py-2.5 border border-slate-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(e as any); }}
                    />
                    <button type="submit" disabled={isLoading || !userInput.trim()} className="absolute inset-y-1 right-1 flex items-center justify-center w-10 h-10 text-white bg-blue-600 rounded-full disabled:bg-blue-300 hover:bg-blue-700 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.428A1 1 0 0011 16.171V11.182l4.243 4.243a1 1 0 001.414-1.414L12.53 10.881l1.414-1.414a1 1 0 00-1.414-1.414L10.894 9.683V4.693z" /></svg>
                    </button>
                </div>
            </form>
        </aside>
    );
};

export default ChatPanel;