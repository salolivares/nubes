import { useParams } from 'react-router-dom';
import { z } from 'zod';

/** A route id param: a string of digits that is a positive safe integer. */
export const idParam = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

/** Params of every `/photoset/:photosetId/...` route. */
export const photosetRouteParams = z.object({ photosetId: idParam });

type RouteParamsSchema = z.ZodType<unknown, Record<string, string | undefined>>;

/**
 * Parse the current route's params with `schema`. Returns `null` when they don't match, so the
 * caller can redirect with `WizardRedirect` (see `components/wizard-step.tsx`). Use this instead of
 * reading `useParams()` directly.
 */
export function useRouteParams<S extends RouteParamsSchema>(schema: S): z.output<S> | null {
  const params = useParams();
  const result = schema.safeParse(params);
  return result.success ? result.data : null;
}
