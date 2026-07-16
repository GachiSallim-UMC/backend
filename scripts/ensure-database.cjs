const { Client } = require('pg');

const databaseName = process.argv[2];

if (!databaseName || !/^[a-z][a-z0-9_]+$/.test(databaseName)) {
  throw new Error('A safe PostgreSQL database name is required.');
}

async function main() {
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';

  const client = new Client({ connectionString: adminUrl.toString() });
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
