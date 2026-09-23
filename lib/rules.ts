// Shared by the server and the browser: no database code here.

export type Flag = { quote: string; issue: string; fix?: string };
export type Check = { key: string; name: string; gate: boolean; score: number; summary: string; flags: Flag[] };
export type HumanizerResult = { checks: Check[]; summary: string; overall: number; passed: boolean; model: string };

/** Publishing needs each core check at 80+ and the core average at 85+. SEO is advice only. */
export const CHECK_MIN = 80;
export const OVERALL_MIN = 85;
