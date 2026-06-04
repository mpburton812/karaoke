import React, { useState, Suspense, useMemo, useEffect, useCallback } from 'react';
import { 
  Container, 
  Box, 
  Tabs, 
  Tab, 
  Typography, 
  ThemeProvider, 
  CssBaseline,
  AppBar,
  Toolbar,
  IconButton,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import { db } from './db';
import { clearSession, fetchCurrentUser, type AuthUser } from './api/auth';
import { setSessionExpiredHandler } from './api/session';
import {
  KARAOKE_OPEN_SONG_EVENT,
  type KaraokeOpenSongDetail,
} from './lib/karaokeEvents';
import { lazyRetry } from './lib/lazyRetry';
import AppConfigDialog from './components/AppConfigDialog';
import WelcomeMessageDialog from './components/WelcomeMessageDialog';
import { logCatalogClientEvent, logUserAction } from './api/eventLog';
import { reportClientBuildOnce } from './lib/reportBuild';
import { isWelcomeDismissed } from './lib/welcomeMessage';
import { createAppTheme, type ThemeMode } from './theme';

// Lazy load tab components (retry once on chunk load failure after deploy)
const SavedSongs = lazyRetry(() => import('./components/SavedSongs'));
const TagManager = lazyRetry(() => import('./components/TagManager'));
const LocationManager = lazyRetry(() => import('./components/LocationManager'));
const Login = lazyRetry(() => import('./components/Login'));
const Stats = lazyRetry(() => import('./components/Stats'));
const EventLogViewer = lazyRetry(() => import('./components/EventLogViewer'));
const GodMode = lazyRetry(() => import('./components/GodMode'));

type SpotifySnackbarState = {
  open: boolean;
  message: string;
  severity: "success" | "error" | "info";
};
const SONGS_TAB_INDEX = 0;
const GOD_MODE_TAB_INDEX = 4;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function App() {
  const [value, setValue] = useState(SONGS_TAB_INDEX);
  const [configOpen, setConfigOpen] = useState(() =>
    new URLSearchParams(window.location.search).has("spotify")
  );
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [songIdToOpenFromExplorer, setSongIdToOpenFromExplorer] = useState<number | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme_mode') as ThemeMode) || 'dark';
  });

  const theme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem('theme_mode', mode);
  };

  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const savedUser = localStorage.getItem('karaoke_user');
    const token = localStorage.getItem('karaoke_token');
    if (savedUser && token) {
      try {
        return JSON.parse(savedUser);
      } catch {
        clearSession();
      }
    } else if (savedUser || token) {
      clearSession();
    }
    return null;
  });
  const isAdmin = currentUser?.accessLevel === 'admin';
  const currentUserId = currentUser?.id;

  useEffect(() => {
    setSessionExpiredHandler((message) => {
      setCurrentUser(null);
      setSessionNotice(message);
      setValue(0);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const id = window.setTimeout(() => {
      void fetchCurrentUser()
        .then((user) => {
          setCurrentUser(user);
          localStorage.setItem('karaoke_user', JSON.stringify(user));
        })
        .catch(() => {
          /* session handler clears expired sessions */
        });
    }, 0);
    return () => window.clearTimeout(id);
  }, [currentUserId]);

  const [spotifySnackbar, setSpotifySnackbar] = useState<SpotifySnackbarState>({
    open: false,
    message: "",
    severity: "success",
  });

  /** OAuth return: run once on load (not tied to React user state) so ?spotify= is never missed. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotify = params.get("spotify");
    if (!spotify) return;

    const token = localStorage.getItem("karaoke_token");
    const saved = localStorage.getItem("karaoke_user");
    const loggedIn = Boolean(token && saved);

    const notifySpotifyListeners = () => {
      window.dispatchEvent(new Event("karaoke-spotify-oauth-return"));
    };

    let nextSnackbar: SpotifySnackbarState | null = null;
    let shouldNotifySpotifyListeners = false;

    if (spotify === "connected") {
      if (loggedIn) {
        nextSnackbar = {
          open: true,
          message: "Spotify account connected.",
          severity: "success",
        };
        shouldNotifySpotifyListeners = true;
      } else {
        nextSnackbar = {
          open: true,
          message:
            "Spotify approved the link. Sign in with the same account to use playlist features.",
          severity: "info",
        };
      }
    } else if (spotify === "error") {
      const rawReason = params.get("reason") || "unknown";
      let displayReason = rawReason;
      try {
        displayReason = decodeURIComponent(rawReason);
      } catch {
        /* use raw */
      }
      nextSnackbar = {
        open: true,
        message: `Spotify connection failed: ${displayReason}`,
        severity: "error",
      };
      if (loggedIn) {
        shouldNotifySpotifyListeners = true;
      }
    }

    params.delete("spotify");
    params.delete("reason");
    const q = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (q ? `?${q}` : "")
    );

    window.setTimeout(() => {
      if (nextSnackbar) {
        setSpotifySnackbar(nextSnackbar);
      }
      if (loggedIn) {
        setConfigOpen(true);
      }
      // Defer until after React commits Settings + SpotifyConnect (listeners miss same-tick dispatch).
      if (shouldNotifySpotifyListeners) {
        notifySpotifyListeners();
      }
    }, 0);
  }, []);

  const handleLogin = (user: AuthUser) => {
    setSessionNotice(null);
    setCurrentUser(user);
    localStorage.setItem('karaoke_user', JSON.stringify(user));
  };

  const handleUserUpdated = useCallback((user: AuthUser, _token: string) => {
    setCurrentUser(user);
    localStorage.setItem('karaoke_user', JSON.stringify(user));
  }, []);

  const handleLogout = () => {
    if (currentUser) {
      logCatalogClientEvent("user_logout", "User signed out");
    }
    setCurrentUser(null);
    setSessionNotice(null);
    clearSession();
    setValue(0);
  };

  const handleNukeData = async () => {
    if (!currentUser) return;
    const confirmed = window.confirm(
      "CRITICAL WARNING: This will permanently delete ALL your songs, performances, tags, and locations. This action CANNOT be undone. Are you absolutely sure?"
    );
    
    if (confirmed) {
      logUserAction("User cleared all personal configuration (nuke)", "data");
      try {
        await db.batch([
          { sql: "DELETE FROM performance_tags WHERE performance_id IN (SELECT id FROM performances WHERE user_id = ?)", args: [currentUser.id] },
          { sql: "DELETE FROM song_tags WHERE song_id IN (SELECT id FROM songs WHERE user_id = ?)", args: [currentUser.id] },
          { sql: "DELETE FROM performances WHERE user_id = ?", args: [currentUser.id] },
          { sql: "DELETE FROM songs WHERE user_id = ?", args: [currentUser.id] },
          { sql: "DELETE FROM tags WHERE user_id = ?", args: [currentUser.id] },
          { sql: "DELETE FROM locations WHERE user_id = ?", args: [currentUser.id] }
        ]);
        alert("Account wiped successfully.");
        window.location.reload();
      } catch (err) {
        console.error("Nuke failed:", err);
        alert("Failed to wipe data. Check console for details.");
      }
    }
  };

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const handleSongIdOpenConsumed = useCallback(() => {
    setSongIdToOpenFromExplorer(null);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    reportClientBuildOnce();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      setWelcomeOpen(false);
      return;
    }
    if (new URLSearchParams(window.location.search).has("spotify")) return;
    setWelcomeOpen(!isWelcomeDismissed(currentUser.id));
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<KaraokeOpenSongDetail>;
      const id = ce.detail?.songId;
      if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) return;
      setSongIdToOpenFromExplorer(id);
      setValue(SONGS_TAB_INDEX);
    };
    window.addEventListener(KARAOKE_OPEN_SONG_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(KARAOKE_OPEN_SONG_EVENT, handler as EventListener);
  }, [currentUser]);

  if (!currentUser) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>}>
          <Login onLogin={handleLogin} sessionNotice={sessionNotice} />
        </Suspense>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            Karaoke Companion
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                maxWidth: { xs: 120, sm: 'none' },
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentUser.username}
            </Typography>
            <IconButton
              color="inherit"
              aria-label="Settings"
              onClick={() => setConfigOpen(true)}
            >
              <SettingsIcon />
            </IconButton>
            <IconButton color="inherit" aria-label="Log out" onClick={handleLogout}>
              <LogoutIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 3 }}>
        <Box sx={{ width: '100%', overflow: 'visible', pt: 0.5, px: { xs: 0.5, sm: 1 } }}>
          <Tabs
            value={value}
            onChange={handleChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              overflow: 'visible !important',
              '& .MuiTabs-list': {
                paddingTop: '20px',
                paddingBottom: '18px',
                gap: 1,
              },
              '& .MuiTab-root': {
                minWidth: { xs: 'auto', sm: 88 },
              },
            }}
          >
            <Tab label="Songs" />
            <Tab label="Places" />
            <Tab label="Tags" />
            <Tab label="Stats" />
            {isAdmin && <Tab label="God mode" />}
          </Tabs>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }} />
        </Box>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>}>
          <CustomTabPanel value={value} index={0}>
            <SavedSongs
              currentUser={currentUser}
              songIdToOpen={songIdToOpenFromExplorer}
              onSongIdOpenConsumed={handleSongIdOpenConsumed}
            />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <LocationManager currentUser={currentUser} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={2}>
            <TagManager currentUser={currentUser} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={3}>
            <Stats currentUser={currentUser} />
          </CustomTabPanel>
          {isAdmin && (
            <CustomTabPanel value={value} index={GOD_MODE_TAB_INDEX}>
              <EventLogViewer />
              <GodMode />
            </CustomTabPanel>
          )}
        </Suspense>
      </Container>

      <WelcomeMessageDialog
        open={welcomeOpen}
        userId={currentUser.id}
        onClose={() => setWelcomeOpen(false)}
      />

      <AppConfigDialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        currentUser={currentUser}
        isAdmin={isAdmin}
        themeMode={themeMode}
        onThemeChange={handleThemeChange}
        onUserUpdated={handleUserUpdated}
        onNukeData={handleNukeData}
        onOpenWelcome={() => setWelcomeOpen(true)}
      />
      
      <Snackbar
        open={spotifySnackbar.open}
        autoHideDuration={8000}
        onClose={() => setSpotifySnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={spotifySnackbar.severity}
          variant="filled"
          onClose={() => setSpotifySnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {spotifySnackbar.message}
        </Alert>
      </Snackbar>

      <Box component="footer" sx={{ 
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        py: 0.5, 
        px: 2, 
        backgroundColor: 'background.default',
        borderTop: 1,
        borderColor: 'divider',
        zIndex: 1100,
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.65rem', opacity: 0.7, fontFamily: 'monospace' }}>
          {__COMMIT_HASH__}
        </Typography>
      </Box>
    </ThemeProvider>
  );
}

export default App;
