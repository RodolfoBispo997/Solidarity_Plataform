import axios from "axios";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Gift,
  HeartHandshake,
  LogOut,
  Megaphone,
  Search,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3333",
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type Role = "DONOR" | "NGO";
type User = { id: string; name: string; email: string; role: Role };
type Category = { id: string; name: string; slug: string };
type Campaign = {
  id: string;
  title: string;
  description: string;
  goalQuantity: number;
  receivedQuantity: number;
  unit: string;
  startDate: string;
  endDate: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELED";
  completionReason: "GOAL_REACHED" | "MANUAL" | null;
  category: Category;
  organization: { id: string; name: string; city: string; state: string };
};
type Donation = {
  id: string;
  quantity: number;
  status: "PENDING" | "RECEIVED" | "CANCELED";
  createdAt: string;
  receivedAt: string | null;
  campaign: Campaign;
  donor?: { name: string; email: string };
};
type QuantityByUnit = { unit: string; total: number };
type Dashboard = {
  kpis: Record<string, number>;
  receivedByUnit: QuantityByUnit[];
  donationsByCategory: Array<{ category: string; unit: string; total: number }>;
  monthlyEvolution: Array<{ month: string; receivedDonations: number }>;
  topCampaigns?: Array<{
    id: string;
    title: string;
    goalQuantity: number;
    receivedQuantity: number;
    unit: string;
    progress: number;
    completionReason: Campaign["completionReason"];
  }>;
  recentDonations?: Donation[];
};
type CampaignForm = {
  title: string;
  description: string;
  categoryId: string;
  goalQuantity: string;
  unit: string;
  startDate: string;
  endDate: string;
  status?: "DRAFT" | "ACTIVE";
};

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error))
    return (
      error.response?.data?.message || "Não foi possível concluir a operação."
    );
  return "Ocorreu um erro inesperado.";
}

function destination(user: User) {
  return `/${user.role.toLowerCase()}/dashboard`;
}

