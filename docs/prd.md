Documento de Requisitos e Arquitetura 
Versão: 1.0 (Foco em Persistência de Dados)
Visão Geral (Overview)
O projeto "Projeção de estoque" é uma aplicação web para gestão de projeção de estoque, sequência de entrega e romaneios. Atualmente, os dados são armazenados no localStorage do navegador, o que impede o compartilhamento entre usuários e máquinas. Este documento descreve a arquitetura para centralizar a persistência de dados.
Metas do Projeto
Sincronização de Dados: Garantir que os dados sejam compartilhados e consistentes entre todas as instâncias do aplicativo.
Segurança: Proteger as credenciais de acesso ao banco de dados MySQL.
Flexibilidade: Manter a capacidade de importar dados manualmente para a MiniFicha, que não possui uma fonte de dados MySQL direta no momento.
Stack Tecnológica (Atualizada para Persistência)
Frontend: React, Vite, TypeScript.
UI Library: Tailwind CSS, Lucide React (Ícones).
Gerenciamento de Estado (Recomendado): TanStack Query (React Query) para otimizar a busca e atualização de dados do servidor.
Backend (para MySQL): Node.js/Express (para atuar como API Gateway para o MySQL).
Banco de Dados Principal: MySQL (para orders e stock).
Banco de Dados Secundário (BaaS): Supabase (PostgreSQL) (para shelf_ficha / MiniFicha).
Autenticação: Atualmente local (localStorage), mas pode ser migrada para Supabase Auth no futuro, se necessário.
Storage: Não aplicável no momento, mas Supabase Storage pode ser considerado para arquivos no futuro.
Estrutura de Dados e Persistência
Dados de Pedidos (orders) e Estoque (stock):
Serão buscados e persistidos no MySQL através de um backend Node.js/Express.
O backend terá endpoints (ex: /api/orders, /api/stock) que consultam o MySQL e retornam os dados para o frontend.
As funções de importação (handleImportOrders, handleImportStock) no frontend serão modificadas para enviar os dados para o backend, que então os salvará no MySQL.
Dados da MiniFicha (shelf_ficha):
Serão buscados e persistidos no Supabase (PostgreSQL).
Uma tabela shelf_ficha será criada no Supabase.
O frontend se conectará diretamente ao Supabase para shelf_ficha (usando VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).
A função handleImportShelfFicha será adaptada para enviar os dados processados do Excel para a tabela shelf_ficha no Supabase (usando upsert).
Outros Dados (users, routes):
Continuarão a ser gerenciados via localStorage por enquanto.
Modelo de Dados (Schema Adaptado para Supabase - shelf_ficha)
Diretrizes:
Chaves Primárias (PK): UUID com DEFAULT uuid_generate_v4().
Nomenclatura: Preferencialmente em Português (Brasil), minúsculo e snake_case.
Tabela: shelf_ficha
Armazena os dados da MiniFicha.
Coluna | Tipo | Descrição
id | UUID (PK) | Identificador único.
codigo_estante | TEXT | Código da estante.
desc_estante | TEXT | Descrição da estante.
cod_coluna | TEXT | Código da coluna.
desc_coluna | TEXT | Descrição da coluna.
qtd_coluna | INTEGER | Quantidade da coluna.
cod_bandeja | TEXT | Código da bandeja.
desc_bandeja | TEXT | Descrição da bandeja.
qtd_bandeja | INTEGER | Quantidade da bandeja.
created_at | TIMESTAMPTZ | Data de criação.
Instruções para o Desenvolvedor (Cursor AI)
Backend para MySQL: Implementar um servidor Node.js/Express para gerenciar a conexão e as queries ao MySQL para orders e stock. As credenciais do MySQL (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) devem ser carregadas de variáveis de ambiente no backend e NUNCA expostas ao frontend.
Frontend para Supabase: Integrar o cliente Supabase no frontend para gerenciar a tabela shelf_ficha. As credenciais do Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) devem ser carregadas de variáveis de ambiente no frontend (com prefixo VITE_).
handleImportShelfFicha: Adaptar a função para enviar os dados para o Supabase usando upsert. Certificar-se de que cada item ShelfFicha tenha um id UUID único antes de enviar.
Assincronicidade e Erros: Garantir que todas as operações de dados (frontend e backend) sejam assíncronas e incluam tratamento de erros robusto, além de estados de carregamento na UI.
React Query (Recomendado): Considerar a implementação de TanStack Query (React Query) para gerenciar o estado do servidor de forma eficiente, melhorando a experiência do usuário com caching e otimizações.
Diretrizes de Segurança (RLS) - Só Aço Industrial (Adaptação para Supabase)
Versão: 1.0 (Foco em shelf_ficha)
Visão Geral (Overview)
Este documento descreve as diretrizes de segurança para a tabela shelf_ficha no Supabase, utilizando Row Level Security (RLS) para controlar o acesso aos dados.
Objetivo:
Garantir que o aplicativo possa ler, criar, atualizar e excluir dados na tabela shelf_ficha de forma controlada, sem expor o banco de dados a acessos não autorizados.