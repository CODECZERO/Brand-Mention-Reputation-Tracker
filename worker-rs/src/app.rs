use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use axum::{routing::get, Json, Router};
use tokio::signal;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use tracing::{error, info, warn};

use crate::config::Settings;
use crate::metrics::gather_metrics;
use crate::queue_consumer::QueueConsumer;
use crate::redis_client::RedisClient;
use crate::service::WorkerService;

pub async fn run(settings: Settings) -> Result<()> {
    let settings = Arc::new(settings);
    let redis = RedisClient::new(&settings.redis_url).await?;
    redis.ensure_connection().await?;

    let consumer = QueueConsumer::new(redis.clone(), settings.worker_id.clone(), settings.blpop_timeout);
    let service = WorkerService::new(settings.clone(), redis.clone(), consumer);
    let service = Arc::new(service);

    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    let worker_loop = spawn_worker_loop(service.clone(), shutdown_tx.subscribe());
    let heartbeat_loop = spawn_heartbeat_loop(service.clone(), shutdown_tx.subscribe());
    let http_server = serve_http(settings.clone(), shutdown_tx.subscribe());
    let metrics_server = serve_metrics(settings.clone(), shutdown_tx.subscribe());

    info!(
        http_port = settings.http_port,
        metrics_port = settings.prometheus_port,
        "Rust worker started"
    );

    tokio::select! {
        _ = signal::ctrl_c() => {
            info!("Shutdown signal received");
        }
        res = worker_loop => {
            if let Err(err) = res {
                error!(error = %err, "Worker task crashed");
            }
        }
    }

    let _ = shutdown_tx.send(());

    heartbeat_loop.await.ok();
    worker_loop.await.ok();
    http_server.await.ok();
    metrics_server.await.ok();

    info!("Rust worker shutdown complete");
    Ok(())
}

fn spawn_worker_loop(service: Arc<WorkerService>, shutdown: broadcast::Receiver<()>) -> JoinHandle<Result<()>> {
    tokio::spawn(async move { service.run(shutdown).await })
}

fn spawn_heartbeat_loop(service: Arc<WorkerService>, mut shutdown: broadcast::Receiver<()>) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("Heartbeat loop stopping");
                    break;
                }
                _ = tokio::time::sleep(service.settings().heartbeat_interval) => {
                    if let Err(err) = service.send_heartbeat().await {
                        warn!(error = %err, "Heartbeat failed");
                    }
                }
            }
        }
    })
}

fn serve_http(settings: Arc<Settings>, mut shutdown: broadcast::Receiver<()>) -> JoinHandle<()> {
    let router = Router::new().route(
        "/health",
        get(move || {
            let worker_id = settings.worker_id.clone();
            async move { Json(serde_json::json!({ "status": "ok", "workerId": worker_id })) }
        }),
    );
    spawn_server(router, settings.http_port, shutdown)
}

fn serve_metrics(settings: Arc<Settings>, mut shutdown: broadcast::Receiver<()>) -> JoinHandle<()> {
    let router = Router::new().route(
        "/metrics",
        get(move || async move {
            let body = gather_metrics();
            axum::response::Response::builder()
                .header("Content-Type", prometheus::TEXT_FORMAT)
                .body(body)
                .unwrap()
        }),
    );
    spawn_server(router, settings.prometheus_port, shutdown)
}

fn spawn_server(app: Router, port: u16, mut shutdown: broadcast::Receiver<()>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .expect("bind listener");
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown.recv().await;
            })
            .await
            .ok();
    })
}
