export async function onRequest({ request }: { request: Request }): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, 'https://wiserule.nunes-jonathan.workers.dev');

  // Encaminha método, cabeçalhos, corpo, cookies e parâmetros da URL ao Worker.
  return fetch(new Request(upstreamUrl, request));
}