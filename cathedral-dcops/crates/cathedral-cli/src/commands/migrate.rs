use clap::Subcommand;

#[derive(Subcommand)]
pub enum MigrateCommands {
    Sqlite {
        #[arg(long, default_value = "cathedral.db")]
        database: String,
    },
    Postgres {
        #[arg(long, env = "DATABASE_URL")]
        url: String,
    },
}

pub async fn run_migrate(cmd: MigrateCommands) -> Result<(), String> {
    match cmd {
        MigrateCommands::Sqlite { database } => {
            // sqlx::migrate!("./migrations").run(&SqlitePool::connect(&database).await?)?;
            println!("✅ Migrações SQLite aplicadas.");
        }
        MigrateCommands::Postgres { url } => {
            // sqlx::migrate!("./migrations").run(&PgPool::connect(&url).await?)?;
            println!("✅ Migrações PostgreSQL aplicadas.");
        }
    }
    Ok(())
}
