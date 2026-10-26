const DISCORD_GUILD_ICON_CDN = 'https://cdn.discordapp.com/icons/';
const DISCORD_GUILD_ICON_MEDIA = 'https://media.discordapp.net/icons/';

/**
 * Try the canonical Discord CDN first, then Discord's media proxy if it fails.
 * Other URLs are never rewritten or forwarded to the media proxy.
 * Failed sources are scoped to the current image component instance.
 */
export function guildIconSource(
  iconUrl: string | null | undefined,
  failedUrls: ReadonlySet<string>
): string | null {
  const original = iconUrl?.trim();
  if (!original) return null;

  if (!failedUrls.has(original)) return original;

  if (original.startsWith(DISCORD_GUILD_ICON_CDN)) {
    const alternative = DISCORD_GUILD_ICON_MEDIA + original.slice(DISCORD_GUILD_ICON_CDN.length);
    if (!failedUrls.has(alternative)) return alternative;
  }

  return null;
}
