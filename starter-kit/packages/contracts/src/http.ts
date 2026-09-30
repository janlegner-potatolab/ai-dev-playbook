import { z } from "zod";

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const fieldErrorSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  retryable: z.boolean(),
  trace_id: z.string(),
  errors: z.array(fieldErrorSchema).optional(),
});
export type Problem = z.infer<typeof problemSchema>;

export const pageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageDtoSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    data: z.array(item),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  });
}
export type PageDto<Item> = { data: Item[]; next_cursor: string | null; has_more: boolean };
export type Page<Item> = { data: Item[]; nextCursor: string | null; hasMore: boolean };

export function toPageDto<Item, Dto>(page: Page<Item>, toDto: (item: Item) => Dto): PageDto<Dto> {
  return { data: page.data.map(toDto), next_cursor: page.nextCursor, has_more: page.hasMore };
}

export function fromPageDto<Dto, Item>(
  dto: PageDto<Dto>,
  fromDto: (item: Dto) => Item,
): Page<Item> {
  return { data: dto.data.map(fromDto), nextCursor: dto.next_cursor, hasMore: dto.has_more };
}
