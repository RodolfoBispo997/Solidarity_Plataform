import bcrypt from "bcryptjs";
import { Prisma, type CampaignStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import {
  campaignCreateSchema,
  campaignUpdateSchema,
  donationCreateSchema,
  donationStatusSchema,
  donorRegisterSchema,
  loginSchema,
  ngoRegisterSchema,
  publicCampaignQuerySchema,
} from "../schemas/index.js";

const safeUser = (user: {
  id: string;
  name: string;
  email: string;
  role: "DONOR" | "NGO";
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function serializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isPrismaCode(error, "P2034") || attempt >= 2) throw error;
    }
  }
}

async function findOrganization(userId: string) {
  return prisma.organization.findUnique({ where: { userId } });
}

async function findOrganizationForTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  return tx.organization.findUnique({ where: { userId } });
}

function isExpired(endDate: Date | null, now = new Date()) {
  return endDate !== null && endDate <= now;
}

function routeId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string")
    throw new ApiError("Identificador inválido.", 400);
  return id;
}

function totalsByCategoryAndUnit(
  donations: Array<{
    quantity: number;
    campaign: { category: { name: string }; unit: string };
  }>,
) {
  const totals = new Map<
    string,
    { category: string; unit: string; total: number }
  >();
  for (const donation of donations) {
    const { name: category } = donation.campaign.category;
    const { unit } = donation.campaign;
    const key = `${category}\u0000${unit}`;
    const current = totals.get(key);
    totals.set(key, {
      category,
      unit,
      total: (current?.total ?? 0) + donation.quantity,
    });
  }
  return [...totals.values()];
}

function monthlyReceived() {
  const months: Array<{
    month: string;
    receivedDonations: number;
    quantityByUnit: Record<string, number>;
  }> = [];
  const indexes = new Map<string, (typeof months)[number]>();
  const now = new Date();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const item = {
      month,
      receivedDonations: 0,
      quantityByUnit: {} as Record<string, number>,
    };
    months.push(item);
    indexes.set(month, item);
  }
  return { months, indexes };
}

export async function registerDonor(req: Request, res: Response) {
  const data = donorRegisterSchema.parse(req.body);
  try {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: "DONOR",
      },
    });
    return res.status(201).json({
      token: signToken({ sub: user.id, role: user.role }),
      user: safeUser(user),
    });
  } catch (error) {
    if (isPrismaCode(error, "P2002"))
      return res.status(409).json({ message: "E-mail já cadastrado." });
    throw error;
  }
}

export async function registerNgo(req: Request, res: Response) {
  const data = ngoRegisterSchema.parse(req.body);
  try {
    const user = await prisma.user.create({
      data: {
        name: data.responsibleName,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: "NGO",
        organization: {
          create: {
            name: data.organizationName,
            cnpj: data.cnpj || null,
            description: data.description,
            phone: data.phone || null,
            city: data.city,
            state: data.state.toUpperCase(),
          },
        },
      },
      include: { organization: true },
    });
    return res.status(201).json({
      token: signToken({ sub: user.id, role: user.role }),
      user: safeUser(user),
      organization: user.organization,
    });
  } catch (error) {
    if (isPrismaCode(error, "P2002"))
      return res.status(409).json({
        message: "E-mail ou CNPJ já cadastrado.",
      });
    throw error;
  }
}

export async function login(req: Request, res: Response) {
  const data = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { organization: true },
  });
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash)))
    return res.status(401).json({ message: "E-mail ou senha inválidos." });
  if (data.expectedRole && user.role !== data.expectedRole)
    return res.status(403).json({ message: "Perfil de acesso incorreto." });
  return res.json({
    token: signToken({ sub: user.id, role: user.role }),
    user: safeUser(user),
    organization: user.organization,
  });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { organization: true },
  });
  if (!user)
    return res.status(404).json({ message: "Usuário não encontrado." });
  return res.json({ user: safeUser(user), organization: user.organization });
}

export async function categories(_req: Request, res: Response) {
  return res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
}

