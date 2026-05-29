import React, { useEffect, useState, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  CircularProgress, 
  Avatar,
  Chip,
  Rating,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme
} from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MicIcon from '@mui/icons-material/Mic';
import StarIcon from '@mui/icons-material/Star';
import PlaceIcon from '@mui/icons-material/Place';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import SchoolIcon from '@mui/icons-material/School';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { db } from '../db';
import { karaokeTokens } from '../theme';

interface GlobalStats {
  totalSongs: number;
  totalPerformances: number;
  avgRating: number;
  uniqueVenues: number;
  masteredCount: number;
  proficientCount: number;
  practicingCount: number;
}

interface TopArtist {
  artist_name: string;
  count: number;
}

interface TopSong {
  id: number;
  track_name: string;
  artist_name: string;
  count: number;
  artwork_url: string;
}

interface GenreStat {
  genre: string;
  count: number;
}

interface VenueStat {
  location: string;
  count: number;
  avgRating: number;
}

interface HistoryEntry {
  song_id: number;
  status: string;
  changed_at: string;
}

interface ChartData {
  week: string;
  Mastered: number;
  Proficient: number;
  Practicing: number;
}

interface PerformanceListRow {
  date: string;
  location: string | null;
  track_name: string;
  artist_name: string;
  rating: number | null;
}

interface SongByRatingRow {
  id: number;
  track_name: string;
  artist_name: string;
  artwork_url: string | null;
  avgRating: number;
  perfCount: number;
}

type StatsDetailDialog = 'performances' | 'ratings' | null;

