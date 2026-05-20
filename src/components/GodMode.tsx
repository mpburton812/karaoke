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
import {
  changeGodModeUserPassword,
  deleteGodModeUser,
  fetchGodModePerformances,
  fetchGodModeUsers,
  type GodModePerformance,
  type GodModeUser,
} from "../api/godMode";

function fmtDate(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

const GodMode: React.FC = () => {
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
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

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

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: "bold" }}>
        USER ADMINISTRATION
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        User accounts and repository controls. Health, enrichment, and KaraFun
        catalog tools are above in this tab.
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
