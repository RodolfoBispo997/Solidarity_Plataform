# ConectaSolidária

Plataforma acadêmica para ONGs divulgarem campanhas de arrecadação material e para doadores registrarem contribuições que a instituição pode confirmar ou cancelar.

## Problema e solução

Campanhas e necessidades de ONGs costumam ficar dispersas em canais diferentes, dificultando descobrir o que está ativo, acompanhar o progresso e saber se uma contribuição foi recebida. O ConectaSolidária centraliza campanhas, registro e confirmação de doações, histórico e indicadores calculados a partir do banco.

O sistema não processa pagamentos. Uma doação representa uma contribuição material registrada pelo doador e confirmada posteriormente pela ONG.

## Arquitetura

- **Backend:** Node.js 20+, TypeScript, Express 5, Prisma 6 e PostgreSQL 16.
- **Frontend:** React 19, TypeScript, Vite, React Router, Axios e Recharts.
- **Autenticação:** um único modelo `User`, com os papéis `DONOR` e `NGO`; senha armazenada com bcrypt e token JWT com validade de oito horas.
- **Banco local:** PostgreSQL via Docker Compose, exposto na porta **5433** do host e atendido na porta 5432 dentro do contêiner.

```text
React/Vite ── HTTP + JWT ── Express ── Prisma ── PostgreSQL
                                  ├── DONOR: campanhas, doações e dashboard pessoal
                                  └── NGO: campanhas, recebimentos e dashboard institucional
```

## Atores e funcionalidades

### Doador

- Cadastro e login como doador.
- Busca de campanhas por texto, categoria e cidade, com paginação.
- Registro de contribuição pendente e consulta do histórico.
- Dashboard com contribuições totais, confirmadas e pendentes, campanhas e ONGs apoiadas, evolução mensal e quantidades recebidas discriminadas por unidade.

### ONG

- Cadastro e login institucional.
- Criação, edição, listagem, cancelamento e acompanhamento de campanhas.
- Consulta de doações pendentes e confirmação ou cancelamento.
- Conclusão manual de campanhas ativas, além da conclusão automática ao atingir a meta.
- Dashboard com campanhas ativas, concluídas, concluídas pela meta ou manualmente, doações recebidas e pendentes, doadores únicos, progresso, arrecadação por categoria/unidade e evolução mensal.

## Regras de negócio

### Doações e campanhas

- O ciclo de uma doação é `PENDING → RECEIVED` ou `PENDING → CANCELED`. Uma doação processada não pode mudar novamente de estado.
- Somente a ONG proprietária pode processar doações da campanha. Donos de outras ONGs não podem consultar ou alterar recursos institucionais alheios.
- Doações pendentes e canceladas não entram na arrecadação. Somente `RECEIVED` atualiza a quantidade arrecadada.
- Confirmação e atualização da campanha acontecem na mesma transação PostgreSQL com isolamento `Serializable`, atualização condicional e repetição limitada de conflitos de serialização.
- Campanhas `DRAFT`, `CANCELED`, `COMPLETED`, ainda não iniciadas ou com prazo vencido não aceitam novas doações.
- A meta precisa ser positiva e a data final não pode anteceder a inicial. Uma campanha ativa pode ser concluída manualmente ou ser concluída automaticamente ao atingir a meta; o motivo fica registrado separadamente.
- **Pendências na conclusão automática:** doações já registradas e pendentes antes de a campanha atingir a meta permanecem disponíveis para confirmação ou cancelamento. São compromissos anteriores; se confirmadas, são contabilizadas uma vez e a campanha permanece concluída, ainda que a arrecadação ultrapasse a meta. Novas doações não são aceitas.
- **Pendências na conclusão manual:** doações pendentes são canceladas na mesma transação que conclui a campanha. Doações recebidas e sua arrecadação são preservadas. A meta e a quantidade recebida não são alteradas artificialmente.
- **Pendências no cancelamento:** cancelar uma campanha também cancela suas doações pendentes, preservando o histórico. Doações já recebidas permanecem contabilizadas. Campanha com histórico não é removida fisicamente.
- Edições só são permitidas em campanhas em rascunho ou ativas. Campanhas concluídas ou canceladas não podem ser alteradas. O progresso sempre representa a arrecadação recebida real; a conclusão manual abaixo da meta não equivale a meta atingida.

### Unidades e indicadores

Cestas, quilos, kits e peças são unidades distintas. O sistema não apresenta uma soma dessas quantidades como um total homogêneo: dashboards e gráficos agrupam arrecadação por **categoria e unidade**, e os indicadores de quantidade mostram o total separado por unidade. A evolução mensal mostra número de confirmações, sem somar unidades distintas.

## Endpoints

