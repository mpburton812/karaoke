import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Paper, 
  Container,
  Alert,
  CircularProgress
} from '@mui/material';
import { db } from '../db';

interface LoginProps {
  onLogin: (user: { id: number; username: string }) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username) return;
    setLoading(true);
    setError(null);
    try {
      const result = await db.execute({
        sql: "SELECT id, username FROM users WHERE username = ?",
        args: [username]
      });

      if (result.rows.length > 0) {
        const user = result.rows[0] as unknown as { id: number; username: string };
        onLogin(user);
      } else {
        setError("Username not found. Try creating an account.");
      }
    } catch (err) {
      console.error(err);
      setError("An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!username) return;
    setLoading(true);
    setError(null);
    try {
      // Check if exists
      const check = await db.execute({
        sql: "SELECT id FROM users WHERE username = ?",
        args: [username]
      });

      if (check.rows.length > 0) {
        setError("Username already exists. Please select a new name.");
      } else {
        const result = await db.execute({
          sql: "INSERT INTO users (username) VALUES (?) RETURNING id, username",
          args: [username]
        });
        const user = result.rows[0] as unknown as { id: number; username: string };
        onLogin(user);
      }
    } catch (err) {
      console.error(err);
      setError("An error occurred while creating account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="xs">
      <Paper elevation={3} sx={{ p: 4, mt: 8, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
          Karaoke Companion
        </Typography>
        <Typography variant="subtitle1" gutterBottom sx={{ mb: 3 }}>
          {isCreating ? "Create a new account" : "Log in to your account"}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            label="Username"
            variant="outlined"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                if (isCreating) {
                  handleCreateAccount();
                } else {
                  handleLogin();
                }
              }
            }}
          />

          {isCreating ? (
            <>
              <Button 
                variant="contained" 
                color="primary" 
                size="large"
                onClick={handleCreateAccount}
                disabled={loading || !username}
              >
                {loading ? <CircularProgress size={24} /> : "CREATE ACCOUNT"}
              </Button>
              <Button 
                variant="text" 
                onClick={() => { setIsCreating(false); setError(null); }}
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
                onClick={handleLogin}
                disabled={loading || !username}
              >
                {loading ? <CircularProgress size={24} /> : "LOGIN"}
              </Button>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Don't have an account?{" "}
                <Button 
                  variant="text" 
                  size="small" 
                  onClick={() => { setIsCreating(true); setError(null); }}
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
  );
};

export default Login;
