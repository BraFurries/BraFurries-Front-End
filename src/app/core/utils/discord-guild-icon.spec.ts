import { guildIconSource } from './discord-guild-icon';

describe('guildIconSource', () => {
  const cdn = 'https://cdn.discordapp.com/icons/1234567890/abc_def.png?size=1024';
  const media = 'https://media.discordapp.net/icons/1234567890/abc_def.png?size=1024';

  it('uses the canonical guild icon URL before any failure', () => {
    expect(guildIconSource(cdn, new Set())).toBe(cdn);
  });

  it('retries with the Discord media host after the CDN connection fails', () => {
    expect(guildIconSource(cdn, new Set([cdn]))).toBe(media);
  });

  it('renders the caller fallback after both Discord sources fail', () => {
    expect(guildIconSource(cdn, new Set([cdn, media]))).toBeNull();
  });

  it('does not proxy unknown hosts or unrelated image paths', () => {
    const external = 'https://images.example.com/custom.png';
    const unrelated = 'https://cdn.discordapp.com/avatars/123/abc.png';
    expect(guildIconSource(external, new Set([external]))).toBeNull();
    expect(guildIconSource(unrelated, new Set([unrelated]))).toBeNull();
  });

  it('handles servers with no icon without requesting an image', () => {
    expect(guildIconSource(null, new Set())).toBeNull();
    expect(guildIconSource('  ', new Set())).toBeNull();
  });
});
