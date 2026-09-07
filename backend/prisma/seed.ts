import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  await prisma.donation.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  const cats = await Promise.all(
    [
      ["Alimentos", "alimentos"],
      ["Roupas", "roupas"],
      ["Higiene", "higiene"],
      ["Material escolar", "material-escolar"],
      ["Outros", "outros"],
    ].map(([name, slug]) => prisma.category.create({ data: { name, slug } })),
  );
  const by = Object.fromEntries(cats.map((c) => [c.slug, c]));
  const pass = await bcrypt.hash("123456", 10);
  const ngo = await prisma.user.create({
    data: {
      name: "Mariana Souza",
      email: "ong@demo.com",
      passwordHash: pass,
      role: "NGO",
      organization: {
        create: {
          name: "ONG Esperança",
          cnpj: "12345678000190",
          description:
            "Atuamos com famílias em situação de vulnerabilidade social.",
          phone: "(11) 99999-1000",
          city: "São Paulo",
          state: "SP",
        },
      },
    },
    include: { organization: true },
  });
  const ngo2 = await prisma.user.create({
    data: {
      name: "Carlos Lima",
      email: "vida@demo.com",
      passwordHash: pass,
      role: "NGO",
      organization: {
        create: {
          name: "Projeto Vida",
          description: "Projeto comunitário de educação e inclusão.",
          city: "São Paulo",
          state: "SP",
        },
      },
    },
    include: { organization: true },
  });
  const donors = [];
  for (const [name, email] of [
    ["João Doador", "doador@demo.com"],
    ["Ana Martins", "ana@demo.com"],
    ["Pedro Rocha", "pedro@demo.com"],
    ["Camila Santos", "camila@demo.com"],
  ])
    donors.push(
      await prisma.user.create({
        data: { name, email, passwordHash: pass, role: "DONOR" },
      }),
    );
  const c1 = await prisma.campaign.create({
    data: {
      organizationId: ngo.organization!.id,
      categoryId: by["alimentos"].id,
      title: "Cestas para Famílias",
      description:
        "Arrecadação de cestas básicas para famílias atendidas pela instituição.",
      goalQuantity: 100,
      unit: "cestas",
      status: "ACTIVE",
    },
  });
  const c2 = await prisma.campaign.create({
    data: {
      organizationId: ngo.organization!.id,
      categoryId: by["roupas"].id,
      title: "Campanha do Agasalho",
      description: "Arrecadação de peças de frio em bom estado para o inverno.",
      goalQuantity: 200,
      unit: "peças",
      status: "ACTIVE",
    },
  });
  const c3 = await prisma.campaign.create({
    data: {
      organizationId: ngo.organization!.id,
      categoryId: by["material-escolar"].id,
      title: "Volta às Aulas Solidária",
      description: "Kits escolares para crianças atendidas pela ONG.",
      goalQuantity: 60,
      unit: "kits",
      status: "ACTIVE",
    },
  });
  await prisma.campaign.create({
    data: {
      organizationId: ngo2.organization!.id,
      categoryId: by["higiene"].id,
      title: "Cuidado Essencial",
      description:
        "Produtos de higiene para famílias acompanhadas pelo projeto.",
      goalQuantity: 80,
      unit: "kits",
      status: "ACTIVE",
    },
  });
  const rows = [
    [0, c1.id, 12],
    [1, c1.id, 18],
    [2, c1.id, 20],
    [0, c2.id, 25],
    [2, c2.id, 30],
    [3, c2.id, 15],
    [1, c3.id, 20],
    [3, c3.id, 15],
  ] as const;
  for (const [i, campaignId, quantity] of rows)
    await prisma.donation.create({
      data: {
        donorId: donors[i].id,
        campaignId,
        quantity,
        status: "RECEIVED",
        receivedAt: new Date(),
      },
    });
  await prisma.donation.create({
    data: {
      donorId: donors[0].id,
      campaignId: c1.id,
      quantity: 5,
      status: "PENDING",
      note: "Posso entregar no próximo sábado.",
    },
  });
  for (const id of [c1.id, c2.id, c3.id]) {
    const a = await prisma.donation.aggregate({
      where: { campaignId: id, status: "RECEIVED" },
      _sum: { quantity: true },
    });
    const q = a._sum.quantity ?? 0;
    const c = await prisma.campaign.findUnique({ where: { id } });
    await prisma.campaign.update({
      where: { id },
      data: {
        receivedQuantity: q,
        status: q >= (c?.goalQuantity ?? 999999) ? "COMPLETED" : "ACTIVE",
      },
    });
  }
  console.log(
    "Seed concluído. ONG: ong@demo.com / 123456 | Doador: doador@demo.com / 123456",
  );
}
main().finally(() => prisma.$disconnect());
