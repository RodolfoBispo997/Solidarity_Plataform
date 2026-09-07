# ConectaSolidária

Plataforma web acadêmica que conecta **ONGs com campanhas de arrecadação** a **pessoas interessadas em ajudar**.

A aplicação foi desenhada para demonstrar um sistema completo com **front-end, back-end, PostgreSQL, autenticação por perfil, CRUD, regras de negócio, tabelas, métricas, KPIs e dashboards** sem ampliar o escopo com funcionalidades que não são essenciais para a entrega.

## Problema

Muitas ONGs divulgam necessidades por redes sociais, aplicativos de mensagem e canais isolados. Isso dificulta para o potencial doador descobrir:

- quais campanhas estão ativas;
- o que a ONG realmente precisa;
- quanto já foi arrecadado;
- quanto ainda falta para a meta;
- se a contribuição informada foi efetivamente recebida.

Do lado da ONG, o acompanhamento também tende a ficar disperso, dificultando a visualização de campanhas, doações pendentes e indicadores de impacto.

## Como a aplicação resolve essa dor

O ConectaSolidária centraliza o fluxo:

```text
ONG cria campanha
       ↓
Doador encontra a campanha
       ↓
Doador registra intenção de doação
       ↓
Doação fica PENDING
       ↓
ONG confirma recebimento
       ↓
Doação vira RECEIVED
       ↓
Meta e dashboard são atualizados
```

O projeto possui dois perfis com interfaces e permissões diferentes.

### ONG

- login exclusivo por perfil;
- dashboard institucional;
- criação e listagem de campanhas;
- definição de categoria, meta e unidade;
- visualização das doações recebidas;
- confirmação ou cancelamento de doações;
- acompanhamento automático do progresso;
- KPIs de campanhas, doações, doadores e itens arrecadados;
- gráfico de arrecadação por categoria.

### Doador

- login exclusivo por perfil;
- dashboard pessoal;
- busca de campanhas;
- visualização do progresso das metas;
- registro de intenção de doação;
- histórico de contribuições;
- KPIs de campanhas apoiadas, ONGs ajudadas e itens doados;
- gráfico de contribuições por categoria.

## Escopo intencional da V1

Esta versão **não processa dinheiro**. Uma doação representa uma intenção de contribuição material, posteriormente confirmada pela ONG.

Também ficaram fora da V1:

- PIX/cartão;
- chat;
- mapa/geolocalização;
- eventos;
- voluntariado;
- notificações;
- gestão de beneficiários;
- estoque.

Esses recursos podem virar evoluções futuras sem comprometer a entrega principal.

## Stack

### Back-end

- Node.js
- TypeScript
- Express
- Prisma ORM
- PostgreSQL
- JWT
- bcryptjs
- Zod

### Front-end

- React
- TypeScript
- Vite
- Axios
- Recharts
- Lucide React
- CSS responsivo

### Banco local

- PostgreSQL 16 via Docker Compose

## Banco de dados

Entidades principais:

```text
User
 ├── DONOR
 └── NGO
       │
       └── Organization
              │
              └── Campaign
                     │
                     └── Donation ← DONOR

Category ─────────── Campaign
```

Principais status:

```text
CampaignStatus
DRAFT | ACTIVE | COMPLETED | CANCELED

DonationStatus
PENDING | RECEIVED | CANCELED
```

Somente doações `RECEIVED` contam para a quantidade arrecadada.

Quando `receivedQuantity >= goalQuantity`, a campanha é marcada automaticamente como `COMPLETED`.

## Estrutura

```text
solidarity-platform/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── controllers/
│       ├── lib/
│       ├── middlewares/
│       ├── schemas/
│       ├── services/
│       ├── types/
│       ├── app.ts
│       └── server.ts
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       └── styles.css
├── docker-compose.yml
└── README.md
```

# Como executar

## Pré-requisitos

- Node.js 20+
- npm
- Docker Desktop

## 1. Subir o PostgreSQL

Na raiz:

```bash
docker compose up -d
```

Banco padrão:

```text
Host: localhost
Porta: 5432
Banco: solidarity
Usuário: solidarity
Senha: solidarity
```

## 2. Configurar o back-end

```bash
cd backend
npm install
```

Copie `.env.example` para `.env`.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Depois:

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
```

API:

```text
http://localhost:3333
```

Teste:

```text
GET http://localhost:3333/health
```

## 3. Configurar o front-end

Em outro terminal:

```bash
cd frontend
npm install
```

Copie `.env.example` para `.env` e execute:

```bash
npm run dev
```

Acesse:

```text
http://localhost:5173
```

# Contas de demonstração

O seed já cria dados para que os dashboards não apareçam vazios.

### ONG

```text
E-mail: ong@demo.com
Senha: 123456
```

### Doador

```text
E-mail: doador@demo.com
Senha: 123456
```

## Endpoints principais

### Auth

```text
POST /auth/register/donor
POST /auth/register/ngo
POST /auth/login
GET  /auth/me
```

### Público

```text
GET /categories
GET /campaigns
```

### ONG

```text
GET    /ngo/dashboard
GET    /ngo/campaigns
POST   /ngo/campaigns
PUT    /ngo/campaigns/:id
DELETE /ngo/campaigns/:id
GET    /ngo/donations
PATCH  /ngo/donations/:id/status
```

### Doador

```text
GET  /donor/dashboard
GET  /donor/donations
POST /donor/donations
```

# Roteiro sugerido para apresentação

1. Entrar como ONG.
2. Mostrar KPIs e gráfico do dashboard.
3. Abrir campanhas e criar uma nova.
4. Sair.
5. Entrar como doador.
6. Buscar a campanha criada.
7. Clicar em `Quero ajudar` e informar uma quantidade.
8. Mostrar a doação como pendente.
9. Entrar novamente como ONG.
10. Abrir a tabela de doações.
11. Confirmar o recebimento.
12. Voltar ao dashboard e mostrar os indicadores atualizados.
13. Entrar como doador e mostrar a contribuição como recebida.

Esse fluxo demonstra em poucos minutos:

- autenticação;
- autorização;
- banco de dados;
- CRUD;
- integração front/back;
- regra de negócio;
- atualização de estado;
- tabela;
- métricas;
- KPI;
- gráfico.

## Evoluções futuras

Depois da V1 estar estável, as melhores evoluções são:

1. mapa de ONGs/campanhas;
2. upload de imagem;
3. voluntariado;
4. paginação avançada;
5. relatórios exportáveis;
6. notificações;
7. painel administrativo.

---

**Objetivo da arquitetura:** manter o projeto suficientemente completo para demonstrar uma aplicação real, mas pequeno o bastante para o grupo entender, apresentar e manter sem depender de IA para cada alteração.
