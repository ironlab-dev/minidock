import Foundation

public struct CronExpression: Sendable {
    let minute: String
    let hour: String
    let dayOfMonth: String
    let month: String
    let dayOfWeek: String
    
    public init(_ expression: String) throws {
        let parts = expression.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        guard parts.count == 5 else {
            throw NSError(domain: "CronExpression", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid cron format"])
        }
        self.minute = parts[0]
        self.hour = parts[1]
        self.dayOfMonth = parts[2]
        self.month = parts[3]
        self.dayOfWeek = parts[4]
    }
    
    public func isDue(date: Date = Date(), calendar: Calendar = .current) -> Bool {
        let components = calendar.dateComponents([.minute, .hour, .day, .month, .weekday], from: date)

        guard let min = components.minute,
              let hr = components.hour,
              let day = components.day,
              let mon = components.month,
              let wday = components.weekday,
              match(minute, min),
              match(hour, hr),
              match(dayOfMonth, day),
              match(month, mon),
              match(dayOfWeek, wday - 1) // Calendar: 1=Sun, Cron: 0=Sun
        else { return false }

        return true
    }
    
    private func match(_ pattern: String, _ value: Int) -> Bool {
        if pattern == "*" { return true }
        if let number = Int(pattern) { return number == value }
        if pattern.contains(",") {
            let parts = pattern.split(separator: ",").compactMap { Int($0) }
            return parts.contains(value)
        }
        // Simplified: ranges and steps not fully supported in this lightweight version yet
        return false
    }
}
