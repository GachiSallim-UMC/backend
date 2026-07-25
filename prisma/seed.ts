import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RULE_CATEGORIES = [
  { name: '소음', sortOrder: 1 },
  { name: '청소/위생 (기존의 청결, 쓰레기 포함)', sortOrder: 2 },
  { name: '주방/식사', sortOrder: 3 },
  { name: '화장실/욕실', sortOrder: 4 },
  { name: '방문객', sortOrder: 5 },
  { name: '안전/보안', sortOrder: 6 },
  { name: '기타', sortOrder: 7 },
];

async function main() {
  for (const category of RULE_CATEGORIES) {
    await prisma.ruleCategory.upsert({
      where: { name: category.name },
      update: {
        sortOrder: category.sortOrder,
      },
      create: category,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('seed done: rule_categories');
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
