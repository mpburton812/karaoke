import React, { useState, useEffect } from 'react';
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
  Divider
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import SongLookup from './components/SongLookup';
import SavedSongs from './components/SavedSongs';
import CatalogImporter from './components/CatalogImporter';
import TagManager from './components/TagManager';
import LocationManager from './components/LocationManager';
import Login from './components/Login';

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
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('karaoke_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('karaoke_user');
      }
    }
    setAuthChecked(true);
  }, []);

  const handleLogin = (user: { id: number; username: string }) => {
    setCurrentUser(user);
    localStorage.setItem('karaoke_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('karaoke_user');
    setValue(0);
  };

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  if (!authChecked) return null;

  if (!currentUser) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Login onLogin={handleLogin} />
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
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 2 }}>
          <Typography variant="h3" component="h1" sx={{ fontWeight: 'bold' }}>
            Karaoke Companion
          </Typography>
        </Box>
        <Box sx={{ width: '100%', borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={value} onChange={handleChange} centered textColor="primary" indicatorColor="primary">
            <Tab label="Song Lookup" />
            <Tab label="Song List" />
            <Tab label="Tags" />
            <Tab label="Admin" />
          </Tabs>
        </Box>
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
              Manage the KaraFun catalog index, favorite locations, and other system settings.
            </Typography>
            <CatalogImporter />
            <Divider sx={{ my: 4 }} />
            <LocationManager currentUser={currentUser} />
          </Box>
        </CustomTabPanel>
      </Container>
    </ThemeProvider>
  );
}

export default App;
