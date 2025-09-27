import React, { useState } from 'react';
import { MailIcon } from './icons/MailIcon';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { Document, DocumentSource, DocumentStatus, InvoiceType, NotificationSettings } from '../types';
import LexofficeIcon from './icons/LexofficeIcon';
import CalendarIcon from './icons/CalendarIcon';
import ChatBubbleIcon from './icons/ChatBubbleIcon';

interface SettingsViewProps {
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  apiKey: string;
  setApiKey: (key: string) => void;
  lexofficeApiKey: string;
  setLexofficeApiKey: (key: string) => void;
  lexofficeLiveEnabled: boolean;
  setLexofficeLiveEnabled: (enabled: boolean) => void;
  notificationSettings: NotificationSettings;
  setNotificationSettings: React.Dispatch<React.SetStateAction<NotificationSettings>>;
  chatSystemPrompt: string;
  setChatSystemPrompt: (prompt: string) => void;
  DEFAULT_CHAT_PROMPT: string;
}

const SettingsCard: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        <p className="text-slate-500 mt-1 mb-6">{description}</p>
        {children}
    </div>
);


const SettingsView: React.FC<SettingsViewProps> = ({ setDocuments, apiKey, setApiKey, lexofficeApiKey, setLexofficeApiKey, lexofficeLiveEnabled, setLexofficeLiveEnabled, notificationSettings, setNotificationSettings, chatSystemPrompt, setChatSystemPrompt, DEFAULT_CHAT_PROMPT }) => {
  const [emails, setEmails] = useState<string[]>(['anna.muster@mail.com', 'privat@email.de']);
  const [newEmail, setNewEmail] = useState('');
  const [scanPeriod, setScanPeriod] = useState<string>('30');
  const [isWhatsAppConnected, setIsWhatsAppConnected] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showLexofficeKey, setShowLexofficeKey] = useState(false);

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmail && !emails.includes(newEmail)) {
      setEmails([...emails, newEmail]);
      setNewEmail('');
    }
  };

  const handleScanEmails = () => {
    setIsScanning(true);
    setTimeout(() => {
      const foundDocs: Document[] = [
        // ... (simulated documents as before)
      ];
      setDocuments(prev => [...prev, ...foundDocs].sort((a,b) => b.date.getTime() - a.date.getTime()));
      setIsScanning(false);
    }, 2000);
  };
  
  const handleSimulateWhatsApp = () => {
     const newDoc: Document = {
        id: `whatsapp-${Date.now()}`,
        name: 're_supermarkt_3,78€_11_2024.jpg',
        date: new Date(new Date().setDate(new Date().getDate() - 2)),
        year: new Date().getFullYear(),
        quarter: Math.floor((new Date().getMonth() + 3) / 3),
        source: DocumentSource.WHATSAPP,
        status: DocumentStatus.OK,
        fileUrl: 'https://picsum.photos/400/600',
        textContent: 'Supermarkt Quittung\nMilch: 1.29\nBrot: 2.49',
        vendor: 'Supermarkt',
        totalAmount: 3.78,
        vatAmount: 0.25,
        invoiceType: InvoiceType.INCOMING,
     };
     setDocuments(prev => [...prev, newDoc].sort((a, b) => b.date.getTime() - a.date.getTime()));
  };
  
  const handleNotificationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNotificationSettings(prev => ({
        ...prev,
        [e.target.name]: e.target.checked
    }));
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-slate-800">Einstellungen</h1>
      
      {/* API Key Section */}
      <SettingsCard 
        title="Konfiguration" 
        description="Verwalten Sie Ihre API-Schlüssel und passen Sie das Verhalten des KI-Assistenten an."
      >
        <div className="space-y-4">
            <div>
                <label htmlFor="api-key" className="block text-sm font-medium text-slate-700 mb-1">Gemini API Schlüssel</label>
                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    id="api-key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Geben Sie Ihren API-Schlüssel hier ein"
                    className="w-full p-2 pr-24 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(prev => !prev)}
                    className="absolute inset-y-1 right-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 hover:text-blue-600"
                  >
                    {showGeminiKey ? 'Verbergen' : 'Anzeigen'}
                  </button>
                </div>
            </div>
            <div>
                <label htmlFor="lexoffice-api-key" className="block text-sm font-medium text-slate-700 mb-1">Lexoffice API Schlüssel</label>
                <div className="relative">
                  <input
                    type={showLexofficeKey ? 'text' : 'password'}
                    id="lexoffice-api-key"
                    value={lexofficeApiKey}
                    onChange={(e) => setLexofficeApiKey(e.target.value)}
                    placeholder="Geben Sie Ihren Lexoffice API-Schlüssel ein"
                    className="w-full p-2 pr-24 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLexofficeKey(prev => !prev)}
                    className="absolute inset-y-1 right-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 hover:text-blue-600"
                  >
                    {showLexofficeKey ? 'Verbergen' : 'Anzeigen'}
                  </button>
                </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="pr-4">
                <p className="text-sm font-medium text-slate-700">Direkte Lexoffice-API verwenden</p>
                <p className="text-xs text-slate-500">Aktiviert echte Importe/Exporte über Lexoffice. Erfordert einen gültigen API-Schlüssel.</p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={lexofficeLiveEnabled}
                  onChange={(event) => setLexofficeLiveEnabled(event.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-12 h-6 bg-slate-300 rounded-full peer-focus:ring-4 peer-focus:ring-blue-200 peer-checked:bg-blue-600 transition">
                  <span className="absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-6"></span>
                </div>
              </label>
            </div>
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center">Ihre API-Schlüssel werden sicher in Ihrem Browser gespeichert.</p>
      </SettingsCard>

      {/* Chat Behavior Section */}
      <SettingsCard 
        title="KI-Chat-Verhalten ('Gehirn')" 
        description="Passen Sie die Systemanweisung des KI-Assistenten an. Dies beeinflusst seine Persönlichkeit, sein Wissen und wie er auf Anfragen reagiert."
      >
        <textarea
            value={chatSystemPrompt}
            onChange={(e) => setChatSystemPrompt(e.target.value)}
            rows={15}
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-xs bg-slate-50/80 text-slate-900"
            placeholder="Geben Sie hier die Systemanweisung für den Chat ein..."
        />
        <div className="flex justify-end mt-4 items-center gap-4">
             <p className="text-xs text-slate-500 mr-auto text-left">
                <strong>Tipp:</strong> Fügen Sie URLs zu vertrauenswürdigen Quellen (z.B. Steuer-Websites) in den Text ein. Der KI-Agent kann diese als Wissensbasis für Recherchen nutzen.
            </p>
            <button 
                onClick={() => setChatSystemPrompt(DEFAULT_CHAT_PROMPT)}
                className="text-sm text-slate-600 hover:text-red-600 font-semibold transition-colors flex-shrink-0"
            >
                Auf Standard zurücksetzen
            </button>
        </div>
      </SettingsCard>
      
      {/* Notifications Section */}
      <SettingsCard
        title="Benachrichtigungen für Fristen"
        description="Legen Sie fest, wann Sie an bevorstehende Steuerfristen erinnert werden möchten."
      >
        <div className="space-y-3">
          <label className="flex items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer">
            <input
              type="checkbox"
              name="notify14Days"
              checked={notificationSettings.notify14Days}
              onChange={handleNotificationChange}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm text-slate-700">Benachrichtigung 2 Wochen vor Fristablauf</span>
          </label>
          <label className="flex items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer">
            <input
              type="checkbox"
              name="notify1Day"
              checked={notificationSettings.notify1Day}
              onChange={handleNotificationChange}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm text-slate-700">Benachrichtigung 1 Tag vor Fristablauf</span>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Integrationen (Simuliert)"
        description="Verbinden Sie Ihre Konten, damit der KI-Agent automatisch nach Belegen suchen kann."
      >
        <div className="space-y-6">
            {/* Email */}
            <div>
              <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center"><MailIcon className="w-5 h-5 mr-3 text-slate-500" />E-Mail-Konten</h3>
              <div className="space-y-2 mb-4">
                {emails.map((email, index) => (
                  <div key={index} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg">
                    <span className="text-slate-700 text-sm">{email}</span>
                    <button className="text-red-500 hover:text-red-700 text-xs font-semibold">Entfernen</button>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddEmail} className="flex items-center space-x-2 mb-4">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="neue.email@beispiel.de"
                  className="flex-grow p-2 border border-slate-300 rounded-lg"
                />
                <button type="submit" className="bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-300">
                  Hinzufügen
                </button>
              </form>
              <button
                onClick={handleScanEmails}
                disabled={isScanning}
                className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300 disabled:bg-blue-300 flex items-center justify-center"
              >
                {isScanning ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Scanne E-Mails...
                  </>
                ) : (
                  'Jetzt E-Mails scannen'
                )}
              </button>
            </div>
            {/* WhatsApp */}
            <div>
              <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center"><WhatsAppIcon className="w-5 h-5 mr-3 text-green-500" />WhatsApp</h3>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                 <p className="text-slate-600">Status: {isWhatsAppConnected ? <span className="text-green-600 font-semibold">Verbunden</span> : 'Nicht verbunden'}</p>
                 <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={isWhatsAppConnected} onChange={() => setIsWhatsAppConnected(!isWhatsAppConnected)} className="sr-only peer" />
                    <div className="relative w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
        </div>
      </SettingsCard>
    </div>
  );
};

export default SettingsView;