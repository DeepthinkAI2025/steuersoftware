import React, { useMemo } from 'react';
import { View, Document, DocumentFilter } from '../types';
import FolderIcon from './icons/FolderIcon';
import ChartBarIcon from './icons/ChartBarIcon';
import { CalculatorIcon } from './icons/CalculatorIcon';
import RulesIcon from './icons/RulesIcon';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import CalendarIcon from './icons/CalendarIcon';
import LexofficeIcon from './icons/LexofficeIcon';
import { XIcon } from './icons/XIcon';
import SparklesIcon from './icons/SparklesIcon';

interface SidebarProps {
  activeView: View;
  setActiveView: (view: View) => void;
  documents: Document[];
  activeFilter: DocumentFilter | null;
  setActiveFilter: (filter: DocumentFilter | null) => void;
  isDesktopOpen: boolean;
  setIsDesktopOpen: (isOpen: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (isOpen: boolean) => void;
}

const NavItem: React.FC<{
  onClick: () => void;
  isActive: boolean;
  isSidebarOpen: boolean;
  label: string;
  count?: number;
  children: React.ReactNode;
}> = ({ onClick, isActive, isSidebarOpen, label, count, children }) => (
  <button
    onClick={onClick}
    title={!isSidebarOpen ? label : ''}
    className={`flex items-center w-full py-2.5 text-sm text-left transition-colors duration-200 rounded-lg ${
      isSidebarOpen ? 'px-3' : 'justify-center'
    } ${
      isActive ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    {children}
    {isSidebarOpen && <span className="ml-3 flex-grow">{label}</span>}
    {isSidebarOpen && count !== undefined && (
      <span className={`text-xs font-mono rounded px-1.5 py-0.5 ${isActive ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
    )}
  </button>
);

const BOOKKEEPING_NAV_ITEMS: Array<{ view: View; label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }> = [
  { view: View.BUCHHALTUNG_BELEGE, label: 'Belege', Icon: FolderIcon },
  { view: View.BUCHHALTUNG_BUCHUNGEN, label: 'Buchungsübersicht', Icon: CalculatorIcon },
  { view: View.BUCHHALTUNG_EUR, label: 'Einnahmen-Überschussrechnung', Icon: ChartBarIcon },
  { view: View.BUCHHALTUNG_MELDUNGEN, label: 'Steuerliche Meldungen', Icon: CalendarIcon },
];

const SidebarContent: React.FC<Omit<SidebarProps, 'isMobileOpen' | 'setIsMobileOpen' | 'isDesktopOpen' | 'setIsDesktopOpen'> & { isSidebarOpen: boolean, closeMobileSidebar?: () => void }> = ({ activeView, setActiveView, documents, activeFilter, setActiveFilter, isSidebarOpen, closeMobileSidebar }) => {
  const handleNavClick = (view: View, filter: DocumentFilter | null = null) => {
    setActiveView(view);
    if (filter !== undefined) setActiveFilter(filter);
    if (closeMobileSidebar) closeMobileSidebar();
  };

  const isAccountingActive = useMemo(() => BOOKKEEPING_NAV_ITEMS.some(item => item.view === activeView), [activeView]);

  return (
    <>
      <div className={`flex items-center mb-8 w-full ${isSidebarOpen ? 'px-3' : 'justify-center'}`}>
        <div className="bg-blue-600 text-white rounded-lg p-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        {isSidebarOpen && <h1 className="text-lg font-bold text-slate-800 ml-3">Steuer Agent</h1>}
      </div>
      <nav className="flex-1 space-y-1.5 overflow-y-auto w-full">
        <NavItem onClick={() => handleNavClick(View.DOCUMENTS, null)} isActive={!activeFilter && activeView === View.DOCUMENTS} isSidebarOpen={isSidebarOpen} label="Alle Belege" count={documents.length}>
          <FolderIcon className="w-5 h-5 text-slate-500" />
        </NavItem>
        <div>
          <NavItem
            onClick={() => handleNavClick(View.BUCHHALTUNG_BUCHUNGEN, null)}
            isActive={isAccountingActive}
            isSidebarOpen={isSidebarOpen}
            label="Buchhaltung"
          >
            <CalculatorIcon className="w-5 h-5 text-slate-500" />
          </NavItem>
          {isSidebarOpen && (
            <div className="mt-1 space-y-1 border-l border-slate-200 pl-4">
              {BOOKKEEPING_NAV_ITEMS.map(({ view, label, Icon }) => (
                <div key={view}>
                  <NavItem
                    onClick={() => handleNavClick(view, null)}
                    isActive={activeView === view}
                    isSidebarOpen={isSidebarOpen}
                    label={label}
                  >
                    <Icon className="h-4 w-4 text-slate-500" />
                  </NavItem>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4">
          <NavItem onClick={() => handleNavClick(View.ANALYSIS)} isActive={activeView === View.ANALYSIS} isSidebarOpen={isSidebarOpen} label="Auswertung"><ChartBarIcon className="h-5 w-5 text-slate-500" /></NavItem>
          <NavItem onClick={() => handleNavClick(View.FÖRDERUNGEN)} isActive={activeView === View.FÖRDERUNGEN} isSidebarOpen={isSidebarOpen} label="Förderungen"><SparklesIcon className="h-5 w-5 text-slate-500" /></NavItem>
          <NavItem onClick={() => handleNavClick(View.DEADLINES)} isActive={activeView === View.DEADLINES} isSidebarOpen={isSidebarOpen} label="Fristen"><CalendarIcon className="h-5 w-5 text-slate-500" /></NavItem>
          <NavItem onClick={() => handleNavClick(View.LEXOFFICE)} isActive={activeView === View.LEXOFFICE} isSidebarOpen={isSidebarOpen} label="LexOffice"><LexofficeIcon className="h-5 w-5 text-slate-500" /></NavItem>
          <NavItem onClick={() => handleNavClick(View.RULES)} isActive={activeView === View.RULES} isSidebarOpen={isSidebarOpen} label="Regeln"><RulesIcon className="h-5 w-5 text-slate-500" /></NavItem>
          <NavItem onClick={() => handleNavClick(View.SETTINGS)} isActive={activeView === View.SETTINGS} isSidebarOpen={isSidebarOpen} label="Einstellungen"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></NavItem>
        </div>
      </nav>
      {isSidebarOpen && <div className="mt-auto pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-500">Dies ist eine Demo-Anwendung. E-Mail- und WhatsApp-Integrationen sind simuliert und greifen nicht auf echte Konten zu.</p>
      </div>}
    </>
  );
};


const Sidebar: React.FC<SidebarProps> = (props) => {
  const { isDesktopOpen, setIsDesktopOpen, isMobileOpen, setIsMobileOpen } = props;

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden md:flex relative flex-col bg-white border-r border-slate-200 transition-all duration-300 ${isDesktopOpen ? 'w-64 p-4' : 'w-20 p-3 items-center'}`}>
        <button 
            onClick={() => setIsDesktopOpen(!isDesktopOpen)}
            className="absolute top-5 -right-3 z-10 p-1 bg-white border border-slate-300 rounded-full shadow-sm hover:bg-slate-100 transition-all"
            title={isDesktopOpen ? 'Seitenleiste einklappen' : 'Seitenleiste ausklappen'}
        >
            <ChevronLeftIcon className={`w-4 h-4 text-slate-600 transition-transform ${!isDesktopOpen && 'rotate-180'}`} />
        </button>
        <SidebarContent {...props} isSidebarOpen={isDesktopOpen} />
      </div>

      {/* Mobile Sidebar */}
      <div className={`md:hidden fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 p-4 flex flex-col transform transition-transform duration-300 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button onClick={() => setIsMobileOpen(false)} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-800">
            <XIcon className="w-6 h-6" />
        </button>
        <SidebarContent {...props} isSidebarOpen={true} closeMobileSidebar={() => setIsMobileOpen(false)} />
      </div>
    </>
  );
};

export default Sidebar;
