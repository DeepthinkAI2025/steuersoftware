<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Steuer-KI-Agent Software

Diese Anwendung ist eine umfassende Buchhaltungs- und Steuersoftware mit KI-gestützter Belegerfassung, Lexoffice-Integration und automatischer Steuerberechnung.

## 🚀 Features

- **KI-gestützte Belegerfassung**: Automatische Texterkennung und Datenextraktion aus Belegen
- **Lexoffice-Integration**: Nahtlose Synchronisation mit Lexoffice für Buchhaltung und Rechnungswesen
- **Steuerberechnung**: Automatische UStVA-Erstellung und Steuerberechnungen
- **Modulare Architektur**: Lazy Loading für optimale Performance
- **Responsive Design**: Vollständig responsive für Desktop und Mobile

## 📊 Performance

### Bundle-Optimierung
- **Haupt-Bundle**: 32.78 kB (vorher: 666.26 kB - **95% Reduktion**)
- **Lazy Loading**: Alle Views werden bei Bedarf geladen
- **Code Splitting**: Automatische Aufteilung in optimierte Chunks
- **Build-Zeit**: ~7.95s für Produktions-Build

### Chunk-Verteilung
- `react-vendor`: 179.62 kB (React & React-DOM)
- `ai-vendor`: 239.28 kB (Google AI SDK)
- `index`: 32.78 kB (Hauptapplikation)
- Verschiedene Feature-Chunks: 5-35 kB (lazy geladen)

## 🛠️ Technologie-Stack

- **Frontend**: React 19.1.1, TypeScript, Vite 6.2.0
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **KI**: Google Gemini AI
- **Build**: Vite mit Terser-Minifizierung
- **Tests**: Vitest, React Testing Library

## 📋 Voraussetzungen

- Node.js (Version 18 oder höher)
- npm oder yarn
- Google Gemini API-Schlüssel (für KI-Funktionen)
- Lexoffice API-Schlüssel (optional, für Live-Integration)

## 🚀 Lokale Installation und Ausführung

### 1. Repository klonen
```bash
git clone <repository-url>
cd steuersoftware
```

### 2. Abhängigkeiten installieren
```bash
npm install
```

### 3. Umgebungsvariablen konfigurieren

Erstelle eine `.env.local` Datei im Projektroot:

```env
# Gemini AI API Key (erforderlich für KI-Funktionen)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Lexoffice Integration (optional)
VITE_LEXOFFICE_API_KEY=your_lexoffice_api_key_here
VITE_LEXOFFICE_API_BASE=https://api.lexoffice.io
VITE_LEXOFFICE_ENABLE_REAL_API=false
```

### 4. Entwicklungsserver starten
```bash
npm run dev
```

Die Anwendung ist nun unter `http://localhost:5173` verfügbar.

### 5. Produktions-Build erstellen
```bash
npm run build
```

### 6. Build lokal testen
```bash
npm run preview
```

## 🧪 Tests

### Unit- und Integration-Tests ausführen
```bash
npm test
```

### Tests mit UI ausführen
```bash
npm run test:ui
```

### Tests für Produktion ausführen
```bash
npm run test:run
```

## 📁 Projektstruktur

```
steuersoftware/
├── components/          # React-Komponenten
│   ├── icons/          # Icon-Komponenten
│   └── *-View.tsx      # Haupt-Views (lazy geladen)
├── services/           # Business-Logic und API-Integration
├── hooks/              # Custom React Hooks
├── types.ts            # TypeScript-Typdefinitionen
├── App.tsx             # Hauptanwendung
├── index.tsx           # Einstiegspunkt
└── src/test/           # Test-Dateien
```

## 🔧 Konfiguration

### Vite-Konfiguration
Die `vite.config.ts` enthält optimierte Build-Einstellungen:
- Manual Chunks für Vendor-Bibliotheken
- Terser-Minifizierung mit Console-Entfernung
- CSS Code Splitting
- Source Maps nur im Development-Modus

### Lexoffice-Integration
- **Simulationsmodus**: Standardmäßig aktiviert für Entwicklung
- **Live-Modus**: Bei gesetztem API-Key und `VITE_LEXOFFICE_ENABLE_REAL_API=true`
- Vollständige CRUD-Operationen für Vouchers und Kontakte

## 📈 Entwicklung

### Neue Features hinzufügen
1. Komponente in `components/` erstellen
2. Lazy Loading in `App.tsx` hinzufügen
3. Tests in `src/test/` schreiben
4. Build testen: `npm run build`

### Performance-Optimierung
- Verwende React.lazy() für neue Views
- Optimiere Bundle-Splitting in `vite.config.ts`
- Überwache Bundle-Größe mit `npm run build`

## 🤝 Beitragen

1. Fork das Repository
2. Erstelle einen Feature-Branch
3. Commite deine Änderungen
4. Pushe den Branch
5. Erstelle einen Pull Request

## 📄 Lizenz

Dieses Projekt ist privat und nur für autorisierte Nutzer bestimmt.

## 🆘 Support

Bei Fragen oder Problemen:
1. Überprüfe die Konsolen-Logs im Browser
2. Stelle sicher, dass alle Umgebungsvariablen gesetzt sind
3. Führe `npm run build` aus, um Build-Fehler zu identifizieren
