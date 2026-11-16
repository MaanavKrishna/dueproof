//! Checks that an address is a Dueproof server before the shell pins it:
//! `GET {origin}/api/health` (apps/app/app/api/health/route.ts).
//!
//! Done in Rust rather than from the setup page, so it isn't subject to the
//! server's CORS policy and never sends cookies. Redirects are not followed:
//! a server that redirects elsewhere is not the origin we'd pin.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Tone {
    Success,
    Warning,
    Danger,
}

/// What the setup screen shows. `ok` means "safe to connect".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub ok: bool,
    pub tone: Tone,
    pub message: String,
    /// The origin that was checked, once the address was valid.
    pub origin: Option<String>,
    pub server_version: Option<String>,
    pub edition: Option<String>,
}

impl Report {
    pub fn refused(message: impl Into<String>) -> Self {
        Report {
            ok: false,
            tone: Tone::Danger,
            message: message.into(),
            origin: None,
            server_version: None,
            edition: None,
        }
    }
}

#[derive(Debug, Deserialize)]
struct HealthBody {
    status: String,
    version: Option<String>,
    edition: Option<String>,
}

/// Turns the health endpoint's answer into a report. Pure, for tests.
pub fn interpret(status: u16, body: &[u8]) -> Report {
    let parsed: Option<HealthBody> = serde_json::from_slice(body).ok();
    let (server_version, edition) = parsed
        .as_ref()
        .map(|h| (h.version.clone(), h.edition.clone()))
        .unwrap_or((None, None));
    let base = |ok, tone, message: &str| Report {
        ok,
        tone,
        message: message.to_string(),
        origin: None,
        server_version: server_version.clone(),
        edition: edition.clone(),
    };
    if (300..400).contains(&status) {
        return base(
            false,
            Tone::Danger,
            "That address redirects somewhere else. Enter the address the server is served from.",
        );
    }
    // A Dueproof server names its edition; one that failed at boot answers
    // only {"status":"down"} with a 503.
    let Some(h) = parsed.filter(|h| h.edition.is_some() || (status == 503 && h.status == "down"))
    else {
        return base(
            false,
            Tone::Danger,
            "That address answered, but it isn't a Dueproof server.",
        );
    };
    match (status, h.status.as_str()) {
        (200, "ok") => base(true, Tone::Success, "Connected. The server is working."),
        (200, "degraded") => base(
            true,
            Tone::Warning,
            "Connected. The server is up, but its document engine isn't answering, so new uploads will wait.",
        ),
        (503, _) | (_, "down") => base(
            false,
            Tone::Danger,
            "The server is up, but its database isn't answering. Ask whoever runs it to check.",
        ),
        _ => base(
            false,
            Tone::Danger,
            "The server answered with an error. Try again in a minute.",
        ),
    }
}

/// Fetches and interprets `/api/health` on the origin.
pub async fn check(origin: &Url) -> Report {
    let mut report = match fetch(origin).await {
        Ok((status, body)) => interpret(status, &body),
        Err(e) if e.is_timeout() => Report::refused(
            "The server didn't answer in time. Check the address and your connection.",
        ),
        Err(e) if e.is_connect() => Report::refused(
            "Couldn't reach that address. Check it, and that you're online (or on the office network).",
        ),
        Err(_) => Report::refused(
            "Couldn't open a secure connection to that address. Check its certificate.",
        ),
    };
    report.origin = Some(crate::origin::origin_string(origin));
    report
}

async fn fetch(origin: &Url) -> Result<(u16, Vec<u8>), reqwest::Error> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .user_agent(concat!("Dueproof-Desktop/", env!("CARGO_PKG_VERSION")))
        .build()?;
    let url = origin.join("/api/health").expect("origin joins a path");
    let res = client
        .get(url)
        .header("accept", "application/json")
        .send()
        .await?;
    let status = res.status().as_u16();
    // The health body is a few hundred bytes; cap what we read.
    let bytes = res.bytes().await?;
    let body = bytes.slice(..bytes.len().min(64 * 1024)).to_vec();
    Ok((status, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn healthy_server() {
        let r = interpret(
            200,
            br#"{"status":"ok","version":"0.1.0","edition":"self-hosted","checks":{}}"#,
        );
        assert!(r.ok);
        assert_eq!(r.tone, Tone::Success);
        assert_eq!(r.server_version.as_deref(), Some("0.1.0"));
        assert_eq!(r.edition.as_deref(), Some("self-hosted"));
    }

    #[test]
    fn degraded_server_still_connects_with_a_warning() {
        let r = interpret(
            200,
            br#"{"status":"degraded","version":"0.1.0","edition":"hosted"}"#,
        );
        assert!(r.ok);
        assert_eq!(r.tone, Tone::Warning);
    }

    #[test]
    fn database_down_does_not_connect() {
        let r = interpret(503, br#"{"status":"down","edition":"self-hosted"}"#);
        assert!(!r.ok);
        assert!(r.message.contains("database"));
        // Production servers that fail at boot send only {"status":"down"}.
        let r = interpret(503, br#"{"status":"down"}"#);
        assert!(!r.ok);
        assert!(r.message.contains("database"));
    }

    #[test]
    fn something_else_is_not_dueproof() {
        for (status, body) in [
            (200, &b"<html>hello</html>"[..]),
            (200, &br#"{"status":"ok"}"#[..]),
            (404, &b"not found"[..]),
            (200, &b""[..]),
        ] {
            let r = interpret(status, body);
            assert!(!r.ok, "{status}");
            assert!(r.message.contains("isn't a Dueproof server"), "{status}");
        }
    }

    #[test]
    fn redirects_are_refused() {
        let r = interpret(308, b"");
        assert!(!r.ok);
        assert!(r.message.contains("redirects"));
    }

    #[test]
    fn report_serialises_for_the_setup_screen() {
        let r = interpret(
            200,
            br#"{"status":"ok","version":"0.1.0","edition":"desktop"}"#,
        );
        let json = serde_json::to_value(&r).unwrap();
        assert_eq!(json["tone"], "success");
        assert_eq!(json["serverVersion"], "0.1.0");
    }
}
