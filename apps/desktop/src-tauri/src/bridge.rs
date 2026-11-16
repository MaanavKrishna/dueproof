//! The small bridge between the server's pages and the shell.
//!
//! The server's origin gets exactly one command, `notify`, through a
//! capability added at run time for the pinned origin (see `lib.rs`). This
//! module renders the injected script and checks what the page sends.

use std::time::{Duration, Instant};
use url::Url;

const TEMPLATE: &str = include_str!("bridge.js");

pub const MAX_TITLE: usize = 120;
pub const MAX_BODY: usize = 300;

/// The bridge script for one pinned origin. Values are JSON-encoded, so an
/// origin can't break out of its string.
pub fn script(origin: &Url, platform: &str) -> String {
    let js = |s: &str| serde_json::to_string(s).expect("strings serialise");
    TEMPLATE
        .replace("__DP_ORIGIN__", &js(&crate::origin::origin_string(origin)))
        .replace("__DP_PLATFORM__", &js(platform))
        .replace("__DP_VERSION__", &js(env!("CARGO_PKG_VERSION")))
}

/// Trims, drops control characters, collapses whitespace and cuts to `max`
/// characters (with an ellipsis).
pub fn clean_text(input: &str, max: usize) -> String {
    let collapsed = input
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if collapsed.chars().count() <= max {
        return collapsed;
    }
    let mut cut: String = collapsed.chars().take(max.saturating_sub(1)).collect();
    cut.push('…');
    cut
}

/// At most `limit` notifications per `window`, so a misbehaving page can't
/// flood the desktop.
pub struct RateLimit {
    limit: usize,
    window: Duration,
    sent: Vec<Instant>,
}

impl RateLimit {
    pub fn new(limit: usize, window: Duration) -> Self {
        RateLimit {
            limit,
            window,
            sent: Vec::new(),
        }
    }

    pub fn allow(&mut self, now: Instant) -> bool {
        self.sent.retain(|t| now.duration_since(*t) < self.window);
        if self.sent.len() >= self.limit {
            return false;
        }
        self.sent.push(now);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_embeds_values_as_json_strings() {
        let origin = Url::parse("https://dueproof.example.com/").unwrap();
        let s = script(&origin, "linux");
        assert!(s.contains(r#"const ORIGIN = "https://dueproof.example.com";"#));
        assert!(s.contains(r#"const PLATFORM = "linux";"#));
        assert!(!s.contains("__DP_"));
    }

    #[test]
    fn cleans_notification_text() {
        assert_eq!(clean_text("  Due\ttoday\n\u{7}now ", 50), "Due today now");
        assert_eq!(clean_text("", 10), "");
        let long = "a".repeat(200);
        let got = clean_text(&long, MAX_TITLE);
        assert_eq!(got.chars().count(), MAX_TITLE);
        assert!(got.ends_with('…'));
        // Multi-byte characters are counted, not bytes.
        assert_eq!(clean_text("देय तिथि", 4), "देय…");
    }

    #[test]
    fn rate_limit_allows_a_burst_then_refuses() {
        let mut rl = RateLimit::new(3, Duration::from_secs(60));
        let t0 = Instant::now();
        assert!(rl.allow(t0));
        assert!(rl.allow(t0));
        assert!(rl.allow(t0));
        assert!(!rl.allow(t0 + Duration::from_secs(10)));
        assert!(rl.allow(t0 + Duration::from_secs(61)));
    }
}
