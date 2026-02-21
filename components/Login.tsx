
import React, { useState } from 'react';
import { Lock, User, AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';
import { UserProfile, UserAccount } from '../types';

interface Props {
  onLogin: (profile: UserProfile, name: string) => void;
  users: UserAccount[];
}

const Login: React.FC<Props> = ({ onLogin, users }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-[#041126] p-4 transition-colors font-inter">
      {/* Wrapper de animação combinada: surgir na entrada e flutuar infinitamente */}
      <div className="w-full max-w-md animate-surgir">
        <div className="bg-white dark:bg-[#1e1e1e] rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-flutuar">
          
          {/* Header do Card com a Logo Oficial */}
          <div className="bg-[#041126] p-10 text-center relative overflow-hidden flex flex-col items-center">
            <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
              <div className="absolute -top-10 -left-10 w-48 h-48 bg-white rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-blue-600 rounded-full blur-3xl"></div>
            </div>
            
            {/* Logo Centralizada */}
            <div className="relative z-10 mb-2">
              <img 
                src="logo.png" 
                alt="Só Aço + 25 Anos" 
                className="w-48 h-auto object-contain drop-shadow-2xl"
                onError={(e) => {
                  // Fallback caso a imagem não seja encontrada durante o desenvolvimento
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = `
                    <div class="flex flex-col items-center">
                      <div class="flex items-baseline gap-1 font-black italic select-none">
                        <span class="text-[#F4A900] text-4xl">SÓ</span>
                        <span class="text-white text-4xl tracking-tighter">AÇO + 25</span>
                      </div>
                      <div class="text-white/60 text-[8px] uppercase tracking-widest mt-2">Produzindo com excelência</div>
                    </div>
                  `;
                }}
              />
            </div>
            <p className="text-blue-200/50 text-[10px] relative z-10 font-bold uppercase tracking-[0.3em] mt-4">Projeção de Estoque</p>
          </div>

          {/* Formulário */}
          <div className="p-10">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral dark:text-gray-500 uppercase tracking-widest ml-1">Usuário de Acesso</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-secondary transition-colors" />
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-secondary dark:focus:ring-blue-500 transition-all text-gray-900 dark:text-gray-100 font-medium"
                    placeholder="admin"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral dark:text-gray-500 uppercase tracking-widest ml-1">Senha</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-secondary transition-colors" />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-12 outline-none focus:ring-2 focus:ring-secondary dark:focus:ring-blue-500 transition-all text-gray-900 dark:text-gray-100 font-medium"
                    placeholder="••••••••"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 p-4 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400 text-sm animate-in slide-in-from-top-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="font-bold leading-tight">{error}</p>
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className={`w-full bg-[#1E22AA] hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg hover:shadow-blue-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${loading ? 'opacity-70 cursor-wait' : ''}`}
              >
                {loading ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>ENTRAR NO SISTEMA</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-[10px] text-neutral dark:text-gray-500 uppercase font-black tracking-widest opacity-60">Só Aço Industrial — + 25 Anos de Excelência</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
