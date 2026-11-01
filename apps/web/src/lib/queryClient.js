import { QueryClient } from '@tanstack/react-query';

// GET thử lại tối đa 2 lần chỉ với mất mạng (status 0) và 503; mutation không thử lại (UI §6)
export const shouldRetryQuery = (failureCount, error) =>
  failureCount < 2 && (error?.status === 0 || error?.status === 503);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetryQuery },
    mutations: { retry: false },
  },
});
