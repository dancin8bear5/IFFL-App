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
            userTeamMap: [commissionerUID: "Jared"],
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

    // MARK: - NFL Team Mapping
    // Player name → NFL team abbreviation. Reflects rosters as of the 2025 season.
    // COMMISSIONER: verify & refresh this 2–3x per year (post-NFL-draft, trade deadline,
    // end of season). seedNFLTeams() only touches players whose name is a key here,
    // so a partial / out-of-date map is safe — it just leaves unknowns untouched.
    static let nflTeamMapping: [String: String] = [
        // QBs
        "Josh Allen": "BUF", "Joe Burrow": "CIN", "Jalen Hurts": "PHI", "Jayden Daniels": "WAS",
        "Patrick Mahomes": "KC", "Lamar Jackson": "BAL", "Jared Goff": "DET", "Baker Mayfield": "TB",
        "Brock Purdy": "SF", "Justin Herbert": "LAC", "Bo Nix": "DEN", "Kyler Murray": "ARI",
        "C.J. Stroud": "HOU", "Dak Prescott": "DAL", "Caleb Williams": "CHI", "Drake Maye": "NE",
        "Jordan Love": "GB", "Tua Tagovailoa": "MIA", "Justin Fields": "NYJ", "Sam Darnold": "SEA",
        "Geno Smith": "LV", "Bryce Young": "CAR", "Michael Penix": "ATL", "J.J. McCarthy": "MIN",
        "Matthew Stafford": "LAR", "Kirk Cousins": "ATL", "Anthony Richardson": "IND", "Daniel Jones": "IND",
        "Aaron Rodgers": "PIT", "Cam Ward": "TEN", "Shedeur Sanders": "CLE", "Jaxson Dart": "NYG",
        "Jameis Winston": "NYG", "Joe Flacco": "CLE", "Jacoby Brissett": "ARI", "Mac Jones": "SF",
        "Jalen Milroe": "SEA", "Dillon Gabriel": "CLE", "Tyler Shough": "NO", "Quinn Ewers": "MIA",
        "Joe Milton": "DAL", "Trey Lance": "LAC", "Malik Willis": "GB", "Kenny Pickett": "LV",
        "Davis Mills": "HOU", "Riley Leonard": "IND", "Brady Cook": "FA", "Tanner McKee": "PHI",
        "Taysom Hill": "NO",
        // RBs
        "Saquon Barkley": "PHI", "Bijan Robinson": "ATL", "Jahmyr Gibbs": "DET", "Derrick Henry": "BAL",
        "Christian McCaffrey": "SF", "Ashton Jeanty": "LV", "De'Von Achane": "MIA", "Josh Jacobs": "GB",
        "Jonathan Taylor": "IND", "Bucky Irving": "TB", "Kenneth Walker III": "SEA", "Chase Brown": "CIN",
        "James Cook": "BUF", "Breece Hall": "NYJ", "Kyren Williams": "LAR", "Chuba Hubbard": "CAR",
        "Omarion Hampton": "LAC", "Quinshon Judkins": "CLE", "TreVeyon Henderson": "NE", "Isiah Pacheco": "KC",
        "James Conner": "ARI", "Aaron Jones": "MIN", "David Montgomery": "DET", "Joe Mixon": "HOU",
        "Tony Pollard": "TEN", "D'Andre Swift": "CHI", "Javonte Williams": "DAL", "RJ Harvey": "DEN",
        "Kaleb Johnson": "PIT", "Cam Skattebo": "NYG", "Rachaad White": "TB", "Jaylen Warren": "PIT",
        "Tank Bigsby": "JAX", "Travis Etienne": "JAX", "Trey Benson": "ARI", "Zach Charbonnet": "SEA",
        "Brian Robinson Jr": "WAS", "Tyrone Tracy Jr": "NYG", "Jordan Mason": "MIN", "Rico Dowdle": "CAR",
        "Nick Chubb": "HOU", "JK Dobbins": "DEN", "Kareem Hunt": "KC", "Austin Ekeler": "WAS",
        "Rhamondre Stevenson": "NE", "Tyjae Spears": "TEN", "Blake Corum": "LAR", "Braelon Allen": "NYJ",
        "Bucky Irving ": "TB", "Ray Davis": "BUF", "Devin Singletary": "NYG", "Jaylen Wright": "MIA",
        "Ollie Gordon": "MIA", "Woody Marks": "HOU", "Dylan Sampson": "CLE", "Bhayshul Tuten": "JAX",
        "Bayshul Tuten": "JAX", "Jacory Croskey-Merritt": "WAS", "Devin Neal": "NO", "Kimani Vidal": "LAC",
        "Kyle Monangai": "CHI", "Tahj Brooks": "CIN", "Phil Mafah": "DAL", "Sean Tucker": "TB",
        "Audric Estime": "DEN", "Keaton Mitchell": "BAL", "Jeremy McNichols": "WAS", "Justice Hill": "BAL",
        "Samaje Perine": "CIN", "Ty Johnson": "BUF", "Kenneth Gainwell": "PIT", "Emanuel Wilson": "GB",
        "Jayden Blue": "DAL", "Jaydon Blue": "DAL", "Trevor Etienne": "CAR", "Tyler Allgeier": "ATL",
        "Tyler Badie": "DEN", "Michael Carter": "ARI", "Isaiah Davis": "NYJ", "Malik Davis": "FA",
        "Chris Brooks": "GB", "Chris Rodriguez Jr.": "WAS", "Jonathan Brooks": "CAR", "Bam Knight": "ARI",
        "Emari Demercado": "ARI", "Brashard Smith": "KC",
        // WRs
        "JaMarr Chase": "CIN", "Justin Jefferson": "MIN", "CeeDee Lamb": "DAL", "Amon-Ra St. Brown": "DET",
        "Puka Nacua": "LAR", "Malik Nabers": "NYG", "Nico Collins": "HOU", "Brian Thomas Jr": "JAX",
        "Drake London": "ATL", "AJ Brown": "PHI", "Tyreek Hill": "MIA", "Ladd McConkey": "LAC",
        "Tee Higgins": "CIN", "Mike Evans": "TB", "Davante Adams": "LAR", "Garrett Wilson": "NYJ",
        "DJ Moore": "CHI", "DK Metcalf": "PIT", "Jaxon Smith-Njigba": "SEA", "Terry McLaurin": "WAS",
        "Marvin Harrison Jr": "ARI", "DeVonta Smith": "PHI", "Courtland Sutton": "DEN", "George Pickens": "DAL",
        "Jaylen Waddle": "MIA", "Zay Flowers": "BAL", "Jameson Williams": "DET", "Jerry Jeudy": "CLE",
        "Rashee Rice": "KC", "Xavier Worthy": "KC", "Calvin Ridley": "TEN", "Jordan Addison": "MIN",
        "Chris Olave": "NO", "Cooper Kupp": "SEA", "Keon Coleman": "BUF", "Khalil Shakir": "BUF",
        "Jakobi Meyers": "LV", "Stefon Diggs": "NE", "Chris Godwin": "TB", "Deebo Samuel": "WAS",
        "Brandon Aiyuk": "SF", "Jauan Jennings": "SF", "Ricky Pearsall": "SF", "Rome Odunze": "CHI",
        "Keenan Allen": "LAC", "Tetairoa McMillan": "CAR", "Emeka Egbuka": "TB", "Matthew Golden": "GB",
        "Travis Hunter": "JAX", "Luther Burden": "CHI", "Jayden Higgins": "HOU", "Jayden Reed": "GB",
        "Quentin Johnston": "LAC", "Jordan Whittington": "LAR", "Josh Downs": "IND", "Michael Pittman": "IND",
        "Adonai Mitchell": "IND", "Alec Pierce": "IND", "Cedric Tillman": "CLE", "Tre Harris": "LAC",
        "Kyle Williams": "NE", "Kayshon Boutte": "NE", "Kendrick Bourne": "NE", "Christian Watson": "GB",
        "Romeo Doubs": "GB", "Dontayvion Wicks": "GB", "Wan'Dale Robinson": "NYG", "Jalen McMillan": "TB",
        "Jalen Coker": "CAR", "Tank Dell": "HOU", "Rashid Shaheed": "NO", "Marvin Mims Jr": "DEN",
        "Troy Franklin": "DEN", "Pat Bryant": "DEN", "Tory Horton": "SEA", "Jaylin Noel": "HOU",
        "Jack Bech": "LV", "Tre Tucker": "LV", "Dont'e Thornton Jr": "LV", "Isaiah Bond": "FA",
        "Elic Ayomanor": "TEN", "Chimere Dike": "TEN", "Malik Washington": "MIA", "Andrei Iosivas": "CIN",
        "Michael Wilson": "ARI", "Parker Washington": "JAX", "Isaac TeSlaa": "DET", "Kaden Prather": "FA",
        "KaVontae Turpin": "DAL", "Quentin Johnson": "LAC",
        // TEs
        "Brock Bowers": "LV", "Trey McBride": "ARI", "George Kittle": "SF", "Sam Laporta": "DET",
        "Mark Andrews": "BAL", "Travis Kelce": "KC", "T.J. Hockenson": "MIN", "David Njoku": "CLE",
        "Tucker Kraft": "GB", "Dalton Kincaid": "BUF", "Jake Ferguson": "DAL", "Colston Loveland": "CHI",
        "Tyler Warren": "IND", "Isaiah Likely": "BAL", "Kyle Pitts": "ATL", "Hunter Henry": "NE",
        "Dallas Goedert": "PHI", "Jonnu Smith": "PIT", "Dalton Schultz": "HOU", "Juwan Johnson": "NO",
        "Brenton Strange": "JAX", "Mason Taylor": "NYJ", "Harold Fannin Jr.": "CLE", "Terrance Ferguson": "LAR",
        "Theo Johnson": "NYG", "Colby Parkinson": "LAR", "Darren Waller": "MIA", "AJ Barner": "SEA",
        "Oronde Gadsden": "LAC", "Oronde Gadsden II": "LAC", "Elijah Arroyo": "SEA", "Cade Otton": "TB",
    ]

    // MARK: - Seed NFL Teams

    func seedNFLTeams(completion: @escaping (Result<Int, Error>) -> Void) {
        db.collection("players").getDocuments { [self] snapshot, error in
            if let error { completion(.failure(error)); return }
            guard let docs = snapshot?.documents else { completion(.success(0)); return }

            let toUpdate = docs.filter { doc in
                let name = doc.data()["name"] as? String ?? ""
                return Self.nflTeamMapping[name] != nil
            }

            guard !toUpdate.isEmpty else { completion(.success(0)); return }

            let chunks = stride(from: 0, to: toUpdate.count, by: 400).map {
                Array(toUpdate[$0..<min($0 + 400, toUpdate.count)])
            }

            var errors: [Error] = []
            let group = DispatchGroup()
            var updated = 0

            for chunk in chunks {
                group.enter()
                let batch = db.batch()
                for doc in chunk {
                    let name = doc.data()["name"] as? String ?? ""
                    if let nflTeam = Self.nflTeamMapping[name] {
                        batch.updateData(["nflTeam": nflTeam], forDocument: doc.reference)
                        updated += 1
                    }
                }
                batch.commit { e in
                    if let e { errors.append(e) }
                    group.leave()
                }
            }

            group.notify(queue: .main) {
                if let first = errors.first { completion(.failure(first)) }
                else { completion(.success(updated)) }
            }
        }
    }

    // MARK: - Seed League History
    // Source: ESPN league history (2009-2025). Place = final playoff/standings rank.
    // notableTrades: add manually from the Historical Keeper Master xlsx Trades tab.
    // Re-running seedLeagueHistory() is safe — it uses merge:true per year doc.
    static let historySeeds: [SeasonHistory] = [

        SeasonHistory(id: "2025", season: 2025, champion: "Bill", runnerUp: "Wayne", standings: [
            TeamFinish(teamName: "Bill",     place: 1,  record: "11-3", pointsFor: nil),
            TeamFinish(teamName: "Wayne",    place: 2,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 3,  record: "10-4", pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 4,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Abad",     place: 5,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 6,  record: "10-4", pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 7,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 8,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "A. Zurek", place: 9,  record: "2-12", pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 10, record: "4-10", pointsFor: nil),
            TeamFinish(teamName: "Cantone",  place: 11, record: "3-11", pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 12, record: "4-10", pointsFor: nil),
        ], notableTrades: [
            "2/12 · Jason & Bill: Jason got Lamar Jackson, Terry McLaurin, 2025 2.07 (Bill) | Bill got Drake Maye, Rashee Rice, 2025 1.04 (Jason)",
            "4/25 · M. Zurek & Wayne: M. Zurek got Trey McBride, Kyren Williams | Wayne got 2025 1.08 (Wayne), Rome Odunze",
            "5/13 · Ryan & Jason: Ryan got 2025 2.06 (Jason), 2025 2.07 (Jason) | Jason got Amon-Ra St. Brown",
            "5/28 · Ryan & Bill: Ryan got Drake Maye, 2025 1.04 (Jason), 2025 2.02 (M. Zurek), 2026 2nd (Bill) | Bill got Justin Herbert, 2025 1.10 (Ryan), 2025 2.06 (Dugan), 2026 1st (Ryan)",
            "6/12 · M. Zurek & Corey: M. Zurek got DJ Moore, 2025 1.11 (Corey), 2025 1.12 (Corey) | Corey got 2026 1st (M. Zurek), 2026 2nd (M. Zurek)",
            "6/15 · M. Zurek & Jason: M. Zurek got Jayden Daniels, Jordan Addison, 2026 1st (Jason) | Jason got Brian Thomas Jr., Justin Fields, 2025 1.11 (Corey), 2025 1.12 (Corey)",
            "7/21 · M. Zurek & Jared: M. Zurek got 2025 1.02 (M. Zurek) | Jared got 2025 1.05 (Foley), Trevor Lawrence",
            "7/21 · Jason & Jared: Jason got 2025 2.12 (Bill) | Jared got 2026 2nd (Jason)",
            "8/18 · Jason & Faybik: Jason got Nico Collins, 2026 2nd (Faybik) | Faybik got Justin Fields, Xavier Worthy, Jayden Higgins",
            "8/21 · M. Zurek & Ryan: M. Zurek got Josh Allen | Ryan got Bryce Young, Michael Penix, Jaxson Dart",
            "8/30 · Cantone & Jared: Cantone got Tank Bigsby | Jared got Brandon Aiyuk",
            "8/30 · Cantone & Faybik: Cantone got Nick Chubb | Faybik got Kendre Miller, 2026 2nd (Cantone)",
            "9/16 · A. Zurek & M. Zurek: A. Zurek got B. Robinson Jr., Jarquez Hunter, O. Hampton, 2026 1st (Jason) | M. Zurek got Saquon Barkley, Ray Davis, Darius Slayton",
            "9/16 · A. Zurek & Ryan: A. Zurek got Tyrone Tracy Jr., Matthew Golden, Jaxson Dart | Ryan got Drake London, K. Walker III, 2026 2nd (Ryan)",
            "9/16 · Cantone & Abad: Cantone got C. Loveland, Q. Judkins, Travis Hunter, 2026 1st (M. Zurek), 2026 2nd (M. Zurek) | Abad got Ja'Marr Chase, Patrick Mahomes",
            "9/17 · Jason & Cantone: Jason got Jared Goff | Cantone got JJ McCarthy, 2026 2nd (Faybik)",
            "9/29 · Ryan & Jason: Ryan got Tyler Warren, Emeka Egbuka, B. Thomas Jr., I. Pacheco, A. Richardson | Jason got D. Henry, Drake London, K. Walker III, Mark Andrews, Christian Kirk",
            "9/30 · Foley & Bill: Foley got Geno Smith | Bill got Jameson Williams",
            "10/20 · Ryan & Wayne: Ryan got RJ Harvey | Wayne got Aaron Rodgers, 2026 2nd (Wayne)",
            "10/22 · Faybik & A. Zurek: Faybik got B. Robinson Jr., Sam Darnold, Jordan Addison | A. Zurek got Jayden Higgins, Jimmy Garoppolo, 2026 1st (Faybik), 2026 2nd (Cantone)",
            "10/23 · Faybik & M. Zurek: Faybik got Emanuel Wilson, Kayshon Boutte | M. Zurek got Khalil Shakir, Keon Coleman",
            "11/2 · Bill & M. Zurek: Bill got Dallas Goedert | M. Zurek got Jameson Williams",
            "11/5 · Bill & M. Zurek: Bill got Kenneth Gainwell | M. Zurek got Blake Corum",
            "11/5 · Faybik & Jared: Faybik got Jaylen Wright | Jared got Parker Washington, 2026 2nd (Jared)",
            "11/12 · Cantone & Corey: Cantone got Luke Musgraves | Corey got Travis Kelce, 2026 2nd (Corey)",
            "11/12 · Dugan & Wayne: Dugan got Z. Charbonnet, Troy Franklin, Rome Odunze, 2026 1st (Wayne) | Wayne got Jonathan Taylor",
            "11/12 · Foley & Corey: Foley got TJ Hockenson, M. Harrison Jr., Travis Etienne, 2026 1st (Corey) | Corey got Sam LaPorta, James Cook",
            "11/13 · Jason & Corey: Jason got Sam LaPorta, Chuba Hubbard | Corey got Aaron Jones, Jordan Mason, Mark Andrews",
            "11/14 · Dugan & M. Zurek: Dugan got Khalil Shakir, Tory Horton | M. Zurek got Joe Flacco",
            "11/14 · Foley & Jared: Foley got T. McMillan, Cam Skattebo, Elijah Arroyo | Jared got Dak Prescott, Joe Burrow, Jakobi Meyers",
            "11/18 · Bill & Dugan: Bill got Keenan Allen, Breece Hall | Dugan got Devin Neal, Tucker Kraft, 2026 1st (Bill)",
            "11/19 · Cantone & Abad: Cantone got CJ Stroud, Davis Mills | Abad got Samaje Perine, Texans D/ST",
        ]),

        SeasonHistory(id: "2024", season: 2024, champion: "Bill", runnerUp: "Cantone", standings: [
            TeamFinish(teamName: "Bill",     place: 1,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Cantone",  place: 2,  record: "10-4", pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 3,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 4,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 5,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "A. Zurek", place: 6,  record: "8-6",  pointsFor: nil),
            TeamFinish(teamName: "Wayne",    place: 7,  record: "8-6",  pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 8,  record: "8-6",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 9,  record: "5-9",  pointsFor: nil),
            TeamFinish(teamName: "Abad",     place: 10, record: "5-9",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 11, record: "4-10", pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 12, record: "3-11", pointsFor: nil),
        ], notableTrades: [
            "5/14 · Foley & Jared: Foley got Zay Flowers, 2024 1.04 (Jared), 2024 1.06 (Jared), 2024 2.10 (Jared) | Jared got 2024 1.02 (Foley), 2024 1.05 (Foley)",
            "7/9 · M. Zurek & Faybik: M. Zurek got Mason Rudolph | Faybik got George Kittle, 2024 2.02 (Faybik)",
            "7/21 · Jason & Faybik: Jason got Bryce Young, Demario Douglas, 2024 1.03 (Faybik) | Faybik got Patrick Mahomes, 2025 1st (Jason), 2025 2nd (Jason)",
            "7/22 · Bill & Cantone: Bill got Joe Mixon | Cantone got 2024 2.11 (Bill)",
            "8/2 · M. Zurek & Ryan: M. Zurek got Alvin Kamara, Davante Adams, 2025 2nd (Ryan) | Ryan got Zamir White, 2025 1st (M. Zurek)",
            "8/3 · Abad & Jared: Abad got Caleb Williams, Jaxon Smith-Njigba | Jared got Christian McCaffrey, Amon-Ra St. Brown, 2025 2nd (Corey)",
            "8/4 · Abad & Cantone: Abad got DJ Moore | Cantone got Gus Edwards",
            "8/4 · Foley & Cantone: Foley got Aaron Rodgers | Cantone got D. Thompson-Robinson, 2025 2nd (Foley)",
            "8/9 · Jason & Cantone: Jason got JJ McCarthy | Cantone got Bryce Young",
            "8/21 · Bill & Ryan: Bill got Jonathan Taylor | Ryan got Dawson Knox, 2025 2nd (Bill)",
            "8/28 · Ryan & Faybik: Ryan got I. Pacheco, Tee Higgins, A. Mattison | Faybik got Trevor Lawrence, D. Mooney, Ezekiel Elliott",
            "9/11 · Bill & Jared: Bill got Kimani Vidal, Baker Mayfield | Jared got Jordan Mason, Will Levis",
            "9/30 · Jason & Faybik: Jason got T. McLaurin, E. Elliott, 2025 1st (Jason), 2025 2nd (Jason) | Faybik got Derrick Henry, Justice Hill",
            "10/3 · Jason & A. Zurek: Jason got Dalton Kincaid, Tyler Allgeier | A. Zurek got Rhamondre Stevenson, Raheem Mostert",
            "10/9 · Jason & Dugan: Jason got Xavier Worthy, 2025 1st (Dugan), 2025 2nd (Dugan) | Dugan got Cooper Kupp",
            "10/9 · Cantone & Ryan: Cantone got CeeDee Lamb | Ryan got X. Legette, Chase Brown, 2025 1st (Cantone)",
            "10/9 · Cantone & Foley: Cantone got James Conner, I. Guerendo | Foley got Gus Edwards, Jameson Williams, 2025 2nd (Foley)",
            "10/12 · Cantone & Corey: Cantone got Austin Ekeler | Corey got Christian Watson, 2025 2nd (Cantone)",
            "10/23 · Jason & Bill: Jason got Rashee Rice, Jordan Addison | Bill got T. McLaurin, 2025 1st (Dugan)",
            "10/23 · Jason & M. Zurek: Jason got Drake Maye, Hunter Henry, Jerry Jeudy, 2025 2nd (Ryan), 2025 2nd (M. Zurek) | M. Zurek got Tua, Jaylen Waddle, Dalton Kincaid, Emanuel Wilson",
            "10/29 · Ryan & Corey: Ryan got D'Andre Swift, Josh Downs | Corey got Chase Brown, 2025 1st (Cantone)",
            "10/29 · Bill & Corey: Bill got Drake London, Saquon Barkley, Kirk Cousins, 2025 2nd (Cantone) | Corey got CJ Stroud, Marvin Harrison Jr., 2025 1st (Bill), 2025 1st (Dugan)",
            "11/6 · Cantone & Dugan: Cantone got M. Pittman Jr., Cooper Rush | Dugan got Austin Ekeler",
            "11/7 · Ryan & Jared: Ryan got Amon-Ra St. Brown, CMC | Jared got Bucky Irving, C. Tillman, 2025 1st (M. Zurek), 2025 2nd (Bill)",
            "11/11 · M. Zurek & Faybik: M. Zurek got Brian Thomas Jr., X. Hutchinson | Faybik got Josh Jacobs, Adonai Mitchell, 2025 2nd (Faybik)",
            "11/12 · M. Zurek & Dugan: M. Zurek got Jahmyr Gibbs, Michael Penix | Dugan got Alvin Kamara, Tyreek Hill",
            "11/12 · Bill & A. Zurek: Bill got C. Ridley, T. Etienne, Travis Kelce, Lamar Jackson, 2025 2nd (Andrew) | A. Zurek got Sam Darnold, Kirk Cousins, Tyjae Spears, Saquon Barkley, Drake London",
            "11/13 · M. Zurek & Foley: M. Zurek got Rome Odunze, 2025 1st (Foley), 2025 2nd (Foley) | Foley got AJ Brown, 2025 2nd (Faybik)",
            "11/19 · M. Zurek & Wayne: M. Zurek got Khalil Herbert | Wayne got D. Montgomery, 2025 1st (Wayne)",
            "11/19 · M. Zurek & Faybik: M. Zurek got Trevor Lawrence | Faybik got Geno Smith",
            "11/20 · Faybik & Corey: Faybik got Jaxon Smith-Njigba | Corey got Tom Brady (joke pick), 2025 1st (Faybik)",
        ]),

        SeasonHistory(id: "2023", season: 2023, champion: "Abad", runnerUp: "Dugan", standings: [
            TeamFinish(teamName: "Abad",     place: 1,  record: "8-6",  pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 2,  record: "8-6",  pointsFor: nil),
            TeamFinish(teamName: "Wayne",    place: 3,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Cantone",  place: 4,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 5,  record: "11-3", pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 6,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 7,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "A. Zurek", place: 8,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 9,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 10, record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 11, record: "5-9",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 12, record: "5-9",  pointsFor: nil),
        ], notableTrades: [
            "3/21 · Wayne & Bill: Wayne got Miles Sanders, Chubba Hubbard, 2023 2nd (Bill) | Bill got Saquon Barkley",
            "4/29 · A. Zurek & Jared: A. Zurek got Travis Etienne | Jared got 2023 1.05 (Ryan)",
            "7/25 · Ryan & Foley: Ryan got Davante Adams | Foley got 2023 1.11 (Faybik), Tyler Lockett",
            "7/26 · Dugan & Abad: Dugan got Jaylen Waddle | Abad got 2023 1.04 (Dugan), 2023 1.12 (Wayne), Sky Moore",
            "7/26 · Abad & Jared: Abad got 2023 1.05, 2023 1.07 | Jared got 2023 1.04, 2023 1.12",
            "8/23 · Abad & Jared: Abad got Lamar Jackson, Tee Higgins, Drake London | Jared got CeeDee Lamb",
            "8/23 · Abad & M. Zurek: Abad got CMC, C. Edwards-Helaire | M. Zurek got Josh Allen",
            "8/23 · Abad & Wayne: Abad got Kyler Murray | Wayne got 2024 2nd (Abad), Derrick Henry",
            "8/23 · Bill & Jason: Bill got Kirk Cousins | Jason got Christian Kirk, 2024 2nd (Bill)",
            "8/24 · Dugan & Foley: Dugan got Dak Prescott | Foley got Jameson Williams, Jimmy Garoppolo",
            "9/6 · Bill & Jared: Bill got 2024 1st (Jared) | Jared got 2024 1st (Bill)",
            "9/20 · Ryan & Jason: Ryan got Zack Moss, 2024 2nd (Jason) | Jason got Calvin Austin, 2024 2nd (Ryan)",
            "9/20 · Jason & Jared: Jason got Puka Nacua, Zach Charbonnet | Jared got Kyren Williams, Jaylen Warren, 2024 2nd (Bill)",
            "9/25 · Faybik & M. Zurek: Faybik got Goedert, Rico Dowdle, Deuce Vaughn, 2024 1st (M. Zurek) | M. Zurek got Josh Jacobs, Cade Otton, Brandin Cooks, 2024 2nd (Faybik)",
            "9/25 · Wayne & Jason: Wayne got Jake Ferguson | Jason got Ty Chandler, 2024 2nd (Wayne)",
            "9/28 · Faybik & M. Zurek: Faybik got Zach Wilson | M. Zurek got Devin Singletary",
            "9/28 · Cantone & M. Zurek: Cantone got Gerald Everett, 2024 2nd (M. Zurek), 2024 2nd (Faybik) | M. Zurek got George Kittle",
            "10/2 · Bill & A. Zurek: Bill got CJ Stroud, Ezekiel Elliott, C. Edwards-Helaire, 2024 1st (Andrew) | A. Zurek got Kirk Cousins, Calvin Ridley, Saquon Barkley",
            "10/3 · Bill & Jason: Bill got B. Aiyuk, Deuce Vaughn, 2024 1st (Jason), 2024 2nd (Ryan) | Jason got DeVonta Smith, A. Mattison, Ezekiel Elliott",
            "10/10 · Faybik & Abad: Faybik got Bryce Young, J. Addison, R. Moore, 2024 1st (Abad) | Abad got Justin Herbert, Amon-Ra St. Brown, MVS",
            "10/11 · Faybik & Foley: Faybik got Nico Collins, I. Pacheco, J. Garoppolo, 2024 2nd (Foley) | Foley got Tony Pollard, Joe Burrow, Drew Lock",
            "10/16 · Wayne & Jared: Wayne got Kyren Williams | Jared got Jerome Ford, 2024 1st (Wayne)",
            "10/23 · Dugan & Abad: Dugan got Kyler Murray, Dawson Knox | Abad got TJ Hockenson",
            "10/23 · Dugan & A. Zurek: Dugan got Jahmyr Gibbs, DeAndre Hopkins | A. Zurek got Jaylen Waddle, Zach Evans",
            "10/25 · Dugan & Cantone: Dugan got Rashee Rice, 2024 2nd (Cantone) | Cantone got DJ Moore",
            "10/26 · Jared & Bill: Jared got B. Aiyuk, 2024 1st (Jared) | Bill got 2024 1st (Bill), 2024 2nd (Bill)",
            "10/26 · Jared & Ryan: Jared got A. Richardson, 2024 2nd (Jason) | Ryan got Jonathan Taylor, CeeDee Lamb",
            "11/2 · Faybik & M. Zurek: Faybik got D. Singletary, Rashid Shaheed | M. Zurek got DK Metcalf, Jordan Mason",
            "11/2 · Faybik & Jason: Faybik got Z. Charbonnet, Demario Douglas | Jason got Raheem Mostert",
            "11/8 · Wayne & Bill: Wayne got Kenny Pickett | Bill got Clayton Tune, 2024 2nd (Corey)",
            "11/9 · Wayne & Jason: Wayne got Puka Nacua, M. Stafford, C. Wentz, 2024 2nd (Wayne) | Jason got Patrick Mahomes",
            "11/13 · Wayne & Dugan: Wayne got Antonio Gibson, 2024 2nd (Cantone) | Dugan got Jake Ferguson",
            "11/17 · Ryan & Foley: Ryan got Travis Kelce | Foley got Garrett Wilson, 2024 1st (Ryan)",
            "11/18 · Dugan & Bill: Dugan got Brian Robinson Jr. | Bill got Rashee Rice",
            "11/21 · Dugan & Jared: Dugan got Justin Jefferson | Jared got Bijan Robinson",
            "11/21 · Cantone & Foley: Cantone got Tony Pollard, Deebo Samuel | Foley got James Cook, Jakobi Meyers, 2024 1st (Cantone)",
            "11/22 · Faybik & Bill: Faybik got Terry McLaurin, 2024 1st (Jason) | Bill got Jordan Addison",
        ]),

        SeasonHistory(id: "2022", season: 2022, champion: "Wayne", runnerUp: "Faybik", standings: [
            TeamFinish(teamName: "Wayne",    place: 1,  record: "10-4", pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 2,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 3,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Abad",     place: 4,  record: "8-6",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 5,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 6,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 7,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 8,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Cantone",  place: 9,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 10, record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "A. Zurek", place: 11, record: "4-10", pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 12, record: "4-10", pointsFor: nil),
        ], notableTrades: [
            "5/14 · Corey & Wayne: Corey got 2022 1.01 | Wayne got Trevor Lawrence, DeVonta Smith, 2022 1.08",
            "5/21 · Jared & Wayne: Jared got 2022 1.11 | Wayne got 2022 2.02, 2022 2.08",
            "5/21 · Corey & Cantone: Corey got Nick Chubb, Derrick Henry | Cantone got C. Edwards-Helaire, 2022 1.09, 2022 1.10, 2022 1.12",
            "6/6 · Wayne & Dugan: Wayne got Cam Akers, Allen Lazard | Dugan got 2022 1.06, 2022 1.08",
            "7/25 · Jared & Corey: Jared got 2023 1st | Corey got 2022 1.11",
            "8/1 · Bill & Jared: Bill got Antonio Gibson, TJ Hockenson | Jared got Mark Andrews, 2023 2nd (Bill)",
            "8/9 · Bill & Ryan: Bill got AJ Brown | Ryan got Brandin Cooks, Marquise Brown",
            "8/9 · Faybik & Jared: Faybik got K. Walker, C. Kirk, Mark Andrews, Z. Wilson | Jared got Javonte Williams",
            "8/11 · Bill & Abad: Bill got Tua Tagovailoa | Abad got Michael Carter",
            "8/18 · Bill & A. Zurek: Bill got Robert Woods | A. Zurek got Antonio Gibson",
            "8/24 · Jason & Jared: Jason got Elijah Mitchell, Darnell Mooney | Jared got 2023 1st (Jason)",
            "8/25 · Wayne & Cantone: Wayne got Keenan Allen | Cantone got 2023 2nd (Wayne), Devin Singletary",
            "9/4 · Bill & Ryan: Bill got Aaron Jones, 2023 2nd (Ryan) | Ryan got 2023 1st (Bill)",
            "9/13 · Cantone & Foley: Cantone got Ryan Tannehill | Foley got 2023 2nd (Wayne)",
            "9/18 · M. Zurek & Jason: M. Zurek got E. Mitchell, Jeff Wilson Jr., Tyreek Hill, C. Patterson | Jason got Boston Scott, Alvin Kamara, Chris Godwin",
            "9/20 · Ryan & A. Zurek: Ryan got Michael Thomas | A. Zurek got D'Ernest Johnson, 2023 1st (Ryan)",
            "9/21 · Wayne & Jared: Wayne got Dallas Goedert, 2023 2nd (Bill) | Jared got David Njoku, 2023 1st (Wayne)",
            "9/27 · Wayne & Corey: Wayne got 2023 2nd (Abad) | Corey got Cooper Rush",
            "9/29 · Dugan & Jared: Dugan got Jameson Williams, Khalil Herbert, 2023 1st (Wayne) | Jared got Jonathan Taylor",
            "9/29 · Dugan & Cantone: Dugan got Taysom Hill, 2023 1st (Cantone) | Cantone got Courtland Sutton",
            "9/30 · Dugan & Corey: Dugan got Breece Hall, Michael Carter | Corey got Kyler Murray",
            "10/17 · Bill & Wayne: Bill got M. Pittman, DeVonta Smith, K. Pickett, B. Robinson Jr., 2023 2nd (Bill) | Wayne got Jalen Hurts, AJ Brown, Raheem Mostert",
            "10/20 · Cantone & Corey: Cantone got Ja'Marr Chase, JK Dobbins | Corey got Josh Allen, Deebo Samuel",
            "10/25 · Jason & Bill: Jason got M. Pittman, B. Aiyuk, Aaron Jones | Bill got Chris Godwin, Alec Pierce, 2023 2nd (Jason)",
            "10/28 · Cantone & M. Zurek: Cantone got 2023 2nd (M. Zurek) | M. Zurek got Alexander Mattison",
            "11/8 · A. Zurek & M. Zurek: A. Zurek got DeAndre Hopkins, 2023 1st (M. Zurek) | M. Zurek got Christian McCaffrey",
            "11/8 · Ryan & Faybik: Ryan got Garrett Wilson, 2023 1st (Faybik), 2023 2nd (Faybik) | Faybik got Justin Herbert",
            "11/9 · A. Zurek & Jared: A. Zurek got Javonte Williams, 2023 1st (Jason) | Jared got Tee Higgins, Drake London",
            "11/10 · Cantone & Foley: Cantone got JaMycal Hasty, Jared Goff, 2023 2nd (Foley), 2023 2nd (Wayne) | Foley got Leonard Fournette, Dak Prescott",
            "11/10 · Ryan & Wayne: Ryan got Trevor Lawrence, Mecole Hardman, 2023 2nd (Corey) | Wayne got Joe Mixon",
            "11/16 · Dugan & Abad: Dugan got Kyle Pitts | Abad got David Montgomery",
            "11/16 · Bill & M. Zurek: Bill got A. Mattison, DK Metcalf, Pat Freiermuth | M. Zurek got Tua Tagovailoa, TJ Hockenson, Ben Skowronek",
            "11/23 · Bill & Faybik: Bill got Christian Kirk | Faybik got DK Metcalf, 2023 2nd (Jason)",
        ]),

        SeasonHistory(id: "2021", season: 2021, champion: "Cantone", runnerUp: "Ryan", standings: [
            TeamFinish(teamName: "Cantone",  place: 1,  record: "10-4", pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 2,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 3,  record: "10-4", pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 4,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 5,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 6,  record: "8-6",  pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 7,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 8,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 9,  record: "5-9",  pointsFor: nil),
            TeamFinish(teamName: "Abad",     place: 10, record: "5-9",  pointsFor: nil),
            TeamFinish(teamName: "Wayne",    place: 11, record: "5-9",  pointsFor: nil),
            TeamFinish(teamName: "A. Zurek", place: 12, record: "2-12", pointsFor: nil),
        ], notableTrades: nil),

        SeasonHistory(id: "2020", season: 2020, champion: "Jared", runnerUp: "Ryan", standings: [
            TeamFinish(teamName: "Jared",    place: 1,  record: "11-3", pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 2,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 3,  record: "11-3", pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 4,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 5,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "A. Zurek", place: 6,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "Wayne",    place: 7,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 8,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Abad",     place: 9,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 10, record: "4-10", pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 11, record: "4-10", pointsFor: nil),
            TeamFinish(teamName: "Cantone",  place: 12, record: "4-10", pointsFor: nil),
        ], notableTrades: nil),

        // 2019: last year with Eric Alt and Vince Antonucci; Corey Abad also joined
        SeasonHistory(id: "2019", season: 2019, champion: "Jared", runnerUp: "M. Zurek", standings: [
            TeamFinish(teamName: "Jared",    place: 1,  record: "11-3", pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 2,  record: "11-3", pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 3,  record: "9-5",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 4,  record: "8-6",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 5,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 6,  record: "7-7",  pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 7,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 8,  record: "5-9",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 9,  record: "6-8",  pointsFor: nil),
            TeamFinish(teamName: "Eric",     place: 10, record: "5-9",  pointsFor: nil),
            TeamFinish(teamName: "Cantone",  place: 11, record: "3-11", pointsFor: nil),
            TeamFinish(teamName: "Abad",     place: 12, record: "1-13", pointsFor: nil),
        ], notableTrades: nil),

        SeasonHistory(id: "2018", season: 2018, champion: "Jared", runnerUp: "Foley", standings: [
            TeamFinish(teamName: "Jared",    place: 1,  record: "11-2", pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 2,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 3,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 4,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 5,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "Cantone",  place: 6,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 7,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Eric",     place: 8,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Abad",     place: 9,  record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 10, record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 11, record: "4-9",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 12, record: "1-12", pointsFor: nil),
        ], notableTrades: nil),

        // 2017: Faybik's first (and only) championship
        SeasonHistory(id: "2017", season: 2017, champion: "Faybik", runnerUp: "Vince", standings: [
            TeamFinish(teamName: "Faybik",   place: 1,  record: "10-3", pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 2,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 3,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 4,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "Eric",     place: 5,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Foley",    place: 6,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 7,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 8,  record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 9,  record: "3-10", pointsFor: nil),
            TeamFinish(teamName: "Jim",      place: 10, record: "4-9",  pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 11, record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Cantone",  place: 12, record: "4-9",  pointsFor: nil),
        ], notableTrades: nil),

        // 2016: last year with DeMott/Drabicki and Yuancie as separate teams
        SeasonHistory(id: "2016", season: 2016, champion: "M. Zurek", runnerUp: "Bill", standings: [
            TeamFinish(teamName: "M. Zurek", place: 1,  record: "10-3", pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 2,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 3,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Dugan",    place: 4,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Jim",      place: 5,  record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Eric",     place: 6,  record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 7,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 8,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 9,  record: "3-10", pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 10, record: "3-10", pointsFor: nil),
            TeamFinish(teamName: "DeMott",   place: 11, record: "4-9",  pointsFor: nil),
            TeamFinish(teamName: "Yuancie",  place: 12, record: "5-8",  pointsFor: nil),
        ], notableTrades: nil),

        SeasonHistory(id: "2015", season: 2015, champion: "Eric", runnerUp: "Faybik", standings: [
            TeamFinish(teamName: "Eric",     place: 1,  record: "10-3", pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 2,  record: "10-3", pointsFor: nil),
            TeamFinish(teamName: "DeMott",   place: 3,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "Yuancie",  place: 4,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 5,  record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 6,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 7,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 8,  record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 9,  record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "James",    place: 10, record: "4-9",  pointsFor: nil),
            TeamFinish(teamName: "Jim",      place: 11, record: "4-9",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 12, record: "3-10", pointsFor: nil),
        ], notableTrades: nil),

        // 2014: Ryan's second championship; faybik joins Lukas as co-manager
        SeasonHistory(id: "2014", season: 2014, champion: "Ryan", runnerUp: "Faybik", standings: [
            TeamFinish(teamName: "Ryan",     place: 1,  record: "10-3", pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 2,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Eric",     place: 3,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 4,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Kerry",    place: 5,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "Nick",     place: 6,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 7,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Jim",      place: 8,  record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 9,  record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 10, record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 11, record: "4-9",  pointsFor: nil),
            TeamFinish(teamName: "Yuancie",  place: 12, record: "2-11", pointsFor: nil),
        ], notableTrades: nil),

        // 2013: Eric Alt's second championship; Lukas solo, faybik not in league this year
        SeasonHistory(id: "2013", season: 2013, champion: "Eric", runnerUp: "Yuancie", standings: [
            TeamFinish(teamName: "Eric",     place: 1,  record: "11-2", pointsFor: nil),
            TeamFinish(teamName: "Yuancie",  place: 2,  record: "10-3", pointsFor: nil),
            TeamFinish(teamName: "Lukas",    place: 3,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 4,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 5,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Kerry",    place: 6,  record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 7,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 8,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Jim",      place: 9,  record: "3-10", pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 10, record: "3-10", pointsFor: nil),
            TeamFinish(teamName: "Vaswani",  place: 11, record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 12, record: "3-10", pointsFor: nil),
        ], notableTrades: nil),

        // 2012: Ryan's first championship; Lukas solo, Yuancie solo (faybik not listed)
        SeasonHistory(id: "2012", season: 2012, champion: "Ryan", runnerUp: "Kerry", standings: [
            TeamFinish(teamName: "Ryan",     place: 1,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Kerry",    place: 2,  record: "11-2", pointsFor: nil),
            TeamFinish(teamName: "Vaswani",  place: 3,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 4,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 5,  record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 6,  record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Lukas",    place: 7,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Yuancie",  place: 8,  record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 9,  record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 10, record: "5-8",  pointsFor: nil),
            TeamFinish(teamName: "Eric",     place: 11, record: "4-9",  pointsFor: nil),
            TeamFinish(teamName: "Jim",      place: 12, record: "1-12", pointsFor: nil),
        ], notableTrades: nil),

        // 2011: Vince's only championship; Lukas solo, faybik/Yuancie as co-managed team
        SeasonHistory(id: "2011", season: 2011, champion: "Vince", runnerUp: "Lukas", standings: [
            TeamFinish(teamName: "Vince",    place: 1,  record: "9-4",  pointsFor: nil),
            TeamFinish(teamName: "Lukas",    place: 2,  record: "8-5",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 3,  record: "10-3", pointsFor: nil),
            TeamFinish(teamName: "Vaswani",  place: 4,  record: "10-3", pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 5,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 6,  record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 7,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 8,  record: "7-6",  pointsFor: nil),
            TeamFinish(teamName: "Eric",     place: 9,  record: "2-11", pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 10, record: "3-10", pointsFor: nil),
            TeamFinish(teamName: "Jim",      place: 11, record: "6-7",  pointsFor: nil),
            TeamFinish(teamName: "Kerry",    place: 12, record: "5-8",  pointsFor: nil),
        ], notableTrades: nil),

        // 2010: Jim Friend's only championship; faybik/Yuancie joined the league
        SeasonHistory(id: "2010", season: 2010, champion: "Jim", runnerUp: "Vaswani", standings: [
            TeamFinish(teamName: "Jim",      place: 1,  record: "7-5",  pointsFor: nil),
            TeamFinish(teamName: "Vaswani",  place: 2,  record: "8-4",  pointsFor: nil),
            TeamFinish(teamName: "Lukas",    place: 3,  record: "10-2", pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 4,  record: "8-4",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 5,  record: "7-5",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 6,  record: "4-8",  pointsFor: nil),
            TeamFinish(teamName: "Eric",     place: 7,  record: "7-5",  pointsFor: nil),
            TeamFinish(teamName: "Kerry",    place: 8,  record: "4-8",  pointsFor: nil),
            TeamFinish(teamName: "Faybik",   place: 9,  record: "6-6",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 10, record: "4-8",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 11, record: "4-8",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 12, record: "3-9",  pointsFor: nil),
        ], notableTrades: nil),

        // 2009: Eric Alt's first championship; league founding era
        SeasonHistory(id: "2009", season: 2009, champion: "Eric", runnerUp: "Ryan", standings: [
            TeamFinish(teamName: "Eric",     place: 1,  record: "7-5",  pointsFor: nil),
            TeamFinish(teamName: "Ryan",     place: 2,  record: "7-5",  pointsFor: nil),
            TeamFinish(teamName: "Vince",    place: 3,  record: "8-4",  pointsFor: nil),
            TeamFinish(teamName: "Lukas",    place: 4,  record: "8-4",  pointsFor: nil),
            TeamFinish(teamName: "Jim",      place: 5,  record: "6-6",  pointsFor: nil),
            TeamFinish(teamName: "Jason",    place: 6,  record: "6-6",  pointsFor: nil),
            TeamFinish(teamName: "Jared",    place: 7,  record: "7-5",  pointsFor: nil),
            TeamFinish(teamName: "Vaswani",  place: 8,  record: "2-10", pointsFor: nil),
            TeamFinish(teamName: "Kerry",    place: 9,  record: "4-8",  pointsFor: nil),
            TeamFinish(teamName: "Chad",     place: 10, record: "7-5",  pointsFor: nil),
            TeamFinish(teamName: "Bill",     place: 11, record: "6-6",  pointsFor: nil),
            TeamFinish(teamName: "M. Zurek", place: 12, record: "4-8",  pointsFor: nil),
        ], notableTrades: nil),
    ]

    func seedLeagueHistory(completion: @escaping (Result<String, Error>) -> Void) {
        let seasons = Self.historySeeds
        guard !seasons.isEmpty else {
            completion(.success("No history data to seed. Add entries to DataSeeder.historySeeds."))
            return
        }

        let group = DispatchGroup()
        var errors: [Error] = []

        for season in seasons {
            group.enter()
            let docId = String(season.season)
            do {
                try db.collection("leagueHistory").document(docId).setData(from: season, merge: true) { e in
                    if let e { errors.append(e) }
                    group.leave()
                }
            } catch {
                errors.append(error)
                group.leave()
            }
        }

        group.notify(queue: .main) {
            if let first = errors.first { completion(.failure(first)) }
            else { completion(.success("Seeded \(seasons.count) season\(seasons.count == 1 ? "" : "s")")) }
        }
    }
}
