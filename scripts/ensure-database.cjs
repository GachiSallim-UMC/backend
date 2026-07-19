const { Client } = require('pg');

const databaseName = process.argv[2];

function buildAdminUrl(databaseUrl) {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.searchParams.delete('schema');
  adminUrl.searchParams.set('uselibpqcompat', 'true');

  return adminUrl.toString();
}

async function main() {
  if (!databaseName || !/^[a-z][a-z0-9_]+$/.test(databaseName)) {
    throw new Error('A safe PostgreSQL database name is required.');
  }

  const adminUrl = buildAdminUrl(process.env.DATABASE_URL);

  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { buildAdminUrl };
