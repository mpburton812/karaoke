import axios from 'axios';

export const cleanText = (text: string): string => {
  return text.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*-.*$/g, '').trim();
};

export const fetchLyrics = async (artist: string, title: string): Promise<string | null> => {
  try {
    const cleanArtist = cleanText(artist);
    const cleanTitle = cleanText(title);
    
    const response = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`);
    return response.data.lyrics || null;
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    return null;
  }
};
