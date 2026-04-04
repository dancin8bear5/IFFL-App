import Foundation
import Firebase
import FirebaseFirestore

// MARK: - DataSeeder
// One-time operation to populate Firestore from the 2026 IFFL Keeper Master List.
// The commissioner triggers this from AdminView. It is idempotent: if the
// "players" collection already has documents it will abort cleanly.
//
// Collections written:
//   config/league       — league settings + authorized UIDs
//   seasons/2026        — active season milestones
//   players/{auto}      — all 2026 roster players
//   draftPicks/{auto}   — 2026 and 2027 future draft picks

class DataSeeder {

    private let db = Firestore.firestore()

    // MARK: - Entry Point

    func seedIfNeeded(commissionerUID: String, completion: @escaping (Result<String, Error>) -> Void) {
        db.collection("players").limit(to: 1).getDocuments { [self] snapshot, _ in
            let alreadySeeded = !(snapshot?.documents.isEmpty ?? true)
            if alreadySeeded {
                completion(.success("Database already seeded — skipped."))
                return
            }
            self.runSeed(commissionerUID: commissionerUID, completion: completion)
        }
    }

    private func runSeed(commissionerUID: String, completion: @escaping (Result<String, Error>) -> Void) {
        let group = DispatchGroup()
        var errors: [Error] = []

        group.enter()
        writeLeagueConfig(commissionerUID: commissionerUID) { e in
            if let e = e { errors.append(e) }
            group.leave()
        }

        group.enter()
        writeSeason2026 { e in
            if let e = e { errors.append(e) }
            group.leave()
        }

        // Write players and picks in batches (Firestore limit = 500 ops/batch)
        group.enter()
        writePlayers { e in
            if let e = e { errors.append(e) }
            group.leave()
        }

        group.enter()
        writeDraftPicks { e in
            if let e = e { errors.append(e) }
            group.leave()
        }

        group.notify(queue: .main) {
            if errors.isEmpty {
                completion(.success("Seed complete: \(Self.playerSeeds.count) players, \(Self.pickSeeds.count) picks written."))
            } else {
                completion(.failure(errors.first!))
            }
        }
    }

    // MARK: - League Config

    private func writeLeagueConfig(commissionerUID: String, completion: @escaping (Error?) -> Void) {
        let config = LeagueConfig(
            activeSeasonYear: 2026,
            authorizedUIDs: [commissionerUID],
            teamEmailMap: [
                "azurek":   "A. Zurek",
                "abad":     "Abad",
                "bill":     "Bill",
                "cantone":  "Cantone",
                "dugan":    "Dugan",
                "faybik":   "Faybik",
                "foley":    "Foley",
                "jared":    "Jared",
                "jason":    "Jason",
                "mzurek":   "M. Zurek",
                "ryan":     "Ryan",
                "wayne":    "Wayne"
            ]
        )
        do {
            try db.collection("config").document("league").setData(from: config, completion: completion)
        } catch {
            completion(error)
        }
    }

    // MARK: - Season 2026

    private func writeSeason2026(completion: @escaping (Error?) -> Void) {
        let season = Season(
            year: 2026,
            isActive: true,
            milestones: [
                SeasonMilestone(name: "Start of Off-Season",        description: "Day after Super Bowl",                date: date("2025-02-10")),
                SeasonMilestone(name: "Trade Window Opens",         description: "1st Day of Offseason",               date: date("2025-02-10")),
                SeasonMilestone(name: "Rookie Draft Pick Lottery",  description: "Mid February",                       date: date("2026-02-11")),
                SeasonMilestone(name: "NFL Draft",                  description: "Draft Date — approx April 23rd",     date: nil),
                SeasonMilestone(name: "Rookie Draft",               description: "NFL Training Camp Opens",            date: date("2026-07-23")),
                SeasonMilestone(name: "Select Keepers",             description: "2-4 Days prior to IFFL Auction",     date: nil),
                SeasonMilestone(name: "IFFL Auction Draft",         description: "Last Monday of August",              date: nil),
                SeasonMilestone(name: "League Dues Paid",           description: "Auction Draft",                      date: date("2026-08-31")),
                SeasonMilestone(name: "NFL Season Start",           description: "1st Day of NFL Season",              date: date("2026-09-10")),
                SeasonMilestone(name: "Rosters Frozen",             description: "NFL Week 17",                        date: date("2027-01-03"))
            ]
        )
        do {
            try db.collection("seasons").document("2026").setData(from: season, completion: completion)
        } catch {
            completion(error)
        }
    }

    // MARK: - Players