const Stats: React.FC<{ currentUser: { id: number } }> = ({ currentUser }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [topSongs, setTopSongs] = useState<TopSong[]>([]);
  const [genres, setGenres] = useState<GenreStat[]>([]);
  const [venues, setVenues] = useState<VenueStat[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [detailDialog, setDetailDialog] = useState<StatsDetailDialog>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [performanceList, setPerformanceList] = useState<PerformanceListRow[]>([]);
  const [songsByRating, setSongsByRating] = useState<SongByRatingRow[]>([]);

  const processChartData = useCallback((history: HistoryEntry[]) => {
    const data: ChartData[] = [];
    const now = new Date();
    const weeksToShow = 12;
    
    // Start from 12 weeks ago
    const startDate = new Date();
    startDate.setDate(now.getDate() - (weeksToShow * 7));
    
    for (let i = 0; i <= weeksToShow; i++) {
      const weekEnd = new Date(startDate);
      weekEnd.setDate(startDate.getDate() + (i * 7));
      
      const weekLabel = i === weeksToShow ? 'Now' : `W-${weeksToShow - i}`;
      
      // Calculate status for each song at this point in time
      const songStatusMap = new Map<number, string>();
      
      for (const entry of history) {
        const changedAt = new Date(entry.changed_at.replace(' ', 'T') + 'Z'); // Handle SQLite format
        if (changedAt <= weekEnd) {
          songStatusMap.set(entry.song_id, entry.status);
        }
      }
      
      const counts = { Mastered: 0, Proficient: 0, Practicing: 0 };
      songStatusMap.forEach((status) => {
        if (status === 'Mastered') counts.Mastered++;
        else if (status === 'Proficient') counts.Proficient++;
        else if (status === 'Practicing') counts.Practicing++;
      });
      
      data.push({
        week: weekLabel,
        ...counts
      });
    }
    
    setChartData(data);
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const uid = currentUser.id;
    try {
      const [globalRes, artistRes, songRes, genreRes, venueRes, historyRes] = await Promise.all([
        db.execute({
          sql: `SELECT 
                  (SELECT COUNT(*) FROM songs WHERE user_id = ?) as totalSongs,
                  (SELECT COUNT(*) FROM performances WHERE user_id = ?) as totalPerformances,
                  (SELECT AVG(rating) FROM performances WHERE user_id = ?) as avgRating,
                  (SELECT COUNT(DISTINCT location) FROM performances WHERE user_id = ?) as uniqueVenues,
                  (SELECT COUNT(*) FROM songs WHERE user_id = ? AND vocal_status = 'Mastered') as masteredCount,
                  (SELECT COUNT(*) FROM songs WHERE user_id = ? AND vocal_status = 'Proficient') as proficientCount,
                  (SELECT COUNT(*) FROM songs WHERE user_id = ? AND vocal_status = 'Practicing') as practicingCount`,
          args: [uid, uid, uid, uid, uid, uid, uid],
        }),
        db.execute({
          sql: `SELECT artist_name, COUNT(*) as count 
                FROM performances p 
                JOIN songs s ON p.song_id = s.id 
                WHERE p.user_id = ? 
                GROUP BY s.artist_name 
                ORDER BY count DESC 
                LIMIT 5`,
          args: [uid],
        }),
        db.execute({
          sql: `SELECT s.id, s.track_name, s.artist_name, s.artwork_url, COUNT(*) as count 
                FROM performances p 
                JOIN songs s ON p.song_id = s.id 
                WHERE p.user_id = ? 
                GROUP BY s.id 
                ORDER BY count DESC 
                LIMIT 5`,
          args: [uid],
        }),
        db.execute({
          sql: `SELECT genre, COUNT(*) as count 
                FROM songs 
                WHERE user_id = ? AND genre IS NOT NULL
                GROUP BY genre 
                ORDER BY count DESC 
                LIMIT 8`,
          args: [uid],
        }),
        db.execute({
          sql: `SELECT location, COUNT(*) as count, AVG(rating) as avgRating 
                FROM performances 
                WHERE user_id = ? AND location != ''
                GROUP BY location 
                ORDER BY count DESC 
                LIMIT 5`,
          args: [uid],
        }),
        db.execute({
          sql: `SELECT h.song_id, h.status, h.changed_at
                FROM song_status_history h
                JOIN songs s ON h.song_id = s.id
                WHERE s.user_id = ?
                ORDER BY h.changed_at ASC`,
          args: [uid],
        }),
      ]);

      const g = globalRes.rows[0];
      setStats({
        totalSongs: Number(g.totalSongs),
        totalPerformances: Number(g.totalPerformances),
        avgRating: Number(g.avgRating) || 0,
        uniqueVenues: Number(g.uniqueVenues),
        masteredCount: Number(g.masteredCount),
        proficientCount: Number(g.proficientCount),
        practicingCount: Number(g.practicingCount)
      });

      setTopArtists(artistRes.rows as unknown as TopArtist[]);
      setTopSongs(songRes.rows as unknown as TopSong[]);
      setGenres(genreRes.rows as unknown as GenreStat[]);
      setVenues(venueRes.rows as unknown as VenueStat[]);

      const history = historyRes.rows as unknown as HistoryEntry[];
      if (history.length > 0) {
        processChartData(history);
      }

    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, processChartData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchStats]);

  const openPerformancesDialog = async () => {
    setDetailDialog('performances');
    setDetailLoading(true);
    try {
      const result = await db.execute({
        sql: `SELECT p.date, p.location, s.track_name, s.artist_name, p.rating
              FROM performances p
              JOIN songs s ON p.song_id = s.id
              WHERE p.user_id = ?
              ORDER BY p.date DESC, p.id DESC`,
        args: [currentUser.id],
      });
      setPerformanceList(result.rows as unknown as PerformanceListRow[]);
    } catch (err) {
      console.error('Error loading performance list:', err);
      setPerformanceList([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const openRatingsDialog = async () => {
    setDetailDialog('ratings');
    setDetailLoading(true);
    try {
      const result = await db.execute({
        sql: `SELECT s.id, s.track_name, s.artist_name, s.artwork_url,
                     AVG(p.rating) AS avgRating, COUNT(*) AS perfCount
              FROM performances p
              JOIN songs s ON p.song_id = s.id
              WHERE p.user_id = ? AND p.rating IS NOT NULL
              GROUP BY s.id
              ORDER BY avgRating DESC, perfCount DESC, s.track_name ASC`,
        args: [currentUser.id],
      });
      setSongsByRating(
        (result.rows as unknown as SongByRatingRow[]).map((row) => ({
          ...row,
          avgRating: Number(row.avgRating),
          perfCount: Number(row.perfCount),
        }))
      );
    } catch (err) {
      console.error('Error loading songs by rating:', err);
      setSongsByRating([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const formatPerfDate = (date: string) => {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString();
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ pb: 4 }}>
      <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold', mb: 4 }}>
        Your karaoke journey
      </Typography>

      {/* Hero Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          {
            label: 'Performances',
            value: stats?.totalPerformances,
            icon: <MicIcon color="primary" />,
            onClick: () => void openPerformancesDialog(),
          },
          {
            label: 'Songs in List',
            value: stats?.totalSongs,
            icon: <MusicNoteIcon color="secondary" />,
          },
          {
            label: 'Average Rating',
            value: stats?.avgRating.toFixed(1),
            icon: <StarIcon sx={{ color: karaokeTokens.starGold }} />,
            onClick: () => void openRatingsDialog(),
          },
          {
            label: 'Venues Visited',
            value: stats?.uniqueVenues,
            icon: <PlaceIcon color="info" />,
          },
        ].map((item, i) => (
          <Grid size={{ xs: 6, md: 3 }} key={i}>
            <Paper
              elevation={3}
              onClick={item.onClick}
              sx={{
                p: 3,
                textAlign: 'center',
                height: '100%',
                border: '1px solid',
                borderColor: 'divider',
                cursor: item.onClick ? 'pointer' : 'default',
                transition: 'background-color 0.15s',
                ...(item.onClick
                  ? {
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 2,
                      },
                    }
                  : {}),
              }}
              {...(item.onClick
                ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        item.onClick?.();
                      }
                    },
                  }
                : {})}
            >
              <Box sx={{ mb: 1 }}>{item.icon}</Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{item.value}</Typography>
              <Typography variant="caption" color="textSecondary">{item.label}</Typography>
              {item.onClick && (
                <Typography variant="caption" display="block" color="primary" sx={{ mt: 0.5 }}>
                  Tap for details
                </Typography>
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Proficiency Breakdown */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          { label: 'Mastered', value: stats?.masteredCount, icon: <StarIcon sx={{ color: '#FFD700' }} />, color: '#FFD700' },
          { label: 'Proficient', value: stats?.proficientCount, icon: <SchoolIcon color="success" />, color: 'success.main' },
          { label: 'Practicing', value: stats?.practicingCount, icon: <FitnessCenterIcon color="info" />, color: 'info.main' },
        ].map((item, i) => (
          <Grid size={{ xs: 4 }} key={i}>
            <Paper elevation={2} sx={{ p: 2, textAlign: 'center', borderRadius: 3, borderLeft: '4px solid', borderLeftColor: item.color }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                {item.icon}
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{item.value}</Typography>
              </Box>
              <Typography variant="caption" color="textSecondary">{item.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Progress Chart */}
      {chartData.length > 0 && (
        <Paper elevation={2} sx={{ p: 3, borderRadius: 4, mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 3 }}>Weekly Repertoire Growth</Typography>
          <Box sx={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                <XAxis 
                  dataKey="week" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme.palette.background.paper, 
                    borderColor: theme.palette.divider,
                    borderRadius: 8
                  }} 
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="Mastered" 
                  stroke="#FFD700" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: "#FFD700" }} 
                  activeDot={{ r: 6 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="Proficient" 
                  stroke={theme.palette.success.main} 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: theme.palette.success.main }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="Practicing" 
                  stroke={theme.palette.info.main} 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: theme.palette.info.main }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      <Grid container spacing={4}>
        {/* Top Tracks */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
              <EmojiEventsIcon sx={{ color: karaokeTokens.starGold }} />
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>All-time greatest hits</Typography>
            </Box>
            <List>
              {topSongs.map((song, i) => (
                <ListItem key={song.id} divider={i !== topSongs.length - 1}>
                  <ListItemAvatar>
                    <Avatar variant="rounded" src={song.artwork_url} />
                  </ListItemAvatar>
                  <ListItemText 
                    primary={song.track_name} 
                    secondary={song.artist_name} 
                  />
                  <Chip 
                    label={`${song.count} plays`} 
                    size="small" 
                    color="primary" 
                    variant="outlined" 
                    sx={{ fontWeight: 'bold' }} 
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Top Artists & Genres */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%' }}>
            <Paper elevation={2} sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                <TrendingUpIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Top artists</Typography>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {topArtists.map((artist, i) => (
                  <Chip 
                    key={i} 
                    label={`${artist.artist_name} (${artist.count})`} 
                    color={i === 0 ? "primary" : "default"}
                    sx={{ fontWeight: i === 0 ? 'bold' : 'normal' }}
                  />
                ))}
              </Box>
            </Paper>

            <Paper elevation={2} sx={{ p: 3, flexGrow: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>Genre mix</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {genres.map((g, i) => (
                  <Box key={i} sx={{ width: '100%', mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">{g.genre}</Typography>
                      <Typography variant="body2" color="textSecondary">{g.count} songs</Typography>
                    </Box>
                    <Box sx={{ width: '100%', height: 8, bgcolor: 'background.default', borderRadius: 9999, overflow: 'hidden' }}>
                      <Box sx={{ 
                        width: `${(g.count / (stats?.totalSongs || 1)) * 100}%`, 
                        height: '100%', 
                        bgcolor: i % 2 === 0 ? 'primary.main' : 'secondary.main',
                        borderRadius: 9999,
                      }} />
                    </Box>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Box>
        </Grid>

        {/* Venue Leaderboard */}
        <Grid size={{ xs: 12 }}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
              <PlaceIcon color="error" />
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Venue power ranking</Typography>
            </Box>
            <Grid container spacing={2}>
              {venues.map((v, i) => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }} key={i}>
                  <Box sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Typography variant="subtitle1" noWrap sx={{ fontWeight: 'bold' }}>{v.location}</Typography>
                    <Typography variant="h5" color="primary" sx={{ my: 1, fontWeight: 'bold' }}>{v.count}</Typography>
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>Performances</Typography>
                    <Rating value={v.avgRating} readOnly size="small" />
                  </Box>
                </Grid>
              ))}
              {venues.length === 0 && (
                <Grid size={{ xs: 12 }}>
                  <Typography align="center" color="textSecondary">No venue data yet — record a performance at a venue to see rankings here.</Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      <Dialog
        open={detailDialog === 'performances'}
        onClose={() => setDetailDialog(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>All performances</DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : performanceList.length === 0 ? (
            <Typography color="text.secondary">No performances recorded yet.</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Venue</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Song</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="center">
                      Rating
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {performanceList.map((row, idx) => (
                    <TableRow key={`${row.date}-${row.track_name}-${idx}`}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {formatPerfDate(row.date)}
                      </TableCell>
                      <TableCell>{row.location?.trim() || '—'}</TableCell>
                      <TableCell>
                        {row.track_name}
                        <Typography variant="caption" color="text.secondary" display="block">
                          {row.artist_name}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {row.rating != null ? (
                          <Rating value={row.rating} readOnly size="small" />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={detailDialog === 'ratings'}
        onClose={() => setDetailDialog(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Songs ranked by average rating</DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : songsByRating.length === 0 ? (
            <Typography color="text.secondary">
              No rated performances yet. Record a performance with a star rating to see rankings
              here.
            </Typography>
          ) : (
            <List disablePadding>
              {songsByRating.map((song, i) => (
                <ListItem key={song.id} divider={i < songsByRating.length - 1}>
                  <ListItemAvatar>
                    <Avatar variant="rounded" src={song.artwork_url ?? undefined} />
                  </ListItemAvatar>
                  <ListItemText
                    primary={song.track_name}
                    secondary={song.artist_name}
                  />
                  <Box sx={{ textAlign: 'right', ml: 1 }}>
                    <Rating
                      value={song.avgRating}
                      readOnly
                      size="small"
                      precision={0.1}
                    />
                    <Typography variant="caption" color="text.secondary" display="block">
                      {song.avgRating.toFixed(1)} · {song.perfCount}{' '}
                      {song.perfCount === 1 ? 'performance' : 'performances'}
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Stats;
