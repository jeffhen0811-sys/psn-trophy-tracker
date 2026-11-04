export class AppError extends Error {}
// Erros da biblioteca podem conter respostas de autenticação. Nunca exibi-los.
export function errorKind(error: unknown): 'auth' | 'rate' | 'other' {
  const message = error instanceof Error ? error.message : '';
  if (/429|rate.?limit|too many requests/i.test(message)) return 'rate';
  if (/401|unauthorized|invalid.?token|expired|invalid_grant|access token/i.test(message)) return 'auth';
  return 'other';
}
