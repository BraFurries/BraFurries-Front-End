export interface DiscordServerInfo {
  type: number
  code: string
  expires_at: any
  guild: Guild
  guild_id: string
  channel: Channel
  profile: Profile
  approximate_member_count: number
  approximate_presence_count: number
}

export interface Guild {
  id: string
  name: string
  splash: string
  banner: string
  description: string
  icon: string
  features: string[]
  verification_level: number
  vanity_url_code: string
  nsfw_level: number
  nsfw: boolean
  premium_subscription_count: number
  premium_tier: number
}

export interface Channel {
  id: string
  type: number
  name: string
}

export interface Profile {
  id: string
  name: string
  icon_hash: string
  member_count: number
  online_count: number
  description: string
  banner_hash: any
  game_application_ids: string[]
  game_activity: Record<string, ActivityData>
  tag: string
  badge: number
  badge_color_primary: string
  badge_color_secondary: string
  badge_hash: string
  traits: Trait[]
  features: string[]
  visibility: number
  custom_banner_hash: string
  premium_subscription_count: number
  premium_tier: number
}

interface ActivityData {
  activity_level: number;
  activity_score: number;
}

export interface Trait {
  emoji_id: any
  emoji_name: string
  emoji_animated: boolean
  label: string
  position: number
}