    private func writePlayers(completion: @escaping (Error?) -> Void) {
        let chunks = stride(from: 0, to: Self.playerSeeds.count, by: 400).map {
            Array(Self.playerSeeds[$0..<min($0 + 400, Self.playerSeeds.count)])
        }

        var chunkErrors: [Error] = []
        let g = DispatchGroup()

        for chunk in chunks {
            g.enter()
            let batch = db.batch()
            for seed in chunk {
                let ref = db.collection("players").document()
                let player = Player(
                    teamName: seed.team,
                    position: seed.position,
                    name: seed.name,
                    prices: ["2026": seed.p2026, "2027": seed.p2027, "2028": seed.p2028],
                    originalPrice: seed.originalPrice,
                    purchaseYear: seed.purchaseYear,
                    contractYearsRemaining: seed.contractYears,
                    playerPool: seed.playerPool,
                    rookieRound: seed.rookieRound,
                    rookieDraftYear: seed.rookieDraftYear,
                    tradeHistory: seed.tradeHistory,
                    isActive: true,
                    acquiredSeason: seed.purchaseYear
                )
                do {
                    try batch.setData(from: player, forDocument: ref)
                } catch {
                    chunkErrors.append(error)
                }
            }
            batch.commit { e in
                if let e = e { chunkErrors.append(e) }
                g.leave()
            }
        }

        g.notify(queue: .main) {
            completion(chunkErrors.first)
        }
    }

    // MARK: - Draft Picks

    private func writeDraftPicks(completion: @escaping (Error?) -> Void) {
        let batch = db.batch()
        for seed in Self.pickSeeds {
            let ref = db.collection("draftPicks").document()
            let pick = DraftPickAsset(
                season: seed.season,
                round: seed.round,
                slot: seed.slot,
                currentTeamName: seed.team,
                originalTeamName: seed.originalTeam,
                prices: ["2026": seed.round == 1 ? 2 : 1,
                         "2027": seed.round == 1 ? 7 : 6,
                         "2028": seed.round == 1 ? 17 : 16],
                tradeHistory: seed.tradeHistory
            )
            do {
                try batch.setData(from: pick, forDocument: ref)
            } catch {
                completion(error)
                return
            }
        }
        batch.commit(completion: completion)
    }

    // MARK: - Helpers

    private func date(_ iso: String) -> Date? {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        return fmt.date(from: iso)
    }

    // MARK: - Player Seed Data

    struct PlayerSeed {
        let team: String, position: String, name: String
        let p2026: Int, p2027: Int, p2028: Int
        let originalPrice: Int, purchaseYear: Int, contractYears: Int
        let playerPool: String
        let rookieRound: Int?, rookieDraftYear: Int?
        let tradeHistory: [String]

        init(_ team: String, _ pos: String, _ name: String,
             _ p26: Int, _ p27: Int, _ p28: Int,
             _ orig: Int, _ pYear: Int, _ cYears: Int,
             _ pool: String,
             _ rRound: Int? = nil, _ rYear: Int? = nil,
             _ hist: [String] = []) {
            self.team = team; self.position = pos; self.name = name
            self.p2026 = p26; self.p2027 = p27; self.p2028 = p28
            self.originalPrice = orig; self.purchaseYear = pYear; self.contractYears = cYears
            self.playerPool = pool
            self.rookieRound = rRound; self.rookieDraftYear = rYear
            self.tradeHistory = hist
        }
    }

