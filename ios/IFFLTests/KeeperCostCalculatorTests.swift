import XCTest
@testable import IFFLCore

final class KeeperCostCalculatorTests: XCTestCase {
    func test_originalCostReturnedWhenNotKept() throws {
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 10, yearsKept: 0), 10)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 50, yearsKept: 0), 50)
    }

    /// Sheet-validated ladder: $10 original through 5 keeps -> 15, 25, 40, 60, 85
    func test_tenDollarLadder() throws {
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 10, yearsKept: 1), 15)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 10, yearsKept: 2), 25)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 10, yearsKept: 3), 40)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 10, yearsKept: 4), 60)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 10, yearsKept: 5), 85)
    }

    /// Rookie-round-2 / waiver-cleared baseline: $1 -> 6, 16, 31, 51, 76
    func test_oneDollarLadder() throws {
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 1, yearsKept: 1), 6)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 1, yearsKept: 5), 76)
    }

    /// Rookie-round-1 / waiver baseline: $2 -> 7, 17, 32, 52, 77
    func test_twoDollarLadder() throws {
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 2, yearsKept: 1), 7)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 2, yearsKept: 2), 17)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 2, yearsKept: 5), 77)
    }

    /// Direct sheet match: A. Zurek's Stefon Diggs ($10 original, 2024 ->
    /// 2026 = 2 keeps -> $25), Chris Godwin ($4 original, 2 keeps -> $19).
    func test_sheetMatchesSpotCheck() throws {
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 10, yearsKept: 2), 25)
        XCTAssertEqual(try KeeperCostCalculator.cost(original: 4, yearsKept: 2), 19)
    }

    func test_renewIncrementsByOneYear() throws {
        // $10 in year 2 ($25) renewed to year 3 should be $40
        XCTAssertEqual(try KeeperCostCalculator.renew(original: 10, yearsKept: 2), 40)
    }

    func test_forecastNextThreeSeasons() throws {
        // Started 2024 at $10, currently 2026 (2 keeps -> $25); forecast 2026/27/28
        let forecast = try KeeperCostCalculator.forecast(
            original: 10, yearsKept: 2, seasons: 3
        )
        XCTAssertEqual(forecast, [25, 40, 60])
    }

    func test_throwsOnNegativeOriginal() {
        XCTAssertThrowsError(try KeeperCostCalculator.cost(original: -1, yearsKept: 0)) { err in
            XCTAssertEqual(err as? KeeperCostCalculator.Error, .originalCostNegative(-1))
        }
    }

    func test_throwsOnYearsOutOfRange() {
        XCTAssertThrowsError(try KeeperCostCalculator.cost(original: 10, yearsKept: -1)) { err in
            XCTAssertEqual(err as? KeeperCostCalculator.Error, .yearsKeptOutOfRange(-1))
        }
        XCTAssertThrowsError(try KeeperCostCalculator.cost(original: 10, yearsKept: 6)) { err in
            XCTAssertEqual(err as? KeeperCostCalculator.Error, .yearsKeptOutOfRange(6))
        }
    }

    func test_renewBeyondMaxThrows() {
        XCTAssertThrowsError(try KeeperCostCalculator.renew(original: 10, yearsKept: 5))
    }
}
