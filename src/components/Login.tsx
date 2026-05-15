import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Paper, 
  Container,
  Alert,
  CircularProgress,
  alpha
} from '@mui/material';
import { login, register, persistSession } from '../api/auth';
import logo from '../assets/logo.png';
import background from '../assets/background_2.jpg';

interface LoginProps {
  onLogin: (user: { id: number; username: string }) => void;
  sessionNotice?: string | null;
}

const Login: React.FC<LoginProps> = ({ onLogin, sessionNotice }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }
    if (isCreating && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { user, token } = isCreating
        ? await register(username, password)
        : await login(username, password);
      persistSession(user, token);
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box 
      sx={{ 
        minHeight: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        backgroundImage: `url(${background})`,
        backgroundSize: 'auto 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 0
      }}
    >
      <Container maxWidth="xs" sx={{ position: 'relative', zIndex: 2, mt: 8 }}>
        <Paper 
          elevation={3} 
          sx={{ 
            p: 4, 
            textAlign: 'center', 
            backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.8),
            backdropFilter: 'blur(4px)'
          }}
        >
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
            Karaoke Companion
          </Typography>
          <Typography variant="subtitle1" gutterBottom sx={{ mb: 3 }}>
            {isCreating ? "Create a new account" : "Log in to your account"}
          </Typography>

          {sessionNotice && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {sessionNotice}
            </Alert>
          )}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Username"
              variant="outlined"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete={isCreating ? 'new-password' : 'current-password'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />

            {isCreating ? (
              <>
                <Button 
                  variant="contained" 
                  color="primary" 
                  size="large"
                  onClick={submit}
                  disabled={loading || !username || !password}
                >
                  {loading ? <CircularProgress size={24} /> : "CREATE ACCOUNT"}
                </Button>
                <Button 
                  variant="text" 
                  onClick={() => { setIsCreating(false); setError(null); setPassword(''); }}
                  disabled={loading}
                >
                  Back to Login
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="contained" 
                  color="primary" 
                  size="large"
                  onClick={submit}
                  disabled={loading || !username || !password}
                >
                  {loading ? <CircularProgress size={24} /> : "LOGIN"}
                </Button>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Don't have an account?{" "}
                  <Button 
                    variant="text" 
                    size="small" 
                    onClick={() => { setIsCreating(true); setError(null); setPassword(''); }}
                    disabled={loading}
                  >
                    CREATE ACCOUNT
                  </Button>
                </Typography>
              </>
            )}
          </Box>
        </Paper>
      </Container>
      
      <Box 
        sx={{ 
          position: 'fixed', 
          bottom: 16, 
          left: '50%', 
          transform: 'translateX(-50%)', 
          width: '50vw',
          zIndex: 1
        }}
      >
        <img 
          src={logo} 
          alt="Logo" 
          style={{ width: '100%', height: 'auto', display: 'block', opacity: 0.8 }} 
        />
      </Box>
    </Box>
  );
};

export default Login;
