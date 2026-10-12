/**
 * Central TanStack Query caching policy.
 * Consolidates staleTime and gcTime across all application domains (Section 6.1).
 */
export const queryPolicy = {
  // Global QueryClient defaults
  defaults: {
    staleTime: 15_000,
    gcTime: 30 * 60 * 1000, // 30 minutes in browser memory
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  },

  // Reports domain
  reports: {
    portfolio: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 60 * 60 * 1000, // 60 minutes
    },
    projectDetail: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 60 * 60 * 1000, // 60 minutes
    },
    subTabs: {
      staleTime: 3 * 60 * 1000, // 3 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
    },
    risks: {
      staleTime: 3 * 60 * 1000, // 3 minutes
      gcTime: 30 * 60 * 1000,
    },
    tasks: {
      staleTime: 3 * 60 * 1000, // 3 minutes
      gcTime: 30 * 60 * 1000,
    },
    members: {
      staleTime: 3 * 60 * 1000, // 3 minutes
      gcTime: 30 * 60 * 1000,
    },
    history: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000,
    },
  },

  // Board and issue lists
  board: {
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 30 * 60 * 1000,
  },

  // Releases, Watch, Stale
  releases: {
    staleTime: 90 * 1000, // 1.5 minutes
    gcTime: 30 * 60 * 1000,
  },
  staleIssues: {
    staleTime: 90 * 1000,
    gcTime: 30 * 60 * 1000,
  },
  watch: {
    staleTime: 90 * 1000,
    gcTime: 30 * 60 * 1000,
  },

  // Leaderboard
  leaderboard: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  },

  // Project catalog & metadata
  catalog: {
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000,
  },

  // Sync status
  sync: {
    active: {
      staleTime: 2_500, // 2.5 seconds
      gcTime: 60 * 1000,
    },
    status: {
      staleTime: 10_000, // 10 seconds
      gcTime: 60 * 1000,
    },
  },

  // Notifications
  notifications: {
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
  },
} as const;
