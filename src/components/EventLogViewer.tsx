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
  Typography,
} from "@mui/material";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import {
  clearAdminEventLogs,
  downloadAdminEventLogsCsv,
  fetchAdminEventLogs,
  type EventLevel,
  type EventLogEntry,
} from "../api/eventLog";
import { isEventCode, labelForEvent, levelTitle } from "../lib/eventCatalog";
import { panelTitleSx } from "../theme";

const PAGE_SIZE = 25;
const MAX_LOG_ENTRIES = 1000;

function levelColor(level: EventLevel): "error" | "warning" | "info" {
  if (level === "C") return "error";
  if (level === "W") return "warning";
  return "info";
}

function eventLabel(category: string | null): string | null {
  if (!category) return null;
  return labelForEvent(category);
}

function eventChipColor(
  category: string | null
): "secondary" | "success" | "default" | "info" {
  if (!category) return "default";
  if (isEventCode(category)) {
    if (category.startsWith("user_")) return "info";
    if (category.includes("session") || category.includes("configuration"))
      return "secondary";
    return "default";
  }
  if (category === "release") return "secondary";
  if (category === "auth") return "info";
  return "default";
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const EventLogViewer: React.FC = () => {
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async (count: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminEventLogs(
        Math.min(count, MAX_LOG_ENTRIES),
        0
      );
      setEvents(res.events);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(visible), 0);
    return () => window.clearTimeout(id);
  }, [load, visible]);

  const showMore = () => {
    setVisible((v) =>
      Math.min(v + PAGE_SIZE, MAX_LOG_ENTRIES, Math.max(total, v + PAGE_SIZE))
    );
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadAdminEventLogsCsv();
      setNotice("Event log exported as CSV.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setError(null);
    try {
      const result = await clearAdminEventLogs();
      setClearConfirmOpen(false);
      setNotice(`Cleared ${result.deleted} log entries.`);
      setVisible(PAGE_SIZE);
      await load(PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear logs.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 4, textAlign: "left" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 1,
          mb: 2,
        }}
      >
        <Typography variant="subtitle2" sx={{ ...panelTitleSx, color: "primary.main" }}>
          Event log
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => void handleExport()}
            disabled={exporting || loading}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<DeleteSweepIcon />}
            onClick={() => setClearConfirmOpen(true)}
            disabled={loading || total === 0}
          >
            Clear logs
          </Button>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Canonical event types with fixed severities (C = critical, W = warning,
        I = informational). The database keeps at most {MAX_LOG_ENTRIES} entries
        (oldest removed automatically).
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

      {loading && events.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>When</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>User</TableCell>
                <TableCell sx={{ fontWeight: "bold", width: 56 }}>Lvl</TableCell>
                <TableCell sx={{ fontWeight: "bold", width: 88 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    No events recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {fmtWhen(row.occurredAt)}
                    </TableCell>
                    <TableCell>{row.username ?? "—"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.level}
                        color={levelColor(row.level)}
                        title={levelTitle(row.level)}
                        sx={{ fontWeight: "bold", minWidth: 36 }}
                      />
                    </TableCell>
                    <TableCell>
                      {row.category ? (
                        <Chip
                          size="small"
                          label={eventLabel(row.category)}
                          color={eventChipColor(row.category)}
                          variant="outlined"
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{row.message}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {visible < total && visible < MAX_LOG_ENTRIES && (
        <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
          <Button variant="outlined" onClick={showMore} disabled={loading}>
            Show more ({visible} of {Math.min(total, MAX_LOG_ENTRIES)})
          </Button>
        </Box>
      )}

      <Dialog
        open={clearConfirmOpen}
        onClose={() => !clearing && setClearConfirmOpen(false)}
      >
        <DialogTitle>Clear all event logs?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This permanently deletes all {total} entries in the event log database.
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearConfirmOpen(false)} disabled={clearing}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleClear()}
            disabled={clearing}
          >
            {clearing ? "Clearing…" : "Clear all"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default EventLogViewer;
