
import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { UserProfile, UserAccount } from '../types';
import { initLoginParticles } from './login-premium/script';
import './login-premium/style.css';

interface Props {
  onLogin: (profile: UserProfile, name: string) => void;
  users: UserAccount[];
  companyLogo?: string | null;
}

const Login: React.FC<Props> = ({ onLogin, users }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cleanup = initLoginParticles(canvasRef.current as unknown as HTMLCanvasElement);
    return () => cleanup();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Pequeno delay para simular rede e dar feedback visual
    setTimeout(() => {
      let userLower = username.toLowerCase().trim();
      
      // Permitir 'administrador' como alias para 'admin' apenas no caso da conta mestre
      if (userLower === 'administrador') userLower = 'admin';

      // Busca na lista dinâmica de usuários (incluindo o mestre admin)
      const foundUser = users.find(u => u.username === userLower && u.password === password);

      if (foundUser) {
        onLogin(foundUser.profile, foundUser.name);
      } else {
        setError('Usuário ou senha incorretos. Verifique suas credenciais.');
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div className="login-page">
      <canvas ref={canvasRef} className="login-particles-canvas" />

      <main className="login-card">
        <h1 className="login-title">Login</h1>
        <p className="login-project-title">Projeção de estoque 2.0</p>

        <form onSubmit={handleLogin}>
          <div className="login-field">
            <label className="login-label">Usuário</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="login-input"
              required
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label">Senha</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input login-input-password"
              required
            />
            <button type="button" className="login-password-toggle" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? 'Conectando...' : 'Conectar'}
          </button>
        </form>

        <p className="login-footer">SÓ AÇO INDUSTRIAL - Produzindo com excelência</p>
      </main>
    </div>
  );
};

export default Login;
