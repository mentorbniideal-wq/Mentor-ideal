// Capture actual entrypoint callbacks; malformed bodies must fail before DB access.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
Deno.test('API entrypoints reject JSON null, arrays and scalars with a 400 response', async () => {
  const originalServe = Object.getOwnPropertyDescriptor(Deno, 'serve')!;
  const originalSecret = Deno.env.get('CRON_SECRET');
  let handler: ((request: Request) => Promise<Response>) | undefined;
  Object.defineProperty(Deno, 'serve', { configurable: true, value: (callback: typeof handler) => { handler = callback; return {}; } });
  Deno.env.set('CRON_SECRET', 'test-only-cron');
  try {
    for (const entry of ['../api/index.ts', '../admin-api/index.ts', '../liff-api/index.ts', '../cron-jobs/index.ts']) {
      handler = undefined;
      await import(entry);
      assert(handler, `${entry} must register an entrypoint`);
      for (const body of [null, [], 'text', 1, true]) {
        const response = await (handler as (request: Request) => Promise<Response>)(new Request('https://local.test', {
          method: 'POST', headers: { Authorization: 'Bearer test-only-cron', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }));
        assert(response.status === 400, `${entry}: ${JSON.stringify(body)} must return 400, got ${response.status}`);
        await response.text();
      }
    }
  } finally {
    Object.defineProperty(Deno, 'serve', originalServe);
    if (originalSecret === undefined) Deno.env.delete('CRON_SECRET'); else Deno.env.set('CRON_SECRET', originalSecret);
  }
});
