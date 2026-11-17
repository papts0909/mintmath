// Types for scripts/b2-cors.mjs (used by the web app and the tests).
export interface CorsRule {
  corsRuleName: string;
  allowedOrigins: string[];
  allowedOperations: string[];
  allowedHeaders: string[];
  exposeHeaders: string[];
  maxAgeSeconds: number;
}
export const RULE_NAME: string;
export const DEFAULT_ORIGINS: string[];
export function mathpadRule(origins: string[]): CorsRule;
export function parseOrigins(text: string): string[];
export function mergeRules(existing: Partial<CorsRule>[] | undefined, rule: CorsRule): Partial<CorsRule>[];
export function parseArgs(args: string[]): {
  keyId?: string;
  appKey?: string;
  bucketName?: string;
  origins: string[];
};
export function setMathpadCors(
  opts: { keyId: string; appKey: string; bucketName: string; origins: string[] },
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Partial<CorsRule>[]>;
