import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql(strings, ...values) as Promise<Record<string, any>[]>;
}

export type Post = {
  id: string;
  source_id: string | null;
  status: 'outline' | 'draft' | 'published';
  theme: string | null;
  notes: string | null;
  outline: string;
  doc: any;
  title: string;
  slug: string | null;
  body_html: string;
  published_html: string | null;
  published_title: string | null;
  excerpt: string;
  tags: string[];
  author: string;
  featured_image_id: string | null;
  qc: HumanizerResult | null;
  qc_hash: string | null;
  qc_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  source_name?: string | null;
  source_date?: string | null;
};

export { CHECK_MIN, OVERALL_MIN, type Flag, type Check, type HumanizerResult } from './rules';
import type { HumanizerResult } from './rules';
