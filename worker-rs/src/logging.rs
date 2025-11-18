use std::sync::Once;

use tracing::Level;
use tracing_subscriber::{fmt, EnvFilter};

static INIT: Once = Once::new();

pub fn init(level: &str) {
    INIT.call_once(|| {
        let fallback = format!("worker_rs={level},info");
        let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(fallback));
        fmt()
            .with_max_level(parse_level(level))
            .with_env_filter(env_filter)
            .with_target(false)
            .init();
    });
}

fn parse_level(level: &str) -> Level {
    match level.to_ascii_lowercase().as_str() {
        "trace" => Level::TRACE,
        "debug" => Level::DEBUG,
        "info" => Level::INFO,
        "warn" | "warning" => Level::WARN,
        "error" => Level::ERROR,
        _ => Level::INFO,
    }
}
