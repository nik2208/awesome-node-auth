export function createRequest(opts: {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}) {
  return {
    cookies: opts.cookies ?? {},
    headers: opts.headers ?? {},
    body: opts.body ?? {},
    query: opts.query ?? {},
    user: undefined,
  };
}

export function createResponse() {
  const cookies: Record<string, unknown> = {};
  const cookieOptions: Record<string, Record<string, unknown>> = {};
  const clearedCookies: string[] = [];
  const clearedCookieOptions: Record<string, Record<string, unknown>> = {};
  let statusCode = 200;
  let jsonBody: unknown;

  const res = {
    cookies,
    cookieOptions,
    clearedCookies,
    clearedCookieOptions,
    get statusCode() { return statusCode; },
    status(code: number) { statusCode = code; return res; },
    json(body: unknown) { jsonBody = body; return res; },
    get jsonBody() { return jsonBody; },
    cookie(name: string, value: unknown, opts?: Record<string, unknown>) {
      cookies[name] = value;
      if (opts) cookieOptions[name] = opts;
      return res;
    },
    clearCookie(name: string, opts?: Record<string, unknown>) {
      clearedCookies.push(name);
      if (opts) clearedCookieOptions[name] = opts;
      delete cookies[name];
      return res;
    },
    redirect(_url: string) { return res; },
  };
  return res;
}
