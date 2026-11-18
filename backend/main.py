from concurrent.futures import ThreadPoolExecutor
import base64
import binascii
from pathlib import Path
from threading import Lock
from urllib.parse import quote
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import get_connection
from youtube_importer import import_youtube


PROJECT_ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title="GreyMatter")
executor = ThreadPoolExecutor(max_workers=1)
jobs, jobs_lock = {}, Lock()


class ImportRequest(BaseModel):
    url: str | None = None


class PlaylistRequest(BaseModel):
    name: str


class PlaylistEditRequest(BaseModel):
    name: str | None = None
    artwork_data: str | None = None
    reset_name: bool = False
    reset_artwork: bool = False


def serialize_song(row):
    song_id, title, artist, album, filename, artwork = row
    return {"id": song_id, "title": title, "artist": artist, "album": album, "file": "/music/" + quote(filename), "artwork": artwork}


@app.get("/api/health")
def get_health():
    return {"status": "ok"}


@app.get("/api/songs")
def get_songs():
    with get_connection() as connection:
        rows = connection.execute("SELECT id, title, artist, album, file, artwork FROM songs ORDER BY id DESC").fetchall()
    return [serialize_song(row) for row in rows]


@app.delete("/api/songs/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_song_from_library(song_id: int):
    with get_connection() as connection:
        if not connection.execute("SELECT 1 FROM songs WHERE id = ?", (song_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Song not found in the library.")
        connection.execute("DELETE FROM songs WHERE id = ?", (song_id,))


@app.get("/api/playlists")
def get_playlists():
    with get_connection() as connection:
        rows = connection.execute("""SELECT playlists.id, playlists.name, COUNT(playlist_songs.song_id),
            COALESCE(playlists.artwork, (SELECT songs.artwork
             FROM playlist_songs AS first_playlist_song
             JOIN songs ON songs.id = first_playlist_song.song_id
             WHERE first_playlist_song.playlist_id = playlists.id
             ORDER BY first_playlist_song.rowid
            LIMIT 1)), playlists.original_name, playlists.artwork, playlists.youtube_playlist_id
            FROM playlists LEFT JOIN playlist_songs ON playlists.id = playlist_songs.playlist_id
            GROUP BY playlists.id ORDER BY playlists.name COLLATE NOCASE""").fetchall()
    return [{"id": row[0], "name": row[1], "song_count": row[2], "artwork": row[3], "original_name": row[4], "custom_artwork": row[5], "youtube_playlist_id": row[6]} for row in rows]


@app.post("/api/playlists", status_code=status.HTTP_201_CREATED)
def create_playlist(data: PlaylistRequest):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Enter a playlist name.")
    with get_connection() as connection:
        existing = connection.execute("SELECT id FROM playlists WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="A playlist with that name already exists.")
        cursor = connection.execute("INSERT INTO playlists (name, original_name) VALUES (?, ?)", (name, name))
    return {"id": cursor.lastrowid, "name": name, "song_count": 0}


@app.put("/api/playlists/{playlist_id}")
def edit_playlist(playlist_id: int, data: PlaylistEditRequest):
    with get_connection() as connection:
        playlist = connection.execute("SELECT name, original_name, artwork FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        name = (playlist[1] or playlist[0]) if data.reset_name else (data.name.strip() if data.name is not None else playlist[0])
        if not name:
            raise HTTPException(status_code=400, detail="Enter a playlist name.")
        existing = connection.execute("SELECT id FROM playlists WHERE name = ? COLLATE NOCASE AND id != ?", (name, playlist_id)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="A playlist with that name already exists.")

        artwork = playlist[2]
        if data.reset_artwork:
            artwork = None
        elif data.artwork_data:
            try:
                header, encoded = data.artwork_data.split(",", 1)
                mime_type = header.removeprefix("data:").removesuffix(";base64")
                extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}.get(mime_type)
                if not extension:
                    raise ValueError("Unsupported image type.")
                image_bytes = base64.b64decode(encoded, validate=True)
                if not image_bytes or len(image_bytes) > 10 * 1024 * 1024:
                    raise ValueError("Choose an image smaller than 10 MB.")
            except (ValueError, binascii.Error) as error:
                raise HTTPException(status_code=400, detail=str(error) or "Choose a valid image file.") from error
            artwork_dir = PROJECT_ROOT / "artwork"
            artwork_dir.mkdir(parents=True, exist_ok=True)
            filename = f"playlist-{uuid4().hex}.{extension}"
            (artwork_dir / filename).write_bytes(image_bytes)
            artwork = f"/artwork/{filename}"

        connection.execute("UPDATE playlists SET name = ?, artwork = ? WHERE id = ?", (name, artwork, playlist_id))
        row = connection.execute("SELECT name, original_name, artwork FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
        artwork = row[2] or connection.execute("""SELECT songs.artwork FROM playlist_songs
            JOIN songs ON songs.id = playlist_songs.song_id WHERE playlist_songs.playlist_id = ?
            ORDER BY playlist_songs.rowid LIMIT 1""", (playlist_id,)).fetchone()
        return {"id": playlist_id, "name": row[0], "original_name": row[1], "artwork": artwork[0] if isinstance(artwork, tuple) else artwork}


@app.post("/api/playlists/{playlist_id}/songs/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_song_to_playlist(playlist_id: int, song_id: int):
    with get_connection() as connection:
        if not connection.execute("SELECT 1 FROM playlists WHERE id = ?", (playlist_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found.")
        if not connection.execute("SELECT 1 FROM songs WHERE id = ?", (song_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Song not found.")
        connection.execute("INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id) VALUES (?, ?)", (playlist_id, song_id))


@app.delete("/api/playlists/{playlist_id}/songs/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_song_from_playlist(playlist_id: int, song_id: int):
    with get_connection() as connection:
        if not connection.execute("SELECT 1 FROM playlists WHERE id = ?", (playlist_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found.")
        connection.execute("DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?", (playlist_id, song_id))


@app.get("/api/song-playlists")
def get_song_playlists():
    with get_connection() as connection:
        rows = connection.execute("SELECT song_id, playlist_id FROM playlist_songs").fetchall()
    memberships = {}
    for song_id, playlist_id in rows:
        memberships.setdefault(str(song_id), []).append(playlist_id)
    return memberships


@app.get("/api/playlists/{playlist_id}/songs")
def get_playlist_songs(playlist_id: int):
    with get_connection() as connection:
        rows = connection.execute("""SELECT songs.id, songs.title, songs.artist, songs.album, songs.file, songs.artwork
            FROM songs JOIN playlist_songs ON songs.id = playlist_songs.song_id
            WHERE playlist_songs.playlist_id = ? ORDER BY playlist_songs.rowid""", (playlist_id,)).fetchall()
    return [serialize_song(row) for row in rows]


def run_import(job_id, url, target_playlist_id=None):
    def update(position, total, title):
        with jobs_lock:
            jobs[job_id].update({"state": "importing", "position": position, "total": total, "title": title})
    try:
        result = import_youtube(url, update, target_playlist_id)
        with jobs_lock:
            jobs[job_id].update({"state": "complete", "result": result})
    except Exception as error:
        with jobs_lock:
            jobs[job_id].update({"state": "failed", "error": str(error)})


@app.post("/api/import-youtube", status_code=status.HTTP_202_ACCEPTED)
def start_import(data: ImportRequest):
    if not data.url or not data.url.strip():
        raise HTTPException(status_code=400, detail="Enter a YouTube video or playlist URL.")
    job_id = str(uuid4())
    with jobs_lock:
        jobs[job_id] = {"state": "queued", "position": 0, "total": 0, "title": None}
    executor.submit(run_import, job_id, data.url.strip())
    return {"job_id": job_id}


@app.post("/api/playlists/{playlist_id}/sync-youtube", status_code=status.HTTP_202_ACCEPTED)
def sync_youtube_playlist(playlist_id: int, data: ImportRequest):
    with get_connection() as connection:
        playlist = connection.execute("SELECT youtube_playlist_id FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found.")
    url = (data.url or "").strip()
    if not url and playlist[0]:
        url = f"https://www.youtube.com/playlist?list={quote(playlist[0])}"
    if not url:
        raise HTTPException(status_code=400, detail="Paste this playlist’s YouTube link to connect it to GreyMatter.")
    job_id = str(uuid4())
    with jobs_lock:
        jobs[job_id] = {"state": "queued", "position": 0, "total": 0, "title": None}
    executor.submit(run_import, job_id, url, playlist_id)
    return {"job_id": job_id}


@app.get("/api/import-youtube/{job_id}")
def get_import_status(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found.")
    return job


app.mount("/music", StaticFiles(directory=PROJECT_ROOT / "music"), name="music")
app.mount("/artwork", StaticFiles(directory=PROJECT_ROOT / "artwork"), name="artwork")
app.mount("/", StaticFiles(directory=PROJECT_ROOT / "frontend", html=True), name="frontend")