    // swiftformat:disable all
    static let playerSeeds: [PlayerSeed] = [

        // MARK: A. Zurek
        .init("A. Zurek","WR","Stefon Diggs",           25,40,60, 10,2024,3,"Auction"),
        .init("A. Zurek","WR","Chris Godwin",            19,34,54,  4,2024,3,"Auction"),
        .init("A. Zurek","WR","Ricky Pearsall",          16,31,51,  1,2024,3,"Rookie Draft",2,2024),
        .init("A. Zurek","RB","Tyrone Tracy Jr",         16,31,51,  1,2024,3,"Auction",1,2025,["via Bill"]),
        .init("A. Zurek","WR","Josh Downs",               9,19,34,  4,2025,2,"Auction"),
        .init("A. Zurek","QB","Cam Ward",                 7,17,32,  2,2025,2,"Draft Pick",1,2025,["via Cantone","via Ryan"]),
        .init("A. Zurek","WR","Cedric Tillman",           7,17,32,  2,2025,2,"Auction"),
        .init("A. Zurek","TE","Jake Ferguson",            7,17,32,  2,2025,2,"Auction"),
        .init("A. Zurek","QB","Matthew Stafford",         7,17,32,  2,2025,2,"Auction"),
        .init("A. Zurek","RB","Kyle Monangai",            7,17,32,  2,2025,2,"Free Agent"),
        .init("A. Zurek","RB","Omarion Hampton",          7,17,32,  2,2025,2,"Draft Pick",1,2025),
        .init("A. Zurek","TE","Dalton Kincaid",           6,16,31,  1,2025,2,"Auction"),
        .init("A. Zurek","RB","Tyjae Spears",             6,16,31,  1,2025,2,"Auction"),
        .init("A. Zurek","QB","Jaxson Dart",              6,16,31,  1,2025,2,"Draft Pick",2,2025),
        .init("A. Zurek","WR","Matthew Golden",           6,16,31,  1,2025,2,"Draft Pick",2,2025),
        .init("A. Zurek","WR","Jayden Higgins",           6,16,31,  1,2025,2,"Draft Pick",2,2025,["via Dugan","via Jason","via Bill"]),
        .init("A. Zurek","RB","Jaylen Wright",           16,31,51,  1,2024,3,"Rookie Draft",2,2024),
        .init("A. Zurek","WR","Tre Tucker",               7,17,32,  2,2025,2,"Free Agent"),
        .init("A. Zurek","WR","Jaxon Smith-Njigba",      32,52,77,  2,2023,4,"Auction"),

        // MARK: Abad
        .init("Abad","WR","JaMarr Chase",               77,107,142, 2,2021,6,"Auction"),
        .init("Abad","WR","Justin Jefferson",            61, 71, 86,56,2025,2,"Auction"),
        .init("Abad","RB","James Cook",                  52, 77,107, 2,2022,5,"Auction"),
        .init("Abad","QB","Patrick Mahomes",             45, 55, 70,40,2025,2,"Auction"),
        .init("Abad","RB","Chase Brown",                 32, 52, 77, 2,2023,4,"Auction"),
        .init("Abad","WR","Jerry Jeudy",                 17, 32, 52, 2,2024,3,"Free Agent"),
        .init("Abad","QB","Caleb Williams",              17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("Abad","TE","Travis Kelce",                16, 26, 41,11,2025,2,"Auction"),
        .init("Abad","RB","Aaron Jones",                 16, 26, 41,11,2025,2,"Auction"),
        .init("Abad","WR","Deebo Samuel",                15, 25, 40,10,2025,2,"Auction"),
        .init("Abad","RB","Jordan Mason",                12, 22, 37, 7,2025,2,"Auction"),
        .init("Abad","TE","Mark Andrews",                11, 21, 36, 6,2025,2,"Auction"),
        .init("Abad","WR","Marvin Mims Jr",              10, 20, 35, 5,2025,2,"Auction"),
        .init("Abad","RB","Ray Davis",                    7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Abad","QB","Kirk Cousins",                 7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Abad","RB","Samaje Perine",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Abad","RB","Ty Johnson",                   7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Abad","RB","Bam Knight",                   7, 17, 32, 2,2025,2,"Free Agent"),

        // MARK: Bill
        .init("Bill","RB","Christian McCaffrey",         62, 72, 87,57,2025,2,"Auction"),
        .init("Bill","RB","Breece Hall",                 52, 77,107, 2,2022,5,"Auction"),
        .init("Bill","QB","Justin Herbert",              34, 49, 69,19,2024,3,"Auction",1,2025),
        .init("Bill","WR","Rashee Rice",                 31, 51, 76, 1,2023,4,"Auction"),
        .init("Bill","QB","Baker Mayfield",              24, 39, 59, 9,2024,3,"Auction"),
        .init("Bill","RB","Jaylen Warren",               20, 30, 45,15,2025,2,"Auction"),
        .init("Bill","WR","Jaylen Waddle",               19, 29, 44,14,2025,2,"Auction"),
        .init("Bill","WR","Ladd McConkey",               17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("Bill","RB","Braelon Allen",               14, 24, 39, 9,2025,2,"Auction"),
        .init("Bill","WR","Keenan Allen",                 9, 19, 34, 4,2025,2,"Auction"),
        .init("Bill","RB","Kaleb Johnson",                7, 17, 32, 2,2025,2,"Auction",1,2025),
        .init("Bill","RB","Jayden Blue",                  6, 16, 31, 1,2025,2,"Draft Pick",2,2025,["via Wayne","via M. Zurek"]),
        .init("Bill","WR","Jack Bech",                    6, 16, 31, 1,2025,2,"Draft Pick",2,2025),
        .init("Bill","TE","Dallas Goedert",               6, 16, 31, 1,2025,2,"Auction"),
        .init("Bill","TE","Isaiah Likely",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Bill","RB","Brashard Smith",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Bill","RB","Kenneth Gainwell",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Bill","QB","Quinn Ewers",                  7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Bill","RB","Malik Davis",                  7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Bill","TE","Taysom Hill",                  7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Bill","WR","Kendrick Bourne",              7, 17, 32, 2,2025,2,"Free Agent"),

        // MARK: Cantone
        .init("Cantone","QB","C.J. Stroud",              32, 52, 77, 2,2023,4,"Auction",1,2025,["via Jason","via Faybik"]),
        .init("Cantone","WR","Jauan Jennings",           17, 32, 52, 2,2024,3,"Free Agent"),
        .init("Cantone","QB","J.J. McCarthy",            16, 31, 51, 1,2024,3,"Rookie Draft",2,2024),
        .init("Cantone","RB","James Conner",             30, 40, 55,25,2025,2,"Auction"),
        .init("Cantone","WR","Terry McLaurin",           24, 34, 49,19,2025,2,"Auction"),
        .init("Cantone","QB","Daniel Jones",              9, 19, 34, 4,2025,2,"Auction"),
        .init("Cantone","RB","Nick Chubb",                9, 19, 34, 4,2025,2,"Auction"),
        .init("Cantone","WR","Travis Hunter",             7, 17, 32, 2,2025,2,"Draft Pick",1,2025,["via Foley"]),
        .init("Cantone","RB","Quinshon Judkins",          7, 17, 32, 2,2025,2,"Draft Pick",1,2025,["via Wayne"]),
        .init("Cantone","TE","Colston Loveland",          7, 17, 32, 2,2025,2,"Draft Pick",1,2025),
        .init("Cantone","RB","Justice Hill",              6, 16, 31, 1,2025,2,"Auction"),
        .init("Cantone","RB","Kareem Hunt",               6, 16, 31, 1,2025,2,"Auction"),
        .init("Cantone","RB","Woody Marks",               6, 16, 31, 1,2025,2,"Auction"),
        .init("Cantone","RB","Tank Bigsby",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Cantone","WR","Christian Watson",          7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Cantone","WR","Chimere Dike",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Cantone","RB","Chris Brooks",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Cantone","QB","Davis Mills",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Cantone","TE","Juwan Johnson",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Cantone","WR","Quentin Johnston",          7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Cantone","QB","Michael Penix",            16, 31, 51, 1,2024,3,"Rookie Draft",2,2024),

        // MARK: Dugan
        .init("Dugan","QB","Jordan Love",                40, 60, 85,10,2023,4,"Auction"),
        .init("Dugan","TE","Tucker Kraft",               17, 32, 52, 2,2024,3,"Free Agent"),
        .init("Dugan","WR","Rome Odunze",                17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("Dugan","WR","Garrett Wilson",             32, 42, 57,27,2025,2,"Auction"),
        .init("Dugan","RB","Jacory Croskey-Merritt",     21, 31, 46,16,2025,2,"Auction"),
        .init("Dugan","WR","Chris Olave",                16, 26, 41,11,2025,2,"Auction"),
        .init("Dugan","QB","Tua Tagovailoa",             15, 25, 40,10,2025,2,"Auction"),
        .init("Dugan","RB","Zach Charbonnet",            15, 25, 40,10,2025,2,"Auction"),
        .init("Dugan","WR","Khalil Shakir",              10, 20, 35, 5,2025,2,"Auction"),
        .init("Dugan","WR","Jayden Reed",                 9, 19, 34, 4,2025,2,"Auction"),
        .init("Dugan","WR","Romeo Doubs",                 6, 16, 31, 1,2025,2,"Auction"),
        .init("Dugan","QB","Tyler Shough",                6, 16, 31, 1,2025,2,"Auction"),
        .init("Dugan","WR","Tory Horton",                 6, 16, 31, 1,2025,2,"Auction"),
        .init("Dugan","RB","Devin Singletary",            7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Dugan","RB","Jeremy McNichols",            7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Dugan","TE","AJ Barner",                   7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Dugan","RB","Isaiah Davis",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Dugan","WR","Troy Franklin",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Dugan","RB","Tyler Badie",                 7, 17, 32, 2,2025,2,"Free Agent"),

        // MARK: Faybik
        .init("Faybik","RB","Emari Demercado",            7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Faybik","QB","Sam Darnold",               19, 34, 54, 4,2024,3,"Auction"),
        .init("Faybik","QB","Bo Nix",                    17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("Faybik","TE","George Kittle",             35, 55, 80, 5,2023,4,"Auction"),
        .init("Faybik","WR","Xavier Worthy",             17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("Faybik","WR","DeVonta Smith",             30, 45, 65,15,2024,3,"Auction"),
        .init("Faybik","RB","D'Andre Swift",             24, 34, 49,19,2025,2,"Auction"),
        .init("Faybik","RB","Javonte Williams",          15, 25, 40,10,2025,2,"Auction"),
        .init("Faybik","RB","Brian Robinson Jr",          7, 17, 32, 2,2025,2,"Auction"),
        .init("Faybik","TE","Kyle Pitts",                 6, 16, 31, 1,2025,2,"Auction"),
        .init("Faybik","WR","George Pickens",            24, 34, 49,19,2025,2,"Auction"),
        .init("Faybik","WR","Jordan Addison",            17, 27, 42,12,2025,2,"Auction"),
        .init("Faybik","WR","Jalen Coker",                7, 17, 32, 2,2025,2,"Auction"),
        .init("Faybik","RB","Audric Estime",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Faybik","RB","Emanuel Wilson",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Faybik","WR","Kayshon Boutte",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Faybik","RB","Michael Carter",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Faybik","QB","Riley Leonard",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Faybik","WR","Isaiah Bond",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Faybik","RB","Devin Neal",                 7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Faybik","RB","Bijan Robinson",            32, 52, 77, 2,2023,4,"Auction"),

        // MARK: Foley
        .init("Foley","WR","Zay Flowers",               32, 52, 77, 2,2023,4,"Auction"),
        .init("Foley","WR","Marvin Harrison Jr",         17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("Foley","RB","JK Dobbins",                12, 22, 37, 7,2025,2,"Auction"),
        .init("Foley","QB","Geno Smith",                11, 21, 36, 6,2025,2,"Auction"),
        .init("Foley","WR","Michael Pittman",            11, 21, 36, 6,2025,2,"Auction"),
        .init("Foley","RB","Travis Etienne",             10, 20, 35, 5,2025,2,"Auction"),
        .init("Foley","RB","Rhamondre Stevenson",         8, 18, 33, 3,2025,2,"Auction"),
        .init("Foley","RB","Dylan Sampson",               7, 17, 32, 2,2025,2,"Auction"),
        .init("Foley","WR","Tetairoa McMillan",           7, 17, 32, 2,2025,2,"Draft Pick",1,2025),
        .init("Foley","RB","Bayshul Tuten",               6, 16, 31, 1,2025,2,"Draft Pick",2,2025),
        .init("Foley","QB","Dillon Gabriel",              6, 16, 31, 1,2025,2,"Auction"),
        .init("Foley","WR","Wan'Dale Robinson",           6, 16, 31, 1,2025,2,"Auction"),
        .init("Foley","RB","Cam Skattebo",                6, 16, 31, 1,2025,2,"Draft Pick",2,2025),
        .init("Foley","QB","Kenny Pickett",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Foley","WR","Rashid Shaheed",              7, 17, 32, 2,2025,2,"Auction"),
        .init("Foley","WR","Chris Rodriguez Jr.",         7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Foley","QB","Brady Cook",                  7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Foley","WR","Malik Washington",            7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Foley","TE","Hunter Henry",                7, 17, 32, 2,2025,2,"Auction"),

        // MARK: Jared
        .init("Jared","QB","Trey Lance",                  7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jared","QB","Brock Purdy",                40, 60, 85,10,2023,4,"Auction"),
        .init("Jared","QB","Trevor Lawrence",             28, 43, 63,13,2024,3,"Auction"),
        .init("Jared","RB","Bucky Irving",               17, 32, 52, 2,2024,3,"Auction"),
        .init("Jared","WR","Brian Thomas Jr",            17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("Jared","WR","Jakobi Meyers",              16, 31, 51, 1,2024,3,"Auction"),
        .init("Jared","TE","Brock Bowers",               16, 31, 51, 1,2024,3,"Rookie Draft",2,2024),
        .init("Jared","WR","CeeDee Lamb",                62, 72, 87,57,2025,2,"Auction"),
        .init("Jared","QB","Dak Prescott",               36, 46, 61,31,2025,2,"Auction"),
        .init("Jared","WR","Brandon Aiyuk",              11, 21, 36, 6,2025,2,"Auction"),
        .init("Jared","RB","Ashton Jeanty",               7, 17, 32, 2,2025,2,"Draft Pick",1,2025),
        .init("Jared","WR","Luther Burden",               6, 16, 31, 1,2025,2,"Draft Pick",2,2025),
        .init("Jared","WR","Elic Ayomanor",               6, 16, 31, 1,2025,2,"Auction"),
        .init("Jared","WR","Pat Bryant",                  7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jared","WR","Parker Washington",           7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jared","RB","Trevor Etienne",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jared","QB","Malik Willis",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jared","RB","Sean Tucker",                 7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jared","WR","Alec Pierce",                 7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jared","WR","Dont'e Thornton Jr",          7, 17, 32, 2,2025,2,"Auction"),
        .init("Jared","WR","Isaac TeSlaa",                7, 17, 32, 2,2025,2,"Auction"),

        // MARK: Jason
        .init("Jason","WR","Amon-Ra St. Brown",          76,106,141, 1,2021,6,"Auction",2,2025,["via Jason","via Faybik"]),
        .init("Jason","WR","Drake London",               52, 77,107, 2,2022,5,"Auction"),
        .init("Jason","WR","Nico Collins",               51, 76,106, 1,2022,5,"Auction"),
        .init("Jason","RB","Chuba Hubbard",              19, 34, 54, 4,2024,3,"Auction"),
        .init("Jason","RB","Derrick Henry",              56, 66, 81,51,2025,2,"Auction"),
        .init("Jason","QB","Jared Goff",                 30, 40, 55,25,2025,2,"Auction"),
        .init("Jason","RB","Kenneth Walker III",         29, 39, 54,24,2025,2,"Auction"),
        .init("Jason","TE","Sam Laporta",                22, 32, 47,17,2025,2,"Auction"),
        .init("Jason","RB","Rico Dowdle",                 6, 16, 31, 1,2025,2,"Auction"),
        .init("Jason","WR","AJ Brown",                   46, 56, 71,41,2025,2,"Auction"),
        .init("Jason","QB","Jacoby Brissett",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","RB","Theo Johnson",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","TE","Harold Fannin Jr.",           7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","WR","Keon Coleman",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","WR","Mike Evans",                  7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","RB","Austin Ekeler",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","WR","KaVontae Turpin",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","WR","Andrei Iosivas",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","TE","Brenton Strange",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","RB","Keaton Mitchell",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Jason","QB","Mac Jones",                   7, 17, 32, 2,2025,2,"Free Agent"),

        // MARK: M. Zurek
        .init("M. Zurek","QB","Josh Allen",              74, 89,109,59,2024,3,"Auction",1,2025,["via Dugan","via Jason","via Bill"]),
        .init("M. Zurek","RB","Jahmyr Gibbs",            32, 52, 77, 2,2023,4,"Auction"),
        .init("M. Zurek","TE","Trey McBride",            32, 52, 77, 2,2023,4,"Auction",1,2025,["via M. Zurek","via Ryan"]),
        .init("M. Zurek","RB","Kyren Williams",          31, 51, 76, 1,2023,4,"Auction",2,2026),
        .init("M. Zurek","WR","Jameson Williams",        19, 34, 54, 4,2024,3,"Auction"),
        .init("M. Zurek","QB","Jayden Daniels",          17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("M. Zurek","RB","Blake Corum",             16, 31, 51, 1,2024,3,"Rookie Draft",2,2024),
        .init("M. Zurek","RB","Saquon Barkley",          64, 74, 89,59,2025,2,"Auction"),
        .init("M. Zurek","WR","Davante Adams",           19, 29, 44,14,2025,2,"Auction"),
        .init("M. Zurek","QB","Jalen Milroe",             7, 17, 32, 2,2025,2,"Auction"),
        .init("M. Zurek","RB","Joe Mixon",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","RB","Phil Mafah",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","QB","Joe Milton",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","QB","Tanner McKee",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","QB","Justin Fields",            7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","WR","Michael Wilson",           7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","RB","Tahj Brooks",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","RB","Jonathan Brooks",          7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","WR","Jalen McMillan",           7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","QB","Jameis Winston",           7, 17, 32, 2,2025,2,"Free Agent"),
        .init("M. Zurek","WR","Tank Dell",                7, 17, 32, 2,2025,2,"Free Agent"),

        // MARK: Ryan
        .init("Ryan","WR","Tee Higgins",                 27, 42, 62,12,2024,3,"Auction",2,2025,["via Foley","via Cantone"]),
        .init("Ryan","WR","Malik Nabers",                17, 32, 52, 2,2024,3,"Rookie Draft",1,2024),
        .init("Ryan","QB","Bryce Young",                 17, 32, 52, 2,2024,3,"Free Agent"),
        .init("Ryan","QB","Drake Maye",                  16, 31, 51, 1,2024,3,"Rookie Draft",2,2024),
        .init("Ryan","RB","Tony Pollard",                27, 37, 52,22,2025,2,"Auction"),
        .init("Ryan","RB","Isiah Pacheco",               21, 31, 46,16,2025,2,"Auction"),
        .init("Ryan","WR","DJ Moore",                    21, 31, 46,16,2025,2,"Auction"),
        .init("Ryan","WR","DK Metcalf",                  20, 30, 45,15,2025,2,"Auction"),
        .init("Ryan","RB","Trey Benson",                  9, 19, 34, 4,2025,2,"Auction"),
        .init("Ryan","QB","Anthony Richardson",           8, 18, 33, 3,2025,2,"Auction"),
        .init("Ryan","WR","Emeka Egbuka",                 7, 17, 32, 2,2025,2,"Draft Pick",1,2025),
        .init("Ryan","TE","Tyler Warren",                 7, 17, 32, 2,2025,2,"Draft Pick",1,2025),
        .init("Ryan","RB","TreVeyon Henderson",           7, 17, 32, 2,2025,2,"Draft Pick",2,2025),
        .init("Ryan","RB","RJ Harvey",                    7, 17, 32, 2,2025,2,"Draft Pick",1,2025,["via Bill"]),
        .init("Ryan","WR","Tre Harris",                   6, 16, 31, 1,2025,2,"Draft Pick",2,2025),
        .init("Ryan","RB","Tyler Allgeier",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Ryan","QB","Shedeur Sanders",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Ryan","TE","Oronde Gadsden",               7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Ryan","WR","Kyle Williams",                7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Ryan","RB","Kimani Vidal",                 7, 17, 32, 2,2025,2,"Free Agent"),

        // MARK: Wayne
        .init("Wayne","QB","Joe Burrow",                 63, 78, 98,48,2024,3,"Auction"),
        .init("Wayne","WR","Courtland Sutton",           35, 55, 80, 5,2023,4,"Auction",2,2026),
        .init("Wayne","WR","Puka Nacua",                 32, 52, 77, 2,2023,4,"Auction",2,2026),
        .init("Wayne","RB","De'Von Achane",              31, 51, 76, 1,2023,4,"Auction",2,2026),
        .init("Wayne","RB","Jonathan Taylor",            65, 75, 90,60,2025,2,"Auction"),
        .init("Wayne","QB","Jalen Hurts",                59, 69, 84,54,2025,2,"Auction"),
        .init("Wayne","QB","Kyler Murray",               38, 48, 63,33,2025,2,"Auction"),
        .init("Wayne","RB","David Montgomery",           16, 26, 41,11,2025,2,"Auction"),
        .init("Wayne","RB","Ollie Gordon",               15, 25, 40,10,2025,2,"Auction"),
        .init("Wayne","WR","Cooper Kupp",                10, 20, 35, 5,2025,2,"Auction"),
        .init("Wayne","QB","Aaron Rodgers",               8, 18, 33, 3,2025,2,"Auction"),
        .init("Wayne","TE","Mason Taylor",                6, 16, 31, 1,2025,2,"Draft Pick",2,2025),
        .init("Wayne","RB","Rachaad White",               6, 16, 31, 1,2025,2,"Auction"),
        .init("Wayne","TE","Darren Waller",               7, 17, 32, 2,2025,2,"Auction"),
        .init("Wayne","WR","Tyreek Hill",                 7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Wayne","TE","Dalton Schultz",              7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Wayne","WR","Jaylin Noel",                 7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Wayne","TE","Colby Parkinson",             7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Wayne","TE","Terrance Ferguson",           7, 17, 32, 2,2025,2,"Free Agent"),
        .init("Wayne","WR","Adonai Mitchell",             7, 17, 32, 2,2025,2,"Free Agent"),
    ]
    // swiftformat:enable all

    // MARK: - Draft Pick Seed Data
    // Canonical 2026 slots from the pick lottery section.
    // 2027 picks are unslotted (all 12 teams hold their own pick).

    struct PickSeed {
        let season: Int, round: Int, slot: Int?
        let team: String, originalTeam: String
        let tradeHistory: [String]
    }

    static let pickSeeds: [PickSeed] = [

        // 2026 Round 1 (lottery-assigned slots)
        PickSeed(season:2026, round:1, slot: 1, team:"Dugan",    originalTeam:"Dugan",    tradeHistory:[]),
        PickSeed(season:2026, round:1, slot: 2, team:"Jared",    originalTeam:"A. Zurek", tradeHistory:["via A. Zurek","via Faybik"]),
        PickSeed(season:2026, round:1, slot: 3, team:"Cantone",  originalTeam:"Cantone",  tradeHistory:[]),
        PickSeed(season:2026, round:1, slot: 4, team:"Bill",     originalTeam:"Ryan",     tradeHistory:["via Ryan"]),
        PickSeed(season:2026, round:1, slot: 5, team:"Foley",    originalTeam:"Foley",    tradeHistory:[]),
        PickSeed(season:2026, round:1, slot: 6, team:"Foley",    originalTeam:"Abad",     tradeHistory:["via Abad"]),
        PickSeed(season:2026, round:1, slot: 7, team:"Jared",    originalTeam:"Jared",    tradeHistory:[]),
        PickSeed(season:2026, round:1, slot: 8, team:"Cantone",  originalTeam:"M. Zurek", tradeHistory:["via M. Zurek","via Abad"]),
        PickSeed(season:2026, round:1, slot: 9, team:"A. Zurek", originalTeam:"Faybik",   tradeHistory:["via Faybik"]),
        PickSeed(season:2026, round:1, slot:10, team:"A. Zurek", originalTeam:"Jason",    tradeHistory:["via Jason","via M. Zurek"]),
        PickSeed(season:2026, round:1, slot:11, team:"Dugan",    originalTeam:"Wayne",    tradeHistory:["via Wayne"]),
        PickSeed(season:2026, round:1, slot:12, team:"Dugan",    originalTeam:"Bill",     tradeHistory:["via Bill"]),

        // 2026 Round 2
        PickSeed(season:2026, round:2, slot: 1, team:"Dugan",    originalTeam:"Dugan",    tradeHistory:[]),
        PickSeed(season:2026, round:2, slot: 2, team:"A. Zurek", originalTeam:"A. Zurek", tradeHistory:[]),
        PickSeed(season:2026, round:2, slot: 3, team:"A. Zurek", originalTeam:"Cantone",  tradeHistory:["via Cantone","via Faybik"]),
        PickSeed(season:2026, round:2, slot: 4, team:"Faybik",   originalTeam:"Ryan",     tradeHistory:["via Ryan","via A. Zurek"]),
        PickSeed(season:2026, round:2, slot: 5, team:"Foley",    originalTeam:"Foley",    tradeHistory:[]),
        PickSeed(season:2026, round:2, slot: 6, team:"Cantone",  originalTeam:"Abad",     tradeHistory:["via Abad"]),
        PickSeed(season:2026, round:2, slot: 7, team:"Faybik",   originalTeam:"Jared",    tradeHistory:["via Jared"]),
        PickSeed(season:2026, round:2, slot: 8, team:"Cantone",  originalTeam:"M. Zurek", tradeHistory:["via M. Zurek","via Abad"]),
        PickSeed(season:2026, round:2, slot: 9, team:"Cantone",  originalTeam:"Faybik",   tradeHistory:["via Faybik","via Jason"]),
        PickSeed(season:2026, round:2, slot:10, team:"Faybik",   originalTeam:"Jason",    tradeHistory:["via Jason","via Jared"]),
        PickSeed(season:2026, round:2, slot:11, team:"Ryan",     originalTeam:"Wayne",    tradeHistory:["via Wayne"]),
        PickSeed(season:2026, round:2, slot:12, team:"Ryan",     originalTeam:"Bill",     tradeHistory:["via Bill"]),

        // 2027 Round 1 — all teams hold own pick, no slots assigned yet
        PickSeed(season:2027, round:1, slot:nil, team:"A. Zurek", originalTeam:"A. Zurek", tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Abad",     originalTeam:"Abad",     tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Bill",     originalTeam:"Bill",     tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Cantone",  originalTeam:"Cantone",  tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Dugan",    originalTeam:"Dugan",    tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Faybik",   originalTeam:"Faybik",   tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Foley",    originalTeam:"Foley",    tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Jared",    originalTeam:"Jared",    tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Jason",    originalTeam:"Jason",    tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"M. Zurek", originalTeam:"M. Zurek", tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Ryan",     originalTeam:"Ryan",     tradeHistory:[]),
        PickSeed(season:2027, round:1, slot:nil, team:"Wayne",    originalTeam:"Wayne",    tradeHistory:[]),

        // 2027 Round 2
        PickSeed(season:2027, round:2, slot:nil, team:"A. Zurek", originalTeam:"A. Zurek", tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Abad",     originalTeam:"Abad",     tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Bill",     originalTeam:"Bill",     tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Cantone",  originalTeam:"Cantone",  tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Dugan",    originalTeam:"Dugan",    tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Faybik",   originalTeam:"Faybik",   tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Foley",    originalTeam:"Foley",    tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Jared",    originalTeam:"Jared",    tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Jason",    originalTeam:"Jason",    tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"M. Zurek", originalTeam:"M. Zurek", tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Ryan",     originalTeam:"Ryan",     tradeHistory:[]),
        PickSeed(season:2027, round:2, slot:nil, team:"Wayne",    originalTeam:"Wayne",    tradeHistory:[]),
    ]
}
