import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

type ApiResult = { status: number; data: any };

const createdUserIds: string[] = [];
const createdCampaignIds: string[] = [];
const createdCategoryIds: string[] = [];
let testUserEmails: string[] = [];
let categoryId = "";
let server: Server;
let baseUrl: string;

async function api(
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}

async function createCampaign(
  token: string,
  title: string,
  goalQuantity: number,
  unit = "kits",
) {
  const result = await api("/ngo/campaigns", {
    token,
    method: "POST",
    body: {
      categoryId,
      title,
      description: "Campanha criada para validar as regras de integração.",
      goalQuantity,
      unit,
      status: "ACTIVE",
    },
  });
  assert.equal(result.status, 201);
  createdCampaignIds.push(result.data.id);
  return result.data;
}

test("regras críticas de autorização, campanhas, doações e dashboards", async (t) => {
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const suffix = randomUUID();
  const donorEmail = `donor-${suffix}@test.invalid`;
  const ngoEmail = `ngo-${suffix}@test.invalid`;
  const otherNgoEmail = `other-ngo-${suffix}@test.invalid`;
  testUserEmails = [donorEmail, ngoEmail, otherNgoEmail];

  try {
    const category = await prisma.category.create({
      data: { name: `Integration ${suffix}`, slug: `integration-${suffix}` },
    });
    categoryId = category.id;
    const alternateCategory = await prisma.category.create({
      data: {
        name: `Integration alternate ${suffix}`,
        slug: `integration-alternate-${suffix}`,
      },
    });
    createdCategoryIds.push(alternateCategory.id);

    const donorResult = await api("/auth/register/donor", {
      method: "POST",
      body: {
        name: "Integration Donor",
        email: donorEmail,
        password: "test-password-123",
      },
    });
    const ngoResult = await api("/auth/register/ngo", {
      method: "POST",
      body: {
        responsibleName: "Integration Owner",
        email: ngoEmail,
        password: "test-password-123",
        organizationName: `Integration NGO ${suffix}`,
        description: "Organização criada exclusivamente para testes.",
        city: "São Paulo",
        state: "SP",
      },
    });
    const otherNgoResult = await api("/auth/register/ngo", {
      method: "POST",
      body: {
        responsibleName: "Another Owner",
        email: otherNgoEmail,
        password: "test-password-123",
        organizationName: `Other NGO ${suffix}`,
        description: "Segunda organização para validar isolamento.",
        city: "São Paulo",
        state: "SP",
      },
    });
    assert.equal(donorResult.status, 201);
    assert.equal(ngoResult.status, 201);
    assert.equal(otherNgoResult.status, 201);
    createdUserIds.push(
      donorResult.data.user.id,
      ngoResult.data.user.id,
      otherNgoResult.data.user.id,
    );

    const donorToken = donorResult.data.token as string;
    const ngoToken = ngoResult.data.token as string;
    const otherNgoToken = otherNgoResult.data.token as string;
    const mainCampaign = await createCampaign(ngoToken, `Main ${suffix}`, 5);

    await t.test("busca pública aplica filtros e paginação", async () => {
      const params = new URLSearchParams({
        search: `Main ${suffix}`,
        category: category.slug,
        city: "São Paulo",
        page: "1",
        pageSize: "1",
      });
      const result = await api(`/campaigns?${params}`);
      assert.equal(result.status, 200);
      assert.equal(result.data.items.length, 1);
      assert.equal(result.data.items[0].id, mainCampaign.id);
      assert.deepEqual(result.data.pagination, {
        page: 1,
        pageSize: 1,
        total: 1,
        pages: 1,
      });
    });

    await t.test(
      "cadastro protege dados sensíveis e trata e-mail duplicado",
      async () => {
        assert.equal("passwordHash" in donorResult.data.user, false);
        const duplicate = await api("/auth/register/donor", {
          method: "POST",
          body: {
            name: "Duplicate",
            email: donorEmail,
            password: "test-password-123",
          },
        });
        assert.equal(duplicate.status, 409);
      },
    );

    await t.test(
      "doador não acessa recursos administrativos da ONG",
      async () => {
        const result = await api("/ngo/dashboard", { token: donorToken });
        assert.equal(result.status, 403);
      },
    );

    await t.test("ONG não acessa operações exclusivas do doador", async () => {
      const result = await api("/donor/dashboard", { token: ngoToken });
      assert.equal(result.status, 403);
    });

    await t.test("token inválido é rejeitado", async () => {
      const result = await api("/auth/me", { token: "invalid.token.value" });
      assert.equal(result.status, 401);
    });

    await t.test("ONG não modifica campanha de outra instituição", async () => {
      const result = await api(`/ngo/campaigns/${mainCampaign.id}`, {
        token: otherNgoToken,
        method: "PUT",
        body: {
          title: "Tentativa de alteração",
          description: "Tentativa de alterar a campanha de outra ONG.",
          goalQuantity: 9,
        },
      });
      assert.equal(result.status, 404);
    });

    const updatedEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await t.test("ONG proprietária edita campanha ativa e atualiza meta e prazo", async () => {
      const result = await api(`/ngo/campaigns/${mainCampaign.id}`, {
        token: ngoToken,
        method: "PUT",
        body: {
          title: `Edited ${suffix}`,
          description: "Descrição atualizada pela ONG proprietária.",
          categoryId: alternateCategory.id,
          goalQuantity: 6,
          unit: "kits",
          endDate: updatedEndDate,
        },
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.title, `Edited ${suffix}`);
      assert.equal(result.data.goalQuantity, 6);
      assert.equal(result.data.categoryId, alternateCategory.id);
      assert.equal(
        new Date(result.data.endDate).toISOString().slice(0, 10),
        updatedEndDate,
      );
      assert.equal(result.data.status, "ACTIVE");
    });

    const pendingResult = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: mainCampaign.id, quantity: 3 },
    });
    await t.test("doador registra doação pendente", async () => {
      assert.equal(pendingResult.status, 201);
      assert.equal(pendingResult.data.status, "PENDING");
    });

    await t.test("doação pendente não altera arrecadação", async () => {
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: mainCampaign.id },
      });
      assert.equal(campaign.receivedQuantity, 0);
    });

    const confirmed = await api(
      `/ngo/donations/${pendingResult.data.id}/status`,
      {
        token: ngoToken,
        method: "PATCH",
        body: { status: "RECEIVED" },
      },
    );
    assert.equal(confirmed.status, 200);

    await t.test(
      "confirmação adiciona a quantidade uma única vez",
      async () => {
        const campaign = await prisma.campaign.findUniqueOrThrow({
          where: { id: mainCampaign.id },
        });
        assert.equal(campaign.receivedQuantity, 3);
      },
    );

    await t.test("confirmação duplicada é rejeitada", async () => {
      const result = await api(
        `/ngo/donations/${pendingResult.data.id}/status`,
        {
          token: ngoToken,
          method: "PATCH",
          body: { status: "RECEIVED" },
        },
      );
      assert.equal(result.status, 409);
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: mainCampaign.id },
      });
      assert.equal(campaign.receivedQuantity, 3);
    });

    const canceledDonation = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: mainCampaign.id, quantity: 2 },
    });
    const canceledResult = await api(
      `/ngo/donations/${canceledDonation.data.id}/status`,
      { token: ngoToken, method: "PATCH", body: { status: "CANCELED" } },
    );

    await t.test("cancelamento não aumenta arrecadação", async () => {
      assert.equal(canceledResult.status, 200);
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: mainCampaign.id },
      });
      assert.equal(campaign.receivedQuantity, 3);
    });

    const finalDonation = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: mainCampaign.id, quantity: 3 },
    });
    const finalConfirmation = await api(
      `/ngo/donations/${finalDonation.data.id}/status`,
      { token: ngoToken, method: "PATCH", body: { status: "RECEIVED" } },
    );

    await t.test(
      "atingir a meta conclui automaticamente a campanha",
      async () => {
        assert.equal(finalConfirmation.status, 200);
        const campaign = await prisma.campaign.findUniqueOrThrow({
          where: { id: mainCampaign.id },
        });
        assert.equal(campaign.receivedQuantity, 6);
        assert.equal(campaign.status, "COMPLETED");
        assert.equal(campaign.completionReason, "GOAL_REACHED");
      },
    );

    await t.test("campanha concluída não pode ser editada", async () => {
      const result = await api(`/ngo/campaigns/${mainCampaign.id}`, {
        token: ngoToken,
        method: "PUT",
        body: { goalQuantity: 10 },
      });
      assert.equal(result.status, 409);
    });

    const canceledCampaign = await createCampaign(
      ngoToken,
      `Canceled ${suffix}`,
      100,
    );
    const outstanding = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: canceledCampaign.id, quantity: 1 },
    });
    assert.equal(outstanding.status, 201);
    const cancellation = await api(`/ngo/campaigns/${canceledCampaign.id}`, {
      token: ngoToken,
      method: "DELETE",
    });

    await t.test(
      "campanha cancelada recusa novas doações e cancela as pendentes",
      async () => {
        assert.equal(cancellation.status, 200);
        const freshDonation = await api("/donor/donations", {
          token: donorToken,
          method: "POST",
          body: { campaignId: canceledCampaign.id, quantity: 1 },
        });
        assert.equal(freshDonation.status, 400);
        const pending = await prisma.donation.findUniqueOrThrow({
          where: { id: outstanding.data.id },
        });
        assert.equal(pending.status, "CANCELED");
        const completeResult = await api(
          `/ngo/campaigns/${canceledCampaign.id}/complete`,
          { token: ngoToken, method: "POST" },
        );
        assert.equal(completeResult.status, 409);
      },
    );

    const draftCampaign = await api("/ngo/campaigns", {
      token: ngoToken,
      method: "POST",
      body: {
        categoryId,
        title: `Draft ${suffix}`,
        description: "Campanha em rascunho para testar conclusão inválida.",
        goalQuantity: 10,
        unit: "kits",
        status: "DRAFT",
      },
    });
    assert.equal(draftCampaign.status, 201);
    createdCampaignIds.push(draftCampaign.data.id);
    await t.test("campanha em rascunho não pode ser concluída", async () => {
      const result = await api(
        `/ngo/campaigns/${draftCampaign.data.id}/complete`,
        { token: ngoToken, method: "POST" },
      );
      assert.equal(result.status, 409);
    });

    const expiredCampaign = await prisma.campaign.create({
      data: {
        organizationId: ngoResult.data.organization.id,
        categoryId,
        title: `Expired ${suffix}`,
        description: "Campanha usada para verificar a restrição de prazo.",
        goalQuantity: 10,
        unit: "kits",
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });
    createdCampaignIds.push(expiredCampaign.id);

    await t.test("campanha vencida recusa novas doações", async () => {
      const result = await api("/donor/donations", {
        token: donorToken,
        method: "POST",
        body: { campaignId: expiredCampaign.id, quantity: 1 },
      });
      assert.equal(result.status, 400);
    });
    await t.test(
      "prazo vencido impede aumentar uma meta não atingida",
      async () => {
        const result = await api(`/ngo/campaigns/${expiredCampaign.id}`, {
          token: ngoToken,
          method: "PUT",
          body: { goalQuantity: 20 },
        });
        assert.equal(result.status, 409);
      },
    );

    const concurrentCampaign = await createCampaign(
      ngoToken,
      `Concurrent ${suffix}`,
      100,
    );
    const concurrentDonation = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: concurrentCampaign.id, quantity: 7 },
    });
    const simultaneous = await Promise.all([
      api(`/ngo/donations/${concurrentDonation.data.id}/status`, {
        token: ngoToken,
        method: "PATCH",
        body: { status: "RECEIVED" },
      }),
      api(`/ngo/donations/${concurrentDonation.data.id}/status`, {
        token: ngoToken,
        method: "PATCH",
        body: { status: "RECEIVED" },
      }),
    ]);

    await t.test(
      "confirmações simultâneas não duplicam quantidade",
      async () => {
        assert.deepEqual(
          simultaneous.map((result) => result.status).sort(),
          [200, 409],
        );
        const [campaign, receivedCount] = await Promise.all([
          prisma.campaign.findUniqueOrThrow({
            where: { id: concurrentCampaign.id },
          }),
          prisma.donation.count({
            where: { campaignId: concurrentCampaign.id, status: "RECEIVED" },
          }),
        ]);
        assert.equal(campaign.receivedQuantity, 7);
        assert.equal(receivedCount, 1);
      },
    );

    const manualCampaign = await createCampaign(
      ngoToken,
      `Manual completion ${suffix}`,
      100,
    );
    const manualReceived = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: manualCampaign.id, quantity: 8 },
    });
    const manualPending = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: manualCampaign.id, quantity: 2 },
    });
    const manualReceiveResult = await api(
      `/ngo/donations/${manualReceived.data.id}/status`,
      { token: ngoToken, method: "PATCH", body: { status: "RECEIVED" } },
    );
    assert.equal(manualReceiveResult.status, 200);
    const manualResult = await api(
      `/ngo/campaigns/${manualCampaign.id}/complete`,
      { token: ngoToken, method: "POST" },
    );
    createdCampaignIds.push(manualCampaign.id);

    await t.test("ONG conclui manualmente campanha ativa sem atingir a meta", async () => {
      assert.equal(manualResult.status, 200);
      assert.equal(manualResult.data.status, "COMPLETED");
      assert.equal(manualResult.data.completionReason, "MANUAL");
      assert.equal(manualResult.data.goalQuantity, 100);
      assert.equal(manualResult.data.receivedQuantity, 8);
    });

    await t.test("conclusão manual cancela pendências e preserva recebidas", async () => {
      const [pending, received, campaign] = await Promise.all([
        prisma.donation.findUniqueOrThrow({ where: { id: manualPending.data.id } }),
        prisma.donation.findUniqueOrThrow({ where: { id: manualReceived.data.id } }),
        prisma.campaign.findUniqueOrThrow({ where: { id: manualCampaign.id } }),
      ]);
      assert.equal(pending.status, "CANCELED");
      assert.equal(received.status, "RECEIVED");
      assert.equal(campaign.receivedQuantity, 8);
    });

    await t.test("conclusão repetida e edição de concluída são rejeitadas", async () => {
      const [completeAgain, editCompleted, newDonation] = await Promise.all([
        api(`/ngo/campaigns/${manualCampaign.id}/complete`, {
          token: ngoToken,
          method: "POST",
        }),
        api(`/ngo/campaigns/${manualCampaign.id}`, {
          token: ngoToken,
          method: "PUT",
          body: { title: "Campanha alterada após conclusão" },
        }),
        api("/donor/donations", {
          token: donorToken,
          method: "POST",
          body: { campaignId: manualCampaign.id, quantity: 1 },
        }),
      ]);
      assert.equal(completeAgain.status, 409);
      assert.equal(editCompleted.status, 409);
      assert.equal(newDonation.status, 400);
    });

    const otherCampaign = await createCampaign(
      ngoToken,
      `Other manual ${suffix}`,
      100,
    );
    createdCampaignIds.push(otherCampaign.id);
    await t.test("outra ONG não pode concluir a campanha", async () => {
      const result = await api(`/ngo/campaigns/${otherCampaign.id}/complete`, {
        token: otherNgoToken,
        method: "POST",
      });
      assert.equal(result.status, 404);
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: otherCampaign.id },
      });
      assert.equal(campaign.status, "ACTIVE");
    });

    const raceCampaign = await createCampaign(
      ngoToken,
      `Completion race ${suffix}`,
      50,
    );
    createdCampaignIds.push(raceCampaign.id);
    const raceDonation = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: raceCampaign.id, quantity: 7 },
    });
    const [raceConfirm, raceComplete] = await Promise.all([
      api(`/ngo/donations/${raceDonation.data.id}/status`, {
        token: ngoToken,
        method: "PATCH",
        body: { status: "RECEIVED" },
      }),
      api(`/ngo/campaigns/${raceCampaign.id}/complete`, {
        token: ngoToken,
        method: "POST",
      }),
    ]);
    await t.test("confirmação concorrente com conclusão mantém estados consistentes", async () => {
      assert.ok([200, 409].includes(raceConfirm.status));
      assert.equal(raceComplete.status, 200);
      const [campaign, donation] = await Promise.all([
        prisma.campaign.findUniqueOrThrow({ where: { id: raceCampaign.id } }),
        prisma.donation.findUniqueOrThrow({ where: { id: raceDonation.data.id } }),
      ]);
      assert.equal(campaign.status, "COMPLETED");
      assert.equal(campaign.completionReason, "MANUAL");
      assert.ok(["RECEIVED", "CANCELED"].includes(donation.status));
      assert.equal(
        campaign.receivedQuantity,
        donation.status === "RECEIVED" ? donation.quantity : 0,
      );
    });

    const unitCampaign = await createCampaign(
      ngoToken,
      `Different unit ${suffix}`,
      20,
      "kg",
    );
    const unitDonation = await api("/donor/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: unitCampaign.id, quantity: 4 },
    });
    const unitConfirmation = await api(
      `/ngo/donations/${unitDonation.data.id}/status`,
      {
        token: ngoToken,
        method: "PATCH",
        body: { status: "RECEIVED" },
      },
    );
    assert.equal(unitConfirmation.status, 200);

    await t.test(
      "dashboards refletem apenas operações confirmadas",
      async () => {
        const [ngoDashboard, donorDashboard] = await Promise.all([
          api("/ngo/dashboard", { token: ngoToken }),
          api("/donor/dashboard", { token: donorToken }),
        ]);
        assert.equal(ngoDashboard.status, 200);
        assert.equal(donorDashboard.status, 200);
        const organizationId = ngoResult.data.organization.id;
        const [receivedCount, pendingCount, manualCompletions, goalCompletions] =
          await Promise.all([
            prisma.donation.count({
              where: {
                campaign: { organizationId },
                status: "RECEIVED",
              },
            }),
            prisma.donation.count({
              where: {
                campaign: { organizationId },
                status: "PENDING",
              },
            }),
            prisma.campaign.count({
              where: {
                organizationId,
                status: "COMPLETED",
                completionReason: "MANUAL",
              },
            }),
            prisma.campaign.count({
              where: {
                organizationId,
                status: "COMPLETED",
                completionReason: "GOAL_REACHED",
              },
            }),
          ]);
        assert.equal(ngoDashboard.data.kpis.receivedDonations, receivedCount);
        assert.equal(ngoDashboard.data.kpis.pendingDonations, pendingCount);
        assert.equal(
          donorDashboard.data.kpis.confirmedDonations,
          await prisma.donation.count({
            where: { donorId: donorResult.data.user.id, status: "RECEIVED" },
          }),
        );
        assert.equal(donorDashboard.data.kpis.pendingDonations, 0);
        assert.equal(ngoDashboard.data.kpis.campaignsCompletedManually, manualCompletions);
        assert.equal(ngoDashboard.data.kpis.campaignsCompletedByGoal, goalCompletions);
        assert.equal(manualCompletions, 2);
        assert.equal(goalCompletions, 1);
        assert.equal(
          donorDashboard.data.kpis.totalDonations,
          await prisma.donation.count({ where: { donorId: donorResult.data.user.id } }),
        );
        assert.deepEqual(
          [
            ...new Set(
              ngoDashboard.data.donationsByCategory.map(
                (item: { unit: string }) => item.unit,
              ),
            ),
          ].sort(),
          ["kg", "kits"],
        );
        assert.deepEqual(
          donorDashboard.data.receivedByUnit
            .map((item: { unit: string }) => item.unit)
            .sort(),
          ["kg", "kits"],
        );
        assert.equal(ngoDashboard.data.monthlyEvolution.length, 12);
      },
    );
  } finally {
    if (createdCampaignIds.length)
      await prisma.campaign.deleteMany({
        where: { id: { in: createdCampaignIds } },
      });
    if (createdUserIds.length)
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    if (testUserEmails.length)
      await prisma.user.deleteMany({
        where: { email: { in: testUserEmails } },
      });
    if (categoryId)
      await prisma.category.deleteMany({ where: { id: categoryId } });
    if (createdCategoryIds.length)
      await prisma.category.deleteMany({
        where: { id: { in: createdCategoryIds } },
      });
  }
});

after(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await prisma.$disconnect();
});
