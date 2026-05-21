import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { logClientCritical } from '../api/eventLog';
import { forceAppReload, isChunkLoadError } from '../lib/forceAppReload';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  chunkStale: boolean;
  hardReloading: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', chunkStale: false, hardReloading: false };

  static getDerivedStateFromError(error: Error): State {
    const message = error.message || 'An unexpected error occurred.';
    return {
      hasError: true,
      message,
      chunkStale: isChunkLoadError(message),
      hardReloading: false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    if (!isChunkLoadError(error.message)) {
      logClientCritical(`Client crash: ${error.message}`.slice(0, 500));
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, message: '', chunkStale: false, hardReloading: false });
  };

  handleHardReload = () => {
    this.setState({ hardReloading: true });
    void forceAppReload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          bgcolor: 'background.default',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {this.state.chunkStale
              ? 'The app was updated while this tab was open. Reload to download the latest version.'
              : this.state.message}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            {!this.state.chunkStale && (
              <Button variant="outlined" onClick={this.handleRetry}>
                Try again
              </Button>
            )}
            <Button
              variant="contained"
              color="primary"
              startIcon={<RefreshIcon />}
              onClick={this.state.chunkStale ? this.handleHardReload : this.handleReload}
              disabled={this.state.hardReloading}
            >
              {this.state.hardReloading ? 'Reloading…' : 'Reload app'}
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }
}

export default ErrorBoundary;
