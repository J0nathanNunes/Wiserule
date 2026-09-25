export function onRequest(context: { request: Request }): Promise<Response> {
  var incomingUrl = new URL(context.request.url);
  var upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, 'https://wiserule.nunes-jonathan.workers.dev');

  // Encaminha método, cabeçalhos, corpo, cookies e parâmetros da URL ao Worker.
  return fetch(new Request(upstreamUrl, context.request));
}