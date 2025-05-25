//
//  Item.swift
//  CodeRed
//
//  Created by Jared Taylor on 4/20/25.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
