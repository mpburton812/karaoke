import React, { useState } from 'react';
import { 
  Container, 
  Box, 
  Tabs, 
  Tab, 
  Typography, 
  createTheme, 
  ThemeProvider, 
  CssBaseline 
} from '@mui/material';
import SongLookup from './components/SongLookup';
import SavedSongs from './components/SavedSongs';

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

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center" sx={{ fontWeight: 'bold' }}>
          Gemini Karaoke
        </Typography>
        <Box sx={{ width: '100%', borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={value} onChange={handleChange} centered textColor="primary" indicatorColor="primary">
            <Tab label="Song Lookup" />
            <Tab label="Saved Songs" />
          </Tabs>
        </Box>
        <CustomTabPanel value={value} index={0}>
          <SongLookup />
        </CustomTabPanel>
        <CustomTabPanel value={value} index={1}>
          <SavedSongs />
        </CustomTabPanel>
      </Container>
    </ThemeProvider>
  );
}

export default App;