function Loading({ message = "Carregando..." }: { message?: string }) {
  return <div className="state">{message}</div>;
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div className="error" role="alert">
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QuantityKpis({ values }: { values: QuantityByUnit[] }) {
  if (!values.length) return null;
  return (
    <>
      {values.map(({ unit, total }) => (
        <Kpi key={unit} label={`Recebido (${unit})`} value={total} />
      ))}
    </>
  );
}

function Progress({
  received,
  goal,
  unit,
}: {
  received: number;
  goal: number;
  unit?: string;
}) {
  const percentage = Math.min(
    100,
    Math.round((received / Math.max(1, goal)) * 100),
  );
  return (
    <div>
      <div className="proglabel">
        <span>
          {received} / {goal}
          {unit ? ` ${unit}` : ""}
        </span>
        <b>{percentage}%</b>
      </div>
      <div className="track">
        <i style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebida",
  CANCELED: "Cancelada",
  ACTIVE: "Ativa",
  COMPLETED: "Concluída",
  DRAFT: "Rascunho",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

function Login({
  onAuthenticated,
}: {
  onAuthenticated: (user: User, token: string) => void;
}) {
  const demoCredentials: Record<Role, { email: string; password: string }> = {
    DONOR: { email: "doador@demo.com", password: "123456" },
    NGO: { email: "ong@demo.com", password: "123456" },
  };
  const credentialsFor = (selectedRole: Role) =>
    import.meta.env.DEV
      ? demoCredentials[selectedRole]
      : { email: "", password: "" };
  const [role, setRole] = useState<Role>("DONOR");
  const [email, setEmail] = useState(() => credentialsFor("DONOR").email);
  const [password, setPassword] = useState(() => credentialsFor("DONOR").password);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  function selectRole(selectedRole: Role) {
    setRole(selectedRole);
    const credentials = credentialsFor(selectedRole);
    setEmail(credentials.email);
    setPassword(credentials.password);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", {
        email,
        password,
        expectedRole: role,
      });
      onAuthenticated(data.user, data.token);
      navigate(destination(data.user), { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="hero">
        <HeartHandshake size={34} />
        <div>
          <span>TECNOLOGIA + IMPACTO SOCIAL</span>
          <h1>Transforme necessidades em conexões que geram impacto.</h1>
          <p>
            Campanhas, doações, indicadores e transparência em uma única
            plataforma.
          </p>
        </div>
      </section>
      <section className="login">
        <div className="card">
          <span>ACESSO À PLATAFORMA</span>
          <h2>Bem-vindo</h2>
          <div className="tabs">
            <button
              type="button"
              className={role === "DONOR" ? "active" : ""}
              onClick={() => selectRole("DONOR")}
            >
              Sou doador
            </button>
            <button
              type="button"
              className={role === "NGO" ? "active" : ""}
              onClick={() => selectRole("NGO")}
            >
              Sou uma ONG
            </button>
          </div>
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <button className="primary" disabled={busy}>
              {busy ? "Entrando..." : "Entrar"}
            </button>
          </form>
          <div className="register-links">
            <Link to="/register/donor">Cadastrar como doador</Link>
            <Link to="/register/ngo">Cadastrar minha ONG</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Register({
  role,
  onAuthenticated,
}: {
  role: Role;
  onAuthenticated: (user: User, token: string) => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const isNgo = role === "NGO";
  const update = (key: string, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (fields.password !== fields.passwordConfirmation) {
      setError("As senhas não conferem.");
      return;
    }
    setBusy(true);
    const body = isNgo
      ? {
          responsibleName: fields.name,
          email: fields.email,
          password: fields.password,
          organizationName: fields.organizationName,
          cnpj: fields.cnpj || null,
          description: fields.description,
          phone: fields.phone || null,
          city: fields.city,
          state: fields.state?.toUpperCase(),
        }
      : { name: fields.name, email: fields.email, password: fields.password };
    try {
      const { data } = await api.post(
        isNgo ? "/auth/register/ngo" : "/auth/register/donor",
        body,
      );
      onAuthenticated(data.user, data.token);
      navigate(destination(data.user), { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="hero">
        <HeartHandshake size={34} />
        <div>
          <span>FAÇA PARTE</span>
          <h1>
            {isNgo
              ? "Conecte sua ONG a quem quer ajudar."
              : "Sua ajuda pode transformar uma comunidade."}
          </h1>
          <p>
            Crie sua conta e acompanhe campanhas e contribuições na plataforma.
          </p>
        </div>
      </section>
      <section className="login">
        <div className="card register-card">
          <span>NOVA CONTA</span>
          <h2>{isNgo ? "Cadastrar minha ONG" : "Cadastro de doador"}</h2>
          <form onSubmit={submit}>
            <label>
              {isNgo ? "Nome do responsável" : "Nome completo"}
              <input
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                value={fields.name ?? ""}
                onChange={(event) => update("name", event.target.value)}
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                autoComplete="email"
                required
                value={fields.email ?? ""}
                onChange={(event) => update("email", event.target.value)}
              />
            </label>
            {isNgo && (
              <>
                <label>
                  Nome da ONG
                  <input
                    required
                    minLength={2}
                    maxLength={150}
                    value={fields.organizationName ?? ""}
                    onChange={(event) =>
                      update("organizationName", event.target.value)
                    }
                  />
                </label>
                <label>
                  CNPJ (opcional)
                  <input
                    value={fields.cnpj ?? ""}
                    onChange={(event) => update("cnpj", event.target.value)}
                  />
                </label>
                <label>
                  Descrição
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    value={fields.description ?? ""}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                  />
                </label>
                <label>
                  Telefone (opcional)
                  <input
                    type="tel"
                    value={fields.phone ?? ""}
                    onChange={(event) => update("phone", event.target.value)}
                  />
                </label>
                <div className="formrow">
                  <label>
                    Cidade
                    <input
                      required
                      minLength={2}
                      value={fields.city ?? ""}
                      onChange={(event) => update("city", event.target.value)}
                    />
                  </label>
                  <label>
                    Estado (UF)
                    <input
                      required
                      minLength={2}
                      maxLength={2}
                      value={fields.state ?? ""}
                      onChange={(event) =>
                        update("state", event.target.value.toUpperCase())
                      }
                    />
                  </label>
                </div>
              </>
            )}
            <label>
              Senha
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={100}
                value={fields.password ?? ""}
                onChange={(event) => update("password", event.target.value)}
              />
            </label>
            <label>
              Confirmar senha
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={fields.passwordConfirmation ?? ""}
                onChange={(event) =>
                  update("passwordConfirmation", event.target.value)
                }
              />
            </label>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <button className="primary" disabled={busy}>
              {busy ? "Criando conta..." : "Criar conta"}
            </button>
          </form>
          <p className="auth-return">
            Já tem conta? <Link to="/login">Voltar ao login</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function Protected({
  user,
  role,
  children,
}: {
  user: User | null;
  role: Role;
  children: ReactNode;
}) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={destination(user)} replace />;
  return children;
}

function Layout({
  user,
  onLogout,
  children,
}: {
  user: User;
  onLogout: () => void;
  children: ReactNode;
}) {
  const base = `/${user.role.toLowerCase()}`;
  return (
    <div className="shell">
      <aside>
        <Link className="brand" to={`${base}/dashboard`}>
          <HeartHandshake />
          <strong>ConectaSolidária</strong>
        </Link>
        <nav>
          <NavLink to={`${base}/dashboard`}>
            <BarChart3 />
            Dashboard
          </NavLink>
          <NavLink to={`${base}/campaigns`}>
            {user.role === "NGO" ? <Megaphone /> : <Search />}
            Campanhas
          </NavLink>
          <NavLink to={`${base}/donations`}>
            <Gift />
            {user.role === "NGO" ? "Doações" : "Minhas doações"}
          </NavLink>
        </nav>
        <button className="logout" onClick={onLogout}>
          <LogOut />
          Sair
        </button>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function ChartPanel({
  title,
  data,
  category = false,
}: {
  title: string;
  data: Dashboard["donationsByCategory"] | Dashboard["monthlyEvolution"];
  category?: boolean;
}) {
  if (!data.length)
    return (
      <section className="panel">
        <h2>{title}</h2>
        <Empty>Sem dados confirmados para este período.</Empty>
      </section>
    );
  const chartData = category
    ? (data as Dashboard["donationsByCategory"]).map((item) => ({
        label: `${item.category} (${item.unit})`,
        total: item.total,
      }))
    : (data as Dashboard["monthlyEvolution"]).map((item) => ({
        label: item.month,
        total: item.receivedDonations,
      }));
  return (
    <section className="panel">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={280}>
        {category ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar
              dataKey="total"
              name="Quantidade"
              fill="#1e8f64"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        ) : (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line
              dataKey="total"
              name="Doações recebidas"
              stroke="#1e8f64"
              strokeWidth={3}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </section>
  );
}

function NgoDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get("/ngo/dashboard")
      .then((response) => setData(response.data))
      .catch((requestError) => setError(errorMessage(requestError)));
  }, []);
  if (error)
    return (
      <div className="page">
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  if (!data) return <Loading />;
  return (
    <div className="page">
      <header>
        <span>PAINEL DA ONG</span>
        <h1>Visão de impacto</h1>
        <p>Indicadores calculados a partir das doações confirmadas.</p>
      </header>
      <div className="kpis">
        <Kpi label="Campanhas ativas" value={data.kpis.activeCampaigns} />
        <Kpi
          label="Campanhas concluídas"
          value={data.kpis.completedCampaigns}
        />
        <Kpi
          label="Meta atingida"
          value={data.kpis.campaignsCompletedByGoal}
        />
        <Kpi
          label="Concluídas manualmente"
          value={data.kpis.campaignsCompletedManually}
        />
        <Kpi label="Doações recebidas" value={data.kpis.receivedDonations} />
        <Kpi label="Doações pendentes" value={data.kpis.pendingDonations} />
        <Kpi label="Doadores únicos" value={data.kpis.uniqueDonors} />
        <QuantityKpis values={data.receivedByUnit} />
      </div>
      <div className="grid">
        <ChartPanel
          title="Arrecadação por categoria e unidade"
          data={data.donationsByCategory}
          category
        />
        <section className="panel">
          <h2>Progresso das campanhas</h2>
          {data.topCampaigns?.length ? (
            data.topCampaigns.map((campaign) => (
              <div className="rank" key={campaign.id}>
                <b>{campaign.title}</b>
                {campaign.completionReason && (
                  <small className="completion-reason">
                    {campaign.completionReason === "MANUAL"
                      ? "Concluída manualmente"
                      : "Meta atingida"}
                  </small>
                )}
                <Progress
                  received={campaign.receivedQuantity}
                  goal={campaign.goalQuantity}
                  unit={campaign.unit}
                />
              </div>
            ))
          ) : (
            <Empty>Nenhuma campanha cadastrada.</Empty>
          )}
        </section>
      </div>
      <div className="dashboard-chart">
        <ChartPanel
          title="Evolução mensal das doações recebidas"
          data={data.monthlyEvolution}
        />
      </div>
    </div>
  );
}

function DonorDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get("/donor/dashboard")
      .then((response) => setData(response.data))
      .catch((requestError) => setError(errorMessage(requestError)));
  }, []);
  if (error)
    return (
      <div className="page">
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  if (!data) return <Loading />;
  return (
    <div className="page">
      <header>
        <span>PAINEL DO DOADOR</span>
        <h1>Seu impacto</h1>
        <p>
          Acompanhe suas contribuições e o que já foi confirmado pelas ONGs.
        </p>
      </header>
      <div className="kpis">
        <Kpi label="Contribuições" value={data.kpis.totalDonations} />
        <Kpi label="Confirmadas" value={data.kpis.confirmedDonations} />
        <Kpi label="Pendentes" value={data.kpis.pendingDonations} />
        <Kpi label="Campanhas apoiadas" value={data.kpis.campaignsSupported} />
        <Kpi label="ONGs ajudadas" value={data.kpis.organizationsHelped} />
        <QuantityKpis values={data.receivedByUnit} />
      </div>
      <div className="grid">
        <ChartPanel
          title="Contribuições por categoria e unidade"
          data={data.donationsByCategory}
          category
        />
        <ChartPanel
          title="Evolução mensal das confirmações"
          data={data.monthlyEvolution}
        />
      </div>
      <section className="panel dashboard-chart">
        <h2>Contribuições recentes</h2>
        {data.recentDonations?.length ? (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>ONG</th>
                  <th>Quantidade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentDonations.map((donation) => (
                  <tr key={donation.id}>
                    <td>{donation.campaign.title}</td>
                    <td>{donation.campaign.organization.name}</td>
                    <td>
                      {donation.quantity} {donation.campaign.unit}
                    </td>
                    <td>
                      <Badge status={donation.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Você ainda não registrou contribuições.</Empty>
        )}
      </section>
    </div>
  );
}

const emptyCampaignForm: CampaignForm = {
  title: "",
  description: "",
  categoryId: "",
  goalQuantity: "1",
  unit: "",
  startDate: "",
  endDate: "",
  status: "ACTIVE",
};

function NgoCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CampaignForm>(emptyCampaignForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const formPanelRef = useRef<HTMLElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [campaignResponse, categoryResponse] = await Promise.all([
        api.get("/ngo/campaigns"),
        api.get("/categories"),
      ]);
      setCampaigns(campaignResponse.data);
      setCategories(categoryResponse.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function edit(campaign: Campaign) {
    setEditingId(campaign.id);
    setNotice("");
    setForm({
      title: campaign.title,
      description: campaign.description,
      categoryId: campaign.category.id,
      goalQuantity: String(campaign.goalQuantity),
      unit: campaign.unit,
      startDate: new Date(campaign.startDate).toISOString().slice(0, 10),
      endDate: campaign.endDate
        ? new Date(campaign.endDate).toISOString().slice(0, 10)
        : "",
      status:
        campaign.status === "DRAFT"
          ? "DRAFT"
          : campaign.status === "ACTIVE"
            ? "ACTIVE"
            : undefined,
    });
    window.requestAnimationFrame(() =>
      formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function resetForm() {
    setEditingId("");
    setForm({ ...emptyCampaignForm, categoryId: categories[0]?.id ?? "" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const body = {
      ...form,
      goalQuantity: Number(form.goalQuantity),
      startDate: form.startDate || undefined,
      endDate: form.endDate || null,
      ...(form.status ? { status: form.status } : {}),
    };
    try {
      if (editingId) {
        await api.put(`/ngo/campaigns/${editingId}`, body);
        setNotice("Campanha atualizada com sucesso.");
      } else {
        await api.post("/ngo/campaigns", body);
        setNotice("Campanha criada com sucesso.");
      }
      resetForm();
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(campaign: Campaign) {
    if (!window.confirm(`Cancelar a campanha "${campaign.title}"?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.delete(`/ngo/campaigns/${campaign.id}`);
      setNotice("Campanha cancelada. O histórico de doações foi preservado.");
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function complete(campaign: Campaign) {
    if (
      !window.confirm(
        `Concluir "${campaign.title}"? As doações pendentes serão canceladas.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.post(`/ngo/campaigns/${campaign.id}/complete`);
      setNotice("Campanha concluída. Doações recebidas foram preservadas.");
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header>
        <span>GESTÃO</span>
        <h1>Campanhas</h1>
        <p>Crie, edite, acompanhe ou cancele as campanhas da sua ONG.</p>
      </header>
      <section className="panel" ref={formPanelRef}>
        <h2>{editingId ? "Editar campanha" : "Nova campanha"}</h2>
        <form className="campaign-form" onSubmit={submit}>
          <label>
            Título
            <input
              required
              minLength={3}
              maxLength={150}
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </label>
          <label>
            Categoria
            <select
              required
              value={form.categoryId}
              onChange={(event) =>
                setForm({ ...form, categoryId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Meta
            <input
              type="number"
              min="1"
              step="1"
              required
              value={form.goalQuantity}
              onChange={(event) =>
                setForm({ ...form, goalQuantity: event.target.value })
              }
            />
          </label>
          <label>
            Unidade
            <input
              required
              maxLength={30}
              placeholder="Ex.: cestas, kg ou kits"
              value={form.unit}
              onChange={(event) =>
                setForm({ ...form, unit: event.target.value })
              }
            />
          </label>
          <label>
            Início
            <input
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm({ ...form, startDate: event.target.value })
              }
            />
          </label>
          <label>
            Prazo final
            <input
              type="date"
              value={form.endDate}
              onChange={(event) =>
                setForm({ ...form, endDate: event.target.value })
              }
            />
          </label>
          {!editingId && (
            <label>
              Status inicial
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as CampaignForm["status"],
                  })
                }
              >
                <option value="ACTIVE">Ativa</option>
                <option value="DRAFT">Rascunho</option>
              </select>
            </label>
          )}
          {editingId && form.status && (
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as CampaignForm["status"],
                  })
                }
              >
                <option value="ACTIVE">Ativa</option>
                <option value="DRAFT" disabled={form.status !== "DRAFT"}>
                  Rascunho
                </option>
              </select>
            </label>
          )}
          <label className="form-wide">
            Descrição
            <textarea
              required
              minLength={10}
              maxLength={3000}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {notice && <div className="success">{notice}</div>}
          <div className="form-actions">
            <button className="primary" disabled={busy || !categories.length}>
              {busy
                ? "Salvando..."
                : editingId
                  ? "Salvar alterações"
                  : "Criar campanha"}
            </button>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="campaign-list">
        <h2>Suas campanhas</h2>
        {loading ? (
          <Loading />
        ) : error && !campaigns.length ? null : !campaigns.length ? (
          <Empty>Você ainda não criou campanhas.</Empty>
        ) : (
          campaigns.map((campaign) => (
            <article className="campaign-management" key={campaign.id}>
              <div className="campaign-heading">
                <div>
                  <span>{campaign.category.name}</span>
                  <h3>{campaign.title}</h3>
                </div>
                <Badge status={campaign.status} />
              </div>
              <p>{campaign.description}</p>
              <Progress
                received={campaign.receivedQuantity}
                goal={campaign.goalQuantity}
                unit={campaign.unit}
              />
              {campaign.status === "COMPLETED" && (
                <p className="completion-reason">
                  {campaign.completionReason === "MANUAL"
                    ? "Encerrada manualmente antes de atingir a meta."
                    : campaign.completionReason === "GOAL_REACHED" ||
                        campaign.receivedQuantity >= campaign.goalQuantity
                      ? "Meta atingida."
                      : "Concluída anteriormente; motivo não registrado."}
                </p>
              )}
              <div className="campaign-actions">
                {campaign.status === "CANCELED" && (
                  <Link
                    className="secondary"
                    to={`/ngo/donations?campaignId=${encodeURIComponent(campaign.id)}`}
                  >
                    Ver histórico de doações
                  </Link>
                )}
                {(campaign.status === "ACTIVE" || campaign.status === "DRAFT") && (
                  <button className="secondary" onClick={() => edit(campaign)}>
                    Editar
                  </button>
                )}
                {campaign.status === "ACTIVE" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void complete(campaign)}
                  >
                    Concluir campanha
                  </button>
                )}
                {(campaign.status === "ACTIVE" || campaign.status === "DRAFT") && (
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() => void cancel(campaign)}
                  >
                    Cancelar campanha
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function NgoDonations() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const location = useLocation();
  const campaignId = new URLSearchParams(location.search).get("campaignId");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/ngo/donations");
      setDonations(data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const visibleDonations = campaignId
    ? donations.filter((donation) => donation.campaign.id === campaignId)
    : donations;
  const campaignTitle = visibleDonations[0]?.campaign.title;
  async function updateStatus(
    donation: Donation,
    status: "RECEIVED" | "CANCELED",
  ) {
    setBusyId(donation.id);
    setError("");
    setNotice("");
    try {
      await api.patch(`/ngo/donations/${donation.id}/status`, { status });
      setNotice(
        status === "RECEIVED" ? "Recebimento confirmado." : "Doação cancelada.",
      );
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }
  return (
    <div className="page">
      <header>
        <span>RECEBIMENTOS</span>
        <h1>{campaignTitle ? `Histórico: ${campaignTitle}` : "Doações"}</h1>
        <p>Confirme ou cancele as contribuições pendentes da sua ONG.</p>
        {campaignId && (
          <Link to="/ngo/donations">Voltar a todas as doações</Link>
        )}
      </header>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {notice && <div className="success">{notice}</div>}
      {loading ? (
        <Loading />
      ) : !visibleDonations.length ? (
        <Empty>Nenhuma doação registrada ainda.</Empty>
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Doador</th>
                <th>Campanha</th>
                <th>Quantidade</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleDonations.map((donation) => (
                <tr key={donation.id}>
                  <td>
                    {donation.donor?.name}
                    <small>{donation.donor?.email}</small>
                  </td>
                  <td>{donation.campaign.title}</td>
                  <td>
                    {donation.quantity} {donation.campaign.unit}
                  </td>
                  <td>
                    <Badge status={donation.status} />
                  </td>
                  <td>
                    {donation.status === "PENDING" ? (
                      <div className="inline-actions">
                        <button
                          disabled={busyId === donation.id}
                          onClick={() =>
                            void updateStatus(donation, "RECEIVED")
                          }
                        >
                          Confirmar
                        </button>
                        <button
                          className="danger-button"
                          disabled={busyId === donation.id}
                          onClick={() =>
                            void updateStatus(donation, "CANCELED")
                          }
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DonorCampaigns() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [applied, setApplied] = useState({
    search: "",
    city: "",
    category: "",
  });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api
      .get("/categories")
      .then((response) => setCategories(response.data))
      .catch((requestError) => setError(errorMessage(requestError)));
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .get("/campaigns", {
        params: {
          ...applied,
          search: applied.search || undefined,
          city: applied.city || undefined,
          category: applied.category || undefined,
          page,
          pageSize: 12,
        },
      })
      .then(({ data }) => {
        if (!active) return;
        setCampaigns(data.items);
        setPages(data.pagination.pages);
        setTotal(data.pagination.total);
      })
      .catch((requestError) => {
        if (active) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applied, page]);

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setApplied({ search: search.trim(), city: city.trim(), category });
  }

  async function submitDonation(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.post("/donor/donations", {
        campaignId: selected.id,
        quantity: Number(quantity),
        note: note || null,
      });
      setNotice(
        "Contribuição registrada como pendente de confirmação pela ONG.",
      );
      setSelected(null);
      setQuantity("1");
      setNote("");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header>
        <span>OPORTUNIDADES</span>
        <h1>Campanhas disponíveis</h1>
        <p>Encontre campanhas ativas e acompanhe o progresso das metas.</p>
      </header>
      <form className="search" onSubmit={submitFilters}>
        <input
          aria-label="Buscar campanha ou ONG"
          placeholder="Buscar campanha ou ONG"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          aria-label="Filtrar por cidade"
          placeholder="Cidade"
          value={city}
          onChange={(event) => setCity(event.target.value)}
        />
        <select
          aria-label="Filtrar por categoria"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categories.map((item) => (
            <option key={item.id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <button className="primary">
          <Search size={16} />
          Buscar
        </button>
      </form>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {notice && <div className="success">{notice}</div>}
      {selected && (
        <section className="panel donation-form-panel">
          <h2>Registrar contribuição: {selected.title}</h2>
          <form className="donation-form" onSubmit={submitDonation}>
            <label>
              Quantidade ({selected.unit})
              <input
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              Observação (opcional)
              <input
                maxLength={300}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Registrando..." : "Confirmar contribuição"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected(null)}
            >
              Voltar
            </button>
          </form>
        </section>
      )}
      {loading ? (
        <Loading />
      ) : campaigns.length === 0 ? (
        <Empty>Nenhuma campanha encontrada com esses filtros.</Empty>
      ) : (
        <>
          <p className="results-count">{total} campanha(s) encontrada(s)</p>
          <div className="cards">
            {campaigns.map((campaign) => (
              <article className="campaign" key={campaign.id}>
                <span>{campaign.category.name}</span>
                <h2>{campaign.title}</h2>
                <b>
                  {campaign.organization.name} · {campaign.organization.city},{" "}
                  {campaign.organization.state}
                </b>
                <p>{campaign.description}</p>
                <Progress
                  received={campaign.receivedQuantity}
                  goal={campaign.goalQuantity}
                  unit={campaign.unit}
                />
                <button
                  className="primary"
                  onClick={() => {
                    setSelected(campaign);
                    setNotice("");
                  }}
                >
                  Quero ajudar
                </button>
              </article>
            ))}
          </div>
          <div className="pagination">
            <button
              className="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <span>
              Página {page} de {pages}
            </span>
            <button
              className="secondary"
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Próxima
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DonorDonations() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get("/donor/donations")
      .then((response) => setDonations(response.data))
      .catch((requestError) => setError(errorMessage(requestError)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="page">
      <header>
        <span>HISTÓRICO</span>
        <h1>Minhas contribuições</h1>
        <p>
          Contribuições pendentes não entram na arrecadação até serem
          confirmadas pela ONG.
        </p>
      </header>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {loading ? (
        <Loading />
      ) : !donations.length ? (
        <Empty>Você ainda não registrou contribuições.</Empty>
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>ONG</th>
                <th>Quantidade</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {donations.map((donation) => (
                <tr key={donation.id}>
                  <td>{donation.campaign.title}</td>
                  <td>{donation.campaign.organization.name}</td>
                  <td>
                    {donation.quantity} {donation.campaign.unit}
                  </td>
                  <td>{new Date(donation.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Badge status={donation.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const isNgo = user.role === "NGO";
  const base = `/${user.role.toLowerCase()}`;
  return (
    <Layout user={user} onLogout={onLogout}>
      <Routes>
        <Route index element={<Navigate to={`${base}/dashboard`} replace />} />
        <Route
          path="dashboard"
          element={isNgo ? <NgoDashboard /> : <DonorDashboard />}
        />
        <Route
          path="campaigns"
          element={isNgo ? <NgoCampaigns /> : <DonorCampaigns />}
        />
        <Route
          path="donations"
          element={isNgo ? <NgoDonations /> : <DonorDonations />}
        />
        <Route
          path="*"
          element={<Navigate to={`${base}/dashboard`} replace />}
        />
      </Routes>
    </Layout>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  function onAuthenticated(authenticatedUser: User, token: string) {
    localStorage.setItem("token", token);
    setUser(authenticatedUser);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    navigate("/login", { replace: true });
  }

  if (authLoading) return <Loading message="Verificando sessão..." />;
  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={destination(user)} replace />
          ) : (
            <Login onAuthenticated={onAuthenticated} />
          )
        }
      />
      <Route
        path="/register/donor"
        element={
          user ? (
            <Navigate to={destination(user)} replace />
          ) : (
            <Register role="DONOR" onAuthenticated={onAuthenticated} />
          )
        }
      />
      <Route
        path="/register/ngo"
        element={
          user ? (
            <Navigate to={destination(user)} replace />
          ) : (
            <Register role="NGO" onAuthenticated={onAuthenticated} />
          )
        }
      />
      <Route
        path="/donor/*"
        element={
          <Protected user={user} role="DONOR">
            <Workspace user={user!} onLogout={logout} />
          </Protected>
        }
      />
      <Route
        path="/ngo/*"
        element={
          <Protected user={user} role="NGO">
            <Workspace user={user!} onLogout={logout} />
          </Protected>
        }
      />
      <Route
        path="*"
        element={<Navigate to={user ? destination(user) : "/login"} replace />}
      />
    </Routes>
  );
}
