import Foundation

public struct Trade: Identifiable, Hashable, Sendable, Codable {
    public enum Status: String, Sendable, Codable, CaseIterable {
        case proposed
        case accepted
        case rejected
        case cancelled
        case expired
        case luxtaxPending = "luxtax_pending"
        case voided
    }

    public enum SourceChannel: String, Sendable, Codable {
        case espnEmail = "espn_email"
        case iosApp    = "ios_app"
    }

    public let id: UUID
    public let proposedBy: UUID         // team_id
    public let proposedTo: UUID
    public let status: Status
    public let sourceChannel: SourceChannel
    public let proposedAt: Date
    public let decidedAt: Date?
    public let luxtaxOwedByTeamId: UUID?
    public let luxtaxPaymentDueAt: Date?
    public let luxtaxPaidAt: Date?
    public let notes: String?

    public var isPending: Bool {
        status == .proposed || status == .luxtaxPending
    }

    enum CodingKeys: String, CodingKey {
        case id
        case proposedBy = "proposed_by"
        case proposedTo = "proposed_to"
        case status
        case sourceChannel = "source_channel"
        case proposedAt = "proposed_at"
        case decidedAt = "decided_at"
        case luxtaxOwedByTeamId = "luxtax_owed_by_team_id"
        case luxtaxPaymentDueAt = "luxtax_payment_due_at"
        case luxtaxPaidAt = "luxtax_paid_at"
        case notes
    }
}

public struct TradeAsset: Identifiable, Hashable, Sendable, Codable {
    public enum Kind: String, Sendable, Codable {
        case contract
        case rookiePick = "rookie_pick"
        case faabDollars = "faab_dollars"
    }

    public let id: UUID
    public let tradeId: UUID
    public let givingTeamId: UUID
    public let assetType: Kind
    public let contractId: UUID?
    public let rookiePickId: UUID?
    public let faabAmount: Decimal?

    enum CodingKeys: String, CodingKey {
        case id
        case tradeId = "trade_id"
        case givingTeamId = "giving_team_id"
        case assetType = "asset_type"
        case contractId = "contract_id"
        case rookiePickId = "rookie_pick_id"
        case faabAmount = "faab_amount"
    }
}
