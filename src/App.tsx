import React, { useState, Suspense, lazy } from 'react';
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
  CircularProgress
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { db } from './db';

// Lazy load tab components
const SongLookup = lazy(() => import('./components/SongLookup'));
const SavedSongs = lazy(() => import('./components/SavedSongs'));
const TagManager = lazy(() => import('./components/TagManager'));
const LocationManager = lazy(() => import('./components/LocationManager'));
const DataPortability = lazy(() => import('./components/DataPortability'));
const SystemStatus = lazy(() => import('./components/SystemStatus'));
const Login = lazy(() => import('./components/Login'));
const Changelog = lazy(() => import('./components/Changelog'));

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1DB954', // Spotify-ish green for a modern look
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

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
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string } | null>(() => {
    const savedUser = localStorage.getItem('karaoke_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        localStorage.removeItem('karaoke_user');
      }
    }
    return null;
  });

  const handleLogin = (user: { id: number; username: string }) => {
    setCurrentUser(user);
    localStorage.setItem('karaoke_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('karaoke_user');
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
          <Login onLogin={handleLogin} />
        </Suspense>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
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
            <Tab label="Song Lookup" />
            <Tab label="Song List" />
            <Tab label="Tags" />
            <Tab label="Admin" />
          </Tabs>
        </Box>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>}>
          <CustomTabPanel value={value} index={0}>
            <SongLookup currentUser={currentUser} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <SavedSongs currentUser={currentUser} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={2}>
            <TagManager currentUser={currentUser} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={3}>
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <Typography variant="h5" gutterBottom>Administrative Tools</Typography>
              <Typography variant="body1" color="textSecondary" sx={{ mb: 4 }}>
                Manage your repertoire and data portability.
              </Typography>
              
              <SystemStatus />
              <Divider sx={{ my: 4 }} />
              <DataPortability currentUser={currentUser} />
              
              <Divider sx={{ my: 4 }} />
              <LocationManager currentUser={currentUser} />

              <Divider sx={{ my: 4 }} />
              <Changelog />

              <Divider sx={{ my: 6, borderColor: 'error.main' }} />              <Box sx={{ p: 3, border: '1px solid', borderColor: 'error.main', borderRadius: 2, bgcolor: 'rgba(211, 47, 47, 0.05)' }}>
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
      
      <Box component="footer" sx={{ 
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        py: 1, 
        px: 2, 
        backgroundColor: 'background.default',
        borderTop: 1,
        borderColor: 'divider',
        zIndex: 1100
      }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ flexGrow: 1, textAlign: 'center' }}>
              <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 'bold', letterSpacing: 2, fontSize: '0.75rem' }}>
                KARAOKE COMPANION
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.65rem', opacity: 0.7, fontFamily: 'monospace' }}>
                {__BRANCH_NAME__} @ {__COMMIT_HASH__}
              </Typography>
            </Box>
          </Box>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