export async function publicCampaigns(req: Request, res: Response) {
  const query = publicCampaignQuerySchema.parse(req.query);
  const now = new Date();
  const where = {
    status: "ACTIVE" as const,
    startDate: { lte: now },
    OR: [{ endDate: null }, { endDate: { gt: now } }],
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.city
      ? {
          organization: {
            city: { contains: query.city, mode: "insensitive" as const },
          },
        }
      : {}),
    ...(query.search
      ? {
          AND: [
            {
              OR: [
                {
                  title: {
                    contains: query.search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  description: {
                    contains: query.search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  organization: {
                    name: {
                      contains: query.search,
                      mode: "insensitive" as const,
                    },
                  },
                },
              ],
            },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: {
        category: true,
        organization: {
          select: {
            id: true,
            name: true,
            description: true,
            phone: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.campaign.count({ where }),
  ]);
  return res.json({
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      pages: Math.ceil(total / query.pageSize),
    },
  });
}

export async function ngoCampaigns(req: Request, res: Response) {
  const organization = await findOrganization(req.user!.id);
  if (!organization)
    return res.status(404).json({ message: "ONG não encontrada." });
  return res.json(
    await prisma.campaign.findMany({
      where: { organizationId: organization.id },
      include: { category: true, _count: { select: { donations: true } } },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function createCampaign(req: Request, res: Response) {
  const data = campaignCreateSchema.parse(req.body);
  const startDate = data.startDate ?? new Date();
  const endDate = data.endDate ?? null;
  if (endDate && endDate < startDate)
    throw new ApiError("A data final não pode ser anterior à inicial.", 400);
  if (data.status === "ACTIVE" && startDate > new Date())
    throw new ApiError("A data inicial da campanha ainda não chegou.", 400);
  if (data.status === "ACTIVE" && isExpired(endDate))
    throw new ApiError("O prazo da campanha já venceu.", 400);
  const organization = await findOrganization(req.user!.id);
  if (!organization)
    return res.status(404).json({ message: "ONG não encontrada." });
  return res.status(201).json(
    await prisma.campaign.create({
      data: {
        organizationId: organization.id,
        ...data,
        startDate,
        endDate,
      },
      include: { category: true },
    }),
  );
}

export async function updateCampaign(req: Request, res: Response) {
  const data = campaignUpdateSchema.parse(req.body);
  const id = routeId(req);
  const campaign = await serializable(async (tx) => {
    const organization = await findOrganizationForTransaction(tx, req.user!.id);
    if (!organization) throw new ApiError("ONG não encontrada.", 404);
    const current = await tx.campaign.findFirst({
      where: { id, organizationId: organization.id },
    });
    if (!current) throw new ApiError("Campanha não encontrada.", 404);
    if (current.status === "CANCELED")
      throw new ApiError("Campanhas canceladas não podem ser alteradas.", 409);
    if (current.status === "COMPLETED")
      throw new ApiError("Campanhas concluídas não podem ser alteradas.", 409);
    const startDate = data.startDate ?? current.startDate;
    const endDate = data.endDate === undefined ? current.endDate : data.endDate;
    if (endDate && endDate < startDate)
      throw new ApiError("A data final não pode ser anterior à inicial.", 400);
    if (data.status === "CANCELED") {
      await tx.donation.updateMany({
        where: { campaignId: current.id, status: "PENDING" },
        data: { status: "CANCELED" },
      });
      return tx.campaign.update({
        where: { id: current.id },
        data: { ...data, status: "CANCELED" },
        include: { category: true },
      });
    }
    if (data.status === "COMPLETED")
      throw new ApiError("A conclusão é determinada pela meta recebida.", 409);
    if (data.status === "DRAFT" && current.status !== "DRAFT")
      throw new ApiError(
        "Uma campanha publicada não pode voltar a rascunho.",
        409,
      );

    if (data.status === "ACTIVE" && isExpired(endDate))
      throw new ApiError("O prazo da campanha já venceu.", 400);
    if (data.status === "ACTIVE" && startDate > new Date())
      throw new ApiError("A data inicial da campanha ainda não chegou.", 400);
    const received = await tx.donation.aggregate({
      where: { campaignId: current.id, status: "RECEIVED" },
      _sum: { quantity: true },
    });
    const receivedQuantity = received._sum.quantity ?? 0;
    const requestedStatus = data.status ?? current.status;
    const goalQuantity = data.goalQuantity ?? current.goalQuantity;
    if (
      receivedQuantity < goalQuantity &&
      isExpired(endDate) &&
      (data.endDate !== undefined ||
        (data.goalQuantity !== undefined &&
          data.goalQuantity !== current.goalQuantity))
    )
      throw new ApiError(
        "Uma campanha com prazo vencido não pode ser reaberta com uma meta não atingida.",
        409,
      );
    let status: CampaignStatus;
    if (requestedStatus === "DRAFT") status = "DRAFT";
    else if (receivedQuantity >= goalQuantity) status = "COMPLETED";
    else status = "ACTIVE";

    return tx.campaign.update({
      where: { id: current.id },
      data: {
        ...data,
        startDate,
        endDate,
        receivedQuantity,
        status,
        completionReason: status === "COMPLETED" ? "GOAL_REACHED" : null,
      },
      include: { category: true },
    });
  });
  return res.json(campaign);
}

export async function completeCampaign(req: Request, res: Response) {
  const id = routeId(req);
  const campaign = await serializable(async (tx) => {
    const organization = await findOrganizationForTransaction(tx, req.user!.id);
    if (!organization) throw new ApiError("ONG não encontrada.", 404);
    const current = await tx.campaign.findFirst({
      where: { id, organizationId: organization.id },
    });
    if (!current) throw new ApiError("Campanha não encontrada.", 404);
    if (current.status !== "ACTIVE")
      throw new ApiError(
        "Somente campanhas ativas podem ser concluídas manualmente.",
        409,
      );

    await tx.donation.updateMany({
      where: { campaignId: current.id, status: "PENDING" },
      data: { status: "CANCELED" },
    });
    const updated = await tx.campaign.updateMany({
      where: { id: current.id, organizationId: organization.id, status: "ACTIVE" },
      data: { status: "COMPLETED", completionReason: "MANUAL" },
    });
    if (updated.count !== 1)
      throw new ApiError("A campanha foi alterada por outra operação.", 409);
    return tx.campaign.findUniqueOrThrow({
      where: { id: current.id },
      include: { category: true },
    });
  });
  return res.json(campaign);
}

export async function deleteCampaign(req: Request, res: Response) {
  const id = routeId(req);
  const result = await serializable(async (tx) => {
    const organization = await findOrganizationForTransaction(tx, req.user!.id);
    if (!organization) throw new ApiError("ONG não encontrada.", 404);
    const campaign = await tx.campaign.findFirst({
      where: { id, organizationId: organization.id },
    });
    if (!campaign) throw new ApiError("Campanha não encontrada.", 404);
    if (campaign.status === "COMPLETED")
      throw new ApiError("Campanhas concluídas não podem ser alteradas.", 409);
    const donationCount = await tx.donation.count({
      where: { campaignId: campaign.id },
    });
    if (donationCount > 0) {
      await tx.donation.updateMany({
        where: { campaignId: campaign.id, status: "PENDING" },
        data: { status: "CANCELED" },
      });
      await tx.campaign.update({
        where: { id: campaign.id },
        data: { status: "CANCELED" },
      });
      return "canceled";
    }
    await tx.campaign.delete({ where: { id: campaign.id } });
    return "deleted";
  });
  if (result === "deleted") return res.status(204).send();
  return res.json({
    message: "Campanha cancelada; o histórico foi preservado.",
  });
}

export async function createDonation(req: Request, res: Response) {
  const data = donationCreateSchema.parse(req.body);
  const donation = await serializable(async (tx) => {
    const campaign = await tx.campaign.findUnique({
      where: { id: data.campaignId },
    });
    if (
      !campaign ||
      campaign.status !== "ACTIVE" ||
      campaign.startDate > new Date() ||
      isExpired(campaign.endDate)
    )
      throw new ApiError("Campanha indisponível para novas doações.", 400);
    return tx.donation.create({
      data: {
        donorId: req.user!.id,
        campaignId: campaign.id,
        quantity: data.quantity,
        note: data.note || null,
      },
      include: { campaign: { select: { id: true, title: true, unit: true } } },
    });
  });
  return res.status(201).json(donation);
}

export async function donorDonations(req: Request, res: Response) {
  return res.json(
    await prisma.donation.findMany({
      where: { donorId: req.user!.id },
      include: {
        campaign: { include: { category: true, organization: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function ngoDonations(req: Request, res: Response) {
  const organization = await findOrganization(req.user!.id);
  if (!organization)
    return res.status(404).json({ message: "ONG não encontrada." });
  return res.json(
    await prisma.donation.findMany({
      where: { campaign: { organizationId: organization.id } },
      include: {
        donor: { select: { id: true, name: true, email: true } },
        campaign: { include: { category: true, organization: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function donationStatus(req: Request, res: Response) {
  const data = donationStatusSchema.parse(req.body);
  const id = routeId(req);
  const donation = await serializable(async (tx) => {
    const organization = await findOrganizationForTransaction(tx, req.user!.id);
    if (!organization) throw new ApiError("ONG não encontrada.", 404);
    const current = await tx.donation.findFirst({
      where: {
        id,
        campaign: { organizationId: organization.id },
      },
      include: { campaign: true },
    });
    if (!current) throw new ApiError("Doação não encontrada.", 404);
    if (current.status !== "PENDING")
      throw new ApiError("Doação já processada.", 409);
    if (current.campaign.status === "CANCELED")
      throw new ApiError(
        "Doação pendente de campanha cancelada não pode ser confirmada.",
        409,
      );
    if (
      current.campaign.status === "COMPLETED" &&
      current.campaign.completionReason === "MANUAL"
    )
      throw new ApiError(
        "Doações pendentes de uma campanha concluída manualmente não podem ser confirmadas.",
        409,
      );

    const now = new Date();
    const updated = await tx.donation.updateMany({
      where: { id: current.id, status: "PENDING" },
      data: {
        status: data.status,
        receivedAt: data.status === "RECEIVED" ? now : null,
      },
    });
    if (updated.count !== 1) throw new ApiError("Doação já processada.", 409);

    if (data.status === "RECEIVED") {
      const received = await tx.donation.aggregate({
        where: { campaignId: current.campaignId, status: "RECEIVED" },
        _sum: { quantity: true },
      });
      const receivedQuantity = received._sum.quantity ?? 0;
      const status =
        current.campaign.status === "DRAFT"
          ? "DRAFT"
          : receivedQuantity >= current.campaign.goalQuantity
            ? "COMPLETED"
            : "ACTIVE";
      await tx.campaign.update({
        where: { id: current.campaignId },
        data: {
          receivedQuantity,
          status,
          completionReason:
            status === "COMPLETED" ? "GOAL_REACHED" : null,
        },
      });
    }
    return tx.donation.findUniqueOrThrow({
      where: { id: current.id },
      include: { campaign: { select: { id: true, title: true, unit: true } } },
    });
  });
  return res.json(donation);
}

export async function ngoDashboard(req: Request, res: Response) {
  const organization = await findOrganization(req.user!.id);
  if (!organization)
    return res.status(404).json({ message: "ONG não encontrada." });
  const [campaigns, received, receivedDonations, pendingDonations] =
    await Promise.all([
      prisma.campaign.findMany({
        where: { organizationId: organization.id },
        include: { category: true },
      }),
      prisma.donation.findMany({
        where: {
          campaign: { organizationId: organization.id },
          status: "RECEIVED",
        },
        select: {
          donorId: true,
          quantity: true,
          receivedAt: true,
          campaign: {
            select: { unit: true, category: { select: { name: true } } },
          },
        },
      }),
      prisma.donation.count({
        where: {
          campaign: { organizationId: organization.id },
          status: "RECEIVED",
        },
      }),
      prisma.donation.count({
        where: {
          campaign: { organizationId: organization.id },
          status: "PENDING",
        },
      }),
    ]);
  const monthly = monthlyReceived();
  const unitTotals: Record<string, number> = {};
  for (const donation of received) {
    unitTotals[donation.campaign.unit] =
      (unitTotals[donation.campaign.unit] ?? 0) + donation.quantity;
    const month =
      donation.receivedAt &&
      `${donation.receivedAt.getFullYear()}-${String(donation.receivedAt.getMonth() + 1).padStart(2, "0")}`;
    const monthData = month ? monthly.indexes.get(month) : undefined;
    if (monthData) {
      monthData.receivedDonations += 1;
      monthData.quantityByUnit[donation.campaign.unit] =
        (monthData.quantityByUnit[donation.campaign.unit] ?? 0) +
        donation.quantity;
    }
  }
  const rates = campaigns
    .filter((campaign) => !["DRAFT", "CANCELED"].includes(campaign.status))
    .map((campaign) =>
      Math.min(100, (campaign.receivedQuantity / campaign.goalQuantity) * 100),
    );
  return res.json({
    kpis: {
      activeCampaigns: campaigns.filter(
        (campaign) =>
          campaign.status === "ACTIVE" &&
          campaign.startDate <= new Date() &&
          !isExpired(campaign.endDate),
      ).length,
      completedCampaigns: campaigns.filter(
        (campaign) => campaign.status === "COMPLETED",
      ).length,
      campaignsCompletedByGoal: campaigns.filter(
        (campaign) =>
          campaign.status === "COMPLETED" &&
          (campaign.completionReason === "GOAL_REACHED" ||
            (campaign.completionReason === null &&
              campaign.receivedQuantity >= campaign.goalQuantity)),
      ).length,
      campaignsCompletedManually: campaigns.filter(
        (campaign) =>
          campaign.status === "COMPLETED" &&
          campaign.completionReason === "MANUAL",
      ).length,
      receivedDonations,
      pendingDonations,
      uniqueDonors: new Set(received.map((donation) => donation.donorId)).size,
      averageCompletionRate: Number(
        (rates.length
          ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
          : 0
        ).toFixed(1),
      ),
    },
    receivedByUnit: Object.entries(unitTotals).map(([unit, total]) => ({
      unit,
      total,
    })),
    donationsByCategory: totalsByCategoryAndUnit(received),
    monthlyEvolution: monthly.months,
    topCampaigns: campaigns
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        goalQuantity: campaign.goalQuantity,
        receivedQuantity: campaign.receivedQuantity,
        unit: campaign.unit,
        completionReason: campaign.completionReason,
        progress: Math.min(
          100,
          Math.round((campaign.receivedQuantity / campaign.goalQuantity) * 100),
        ),
      }))
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 5),
  });
}

export async function donorDashboard(req: Request, res: Response) {
  const donations = await prisma.donation.findMany({
    where: { donorId: req.user!.id },
    include: { campaign: { include: { category: true, organization: true } } },
    orderBy: { createdAt: "desc" },
  });
  const received = donations.filter(
    (donation) => donation.status === "RECEIVED",
  );
  const monthly = monthlyReceived();
  const unitTotals: Record<string, number> = {};
  for (const donation of received) {
    const unit = donation.campaign.unit;
    unitTotals[unit] = (unitTotals[unit] ?? 0) + donation.quantity;
    const month =
      donation.receivedAt &&
      `${donation.receivedAt.getFullYear()}-${String(donation.receivedAt.getMonth() + 1).padStart(2, "0")}`;
    const monthData = month ? monthly.indexes.get(month) : undefined;
    if (monthData) {
      monthData.receivedDonations += 1;
      monthData.quantityByUnit[unit] =
        (monthData.quantityByUnit[unit] ?? 0) + donation.quantity;
    }
  }
  return res.json({
    kpis: {
      totalDonations: donations.length,
      confirmedDonations: received.length,
      pendingDonations: donations.filter(
        (donation) => donation.status === "PENDING",
      ).length,
      campaignsSupported: new Set(
        received.map((donation) => donation.campaignId),
      ).size,
      organizationsHelped: new Set(
        received.map((donation) => donation.campaign.organizationId),
      ).size,
    },
    receivedByUnit: Object.entries(unitTotals).map(([unit, total]) => ({
      unit,
      total,
    })),
    donationsByCategory: totalsByCategoryAndUnit(received),
    monthlyEvolution: monthly.months,
    recentDonations: donations.slice(0, 5),
  });
}
