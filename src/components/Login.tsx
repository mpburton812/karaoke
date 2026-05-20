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
import { login, register, persistSession, type AuthUser } from '../api/auth';
import logo from '../assets/logo.png';
import background from '../assets/background_2.jpg';

interface LoginProps {
  onLogin: (user: AuthUser) => void;
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
        minHeight: '100dvh',
        width: '100%',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        backgroundImage: `url(${background})`,
        backgroundSize: 'auto 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 0,
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <Container
        maxWidth="xs"
        sx={{
          position: 'relative',
          zIndex: 2,
          mt: { xs: 2, sm: 4, md: 8 },
          mb: { xs: 10, sm: 12 },
          px: { xs: 2, sm: 3 },
          py: 2,
          flex: '0 0 auto',
        }}
      >
        <Paper 
          elevation={8} 
          sx={{ 
            p: { xs: 2, sm: 3, md: 4 },
            textAlign: 'center', 
            backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.92),
            backdropFilter: 'blur(12px)',
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette.primary.main, 0.35),
            boxShadow: (theme) =>
              theme.palette.mode === 'light'
                ? '0 12px 40px rgba(26, 18, 40, 0.12)'
                : `0 12px 40px rgba(0, 0, 0, 0.45), 0 0 24px ${alpha(theme.palette.primary.main, 0.2)}`,
          }}
        >
          <Typography
            variant="h4"
            gutterBottom
            sx={{
              fontWeight: 'bold',
              fontSize: { xs: '1.5rem', sm: '2.125rem' },
              color: 'primary.main',
            }}
          >
            Karaoke Companion
          </Typography>
          <Typography variant="subtitle1" gutterBottom sx={{ mb: { xs: 2, sm: 3 } }}>
            {isCreating ? "Create a new account" : "Log in to your account"}
          </Typography>

          {sessionNotice && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {sessionNotice}
            </Alert>
          )}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 } }}>
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
                  fullWidth
                  onClick={submit}
                  disabled={loading || !username || !password}
                >
                  {loading ? <CircularProgress size={24} /> : "Create account"}
                </Button>
                <Button 
                  variant="outlined"
                  color="primary"
                  size="large"
                  fullWidth
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
                  fullWidth
                  onClick={submit}
                  disabled={loading || !username || !password}
                >
                  {loading ? <CircularProgress size={24} /> : "Log in"}
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  size="large"
                  fullWidth
                  onClick={() => { setIsCreating(true); setError(null); setPassword(''); }}
                  disabled={loading}
                >
                  Create account
                </Button>
              </>
            )}
          </Box>
        </Paper>
      </Container>
      
      <Box 
        sx={{ 
          position: 'fixed', 
          bottom: { xs: 8, sm: 16 },
          left: '50%', 
          transform: 'translateX(-50%)', 
          width: { xs: '40vw', sm: '50vw' },
          maxWidth: 280,
          zIndex: 1,
          pointerEvents: 'none',
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
