//! Local mode (spike, behind the `local-mode` cargo feature): run the app
//! server and the engine on this computer as sidecars (03-architecture §5,
//! 05-security §7). See README "Local mode" for what's measured and missing.
//!
//! - Both listen on 127.0.0.1 only, each on a random free port.
//! - A per-launch secret, made fresh each start, is shared by the shell, the
//!   app server and the engine (ENGINE_SHARED_SECRET), and handed to the app
//!   server as DUEPROOF_LAUNCH_SECRET for the webview check (not yet enforced
//!   by apps/app; see README).
//! - The children get a clean environment: nothing from the user's shell
//!   (no stray DATABASE_URL or keys) leaks in.
//! - Data lives in the OS user's app-data folder.
//!
//! Expected layout under the bundle's resources (`local-runtime/`):
//!
//! ```text
//! node/bin/node            Node 22 runtime (node.exe on Windows)
//! app/apps/app/server.js   Next.js standalone output (apps/app/.next/standalone)
//! engine/bin/python3       Python with services/engine and uvicorn installed (optional)
//! ```

use std::{
    fs,
    net::{Ipv4Addr, TcpListener},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use url::Url;

pub struct Sidecars {
    pub origin: Url,
    app: Child,
    engine: Option<Child>,
}

/// A free TCP port on 127.0.0.1, picked by the OS.
pub fn free_port() -> std::io::Result<u16> {
    let l = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    Ok(l.local_addr()?.port())
}

/// 32 random bytes as hex.
pub fn random_secret() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random source works");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The install's AUTH_SECRET: made once, kept in the app-data folder (owner
/// read/write only), so sign-ins survive a restart. Not per launch.
fn auth_secret(data: &Path) -> std::io::Result<String> {
    let path = data.join("auth-secret");
    if let Ok(s) = fs::read_to_string(&path) {
        if s.trim().len() >= 32 {
            return Ok(s.trim().to_string());
        }
    }
    fs::create_dir_all(data)?;
    let s = random_secret();
    fs::write(&path, &s)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(s)
}

pub struct AppEnv<'a> {
    pub port: u16,
    pub engine_port: Option<u16>,
    pub launch_secret: &'a str,
    pub auth_secret: &'a str,
    pub data: &'a Path,
}

/// The app server's environment (apps/app/.env.example). Pure, for tests.
pub fn app_env(e: &AppEnv<'_>) -> Vec<(String, String)> {
    let origin = format!("http://127.0.0.1:{}", e.port);
    let mut v: Vec<(String, String)> = vec![
        ("NODE_ENV", "production".to_string()),
        ("NEXT_TELEMETRY_DISABLED", "1".to_string()),
        ("HOSTNAME", "127.0.0.1".to_string()),
        ("PORT", e.port.to_string()),
        ("DUEPROOF_EDITION", "desktop".to_string()),
        ("APP_URL", origin),
        ("AUTH_SECRET", e.auth_secret.to_string()),
        ("AUTH_SIGNUP", "first-user".to_string()),
        (
            "PGLITE_DATA_DIR",
            e.data.join("pglite").display().to_string(),
        ),
        ("DB_MIGRATE_ON_START", "1".to_string()),
        ("STORAGE_DRIVER", "local".to_string()),
        (
            "STORAGE_LOCAL_DIR",
            e.data.join("files").display().to_string(),
        ),
        ("DUEPROOF_LAUNCH_SECRET", e.launch_secret.to_string()),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v))
    .collect();
    if let Some(p) = e.engine_port {
        v.push(("ENGINE_MODE".into(), "http".into()));
        v.push(("ENGINE_URL".into(), format!("http://127.0.0.1:{p}")));
        v.push(("ENGINE_SHARED_SECRET".into(), e.launch_secret.to_string()));
    }
    v
}

/// The few variables a child process needs from the OS, and nothing else.
fn base_env(cmd: &mut Command) {
    cmd.env_clear();
    for k in [
        "PATH",
        "HOME",
        "USERPROFILE",
        "SystemRoot",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
    ] {
        if let Some(v) = std::env::var_os(k) {
            cmd.env(k, v);
        }
    }
    die_with_parent(cmd);
}

