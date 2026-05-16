import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';

/** Clear PWA caches, remove service workers, and reload to fetch the latest deployed app. */
async function forceAppReload(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (reg) => {
        try {
          await reg.update();
        } catch {
          /* offline or update blocked */
        }
      })
    );
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  }

  window.location.reload();
}

type DevGitStamp = { commit: string; branch: string };

const AdminAppReload: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devGit, setDevGit] = useState<DevGitStamp | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const load = () => {
      void fetch('/__dev/git-stamp.json')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
        .then((d: unknown) => {
          const o = d as { commit?: unknown; branch?: unknown };
          setDevGit({
            commit: typeof o.commit === 'string' ? o.commit : __COMMIT_HASH__,
            branch: typeof o.branch === 'string' ? o.branch : __BRANCH_NAME__,
          });
        })
        .catch(() => setDevGit(null));
    };
    load();
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const commitShown =
    import.meta.env.DEV && devGit ? devGit.commit : __COMMIT_HASH__;
  const branchShown =
    import.meta.env.DEV && devGit ? devGit.branch : __BRANCH_NAME__;

  const handleReload = async () => {
    setLoading(true);
    setMessage(null);
    try {
      setMessage("Restarting… loading the latest app from the server.");
      await forceAppReload();
    } catch (err) {
      console.error(err);
      setMessage("Update step failed; reloading this tab anyway.");
      window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 480, mx: 'auto', mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
        <SystemUpdateAltIcon color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
          Restart &amp; update
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Build <strong>{commitShown}</strong>
        {branchShown !== 'unknown' && (
          <> · branch <strong>{branchShown}</strong></>
        )}
        {import.meta.env.DEV && devGit && (
          <>
            {' '}
            <Typography component="span" variant="caption" color="text.secondary">
              (live repo; no dev-server restart needed)
            </Typography>
          </>
        )}
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Checks for a newer service worker, clears offline caches, unregisters the PWA worker, then
        reloads so this tab pulls the latest JavaScript and assets from the server (same as after a
        deploy). Your login stays in this browser unless something goes wrong.
      </Typography>

      {message && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      <Button
        variant="contained"
        color="primary"
        fullWidth
        size="large"
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
        onClick={handleReload}
        disabled={loading}
      >
        Restart and update to latest
      </Button>
    </Paper>
  );
};

export default AdminAppReload;
