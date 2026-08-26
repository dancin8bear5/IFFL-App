import Foundation

/// NFL player catalog. Mirrors `players` in Postgres.
public struct Player: Identifiable, Hashable, Sendable, Codable {
    public enum Position: String, Hashable, Sendable, Codable, CaseIterable {
        case qb = "QB"
        case rb = "RB"
        case wr = "WR"
        case te = "TE"
        case k = "K"
        case dst = "D/ST"
        case op = "OP"
    }

    public let id: UUID
    public let espnId: String?
    public let fullName: String
    public let position: Position
    public let nflTeam: String?

    public init(
        id: UUID,
        espnId: String? = nil,
        fullName: String,
        position: Position,
        nflTeam: String? = nil
    ) {
        self.id = id
        self.espnId = espnId
        self.fullName = fullName
        self.position = position
        self.nflTeam = nflTeam
    }

    enum CodingKeys: String, CodingKey {
        case id
        case espnId = "espn_id"
        case fullName = "full_name"
        case position
        case nflTeam = "nfl_team"
    }
}
