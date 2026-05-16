import React, { useState, Suspense, lazy, useMemo, useEffect } from 'react';
import { 
  Container, 
  Box, 
  Tabs, 
  Tab, 
  Typography, 
  createTheme, 
  ThemeProvider, 
  CssBaseline,
  Button,
  AppBar,
  Toolbar,
  Divider,
  CircularProgress,
  ButtonGroup,
  Snackbar,
  Alert,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import TransgenderIcon from '@mui/icons-material/Transgender';
import { db } from './db';
import { clearSession } from './api/auth';
import { setSessionExpiredHandler } from './api/session';

// Lazy load tab components
const SavedSongs = lazy(() => import('./components/SavedSongs'));
const TagManager = lazy(() => import('./components/TagManager'));
const LocationManager = lazy(() => import('./components/LocationManager'));
const DataPortability = lazy(() => import('./components/DataPortability'));
const SystemStatus = lazy(() => import('./components/SystemStatus'));
const Login = lazy(() => import('./components/Login'));
const Changelog = lazy(() => import('./components/Changelog'));
const Stats = lazy(() => import('./components/Stats'));
const ChangePassword = lazy(() => import('./components/ChangePassword'));
const AdminAppReload = lazy(() => import('./components/AdminAppReload'));
const SpotifyConnect = lazy(() => import('./components/SpotifyConnect'));

type ThemeMode = 'light' | 'dark' | 'trans';

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
  const [value, setValue] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme_mode') as ThemeMode) || 'dark';
  });

  const theme = useMemo(() => {
    if (themeMode === 'trans') {
      return createTheme({
        palette: {
          mode: 'light',
          primary: {
            main: '#5BCEFA', // Trans Light Blue
          },
          secondary: {
            main: '#F5A9B8', // Trans Pink
          },
          background: {
            default: '#FFFFFF',
            paper: '#F5A9B822', // Very faint pink
          },
          text: {
            primary: '#5BCEFA',
            secondary: '#F5A9B8',
          }
        },
        typography: {
          fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        },
        components: {
          MuiAppBar: {
            styleOverrides: {
              root: {
                background: 'linear-gradient(45deg, #5BCEFA 30%, #F5A9B8 90%)',
                color: '#FFFFFF'
              }
            }
          },
          MuiButton: {
            styleOverrides: {
              root: ({ ownerState }) => ({
                ...(ownerState.variant === 'contained' && ownerState.color === 'primary' && {
                  color: '#FFFFFF',
                }),
              }),
            }
          }
        }
      });
    }

    return createTheme({
      palette: {
        mode: themeMode,
        primary: {
          main: '#1DB954', // Spotify-ish green
        },
        ...(themeMode === 'dark' ? {
          background: {
            default: '#121212',
            paper: '#1e1e1e',
          }
        } : {
          background: {
            default: '#f5f5f5',
            paper: '#ffffff',
          }
        })
      },
      typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      },
    });
  }, [themeMode]);

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem('theme_mode', mode);
  };

  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<{ id: number; username: string } | null>(() => {
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

  useEffect(() => {
    setSessionExpiredHandler((message) => {
      setCurrentUser(null);
      setSessionNotice(message);
      setValue(0);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const [spotifySnackbar, setSpotifySnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const spotify = params.get("spotify");
    if (!spotify) return;

    if (spotify === "connected") {
      setSpotifySnackbar({
        open: true,
        message: "Spotify account connected.",
        severity: "success",
      });
    } else if (spotify === "error") {
      const reason = params.get("reason") || "unknown";
      setSpotifySnackbar({
        open: true,
        message: `Spotify connection failed: ${decodeURIComponent(reason)}`,
        severity: "error",
      });
    }

    params.delete("spotify");
    params.delete("reason");
    const q = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (q ? `?${q}` : "")
    );
  }, [currentUser]);

  const handleLogin = (user: { id: number; username: string }) => {
    setSessionNotice(null);
    setCurrentUser(user);
    localStorage.setItem('karaoke_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSessionNotice(null);
    clearSession();
    setValue(0);
  };

  const handleNukeData = async () => {
    if (!currentUser) return;
    const confirmed = window.confirm(
      "CRITICAL WARNING: This will permanently delete ALL your songs, performances, setlists, tags, and locations. This action CANNOT be undone. Are you absolutely sure?"
    );
    
    if (confirmed) {
      try {
        await db.batch([
          { sql: "DELETE FROM performance_tags WHERE performance_id IN (SELECT id FROM performances WHERE user_id = ?)", args: [currentUser.id] },
          { sql: "DELETE FROM song_tags WHERE song_id IN (SELECT id FROM songs WHERE user_id = ?)", args: [currentUser.id] },
          { sql: "DELETE FROM setlist_songs WHERE setlist_id IN (SELECT id FROM setlists WHERE user_id = ?)", args: [currentUser.id] },
          { sql: "DELETE FROM performances WHERE user_id = ?", args: [currentUser.id] },
          { sql: "DELETE FROM songs WHERE user_id = ?", args: [currentUser.id] },
          { sql: "DELETE FROM setlists WHERE user_id = ?", args: [currentUser.id] },
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
      <AppBar position="static" color={themeMode === 'trans' ? 'primary' : 'transparent'} elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {currentUser.username}
          </Typography>
          <Button 
            color="inherit" 
            startIcon={<LogoutIcon />} 
            onClick={handleLogout}
          >
            LOGOUT
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box sx={{ width: '100%', borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={value} 
            onChange={handleChange} 
            centered 
            textColor="primary" 
            indicatorColor="primary"
            sx={{
              '& .MuiTabs-flexContainer': {
                flexWrap: 'wrap',
              }
            }}
          >
            <Tab label="Songs" />
            <Tab label="Places" />
            <Tab label="Tags" />
            <Tab label="Stats" />
            <Tab label="Admin" />
          </Tabs>
        </Box>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>}>
          <CustomTabPanel value={value} index={0}>
            <SavedSongs currentUser={currentUser} />
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
          <CustomTabPanel value={value} index={4}>
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <Typography variant="h5" gutterBottom>Administrative Tools</Typography>
              <Typography variant="body1" color="textSecondary" sx={{ mb: 4 }}>
                Manage your repertoire and data portability.
              </Typography>

              <Box sx={{ mb: 4 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', mb: 2 }}>THEME SELECTION</Typography>
                <ButtonGroup variant="outlined" size="large">
                  <Button 
                    startIcon={<LightModeIcon />} 
                    onClick={() => handleThemeChange('light')}
                    variant={themeMode === 'light' ? 'contained' : 'outlined'}
                  >
                    LIGHT
                  </Button>
                  <Button 
                    startIcon={<DarkModeIcon />} 
                    onClick={() => handleThemeChange('dark')}
                    variant={themeMode === 'dark' ? 'contained' : 'outlined'}
                  >
                    DARK
                  </Button>
                  <Button 
                    startIcon={<TransgenderIcon />} 
                    onClick={() => handleThemeChange('trans')}
                    variant={themeMode === 'trans' ? 'contained' : 'outlined'}
                    sx={themeMode === 'trans' ? {
                      background: 'linear-gradient(45deg, #5BCEFA 30%, #F5A9B8 90%)',
                      borderColor: 'transparent'
                    } : {}}
                  >
                    TRANS
                  </Button>
                </ButtonGroup>
              </Box>

              <Box sx={{ mb: 4 }}>
                <ChangePassword />
              </Box>

              <SpotifyConnect />

              <AdminAppReload />
              
              <SystemStatus />
              <Divider sx={{ my: 4 }} />
              <DataPortability currentUser={currentUser} />
              
              <Divider sx={{ my: 4 }} />
              <Changelog />

              <Divider sx={{ my: 6, borderColor: 'error.main' }} />
              <Box sx={{ p: 3, border: '1px solid', borderColor: 'error.main', borderRadius: 2, bgcolor: 'rgba(211, 47, 47, 0.05)' }}>
                <Typography variant="h6" color="error" gutterBottom>Danger Zone</Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Clearing your configuration will delete all personal data associated with your account.
                </Typography>
                <Button 
                  variant="outlined" 
                  color="error" 
                  onClick={handleNukeData}
                  sx={{ fontWeight: 'bold' }}
                >
                  NUKE ALL CONFIGURATION
                </Button>
              </Box>
            </Box>
          </CustomTabPanel>
        </Suspense>
      </Container>
      
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
