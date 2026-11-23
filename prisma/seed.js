// prisma/seed.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const clients = [
  {
    name: 'Example Dental Clinic',
    websiteUrl: 'https://example-dental-clinic.com',
    businessType: 'Dental clinic',
    city: 'Pune',
    state: 'Maharashtra',
    whatsapp: '+919999900001',
    email: 'owner@example-dental-clinic.com',
  },
  {
    name: 'Demo Realty Group',
    websiteUrl: 'https://example.com',
    businessType: 'Real estate',
    city: 'Jaipur',
    state: 'Rajasthan',
    whatsapp: '+919999900002',
    email: 'hello@demo-realty.example',
  },
  {
    name: 'Demo Healthcare Centre',
    websiteUrl: 'https://example.org',
    businessType: 'Healthcare',
    city: 'Mumbai',
    state: 'Maharashtra',
    whatsapp: '+919999900003',
    email: 'info@demo-healthcare.example',
  },
];

async function main() {
  for (const c of clients) {
    const row = await prisma.client.upsert({
      where: { websiteUrl: c.websiteUrl },
      update: {},
      create: c,
    });
    console.log(`Seeded: ${row.name} (${row.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
