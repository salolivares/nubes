import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../common/api/root';

export const trpc = createTRPCReact<AppRouter>();
