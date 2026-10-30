function destination(value: string) {
  const url = new URL(value);
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error();
  const host = url.hostname
    .replace(/-pooler(?=\.)/, "")
    .replace(/^(localhost|\[::1\])$/, "127.0.0.1");
  return `${host}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
}

export function assertIsolatedTestDatabase(
  values: Record<string, string | undefined>,
) {
  try {
    if (!values.TEST_DATABASE_URL) throw new Error();
    const test = destination(values.TEST_DATABASE_URL);
    for (const app of [values.DATABASE_URL, values.DATABASE_DIRECT_URL])
      if (app && destination(app) === test) throw new Error();
  } catch {
    throw new Error(
      "Database tests require TEST_DATABASE_URL to point to a separate database from DATABASE_URL/DATABASE_DIRECT_URL. No database tests were started.",
    );
  }
}
