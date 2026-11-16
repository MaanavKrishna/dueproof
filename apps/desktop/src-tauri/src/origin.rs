//! Server URL validation and origin pinning (05-security §7).
//!
//! Pure functions, no Tauri types, so they're unit-tested here. The shell
//! pins exactly one origin (scheme, host, port). The main window may show
//! that origin and the app's own local screens; every other web link opens in
//! the system browser, and anything else is refused.

use std::fmt;
use url::{Host, Url};

/// Why a server address was refused. `Display` is the sentence the setup
/// screen shows (British spelling, plain words).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UrlError {
    Empty,
    Unparseable,
    Scheme,
    Insecure,
    Credentials,
    NoHost,
    Ipv6,
    PathNotSupported,
}

impl fmt::Display for UrlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            UrlError::Empty => "Enter your Dueproof server's address.",
            UrlError::Unparseable => "That doesn't look like a web address.",
            UrlError::Scheme => "Use an https:// address.",
            UrlError::Insecure => {
                "Use https:// for a server on another computer. Plain http:// is allowed only for this computer (localhost)."
            }
            UrlError::Credentials => "Leave the user name and password out of the address.",
            UrlError::NoHost => "The address needs a server name.",
            UrlError::Ipv6 => "Use a host name rather than an IPv6 address.",
            UrlError::PathNotSupported => {
                "Use the server's main address, without a path (for example https://dueproof.example.com)."
            }
        };
        f.write_str(s)
    }
}

impl std::error::Error for UrlError {}

/// True for `localhost`, `*.localhost` and 127.0.0.0/8.
pub fn is_loopback_host(host: &Host<&str>) -> bool {
    match host {
        Host::Domain(d) => {
            let d = d.trim_end_matches('.').to_ascii_lowercase();
            d == "localhost" || d.ends_with(".localhost")
        }
        Host::Ipv4(ip) => ip.is_loopback(),
        Host::Ipv6(ip) => ip.is_loopback(),
    }
}

/// Turns what someone typed into the server's origin (`scheme://host[:port]`,
/// returned as a `Url` with path `/`).
///
/// - No scheme typed: `https://` is assumed, or `http://` for this computer.
/// - `https` anywhere; `http` only for this computer (localhost, 127.x).
/// - No user name or password; no IPv6 literals (the origin also becomes an
///   IPC URL pattern, where brackets and colons have meaning).
/// - A trailing `/` is fine; any other path, query or fragment is refused,
///   because the server is the whole origin.
pub fn normalise_server_url(input: &str) -> Result<Url, UrlError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(UrlError::Empty);
    }
    if trimmed.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(UrlError::Unparseable);
    }
    let url = if trimmed.contains("://") {
        Url::parse(trimmed).map_err(|_| UrlError::Unparseable)?
    } else {
        let https = Url::parse(&format!("https://{trimmed}")).map_err(|_| UrlError::Unparseable)?;
        // A server on this computer is almost always plain http (`pnpm start`).
        match https.host() {
            Some(h) if is_loopback_host(&h) => {
                Url::parse(&format!("http://{trimmed}")).map_err(|_| UrlError::Unparseable)?
            }
            _ => https,
        }
    };
    match url.scheme() {
        "https" | "http" => {}
        _ => return Err(UrlError::Scheme),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(UrlError::Credentials);
    }
    let host = url.host().ok_or(UrlError::NoHost)?;
    if let Host::Domain(d) = host {
        if d.is_empty() {
            return Err(UrlError::NoHost);
        }
    }
    if matches!(host, Host::Ipv6(_)) {
        return Err(UrlError::Ipv6);
    }
    if url.scheme() == "http" && !is_loopback_host(&host) {
        return Err(UrlError::Insecure);
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err(UrlError::PathNotSupported);
    }
    // Rebuild from the origin so nothing but scheme, host and port survives.
    let origin = url.origin().ascii_serialization();
    Url::parse(&format!("{origin}/")).map_err(|_| UrlError::Unparseable)
}

/// `scheme://host[:port]` without a trailing slash.
pub fn origin_string(url: &Url) -> String {
    url.origin().ascii_serialization()
}

/// Same scheme, host and port. Opaque origins (data:, file: and so on) never match.
pub fn same_origin(a: &Url, b: &Url) -> bool {
    let (oa, ob) = (a.origin(), b.origin());
    oa.is_tuple() && oa == ob
}

