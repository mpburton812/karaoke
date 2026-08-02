import React, { useState, Suspense, useMemo, useEffect, useCallback } from 'react';
import { 
  Container, 
  Box, 
  Typography, 
  ThemeProvider, 
  CssBaseline,
  AppBar,
  Toolbar,
  IconButton,
  CircularProgress,
  Snackbar,
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import PlaceIcon from '@mui/icons-material/Place';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import BarChartIcon from '@mui/icons-material/BarChart';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LogoutIcon from '@mui/icons-material/Logout';
import { wipeAccountData } from './api/repertoire';
import { clearSession, fetchCurrentUser, type AuthUser, type ImpersonationInfo } from './api/auth';
import { exitGodModeImpersonation } from './api/godMode';
import { setSessionExpiredHandler } from './api/session';
import {
  KARAOKE_OPEN_SONG_EVENT,
  type KaraokeOpenSongDetail,
} from './lib/karaokeEvents';
import { lazyRetry } from './lib/lazyRetry';
import AppConfigDialog from './components/AppConfigDialog';
import WelcomeMessageDialog from './components/WelcomeMessageDialog';
import SongShareNotifications from './components/SongShareNotifications';
import { logCatalogClientEvent, logUserAction } from './api/eventLog';
import { reportClientBuildOnce } from './lib/reportBuild';
import { isWelcomeDismissed } from './lib/welcomeMessage';
import { createAppTheme, type ThemeMode } from './theme';

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
  const [godModeOpen, setGodModeOpen] = useState(false);
  const [cogAnchor, setCogAnchor] = useState<null | HTMLElement>(null);
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
  const [impersonation, setImpersonation] = useState<ImpersonationInfo | null>(null);

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
        .then(({ user, impersonation: imp }) => {
          setCurrentUser(user);
          setImpersonation(imp);
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
      if (shouldNotifySpotifyListeners) {
        notifySpotifyListeners();
      }
    }, 0);
  }, []);

  const handleLogin = (user: AuthUser) => {
    setSessionNotice(null);
    setImpersonation(null);
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
    setImpersonation(null);
    setSessionNotice(null);
    clearSession();
    setValue(0);
    setCogAnchor(null);
    setGodModeOpen(false);
  };

  const handleExitImpersonation = async () => {
    try {
      const { user } = await exitGodModeImpersonation();
      setCurrentUser(user);
      setImpersonation(null);
      setValue(SONGS_TAB_INDEX);
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(
        err instanceof Error ? err.message : "Failed to exit impersonation."
      );
    }
  };

  const handleNukeData = async ({ deleteAccount }: { deleteAccount: boolean }) => {
    if (!currentUser) return;
    const accountLine = deleteAccount
      ? " Your login account will also be permanently deleted."
      : "";
    const confirmed = window.confirm(
      `CRITICAL WARNING: This will permanently delete ALL your songs, performances, tags, and locations.${accountLine} This action CANNOT be undone. Are you absolutely sure?`
    );

    if (confirmed) {
      logUserAction(
        deleteAccount
          ? "User cleared all data and deleted account"
          : "User cleared all personal configuration (nuke)",
        "data"
      );
      try {
        await wipeAccountData({ deleteAccount });
        if (deleteAccount) {
          clearSession();
          setCurrentUser(null);
          setConfigOpen(false);
          alert("Your data and account have been deleted.");
        } else {
          alert("Account wiped successfully.");
          window.location.reload();
        }
      } catch (err) {
        console.error("Nuke failed:", err);
        alert("Failed to wipe data. Check console for details.");
      }
    }
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
      {impersonation?.active && (
        <Box
          component="button"
          type="button"
          onClick={() => void handleExitImpersonation()}
          sx={{
            width: '100%',
            border: 'none',
            cursor: 'pointer',
            bgcolor: 'error.main',
            color: 'error.contrastText',
            py: 0.75,
            px: 2,
            typography: 'caption',
            fontWeight: 700,
            letterSpacing: 0.5,
            textAlign: 'center',
            '&:hover': { bgcolor: 'error.dark' },
          }}
        >
          IMPERSONATING - Click here to exit out.
        </Box>
      )}
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
              aria-label="Menu"
              aria-controls={cogAnchor ? 'cog-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={cogAnchor ? 'true' : undefined}
              onClick={(e) => setCogAnchor(e.currentTarget)}
            >
              <SettingsIcon />
            </IconButton>
            <Menu
              id="cog-menu"
              anchorEl={cogAnchor}
              open={Boolean(cogAnchor)}
              onClose={() => setCogAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem
                onClick={() => {
                  setCogAnchor(null);
                  setConfigOpen(true);
                }}
              >
                <ListItemIcon>
                  <SettingsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Settings</ListItemText>
              </MenuItem>
              {isAdmin && (
                <MenuItem
                  onClick={() => {
                    setCogAnchor(null);
                    setGodModeOpen(true);
                  }}
                >
                  <ListItemIcon>
                    <AdminPanelSettingsIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>God Mode</ListItemText>
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  setCogAnchor(null);
                  handleLogout();
                }}
              >
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Exit</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 3, pb: 10 }}>
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
        </Suspense>
      </Container>

      <Paper
        elevation={3}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1200,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <BottomNavigation
          showLabels
          value={value}
          onChange={(_event, newValue: number) => setValue(newValue)}
        >
          <BottomNavigationAction label="Songs" icon={<LibraryMusicIcon />} />
          <BottomNavigationAction label="Places" icon={<PlaceIcon />} />
          <BottomNavigationAction label="Tags" icon={<LocalOfferIcon />} />
          <BottomNavigationAction label="Stats" icon={<BarChartIcon />} />
        </BottomNavigation>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pb: 0.25 }}>
          <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.65rem', opacity: 0.7, fontFamily: 'monospace' }}>
            {__COMMIT_HASH__}
          </Typography>
        </Box>
      </Paper>

      <WelcomeMessageDialog
        open={welcomeOpen}
        userId={currentUser.id}
        onClose={() => setWelcomeOpen(false)}
      />
      <SongShareNotifications active />

      <AppConfigDialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        currentUser={currentUser}
        themeMode={themeMode}
        onThemeChange={handleThemeChange}
        onUserUpdated={handleUserUpdated}
        onNukeData={handleNukeData}
        onOpenWelcome={() => setWelcomeOpen(true)}
      />

      <Dialog
        open={godModeOpen}
        onClose={() => setGodModeOpen(false)}
        fullWidth
        maxWidth="lg"
        scroll="paper"
      >
        <DialogTitle>God Mode</DialogTitle>
        <DialogContent dividers>
          <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}>
            {godModeOpen && (
              <>
                <EventLogViewer />
                <GodMode
                  adminUserId={currentUser.id}
                  onImpersonated={(user, imp) => {
                    setCurrentUser(user);
                    setImpersonation(imp);
                    setGodModeOpen(false);
                    setValue(SONGS_TAB_INDEX);
                    window.location.reload();
                  }}
                />
              </>
            )}
          </Suspense>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGodModeOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      
      <Snackbar
        open={spotifySnackbar.open}
        autoHideDuration={8000}
        onClose={() => setSpotifySnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ bottom: { xs: 72, sm: 72 } }}
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
    </ThemeProvider>
  );
}

export default App;