Todas as rotas privadas exigem `Authorization: Bearer <token>`.

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| `POST` | `/auth/register/donor` | Público | Cadastrar doador |
| `POST` | `/auth/register/ngo` | Público | Cadastrar ONG e responsável |
| `POST` | `/auth/login` | Público | Login; aceita `expectedRole` opcional |
| `GET` | `/auth/me` | Autenticado | Consultar perfil da sessão |
| `GET` | `/categories` | Público | Listar categorias |
| `GET` | `/campaigns` | Público | Buscar campanhas ativas e vigentes |
| `GET` | `/donor/dashboard` | `DONOR` | KPIs, evolução e contribuições recentes |
| `GET` | `/donor/donations` | `DONOR` | Histórico próprio |
| `POST` | `/donor/donations` | `DONOR` | Registrar contribuição pendente |
| `GET` | `/ngo/dashboard` | `NGO` | KPIs e progresso institucional |
| `GET` | `/ngo/campaigns` | `NGO` | Listar campanhas próprias |
| `POST` | `/ngo/campaigns` | `NGO` | Criar campanha |
| `PUT` | `/ngo/campaigns/:id` | `NGO` | Editar campanha própria |
| `POST` | `/ngo/campaigns/:id/complete` | `NGO` | Concluir campanha ativa e cancelar doações pendentes |
| `DELETE` | `/ngo/campaigns/:id` | `NGO` | Excluir campanha sem histórico ou cancelar preservando histórico |
| `GET` | `/ngo/donations` | `NGO` | Listar doações das campanhas próprias |
| `PATCH` | `/ngo/donations/:id/status` | `NGO` | Confirmar ou cancelar doação pendente |
| `GET` | `/health` | Público | Verificar disponibilidade da API |

### Filtros e paginação de campanhas

`GET /campaigns` aceita `search`, `category` (slug), `city`, `page` e `pageSize` (máximo 50; padrão 12). Exemplo:

```text
GET /campaigns?search=alimentos&category=alimentos&city=São%20Paulo&page=1&pageSize=12
```

A resposta contém `items` e `pagination` com `page`, `pageSize`, `total` e `pages`.

## Requisitos

- Node.js 20 ou superior e npm.
- Docker Desktop com Docker Compose.
- Git para obter o projeto.

## Instalação e execução

### 1. PostgreSQL local

Na raiz do projeto:

```bash
docker compose up -d
```

Configuração local do Compose:

```text
Host: localhost
Porta externa: 5433
Banco: solidarity
Usuário: solidarity
Senha local: solidarity
```

Essas credenciais são apenas para o ambiente de desenvolvimento local. Não as reutilize em produção.

### 2. Backend

```bash
cd backend
npm install
```

Copie `.env.example` para `.env` (PowerShell: `Copy-Item .env.example .env`). Configure `DATABASE_URL`, `JWT_SECRET`, `PORT` e `FRONTEND_URL`. O exemplo já aponta para o PostgreSQL local na porta 5433; substitua o segredo JWT por um valor aleatório local.

```bash
npx prisma generate
npx prisma migrate dev
npm run dev
```

A API fica disponível em `http://localhost:3333`.

### 3. Frontend

Em outro terminal:

```bash
cd frontend
npm install
```

Copie `.env.example` para `.env` e ajuste `VITE_API_URL` se a API não estiver em `http://localhost:3333`.

```bash
npm run dev
```

A aplicação fica disponível em `http://localhost:5173`.

### Migrations

As migrations versionadas ficam em `backend/prisma/migrations`. Em ambiente de desenvolvimento, `npx prisma migrate dev` aplica as migrations pendentes. Para inicialização de outro ambiente já preparado, use `npx prisma migrate deploy`; não apague nem recrie o banco para atualizar o schema.

### Seed e contas de demonstração

O seed cria categorias, duas ONGs, doadores, campanhas e doações de demonstração. Contas definidas no seed:

| Perfil | E-mail | Senha local de demonstração |
| --- | --- | --- |
| ONG | `ong@demo.com` | `123456` |
| Doador | `doador@demo.com` | `123456` |

**Atenção:** o seed atual apaga registros existentes das tabelas de doações, campanhas, organizações, usuários e categorias antes de criar os dados de demonstração. Não o execute em um banco com dados que devam ser preservados. Use somente uma base local descartável e faça backup antes de executá-lo.

Para executar conscientemente em um banco local descartável:

```bash
cd backend
npm run seed
```

## Testes e verificações

Os testes de integração usam o runner nativo `node:test`, `tsx` já instalado e o PostgreSQL configurado em `backend/.env`. Criam registros com identificadores exclusivos e removem somente os registros criados pelo próprio teste; não executam migrations nem seed.

```bash
cd backend
npm test
npm run build
npx prisma validate
```

Build do frontend:

```bash
cd frontend
npm run build
```

Execute os testes em um banco local já migrado. A suíte cobre autorização por perfil, isolamento entre ONGs, doações pendentes e canceladas, confirmação única e concorrente, conclusão por meta, campanhas canceladas/vencidas e atualização dos dashboards.

## Fluxo principal para demonstração

1. Entre como ONG e crie uma campanha ativa.
2. Entre como doador e encontre a campanha usando busca, categoria ou cidade.
3. Registre uma contribuição; ela aparecerá como pendente e não alterará a arrecadação.
4. Entre como ONG e confirme a doação.
5. Confira o progresso da campanha e os indicadores dos dois dashboards.

## Fora do escopo

Pagamentos, PIX/cartão, OAuth, refresh token, recuperação de senha, logística, mapas, notificações e filas não fazem parte desta versão.
