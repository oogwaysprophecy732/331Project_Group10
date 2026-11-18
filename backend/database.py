import sqlite3
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parent / "music.db"


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                file TEXT UNIQUE NOT NULL,
                artwork TEXT,
                youtube_id TEXT UNIQUE
            );
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                original_name TEXT,
                artwork TEXT,
                youtube_playlist_id TEXT
            );
            CREATE TABLE IF NOT EXISTS playlist_songs (
                playlist_id INTEGER NOT NULL,
                song_id INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, song_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
            );
            """
        )
        columns = {row[1] for row in connection.execute("PRAGMA table_info(playlists)")}
        if "original_name" not in columns:
            connection.execute("ALTER TABLE playlists ADD COLUMN original_name TEXT")
        if "artwork" not in columns:
            connection.execute("ALTER TABLE playlists ADD COLUMN artwork TEXT")
        if "youtube_playlist_id" not in columns:
            connection.execute("ALTER TABLE playlists ADD COLUMN youtube_playlist_id TEXT")
        connection.execute("UPDATE playlists SET original_name = name WHERE original_name IS NULL")


initialize_database()
