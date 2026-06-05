import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Chip,
  CircularProgress,
  Divider,
  Alert,
} from '@mui/material';
import {
  fetchShareInbox,
  fetchShareOutbox,
  openSongShare,
  type SongShareRow,
} from '../api/songShares';
import {
  KARAOKE_OPEN_SHARE_EVENT,
  KARAOKE_SHARES_REFRESH_EVENT,
  type KaraokeOpenShareDetail,
} from '../lib/karaokeEvents';

const statusLabel: Record<string, string> = {
  pending: 'New',
  opened: 'Opened',
  saved: 'Saved',
  discarded: 'Closed',
  duplicate: 'Already had it',
};

const SongShareInbox: React.FC = () => {
  const [inbox, setInbox] = useState<SongShareRow[]>([]);
  const [outbox, setOutbox] = useState<SongShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inRows, outRows] = await Promise.all([
        fetchShareInbox(),
        fetchShareOutbox(),
      ]);
      setInbox(inRows);
      setOutbox(outRows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener(KARAOKE_SHARES_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(KARAOKE_SHARES_REFRESH_EVENT, onRefresh);
  }, [load]);

  const openFromInbox = async (share: SongShareRow) => {
    if (!['pending', 'opened'].includes(share.status)) return;
    try {
      await openSongShare(share.id);
      window.dispatchEvent(
        new CustomEvent<KaraokeOpenShareDetail>(KARAOKE_OPEN_SHARE_EVENT, {
          detail: { shareId: share.id },
        })
      );
      window.dispatchEvent(new Event(KARAOKE_SHARES_REFRESH_EVENT));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 2 }} />;
  }

  return (
    <Box sx={{ textAlign: 'left', mt: 2 }}>
      <Alert severity="info" sx={{ mb: 2 }}>
        Shares stay here even when pop-up notifications are turned off.
      </Alert>

      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
        Received
      </Typography>
      {inbox.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No received shares yet.
        </Typography>
      ) : (
        <List dense disablePadding sx={{ mb: 2 }}>
          {inbox.map((s) => (
            <ListItem key={s.id} disablePadding divider>
              <ListItemButton
                onClick={() => void openFromInbox(s)}
                disabled={!['pending', 'opened'].includes(s.status)}
              >
                <ListItemText
                  primary={`${s.songSnapshot?.track_name ?? 'Song'} — ${s.senderUsername}`}
                  secondary={s.sendMessage || undefined}
                />
                <Chip size="small" label={statusLabel[s.status] ?? s.status} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
        Sent
      </Typography>
      {outbox.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No sent shares yet.
        </Typography>
      ) : (
        <List dense disablePadding>
          {outbox.map((s) => (
            <ListItem key={s.id} disablePadding divider>
              <ListItemText
                primary={`${s.songSnapshot?.track_name ?? 'Song'} → ${s.recipientUsername}`}
                secondary={
                  s.responseMessage
                    ? `Reply: ${s.responseMessage}`
                    : statusLabel[s.status] ?? s.status
                }
              />
            </ListItem>
          ))}
        </List>
      )}

    </Box>
  );
};

export default SongShareInbox;
