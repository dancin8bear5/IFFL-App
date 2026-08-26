import Foundation

/// One of the 12 IFFL owners. Mirrors `app_users` in Postgres.
public struct Owner: Identifiable, Hashable, Sendable, Codable {
    public let id: UUID
    public let masterName: String          // "A. Zurek" — matches the Sheet
    public let fullName: String            // "Andrew Zurek"
    public let email: String
    public let phone: String?
    public let groupmeHandle: String?
    public let isCommissioner: Bool
    public let isTreasurer: Bool
    public let isRulesCommittee: Bool

    public init(
        id: UUID,
        masterName: String,
        fullName: String,
        email: String,
        phone: String? = nil,
        groupmeHandle: String? = nil,
        isCommissioner: Bool = false,
        isTreasurer: Bool = false,
        isRulesCommittee: Bool = false
    ) {
        self.id = id
        self.masterName = masterName
        self.fullName = fullName
        self.email = email
        self.phone = phone
        self.groupmeHandle = groupmeHandle
        self.isCommissioner = isCommissioner
        self.isTreasurer = isTreasurer
        self.isRulesCommittee = isRulesCommittee
    }

    /// "AZ", "JT", "BH" — used for monogram fallback in compact UI spots.
    public var initials: String {
        let parts = fullName.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    enum CodingKeys: String, CodingKey {
        case id
        case masterName = "master_name"
        case fullName = "full_name"
        case email
        case phone
        case groupmeHandle = "groupme_handle"
        case isCommissioner = "is_commissioner"
        case isTreasurer = "is_treasurer"
        case isRulesCommittee = "is_rules_committee"
    }
}
