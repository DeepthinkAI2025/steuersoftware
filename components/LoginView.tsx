import React, { useState } from 'react';

interface LoginViewProps {
  onLogin: () => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
      setError('');
      onLogin();
    } else {
      setError('Ungültiger Benutzername oder Passwort.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-full max-w-sm p-8 space-y-6">
        <div className="flex flex-col items-center">
          <div className="bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-xl p-3 mb-4 shadow ring-1 ring-inset ring-white/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Willkommen beim Steuer Agent</h1>
          <p className="text-slate-500 text-sm">Bitte melden Sie sich an, um fortzufahren.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 card animate-[fadeIn_.4s_ease]">
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="form-label">Benutzername</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="input"
                placeholder="admin"
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="password" className="form-label">Passwort</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input"
                placeholder="••••••"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
            <div className="text-center text-xs text-slate-500">
              Login
            </div>
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
          >
            Anmelden
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginView;