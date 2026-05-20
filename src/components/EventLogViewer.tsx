import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  fetchAdminEventLogs,
  type EventLevel,
  type EventLogEntry,
} from "../api/eventLog";
import { panelTitleSx } from "../theme";

const PAGE_SIZE = 10;

function levelColor(level: EventLevel): "error" | "warning" | "info" {
  if (level === "C") return "error";
  if (level === "W") return "warning";
  return "info";
}

function levelTitle(level: EventLevel): string {
  if (level === "C") return "Critical";
  if (level === "W") return "Warning";
  return "Informational";
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

  const load = useCallback(async (count: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminEventLogs(count, 0);
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
    setVisible((v) => Math.min(v + PAGE_SIZE, Math.max(total, v + PAGE_SIZE)));
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 4, textAlign: "left" }}>
      <Typography variant="subtitle2" gutterBottom sx={{ ...panelTitleSx, color: "primary.main" }}>
        Event log
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Application audit trail (C = critical, W = warning, I = informational). Mirrored
        to{" "}
        <Typography component="span" variant="body2" sx={{ fontFamily: "monospace" }}>
          logs/application-events.jsonl
        </Typography>{" "}
        in the repository.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
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
                <TableCell sx={{ fontWeight: "bold" }}>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
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
                    <TableCell>{row.message}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {visible < total && (
        <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
          <Button variant="outlined" onClick={showMore} disabled={loading}>
            Show more ({visible} of {total})
          </Button>
        </Box>
      )}
    </Paper>
  );
};

export default EventLogViewer;
