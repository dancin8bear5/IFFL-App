import Foundation

/// One row per (owner, season). Mirrors `teams` in Postgres.
public struct Team: Identifiable, Hashable, Sendable, Codable {
    public let id: UUID
    public let ownerId: UUID
    public let season: Int
    public let espnTeamName: String
    public let teamAvatarUrl: String?
    public let monogramColor: String?      // hex string, e.g. "#FF6B35"

    public init(
        id: UUID,
        ownerId: UUID,
        season: Int,
        espnTeamName: String,
        teamAvatarUrl: String? = nil,
        monogramColor: String? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.season = season
        self.espnTeamName = espnTeamName
        self.teamAvatarUrl = teamAvatarUrl
        self.monogramColor = monogramColor
    }

    enum CodingKeys: String, CodingKey {
        case id
        case ownerId = "owner_id"
        case season
        case espnTeamName = "espn_team_name"
        case teamAvatarUrl = "team_avatar_url"
        case monogramColor = "monogram_color"
    }
}
