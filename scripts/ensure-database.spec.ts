// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildAdminUrl } = require('./ensure-database.cjs') as {
  buildAdminUrl: (databaseUrl: string) => string;
};

describe('buildAdminUrl', () => {
  it('preserves the required TLS mode while switching to the admin database', () => {
    const databaseUrl =
      'postgresql://postgres:secret@database.example.com:5432/gachisallim_develop?schema=public&sslmode=require';

    expect(buildAdminUrl(databaseUrl)).toBe(
      'postgresql://postgres:secret@database.example.com:5432/postgres?sslmode=require&uselibpqcompat=true',
    );
  });
});
