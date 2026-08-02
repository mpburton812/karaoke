import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import KeyIcon from "@mui/icons-material/Key";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PersonIcon from "@mui/icons-material/Person";
import type { AuthUser, ImpersonationInfo } from "../api/auth";
import {
  changeGodModeUserPassword,
  deleteGodModeUser,
  fetchGodModePerformances,
  fetchGodModeUsers,
  impersonateGodModeUser,
  type GodModePerformance,
  type GodModeUser,
} from "../api/godMode";
import {
  expireAdminMotdNow,
  fetchAdminMotd,
  publishAdminMotd,
  type AdminMotd,
} from "../api/motd";
import AllUsersSongEnrichment from "./AllUsersSongEnrichment";
import EnrichmentAdmin from "./EnrichmentAdmin";
import SystemStatus from "./SystemStatus";
import { panelTitleSx } from "../theme";

const MOTD_MAX = 255;

function fmtDate(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

interface GodModeProps {
  adminUserId: number;
  onImpersonated: (user: AuthUser, impersonation: ImpersonationInfo) => void;
}

const GodMode: React.FC<GodModeProps> = ({ adminUserId, onImpersonated }) => {
  const [users, setUsers] = useState<GodModeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<GodModeUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GodModeUser | null>(null);
  const [performanceTarget, setPerformanceTarget] = useState<GodModeUser | null>(
    null
  );
  const [performances, setPerformances] = useState<GodModePerformance[]>([]);
  const [performancesLoading, setPerformancesLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [impersonateTarget, setImpersonateTarget] = useState<GodModeUser | null>(null);
  const [motdCurrent, setMotdCurrent] = useState<AdminMotd | null>(null);
  const [motdDraft, setMotdDraft] = useState("");
  const [motdExpires, setMotdExpires] = useState("");
  const [motdLoading, setMotdLoading] = useState(true);
  const [motdSaving, setMotdSaving] = useState(false);

  const loadMotd = useCallback(async () => {
    setMotdLoading(true);
    try {
      const current = await fetchAdminMotd();
      setMotdCurrent(current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MOTD.");
    } finally {
      setMotdLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchGodModeUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
      void loadMotd();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load, loadMotd]);

  const savePassword = async () => {
    if (!passwordTarget) return;
    setActionLoading(true);
    setError(null);
    try {
      await changeGodModeUserPassword(passwordTarget.id, newPassword);
      setNotice(`Password changed for ${passwordTarget.username}.`);
      setPasswordTarget(null);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setActionLoading(false);
    }
  };

  const startImpersonation = async () => {
    if (!impersonateTarget) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await impersonateGodModeUser(impersonateTarget.id);
      onImpersonated(result.user, result.impersonation);
      setImpersonateTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to impersonate user.");
    } finally {
      setActionLoading(false);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    setError(null);
    try {
      await deleteGodModeUser(deleteTarget.id);
      setNotice(`Deleted account ${deleteTarget.username}.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account.");
    } finally {
      setActionLoading(false);
    }
  };

  const openPerformances = async (user: GodModeUser) => {
    setPerformanceTarget(user);
    setPerformances([]);
    setPerformancesLoading(true);
    setError(null);
    try {
      setPerformances(await fetchGodModePerformances(user.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load performances."
      );
    } finally {
      setPerformancesLoading(false);
    }
  };

  const publishMotd = async () => {
    setMotdSaving(true);
    setError(null);
    try {
      const motd = await publishAdminMotd(
        motdDraft,
        motdExpires.trim() ? motdExpires : null
      );
      setMotdCurrent(motd);
      setMotdDraft("");
      setMotdExpires("");
      setNotice("MOTD published. Users will see it on their next login.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish MOTD.");
    } finally {
      setMotdSaving(false);
    }
  };

  const autoExpireMotd = async () => {
    if (
      !window.confirm(
        "Auto-expire the current MOTD now? Users who have not seen it will not see it."
      )
    ) {
      return;
    }
    setMotdSaving(true);
    setError(null);
    try {
      const result = await expireAdminMotdNow();
      await loadMotd();
      setNotice(
        result.cleared
          ? "MOTD auto-expired. Unseen users will not receive it."
          : "No active MOTD to expire."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to expire MOTD.");
    } finally {
      setMotdSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ ...panelTitleSx, color: "primary.main" }}>
        Admin health
      </Typography>
      <SystemStatus />

      <AllUsersSongEnrichment />

      <EnrichmentAdmin />

      <Typography variant="h5" gutterBottom sx={{ ...panelTitleSx, color: "primary.main", mt: 4 }}>
        MOTD
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Send a short message (max {MOTD_MAX} characters) that appears once for each user on
        their next login. Leave expire blank to default to one month from today.
      </Typography>

      {motdLoading ? (
        <CircularProgress size={24} sx={{ mb: 2 }} />
      ) : motdCurrent ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Active MOTD
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 1 }}>
            {motdCurrent.body}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            Expires: {motdCurrent.expiresAt} · Seen by {motdCurrent.seenCount} user
            {motdCurrent.seenCount === 1 ? "" : "s"} · Created {fmtDate(motdCurrent.createdAt)}
          </Typography>
        </Paper>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No active MOTD.
        </Typography>
      )}

      <TextField
        label="Message"
        value={motdDraft}
        onChange={(e) => setMotdDraft(e.target.value.slice(0, MOTD_MAX))}
        fullWidth
        multiline
        minRows={2}
        helperText={`${motdDraft.length}/${MOTD_MAX}`}
        sx={{ mb: 2 }}
      />
      <TextField
        label="Expire date (optional)"
        type="date"
        value={motdExpires}
        onChange={(e) => setMotdExpires(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ mb: 2, mr: 2, minWidth: 220 }}
      />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
        <Button
          variant="contained"
          onClick={() => void publishMotd()}
          disabled={motdSaving || !motdDraft.trim()}
        >
          Publish
        </Button>
        <Button
          variant="outlined"
          color="warning"
          onClick={() => void autoExpireMotd()}
          disabled={motdSaving || !motdCurrent}
        >
          Auto-expire now
        </Button>
      </Box>

      <Typography variant="h5" gutterBottom sx={{ ...panelTitleSx, color: "primary.main", mt: 4 }}>
        User administration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        User accounts, password controls, and account deletion.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Access</TableCell>
                <TableCell>Last sign-in</TableCell>
                <TableCell>Latest performance</TableCell>
                <TableCell align="right">Songs</TableCell>
                <TableCell align="right">Tags</TableCell>
                <TableCell align="right">Venues</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={user.accessLevel === "admin" ? "secondary" : "default"}
                      label={user.accessLevel}
                    />
                  </TableCell>
                  <TableCell>{fmtDate(user.lastLoginAt)}</TableCell>
                  <TableCell>{fmtDate(user.lastPerformanceAt)}</TableCell>
                  <TableCell align="right">{user.songCount}</TableCell>
                  <TableCell align="right">{user.tagCount}</TableCell>
                  <TableCell align="right">{user.venueCount}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {user.id !== adminUserId && (
                        <Button
                          size="small"
                          color="warning"
                          startIcon={<PersonIcon />}
                          onClick={() => setImpersonateTarget(user)}
                        >
                          Impersonate
                        </Button>
                      )}
                      <Button
                        size="small"
                        startIcon={<ListAltIcon />}
                        onClick={() => void openPerformances(user)}
                      >
                        Performances
                      </Button>
                      <Button
                        size="small"
                        startIcon={<KeyIcon />}
                        onClick={() => {
                          setPasswordTarget(user);
                          setNewPassword("");
                        }}
                      >
                        Password
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => setDeleteTarget(user)}
                      >
                        Delete
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={Boolean(passwordTarget)} onClose={() => setPasswordTarget(null)}>
        <DialogTitle>Change password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Set a new password for {passwordTarget?.username}.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="Minimum 8 characters"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordTarget(null)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={savePassword}
            disabled={actionLoading || newPassword.length < 8}
          >
            Change password
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(impersonateTarget)}
        onClose={() => setImpersonateTarget(null)}
      >
        <DialogTitle>Impersonate user?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            View the app as {impersonateTarget?.username}. A red banner at the top
            lets you exit impersonation at any time.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImpersonateTarget(null)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => void startImpersonation()}
            disabled={actionLoading}
          >
            Impersonate
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete account?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete {deleteTarget?.username} and all their songs, tags, venues,
            performances, and Spotify links? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={deleteUser}
            disabled={actionLoading}
          >
            Delete account
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(performanceTarget)}
        onClose={() => setPerformanceTarget(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Performances: {performanceTarget?.username}
        </DialogTitle>
        <DialogContent>
          {performancesLoading ? (
            <CircularProgress />
          ) : performances.length === 0 ? (
            <Typography color="text.secondary">No performances found.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Location / Venue</TableCell>
                    <TableCell>Song</TableCell>
                    <TableCell>Rating</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {performances.map((perf) => (
                    <TableRow key={perf.id}>
                      <TableCell>
                        {perf.date ?? "Unknown"}
                        {perf.time ? ` ${perf.time}` : ""}
                      </TableCell>
                      <TableCell>{perf.location ?? "-"}</TableCell>
                      <TableCell>
                        {perf.trackName ?? "Unknown song"}
                        {perf.artistName ? ` - ${perf.artistName}` : ""}
                      </TableCell>
                      <TableCell>{perf.rating || "-"}</TableCell>
                      <TableCell>{perf.notes ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPerformanceTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GodMode;
