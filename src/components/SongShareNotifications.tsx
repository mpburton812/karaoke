import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Avatar,
  Box,
  TextField,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  acceptSongShare,
  ackSenderReply,
  ackShareIntro,
  discardSongShare,
  fetchIncomingShareNotifications,
  fetchSenderReplyNotifications,
  fetchSharesNeedingResponse,
  fetchSongShare,
  openSongShare,
  respondToSongShare,
  type SongShareRow,
} from '../api/songShares';
import {
  KARAOKE_OPEN_SHARE_EVENT,
  KARAOKE_SHARES_REFRESH_EVENT,
  KARAOKE_SONGS_REFRESH_EVENT,
  type KaraokeOpenShareDetail,
} from '../lib/karaokeEvents';

const MAX_LEN = 255;

type Phase =
  | 'idle'
  | 'intro'
  | 'preview'
  | 'response'
  | 'senderReply';

interface SongShareNotificationsProps {
  active: boolean;
}

const SongShareNotifications: React.FC<SongShareNotificationsProps> = ({ active }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [share, setShare] = useState<SongShareRow | null>(null);
  const [responseText, setResponseText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateMsg, setDuplicateMsg] = useState<string | null>(null);

  const refreshQueues = useCallback(async () => {
    if (!active) return;
    const [incoming, needResponse, senderReplies] = await Promise.all([
      fetchIncomingShareNotifications(),
      fetchSharesNeedingResponse(),
      fetchSenderReplyNotifications(),
    ]);
    if (incoming.length > 0) {
      setShare(incoming[0]!);
      setPhase('intro');
      setError(null);
      setDuplicateMsg(null);
      return;
    }
    if (needResponse.length > 0) {
      setShare(needResponse[0]!);
      setPhase('response');
      setResponseText('');
      setError(null);
      return;
    }
    if (senderReplies.length > 0) {
      setShare(senderReplies[0]!);
      setPhase('senderReply');
      setError(null);
      return;
    }
    setPhase('idle');
    setShare(null);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void refreshQueues();
    const onRefresh = () => void refreshQueues();
    window.addEventListener(KARAOKE_SHARES_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(KARAOKE_SHARES_REFRESH_EVENT, onRefresh);
  }, [active, refreshQueues]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<KaraokeOpenShareDetail>;
      const shareId = ce.detail?.shareId;
      if (typeof shareId !== 'number' || shareId <= 0) return;
      void fetchSongShare(shareId).then((row) => {
        setShare(row);
        setPhase('preview');
        setError(null);
        setDuplicateMsg(null);
      });
    };
    window.addEventListener(KARAOKE_OPEN_SHARE_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(KARAOKE_OPEN_SHARE_EVENT, handler as EventListener);
  }, [active]);

  const closeAndAdvance = () => {
    setShare(null);
    setPhase('idle');
    setError(null);
    setDuplicateMsg(null);
    window.dispatchEvent(new Event(KARAOKE_SHARES_REFRESH_EVENT));
    void refreshQueues();
  };

  const handleIntroOpen = async () => {
    if (!share) return;
    setBusy(true);
    try {
      await ackShareIntro(share.id);
      const opened = await openSongShare(share.id);
      setShare(opened);
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open share.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!share) return;
    setBusy(true);
    setError(null);
    setDuplicateMsg(null);
    try {
      await acceptSongShare(share.id);
      window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
      const updated = { ...share, status: 'saved' };
      setShare(updated);
      setPhase('response');
      setResponseText('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save.';
      if (msg.includes('already in your repertoire')) {
        setDuplicateMsg(msg);
        setPhase('response');
        setResponseText('');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClosePreview = async () => {
    if (!share) return;
    setBusy(true);
    setError(null);
    try {
      await discardSongShare(share.id);
      setPhase('response');
      setResponseText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendResponse = async () => {
    if (!share) return;
    setBusy(true);
    setError(null);
    try {
      await respondToSongShare(share.id, responseText.trim());
      closeAndAdvance();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send response.');
    } finally {
      setBusy(false);
    }
  };

  const handleSenderAck = async () => {
    if (!share) return;
    setBusy(true);
    try {
      await ackSenderReply(share.id);
      closeAndAdvance();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to dismiss.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'idle' || !share) return null;

  const snap = share.songSnapshot;

  if (phase === 'intro') {
    return (
      <Dialog open onClose={busy ? undefined : closeAndAdvance}>
        <DialogTitle>Song shared with you</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1" gutterBottom>
            <strong>{share.senderUsername}</strong> shared a song with you.
          </Typography>
          {share.sendMessage && (
            <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
              &ldquo;{share.sendMessage}&rdquo;
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAndAdvance} disabled={busy}>Later</Button>
          <Button variant="contained" onClick={() => void handleIntroOpen()} disabled={busy}>
            {busy ? <CircularProgress size={22} color="inherit" /> : 'Open song'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (phase === 'preview' && snap) {
    return (
      <Dialog open onClose={busy ? undefined : undefined} fullWidth maxWidth="sm">
        <DialogTitle>Shared song</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
            <Avatar
              variant="rounded"
              src={(snap.artwork_url ?? '').replace('100x100bb', '200x200bb')}
              sx={{ width: 96, height: 96 }}
            />
            <Box>
              <Typography variant="h6">{snap.track_name}</Typography>
              <Typography color="text.secondary">{snap.artist_name}</Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                From {share.senderUsername}
              </Typography>
            </Box>
          </Box>
          {share.sendMessage && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              Message: {share.sendMessage}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {snap.genre && <Chip label={snap.genre} size="small" />}
            {snap.album && <Chip label={snap.album} size="small" variant="outlined" />}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void handleClosePreview()} disabled={busy} color="inherit">
            Close
          </Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={busy}>
            {busy ? <CircularProgress size={22} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (phase === 'response') {
    return (
      <Dialog open onClose={busy ? undefined : closeAndAdvance} fullWidth maxWidth="sm">
        <DialogTitle>Reply to {share.senderUsername}</DialogTitle>
        <DialogContent dividers>
          {duplicateMsg && <Alert severity="warning" sx={{ mb: 2 }}>{duplicateMsg}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Send a short note back (optional).
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Your response"
            value={responseText}
            onChange={(e) => setResponseText(e.target.value.slice(0, MAX_LEN))}
            helperText={`${responseText.length}/${MAX_LEN}`}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (share.respondedAt) {
                closeAndAdvance();
                return;
              }
              void respondToSongShare(share.id, '').then(closeAndAdvance);
            }}
            disabled={busy}
          >
            Skip
          </Button>
          <Button variant="contained" onClick={() => void handleSendResponse()} disabled={busy}>
            Send
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (phase === 'senderReply') {
    return (
      <Dialog open onClose={busy ? undefined : undefined}>
        <DialogTitle>Reply from {share.recipientUsername}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            About your shared song
          </Typography>
          <Typography variant="body1">
            {share.responseMessage || '(No message)'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => void handleSenderAck()} disabled={busy}>
            OK
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return null;
};

export default SongShareNotifications;
