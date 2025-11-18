use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    let settings = worker_rs::config::Settings::from_env()?;
    worker_rs::logging::init(&settings.log_level);

    worker_rs::app::run(settings).await
}
