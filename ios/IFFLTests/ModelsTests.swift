import XCTest
@testable import IFFLCore

final class ModelsTests: XCTestCase {
    func test_ownerInitialsTwoWords() {
        let o = Owner(
            id: UUID(),
            masterName: "Jared",
            fullName: "Jared Taylor",
            email: "jarrtayl@gmail.com"
        )
        XCTAssertEqual(o.initials, "JT")
    }

    func test_ownerInitialsThreeWords() {
        let o = Owner(
            id: UUID(),
            masterName: "Wayne",
            fullName: "Wayne Vonder Heide",
            email: "wayne.vonderheide@gmail.com"
        )
        // Limited to first 2 parts: "WV"
        XCTAssertEqual(o.initials, "WV")
    }

    func test_contractIsWaiverBaseline_trueWhenFAABTwoDollarFresh() {
        let c = Contract(
            id: UUID(), teamId: UUID(), playerId: UUID(), season: 2026,
            source: .faab, originalCost: 2, acquiredInSeason: 2026,
            yearsKept: 0, currentKeeperCost: 2
        )
        XCTAssertTrue(c.isWaiverBaseline)
    }

    func test_contractIsWaiverBaseline_falseWhenAuction() {
        let c = Contract(
            id: UUID(), teamId: UUID(), playerId: UUID(), season: 2026,
            source: .auction, originalCost: 2, acquiredInSeason: 2026,
            yearsKept: 0, currentKeeperCost: 2
        )
        XCTAssertFalse(c.isWaiverBaseline)
    }

    func test_contractIsWaiverBaseline_falseWhenKept() {
        let c = Contract(
            id: UUID(), teamId: UUID(), playerId: UUID(), season: 2026,
            source: .faab, originalCost: 2, acquiredInSeason: 2025,
            yearsKept: 1, currentKeeperCost: 7
        )
        XCTAssertFalse(c.isWaiverBaseline)
    }

    func test_contractForecast_threeSeasons() throws {
        let c = Contract(
            id: UUID(), teamId: UUID(), playerId: UUID(), season: 2026,
            source: .auction, originalCost: 10, acquiredInSeason: 2024,
            yearsKept: 2, currentKeeperCost: 25
        )
        let forecast = try c.forecast(seasons: 3)
        XCTAssertEqual(forecast, [25, 40, 60])
    }

    func test_codableRoundTrip() throws {
        let owner = Owner(
            id: UUID(),
            masterName: "M. Zurek",
            fullName: "Matt Zurek",
            email: "zurezo@gmail.com",
            isCommissioner: true,
            isRulesCommittee: true
        )
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .useDefaultKeys
        let data = try encoder.encode(owner)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .useDefaultKeys
        let decoded = try decoder.decode(Owner.self, from: data)
        XCTAssertEqual(decoded, owner)
    }

    func test_positionRawValueMatchesSchemaCheckConstraint() {
        // The Postgres CHECK constraint is: position in ('QB','RB','WR','TE','K','D/ST','OP')
        let raws = Player.Position.allCases.map(\.rawValue).sorted()
        XCTAssertEqual(raws, ["D/ST", "K", "OP", "QB", "RB", "TE", "WR"])
    }
}
