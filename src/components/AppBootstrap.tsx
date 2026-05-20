import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  CssBaseline,
  LinearProgress,
  ThemeProvider,
  Typography,
} from "@mui/material";
import App from "../App";
import { waitForApi } from "../db";
import { createAppTheme } from "../theme";

const bootTheme = createAppTheme("dark");

export default function AppBootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ attempt: 0, max: 1 });
  const [retryKey, setRetryKey] = useState(0);

  const connect = useCallback(async (signal: AbortSignal) => {
    setError(null);
    setProgress({ attempt: 0, max: 1 });
    try {
      await waitForApi({
        signal,
        onProgress: (attempt, max) => setProgress({ attempt, max }),
      });
      setReady(true);
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to connect to API.");
    }
  }, []);

  useEffect(() => {
    if (ready) return;
    const controller = new AbortController();
    const id = window.setTimeout(() => {
      void connect(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [connect, ready, retryKey]);

  if (ready) {
    return <App />;
  }

  const percent =
    progress.max > 0
      ? Math.min(100, Math.round((progress.attempt / progress.max) * 100))
      : 0;
  const isProd = import.meta.env.PROD;

  return (
    <ThemeProvider theme={bootTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
        }}
      >
        <Box sx={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: "bold" }}>
            Karaoke Companion
          </Typography>

          {!error ? (
            <>
              <CircularProgress sx={{ my: 3 }} />
              <Typography color="text.secondary">Connecting to server…</Typography>
              <LinearProgress
                variant="determinate"
                value={percent}
                sx={{ mt: 2, borderRadius: 1 }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
              >
                {progress.attempt > 0
                  ? `Attempt ${progress.attempt} of ${progress.max}`
                  : "Starting…"}
              </Typography>
              {isProd && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 2 }}
                >
                  Free hosting may take up to a minute to wake up after idle
                  time.
                </Typography>
              )}
            </>
          ) : (
            <>
              <Alert severity="error" sx={{ mb: 2, textAlign: "left" }}>
                {error}
              </Alert>
              <Button
                variant="contained"
                onClick={() => {
                  setError(null);
                  setRetryKey((k) => k + 1);
                }}
              >
                Retry
              </Button>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
                sx={{ mt: 2 }}
              >
                {isProd ? (
                  <>
                    Check Turso and JWT secrets on Render, then redeploy if
                    needed.
                  </>
                ) : (
                  <>
                    Run <code>npm run dev</code> and configure <code>.env</code>.
                  </>
                )}
              </Typography>
            </>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