/// The IPC URL pattern for the run-time capability: the pinned origin and
/// every path on it (Tauri fills in `*` for an empty path).
pub fn remote_capability_pattern(origin: &Url) -> String {
    origin_string(origin)
}

/// Where the app's own screens are served from: `tauri://localhost` (macOS,
/// Linux), `http(s)://tauri.localhost` (Windows), or the dev server.
pub fn is_local_app_url(url: &Url, dev_origin: Option<&Url>) -> bool {
    if url.scheme() == "tauri" && url.host_str() == Some("localhost") {
        return true;
    }
    if matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost") {
        return true;
    }
    dev_origin.is_some_and(|d| same_origin(d, url))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Navigation {
    /// Load it in the main window.
    Allow,
    /// Refuse it here and hand it to the system browser or mail app.
    OpenExternally,
    /// Refuse it.
    Deny,
}

/// What the main window does with a navigation.
///
/// - The pinned origin, and same-origin `blob:` URLs: allowed.
/// - The app's own screens: allowed only when the shell asked for them
///   (`local_allowed`), so the server's pages can't open the setup screen
///   and its commands.
/// - Other `http(s)` links, `mailto:` and `tel:`: the system's apps.
/// - `about:blank`/`about:srcdoc` (empty frames): allowed, they carry no origin.
/// - Everything else (`file:`, `data:`, `javascript:`, unknown schemes): refused.
pub fn decide_navigation(
    pinned: Option<&Url>,
    target: &Url,
    local_allowed: bool,
    dev_origin: Option<&Url>,
) -> Navigation {
    if is_local_app_url(target, dev_origin) {
        return if local_allowed {
            Navigation::Allow
        } else {
            Navigation::Deny
        };
    }
    match target.scheme() {
        "about" => match target.path() {
            "blank" | "srcdoc" => Navigation::Allow,
            _ => Navigation::Deny,
        },
        "http" | "https" => match pinned {
            Some(p) if same_origin(p, target) => Navigation::Allow,
            _ => Navigation::OpenExternally,
        },
        "blob" => match pinned {
            Some(p) if same_origin(p, target) => Navigation::Allow,
            _ => Navigation::Deny,
        },
        "mailto" | "tel" => Navigation::OpenExternally,
        _ => Navigation::Deny,
    }
}

/// A path inside the app, as a deep link or a notification may carry it:
/// starts with one `/`, no backslashes, no control characters, at most 2 KB.
/// The query string is kept; a fragment is dropped.
pub fn safe_app_path(path: &str) -> Option<&str> {
    if path.len() > 2048
        || !path.starts_with('/')
        || path.starts_with("//")
        || path.contains('\\')
        || path.chars().any(|c| c.is_control())
    {
        return None;
    }
    Some(path.split('#').next().unwrap_or(path))
}

/// Joins an app path to the pinned origin, and refuses the result if it
/// somehow leaves that origin.
pub fn join_app_path(pinned: &Url, path: &str) -> Option<Url> {
    let path = safe_app_path(path)?;
    let joined = pinned.join(path).ok()?;
    same_origin(pinned, &joined).then_some(joined)
}

