import Foundation
import SwiftData

// MARK: - SwiftData Models
//
// All money is stored as whole-dollar `Int` to avoid floating-point penny drift.
// The object graph is: Trip → [Player], Trip → [Game] → [GameLine] → Player.
// A GameLine records one player's stake (`contribution`) and winnings (`payout`)
// in one game; their net for that game is `payout - contribution`.

@Model
final class Trip {
    var name: String
    var date: Date
    /// "Usually static" default buy-in; new games start from this value.
    var defaultBuyIn: Int

    @Relationship(deleteRule: .cascade, inverse: \Player.trip)
    var players: [Player]

    @Relationship(deleteRule: .cascade, inverse: \Game.trip)
    var games: [Game]

    init(name: String, date: Date = .now, defaultBuyIn: Int = 0) {
        self.name = name
        self.date = date
        self.defaultBuyIn = defaultBuyIn
        self.players = []
        self.games = []
    }

    /// Players sorted by name for stable display.
    var sortedPlayers: [Player] {
        players.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Games newest-first.
    var sortedGames: [Game] {
        games.sorted { $0.date > $1.date }
    }
}

@Model
final class Player {
    var name: String
    var trip: Trip?

    @Relationship(deleteRule: .cascade, inverse: \GameLine.player)
    var lines: [GameLine]

    init(name: String, trip: Trip? = nil) {
        self.name = name
        self.trip = trip
        self.lines = []
    }
}

@Model
final class Game {
    var name: String
    var date: Date
    var buyIn: Int
    var trip: Trip?

    @Relationship(deleteRule: .cascade, inverse: \GameLine.game)
    var lines: [GameLine]

    init(name: String, date: Date = .now, buyIn: Int, trip: Trip? = nil) {
        self.name = name
        self.date = date
        self.buyIn = buyIn
        self.trip = trip
        self.lines = []
    }

    var pot: Int { lines.reduce(0) { $0 + $1.contribution } }
    var totalPaidOut: Int { lines.reduce(0) { $0 + $1.payout } }
    var isBalanced: Bool { pot == totalPaidOut }

    /// The line with the largest positive net, if any (the "winner").
    var winnerLine: GameLine? {
        lines.filter { $0.net > 0 }.max { $0.net < $1.net }
    }
}

@Model
final class GameLine {
    /// What this player put into the pot for this game (defaults to game buy-in).
    var contribution: Int
    /// What this player collected from this game (winner = whole pot, losers = 0).
    var payout: Int
    var player: Player?
    var game: Game?

    init(contribution: Int, payout: Int, player: Player? = nil, game: Game? = nil) {
        self.contribution = contribution
        self.payout = payout
        self.player = player
        self.game = game
    }

    /// This player's net for this single game.
    var net: Int { payout - contribution }
}