/// On Linux the kernel stops a sidecar when the shell dies, even if the
/// shell is killed or crashes (RunEvent::Exit doesn't run then). macOS and
/// Windows need their own mechanism (a kqueue watcher, a Job object); see README.
#[cfg(target_os = "linux")]
fn die_with_parent(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    // SAFETY: prctl is async-signal-safe and touches only the child.
    unsafe {
        cmd.pre_exec(|| {
            if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

#[cfg(not(target_os = "linux"))]
fn die_with_parent(_cmd: &mut Command) {}

fn runtime_dir(resources: &Path) -> PathBuf {
    resources.join("local-runtime")
}

fn node_bin(rt: &Path) -> PathBuf {
    if cfg!(windows) {
        rt.join("node").join("node.exe")
    } else {
        rt.join("node").join("bin").join("node")
    }
}

fn python_bin(rt: &Path) -> PathBuf {
    if cfg!(windows) {
        rt.join("engine").join("python.exe")
    } else {
        rt.join("engine").join("bin").join("python3")
    }
}

impl Sidecars {
    /// Starts the engine (when bundled) and the app server, and waits until
    /// the app answers `/api/health` (60 s at most).
    pub fn start(resources: &Path, data: &Path) -> Result<Self, String> {
        let rt = runtime_dir(resources);
        let node = node_bin(&rt);
        let server = rt.join("app").join("apps").join("app").join("server.js");
        if !node.exists() || !server.exists() {
            return Err(format!(
                "the local runtime isn't bundled in {}",
                rt.display()
            ));
        }
        let launch_secret = random_secret();
        let auth = auth_secret(data).map_err(|e| format!("auth secret: {e}"))?;

        let python = python_bin(&rt);
        let (engine, engine_port) = if python.exists() {
            let port = free_port().map_err(|e| e.to_string())?;
            let mut cmd = Command::new(&python);
            base_env(&mut cmd);
            let port_s = port.to_string();
            cmd.args([
                "-m",
                "uvicorn",
                "dueproof_engine.app:app",
                "--host",
                "127.0.0.1",
                "--port",
                &port_s,
                "--workers",
                "1",
                "--no-server-header",
            ])
            .current_dir(rt.join("engine"))
            .env("ENGINE_SHARED_SECRET", &launch_secret)
            // The engine refuses every storage host unless told which: the app, on loopback.
            .env("DUEPROOF_ALLOWED_HOSTS", "127.0.0.1")
            .stdin(Stdio::null());
            let child = cmd.spawn().map_err(|e| format!("engine: {e}"))?;
            (Some(child), Some(port))
        } else {
            (None, None)
        };

        let port = free_port().map_err(|e| e.to_string())?;
        let mut cmd = Command::new(&node);
        base_env(&mut cmd);
        cmd.arg(&server)
            .current_dir(server.parent().expect("server.js has a folder"))
            .envs(app_env(&AppEnv {
                port,
                engine_port,
                launch_secret: &launch_secret,
                auth_secret: &auth,
                data,
            }))
            .stdin(Stdio::null());
        let app = cmd.spawn().map_err(|e| format!("app server: {e}"))?;
        let origin = Url::parse(&format!("http://127.0.0.1:{port}/")).expect("valid origin");

        let s = Sidecars {
            origin,
            app,
            engine,
        };
        let started = Instant::now();
        loop {
            let report = tauri::async_runtime::block_on(crate::health::check(&s.origin));
            if report.ok {
                log::info!("local mode ready in {} ms", started.elapsed().as_millis());
                return Ok(s);
            }
            if started.elapsed() > Duration::from_secs(60) {
                s.stop();
                return Err("the local app server didn't start within 60 seconds".into());
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }

    pub fn stop(mut self) {
        let _ = self.app.kill();
        let _ = self.app.wait();
        if let Some(mut e) = self.engine.take() {
            let _ = e.kill();
            let _ = e.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ports_are_loopback_and_free() {
        let p = free_port().unwrap();
        assert!(p > 0);
        // Still free: we can bind it on 127.0.0.1.
        TcpListener::bind((Ipv4Addr::LOCALHOST, p)).unwrap();
    }

    #[test]
    fn secrets_are_fresh_and_long() {
        let (a, b) = (random_secret(), random_secret());
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }

    #[test]
    fn app_env_binds_to_loopback_and_shares_the_launch_secret() {
        let data = Path::new("/data");
        let env = app_env(&AppEnv {
            port: 40123,
            engine_port: Some(40124),
            launch_secret: "s3cret",
            auth_secret: "auth",
            data,
        });
        let get = |k: &str| env.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str());
        assert_eq!(get("HOSTNAME"), Some("127.0.0.1"));
        assert_eq!(get("APP_URL"), Some("http://127.0.0.1:40123"));
        assert_eq!(get("DUEPROOF_EDITION"), Some("desktop"));
        assert_eq!(get("ENGINE_URL"), Some("http://127.0.0.1:40124"));
        assert_eq!(get("ENGINE_SHARED_SECRET"), Some("s3cret"));
        assert_eq!(get("DUEPROOF_LAUNCH_SECRET"), Some("s3cret"));
        assert!(get("PGLITE_DATA_DIR").unwrap().starts_with("/data"));
        let without_engine = app_env(&AppEnv {
            port: 1,
            engine_port: None,
            launch_secret: "s",
            auth_secret: "a",
            data,
        });
        assert!(!without_engine.iter().any(|(k, _)| k == "ENGINE_URL"));
    }

    #[test]
    fn auth_secret_is_kept_between_launches() {
        let dir = std::env::temp_dir().join(format!("dp-local-{}", random_secret()));
        let a = auth_secret(&dir).unwrap();
        assert_eq!(auth_secret(&dir).unwrap(), a);
        fs::remove_dir_all(dir).unwrap();
    }
}