/// `dueproof://open?path=/cases/…` → a URL on the pinned origin.
/// Anything else (another action, a missing or unsafe path) gives `None`.
pub fn deep_link_target(pinned: &Url, link: &Url) -> Option<Url> {
    if link.scheme() != "dueproof" {
        return None;
    }
    if link.host_str() != Some("open") {
        return None;
    }
    if !(link.path().is_empty() || link.path() == "/") {
        return None;
    }
    let path = link
        .query_pairs()
        .find(|(k, _)| k == "path")
        .map(|(_, v)| v.into_owned())
        .unwrap_or_else(|| "/".to_string());
    join_app_path(pinned, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn assumes_https_and_keeps_only_the_origin() {
        let got = normalise_server_url("  Dueproof.Example.com  ").unwrap();
        assert_eq!(got.as_str(), "https://dueproof.example.com/");
        let got = normalise_server_url("https://dueproof.example.com:8443/").unwrap();
        assert_eq!(origin_string(&got), "https://dueproof.example.com:8443");
        // Default port is dropped.
        let got = normalise_server_url("https://dueproof.example.com:443").unwrap();
        assert_eq!(origin_string(&got), "https://dueproof.example.com");
    }

    #[test]
    fn allows_plain_http_only_for_this_computer() {
        assert!(normalise_server_url("http://localhost:3000").is_ok());
        assert_eq!(
            normalise_server_url("localhost:3000").unwrap().as_str(),
            "http://localhost:3000/"
        );
        assert_eq!(
            normalise_server_url("127.0.0.1:3000").unwrap().as_str(),
            "http://127.0.0.1:3000/"
        );
        assert!(normalise_server_url("http://127.0.0.1:3000/").is_ok());
        assert!(normalise_server_url("http://app.localhost:3000").is_ok());
        assert_eq!(
            normalise_server_url("http://dueproof.example.com"),
            Err(UrlError::Insecure)
        );
        assert_eq!(
            normalise_server_url("http://192.168.1.20:3000"),
            Err(UrlError::Insecure)
        );
        // "localhost" as a prefix of another name is not loopback.
        assert_eq!(
            normalise_server_url("http://localhost.evil.example"),
            Err(UrlError::Insecure)
        );
    }

    #[test]
    fn refuses_other_schemes_and_odd_addresses() {
        assert_eq!(normalise_server_url(""), Err(UrlError::Empty));
        assert_eq!(normalise_server_url("   "), Err(UrlError::Empty));
        assert_eq!(
            normalise_server_url("file:///etc/passwd"),
            Err(UrlError::Scheme)
        );
        assert_eq!(
            normalise_server_url("ftp://example.com"),
            Err(UrlError::Scheme)
        );
        assert_eq!(
            normalise_server_url("javascript://alert(1)"),
            Err(UrlError::Scheme)
        );
        assert_eq!(
            normalise_server_url("tauri://localhost"),
            Err(UrlError::Scheme)
        );
        assert_eq!(
            normalise_server_url("https://user:pw@example.com"),
            Err(UrlError::Credentials)
        );
        assert_eq!(
            normalise_server_url("https://[::1]:3000"),
            Err(UrlError::Ipv6)
        );
        assert_eq!(
            normalise_server_url("http://[::1]:3000"),
            Err(UrlError::Ipv6)
        );
        assert_eq!(
            normalise_server_url("exa mple.com"),
            Err(UrlError::Unparseable)
        );
        assert_eq!(
            normalise_server_url("https://example.com\n"),
            Ok(u("https://example.com/"))
        );
        assert_eq!(
            normalise_server_url("https://exa\tmple.com"),
            Err(UrlError::Unparseable)
        );
        assert_eq!(normalise_server_url("https://"), Err(UrlError::Unparseable));
    }

    #[test]
    fn refuses_paths_queries_and_fragments() {
        for s in [
            "https://example.com/app",
            "https://example.com/?next=/x",
            "https://example.com/#x",
        ] {
            assert_eq!(
                normalise_server_url(s),
                Err(UrlError::PathNotSupported),
                "{s}"
            );
        }
    }

    #[test]
    fn error_messages_are_plain_sentences() {
        for e in [
            UrlError::Empty,
            UrlError::Unparseable,
            UrlError::Scheme,
            UrlError::Insecure,
            UrlError::Credentials,
            UrlError::NoHost,
            UrlError::Ipv6,
            UrlError::PathNotSupported,
        ] {
            let s = e.to_string();
            assert!(s.ends_with('.') || s.ends_with(')'), "{s}");
        }
    }

    #[test]
    fn pins_navigation_to_one_origin() {
        let pinned = u("https://dueproof.example.com/");
        let p = Some(&pinned);
        let nav = |t: &str| decide_navigation(p, &u(t), false, None);
        assert_eq!(
            nav("https://dueproof.example.com/deadlines?x=1"),
            Navigation::Allow
        );
        assert_eq!(nav("https://dueproof.example.com:443/"), Navigation::Allow);
        // Another port, scheme or subdomain is another origin.
        assert_eq!(
            nav("https://dueproof.example.com:8443/"),
            Navigation::OpenExternally
        );
        assert_eq!(
            nav("http://dueproof.example.com/"),
            Navigation::OpenExternally
        );
        assert_eq!(
            nav("https://evil.dueproof.example.com/"),
            Navigation::OpenExternally
        );
        assert_eq!(
            nav("https://incometax.gov.in/notice"),
            Navigation::OpenExternally
        );
        assert_eq!(nav("mailto:help@example.com"), Navigation::OpenExternally);
        assert_eq!(nav("file:///etc/passwd"), Navigation::Deny);
        assert_eq!(nav("data:text/html,<p>x</p>"), Navigation::Deny);
        assert_eq!(nav("javascript:alert(1)"), Navigation::Deny);
        assert_eq!(nav("ms-settings:privacy"), Navigation::Deny);
        assert_eq!(nav("about:blank"), Navigation::Allow);
        assert_eq!(nav("about:config"), Navigation::Deny);
        assert_eq!(
            nav("blob:https://dueproof.example.com/2b1c7f3e-1111-4c5d-9e0f-123456789abc"),
            Navigation::Allow
        );
        assert_eq!(
            nav("blob:https://evil.example/2b1c7f3e-1111-4c5d-9e0f-123456789abc"),
            Navigation::Deny
        );
    }

    #[test]
    fn local_screens_only_when_the_shell_asks() {
        let pinned = u("https://dueproof.example.com/");
        for local in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/index.html",
        ] {
            assert_eq!(
                decide_navigation(Some(&pinned), &u(local), false, None),
                Navigation::Deny,
                "{local}"
            );
            assert_eq!(
                decide_navigation(Some(&pinned), &u(local), true, None),
                Navigation::Allow,
                "{local}"
            );
        }
        let dev = u("http://127.0.0.1:1420/");
        assert_eq!(
            decide_navigation(
                None,
                &u("http://127.0.0.1:1420/index.html"),
                true,
                Some(&dev)
            ),
            Navigation::Allow
        );
        assert_eq!(
            decide_navigation(
                None,
                &u("http://127.0.0.1:1420/index.html"),
                false,
                Some(&dev)
            ),
            Navigation::Deny
        );
    }

    #[test]
    fn nothing_is_pinned_before_setup() {
        assert_eq!(
            decide_navigation(None, &u("https://dueproof.example.com/"), false, None),
            Navigation::OpenExternally
        );
    }

    #[test]
    fn deep_links_stay_on_the_pinned_origin() {
        let pinned = u("https://dueproof.example.com/");
        let dl = |s: &str| deep_link_target(&pinned, &u(s)).map(|u| u.to_string());
        assert_eq!(
            dl("dueproof://open?path=/cases/42"),
            Some("https://dueproof.example.com/cases/42".into())
        );
        assert_eq!(
            dl("dueproof://open?path=%2Fdeadlines%3Fview%3Dcalendar"),
            Some("https://dueproof.example.com/deadlines?view=calendar".into())
        );
        assert_eq!(
            dl("dueproof://open"),
            Some("https://dueproof.example.com/".into())
        );
        assert_eq!(dl("dueproof://open?path=//evil.example/x"), None);
        assert_eq!(dl("dueproof://open?path=https://evil.example/"), None);
        assert_eq!(dl("dueproof://open?path=/%5C%5Cevil.example"), None);
        assert_eq!(dl("dueproof://open?path=/a%0Ab"), None);
        assert_eq!(dl("dueproof://open?path=cases/42"), None);
        assert_eq!(dl("dueproof://delete?path=/cases/42"), None);
        assert_eq!(dl("dueproof://open/cases/42"), None);
        assert_eq!(dl("https://open?path=/cases/42"), None);
        // ".." can't climb out of the origin.
        assert_eq!(
            dl("dueproof://open?path=/../../x"),
            Some("https://dueproof.example.com/x".into())
        );
    }

    #[test]
    fn capability_pattern_is_a_valid_url_pattern_for_the_origin() {
        use std::str::FromStr;
        use tauri::utils::acl::RemoteUrlPattern;
        for s in [
            "https://dueproof.example.com",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ] {
            let origin = normalise_server_url(s).unwrap();
            let pattern = RemoteUrlPattern::from_str(&remote_capability_pattern(&origin)).unwrap();
            assert!(pattern.test(&origin.join("/deadlines?x=1").unwrap()), "{s}");
            assert!(pattern.test(&origin), "{s}");
            assert!(!pattern.test(&u("https://evil.example/")), "{s}");
        }
        let origin = normalise_server_url("https://dueproof.example.com").unwrap();
        let pattern = RemoteUrlPattern::from_str(&remote_capability_pattern(&origin)).unwrap();
        assert!(!pattern.test(&u("https://dueproof.example.com.evil.example/")));
        assert!(!pattern.test(&u("https://dueproof.example.com:8443/")));
        assert!(!pattern.test(&u("http://dueproof.example.com/")));
    }
}
