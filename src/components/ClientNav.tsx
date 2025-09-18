// app/ClientNav.tsx (Client Component)

"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { Box, Skeleton } from "@mui/material";
import { useAuth } from "@/hooks/useAuth";

const SIDEBAR_WIDTH = 260;
const Sidebar = dynamic(() => import("@/components/Sidebar"), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" width={SIDEBAR_WIDTH} height="100vh" animation="wave" />,
});
const Navbar = dynamic(() => import("@/components/Navbar"), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height={64} animation="wave" />,
});

interface ClientNavProps {
  children: React.ReactNode;
}

export default function ClientNav({ children }: ClientNavProps) {
  const { user, loading: authLoading } = useAuth();
  const showUserNavigation = !authLoading && !!user;

  return (
    <Box sx={{ display: "flex", height: "100vh", width: "100vw", overflow: 'hidden' }}>
      {authLoading ? (
        <Skeleton variant="rectangular" width={SIDEBAR_WIDTH} height="100vh" animation="wave" />
      ) : showUserNavigation ? (
        <Box
          component="aside"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            bgcolor: 'background.paper',
            borderRight: (muiTheme) => `1px solid ${muiTheme.palette.divider}`,
          }}
        >
          <Suspense fallback={<Skeleton variant="rectangular" width={SIDEBAR_WIDTH} height="100vh" animation="wave" />}>
            <Sidebar />
          </Suspense>
        </Box>
      ) : null}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          overflow: 'hidden',
        }}
      >
        {authLoading ? (
          <Skeleton variant="rectangular" height={64} animation="wave" />
        ) : (
          <Suspense fallback={<Skeleton variant="rectangular" height={64} animation="wave" />}>
            <Navbar user={user} />
          </Suspense>
        )}

        <Box
          sx={{
            flexGrow: 1,
            overflowY: "auto",
            overflowX: "hidden",
            p: { xs: 2, sm: 3 },
          }}
        >
          {authLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Box sx={{ width: 'min(80%, 600px)' }}>
                <Skeleton variant="text" sx={{ fontSize: '2.5rem', mb: 2 }} />
                <Skeleton variant="rectangular" height={150} sx={{ mb: 1.5 }} />
                <Skeleton variant="rectangular" height={150} />
              </Box>
            </Box>
          ) : (
            <Suspense
              fallback={
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <Skeleton variant="rectangular" width="100%" height="100%" />
                </Box>
              }
            >
              {children}
            </Suspense>
          )}
        </Box>
      </Box>
    </Box>
  );
}
