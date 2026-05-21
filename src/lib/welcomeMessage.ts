const STORAGE_PREFIX = "karaoke_welcome_dismissed_";

export const WELCOME_EMAIL = "mpburton@gmail.com";

/** Body copy for the first-time welcome dialog (also linked from Settings). */
export const WELCOME_PARAGRAPHS: readonly string[] = [
  "This is an app for karaoke \"enthusiasts\" to keep track of the songs they sang, where they sang them, and how well they did.",
  "Use the Songs tab to add song from the Internet or search your repertoire for song information. You can also take notes on individual performances and add whatever tags you want about the song itself or your performance. You can also find links to your song's karaoke version on youtube, listen on Spotify if you have it installed, or download the lyrics. Your previous performance information is here, too!",
  "The Places tab allows you to manage your venues where you perform and see information about how you performed there.",
  "The Tags tab allows you to create and assign as many tags as you want and associate them with songs, individual performances, or venues. Once you've got some tags going, you can now search for those tags and find the perfect song for the perfect location!",
  "The Stats tab gives you an overview of your karaoke journey; how many performances, how many songs in your list, and even your all-time greatest hits!",
  "You can read this message again under Settings.",
];

export function isWelcomeDismissed(userId: number): boolean {
  return localStorage.getItem(`${STORAGE_PREFIX}${userId}`) === "1";
}

export function setWelcomeDismissed(userId: number): void {
  localStorage.setItem(`${STORAGE_PREFIX}${userId}`, "1");
}
