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
  ListItemText
} from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MicIcon from '@mui/icons-material/Mic';
import StarIcon from '@mui/icons-material/Star';
import PlaceIcon from '@mui/icons-material/Place';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { db } from '../db';

interface GlobalStats {
  totalSongs: number;
  totalPerformances: number;
  avgRating: number;
  uniqueVenues: number;
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

const Stats: React.FC<{ currentUser: { id: number } }> = ({ currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [topSongs, setTopSongs] = useState<TopSong[]>([]);
  const [genres, setGenres] = useState<GenreStat[]>([]);
  const [venues, setVenues] = useState<VenueStat[]>([]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Global Stats
      const globalRes = await db.execute({
        sql: `SELECT 
                (SELECT COUNT(*) FROM songs WHERE user_id = ?) as totalSongs,
                (SELECT COUNT(*) FROM performances WHERE user_id = ?) as totalPerformances,
                (SELECT AVG(rating) FROM performances WHERE user_id = ?) as avgRating,
                (SELECT COUNT(DISTINCT location) FROM performances WHERE user_id = ?) as uniqueVenues`,
        args: [currentUser.id, currentUser.id, currentUser.id, currentUser.id]
      });
      
      const g = globalRes.rows[0];
      setStats({
        totalSongs: Number(g.totalSongs),
        totalPerformances: Number(g.totalPerformances),
        avgRating: Number(g.avgRating) || 0,
        uniqueVenues: Number(g.uniqueVenues)
      });

      // 2. Top Artists
      const artistRes = await db.execute({
        sql: `SELECT artist_name, COUNT(*) as count 
              FROM performances p 
              JOIN songs s ON p.song_id = s.id 
              WHERE p.user_id = ? 
              GROUP BY s.artist_name 
              ORDER BY count DESC 
              LIMIT 5`,
        args: [currentUser.id]
      });
      setTopArtists(artistRes.rows as unknown as TopArtist[]);

      // 3. Top Songs
      const songRes = await db.execute({
        sql: `SELECT s.id, s.track_name, s.artist_name, s.artwork_url, COUNT(*) as count 
              FROM performances p 
              JOIN songs s ON p.song_id = s.id 
              WHERE p.user_id = ? 
              GROUP BY s.id 
              ORDER BY count DESC 
              LIMIT 5`,
        args: [currentUser.id]
      });
      setTopSongs(songRes.rows as unknown as TopSong[]);

      // 4. Genres
      const genreRes = await db.execute({
        sql: `SELECT genre, COUNT(*) as count 
              FROM songs 
              WHERE user_id = ? AND genre IS NOT NULL
              GROUP BY genre 
              ORDER BY count DESC 
              LIMIT 8`,
        args: [currentUser.id]
      });
      setGenres(genreRes.rows as unknown as GenreStat[]);

      // 5. Venue Rankings
      const venueRes = await db.execute({
        sql: `SELECT location, COUNT(*) as count, AVG(rating) as avgRating 
              FROM performances 
              WHERE user_id = ? AND location != ''
              GROUP BY location 
              ORDER BY count DESC 
              LIMIT 5`,
        args: [currentUser.id]
      });
      setVenues(venueRes.rows as unknown as VenueStat[]);

    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchStats]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ pb: 4 }}>
      <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold', mb: 4 }}>
        Your Karaoke Journey
      </Typography>

      {/* Hero Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          { label: 'Performances', value: stats?.totalPerformances, icon: <MicIcon color="primary" />, color: 'primary.main' },
          { label: 'Songs in List', value: stats?.totalSongs, icon: <MusicNoteIcon color="secondary" />, color: 'secondary.main' },
          { label: 'Average Rating', value: stats?.avgRating.toFixed(1), icon: <StarIcon sx={{ color: '#FFD700' }} />, color: '#FFD700' },
          { label: 'Venues Visited', value: stats?.uniqueVenues, icon: <PlaceIcon color="info" />, color: 'info.main' },
        ].map((item, i) => (
          <Grid size={{ xs: 6, md: 3 }} key={i}>
            <Paper elevation={3} sx={{ p: 3, textAlign: 'center', borderRadius: 4, height: '100%', border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ mb: 1 }}>{item.icon}</Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{item.value}</Typography>
              <Typography variant="caption" color="textSecondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>{item.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={4}>
        {/* Top Tracks */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 4, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
              <EmojiEventsIcon sx={{ color: '#FFD700' }} />
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>All-Time Greatest Hits</Typography>
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
            <Paper elevation={2} sx={{ p: 3, borderRadius: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                <TrendingUpIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Top Artists</Typography>
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

            <Paper elevation={2} sx={{ p: 3, borderRadius: 4, flexGrow: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>Genre DNA</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {genres.map((g, i) => (
                  <Box key={i} sx={{ width: '100%', mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">{g.genre}</Typography>
                      <Typography variant="body2" color="textSecondary">{g.count} songs</Typography>
                    </Box>
                    <Box sx={{ width: '100%', height: 8, bgcolor: 'background.default', borderRadius: 4, overflow: 'hidden' }}>
                      <Box sx={{ 
                        width: `${(g.count / (stats?.totalSongs || 1)) * 100}%`, 
                        height: '100%', 
                        bgcolor: i % 2 === 0 ? 'primary.main' : 'secondary.main' 
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
          <Paper elevation={2} sx={{ p: 3, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
              <PlaceIcon color="error" />
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Venue Power Ranking</Typography>
            </Box>
            <Grid container spacing={2}>
              {venues.map((v, i) => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }} key={i}>
                  <Box sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                    <Typography variant="subtitle1" noWrap sx={{ fontWeight: 'bold' }}>{v.location}</Typography>
                    <Typography variant="h5" color="primary" sx={{ my: 1, fontWeight: 'bold' }}>{v.count}</Typography>
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>PERFORMANCES</Typography>
                    <Rating value={v.avgRating} readOnly size="small" />
                  </Box>
                </Grid>
              ))}
              {venues.length === 0 && (
                <Grid size={{ xs: 12 }}>
                  <Typography align="center" color="textSecondary">No venue data yet. Start performing!</Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Stats;
