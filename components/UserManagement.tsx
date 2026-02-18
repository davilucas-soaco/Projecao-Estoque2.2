
import React, { useState } from 'react';
import { UserAccount, UserProfile } from '../types';
import { 
  UserPlus, 
  Trash2, 
  Shield, 
  User, 
  Key, 
  Users, 
  Download, 
  Upload, 
  Database, 
  Eye, 
  EyeOff, 
  Edit2, 
  Save, 
  X 
} from 'lucide-react';

interface Props {
  users: UserAccount[];
  onAddUser: (user: UserAccount) => void;
  onDeleteUser: (id: string) => void;
  onUpdateUser: (user: UserAccount) => void;
  onExport: () => void;
  onImport: (json: any) => void;
}

const UserManagement: React.FC<Props> = ({ users, onAddUser, onDeleteUser, onUpdateUser, onExport, onImport }) => {
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newProfile, setNewProfile] = useState<UserProfile>('CONSULTA');

  // Estados para gerenciar visualização e edição de senhas na tabela
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editPasswordValue, setEditPasswordValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !newName) return;

    const newUser: UserAccount = {
      id: crypto.randomUUID(),
      username: newUsername.toLowerCase().trim(),
      name: newName,
      password: newPassword,
      profile: newProfile
    };

    onAddUser(newUser);
    setNewUsername('');
    setNewName('');
    setNewPassword('');
    setNewProfile('CONSULTA');
  };

  const handleTogglePassword = (userId: string) => {
    setVisiblePasswords(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleStartEdit = (user: UserAccount) => {
    setEditingUserId(user.id);
    setEditPasswordValue(user.password);
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditPasswordValue('');
  };

  const handleSavePassword = (user: UserAccount) => {
    if (!editPasswordValue.trim()) return;
    onUpdateUser({ ...user, password: editPasswordValue });
    setEditingUserId(null);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        onImport(json);
      } catch (err) {
        alert('Erro ao processar o arquivo de backup. Certifique-se de que é um JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* Seção de Backup e Restauração */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-800 flex flex-col justify-between">
          <div>
            <h3 className="text-blue-900 dark:text-blue-300 font-bold flex items-center gap-2 mb-2">
              <Download className="w-4 h-4" /> Exportar Dados
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed mb-4">
              Crie uma cópia de segurança de todos os usuários, pedidos e estoque. Recomendado antes de migrar o sistema para outro ambiente.
            </p>
          </div>
          <button 
            onClick={onExport}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg shadow-sm transition-all"
          >
            BAIXAR BACKUP (.JSON)
          </button>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-2xl border border-amber-100 dark:border-amber-800 flex flex-col justify-between">
          <div>
            <h3 className="text-amber-900 dark:text-amber-300 font-bold flex items-center gap-2 mb-2">
              <Upload className="w-4 h-4" /> Restaurar Backup
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed mb-4">
              Restaurar usuários e dados de um arquivo exportado anteriormente. Isso substituirá as informações atuais.
            </p>
          </div>
          <div className="relative">
            <input 
              type="file" 
              accept=".json"
              onChange={handleFileImport}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <button className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 rounded-lg shadow-sm transition-all">
              IMPORTAR BACKUP (.JSON)
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#252525] p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-gray-900 dark:text-gray-100">
          <UserPlus className="text-secondary" />
          Criar Novo Usuário
        </h2>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral uppercase tracking-wider">Nome Completo</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-secondary text-sm"
                placeholder="Ex: João Silva"
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral uppercase tracking-wider">Usuário (Login)</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                className="w-full bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-secondary text-sm"
                placeholder="Ex: joao.p"
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral uppercase tracking-wider">Senha Inicial</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="password" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-secondary text-sm"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral uppercase tracking-wider">Perfil de Acesso</label>
            <select 
              value={newProfile}
              onChange={e => setNewProfile(e.target.value as UserProfile)}
              className="w-full bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl py-2 px-4 outline-none focus:ring-2 focus:ring-secondary text-sm font-bold"
            >
              <option value="CONSULTA">CONSULTA (Apenas Leitura)</option>
              <option value="PCP">PCP (Edição + Sequência)</option>
              <option value="ADMIN">ADMINISTRADOR (Acesso Total)</option>
            </select>
          </div>
          <div className="md:col-span-2 pt-2">
            <button 
              type="submit"
              className="w-full bg-secondary hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-[0.99]"
            >
              CADASTRAR USUÁRIO
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-[#252525] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Users className="text-secondary w-5 h-5" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Usuários Cadastrados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-[#1a1a1a] text-[10px] font-black uppercase text-neutral tracking-widest">
              <tr>
                <th className="px-6 py-4">Nome</th>
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Senha</th>
                <th className="px-6 py-4">Perfil</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map(user => {
                const isEditing = editingUserId === user.id;
                const isVisible = visiblePasswords[user.id];

                return (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-gray-100">{user.name}</td>
                    <td className="px-6 py-4 font-mono text-xs">{user.username}</td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input 
                            type="text"
                            value={editPasswordValue}
                            onChange={(e) => setEditPasswordValue(e.target.value)}
                            className="bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-secondary w-32"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/pass">
                          <span className="font-mono text-xs">
                            {isVisible ? user.password : '••••••••'}
                          </span>
                          <button 
                            onClick={() => handleTogglePassword(user.id)}
                            className="opacity-0 group-hover:opacity-100 group-hover/pass:text-secondary transition-all"
                            title={isVisible ? "Ocultar Senha" : "Ver Senha"}
                          >
                            {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        user.profile === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                        user.profile === 'PCP' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {user.profile}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button 
                              onClick={() => handleSavePassword(user)}
                              className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                              title="Salvar Senha"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={handleCancelEdit}
                              className="p-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/20 rounded-lg transition-colors"
                              title="Cancelar Edição"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleStartEdit(user)}
                              className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              title="Alterar Senha"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {user.username !== 'admin' ? (
                              <button 
                                onClick={() => onDeleteUser(user.id)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Excluir Usuário"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-neutral italic pr-2">Sistema</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-neutral italic">
                    Nenhum usuário adicional cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
