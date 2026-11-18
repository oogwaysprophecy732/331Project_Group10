import re
import urllib.parse
import urllib.request
from pathlib import Path

import yt_dlp

from database import get_connection


PROJECT_ROOT = Path(__file__).resolve().parent.parent
MUSIC_DIRECTORY = PROJECT_ROOT / "music"
ARTWORK_DIRECTORY = PROJECT_ROOT / "artwork"
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}


def validate_youtube_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in YOUTUBE_HOSTS:
        raise ValueError("Please enter a YouTube video or playlist URL.")


def safe_filename(title, video_id):
    name = re.sub(r'[\\/:*?"<>|\u29f8]', "_", title).strip().rstrip(".")
    return f"{name[:180] or video_id} [{video_id}].mp3"


def get_or_create_playlist(name, youtube_playlist_id=None):
    with get_connection() as connection:
        if youtube_playlist_id:
            existing = connection.execute("SELECT id FROM playlists WHERE youtube_playlist_id = ?", (youtube_playlist_id,)).fetchone()
            if existing:
                return existing[0]
        existing = connection.execute("SELECT id, youtube_playlist_id FROM playlists WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
        if existing:
            if existing[1] and youtube_playlist_id and existing[1] != youtube_playlist_id:
                raise ValueError("A different YouTube playlist with this name is already linked.")
            if youtube_playlist_id:
                connection.execute("UPDATE playlists SET youtube_playlist_id = ? WHERE id = ?", (youtube_playlist_id, existing[0]))
            return existing[0]
        cursor = connection.execute("INSERT INTO playlists (name, original_name, youtube_playlist_id) VALUES (?, ?, ?)", (name, name, youtube_playlist_id))
        return cursor.lastrowid


def link_song_to_playlist(playlist_id, song_id):
    if playlist_id:
        with get_connection() as connection:
            connection.execute("INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id) VALUES (?, ?)", (playlist_id, song_id))


def import_youtube(url, progress=None, target_playlist_id=None):
    validate_youtube_url(url)
    progress = progress or (lambda *_: None)
    MUSIC_DIRECTORY.mkdir(exist_ok=True)
    ARTWORK_DIRECTORY.mkdir(exist_ok=True)
    # Read playlist entries without resolving each video first. A restricted
    # video must not prevent the accessible entries from being imported.
    with yt_dlp.YoutubeDL({"quiet": True, "noplaylist": False, "extract_flat": "in_playlist"}) as ydl:
        info = ydl.extract_info(url, download=False)

    entries = [entry for entry in (info.get("entries") or [info]) if entry]
    playlist_id = None
    playlist_title = info.get("title")
    playlist_query_id = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("list", [None])[0]
    youtube_playlist_id = (info.get("id") or playlist_query_id) if info.get("_type") == "playlist" else None
    if target_playlist_id is not None:
        if not youtube_playlist_id:
            raise ValueError("Enter a YouTube playlist URL to update this playlist.")
        with get_connection() as connection:
            target = connection.execute("SELECT id, youtube_playlist_id FROM playlists WHERE id = ?", (target_playlist_id,)).fetchone()
            if not target:
                raise ValueError("GreyMatter playlist not found.")
            if target[1] and target[1] != youtube_playlist_id:
                raise ValueError("This GreyMatter playlist is linked to a different YouTube playlist.")
            connection.execute("UPDATE playlists SET youtube_playlist_id = ? WHERE id = ?", (youtube_playlist_id, target_playlist_id))
        playlist_id = target_playlist_id
    elif youtube_playlist_id and playlist_title:
        playlist_id = get_or_create_playlist(playlist_title, youtube_playlist_id)

    imported = skipped = 0
    unavailable = []
    for position, entry in enumerate(entries, start=1):
        video_id = entry.get("id")
        if not video_id:
            skipped += 1
            continue
        progress(position, len(entries), entry.get("title") or "Untitled video")
        with get_connection() as connection:
            existing = connection.execute("SELECT id FROM songs WHERE youtube_id = ?", (video_id,)).fetchone()
        if existing:
            link_song_to_playlist(playlist_id, existing[0])
            skipped += 1
            continue

        video_url = f"https://www.youtube.com/watch?v={video_id}"
        title = entry.get("title") or video_id
        try:
            with yt_dlp.YoutubeDL({"quiet": True}) as ydl:
                video_info = ydl.extract_info(video_url, download=False)
            title = video_info.get("title") or title
            filename = safe_filename(title, video_id)
            options = {
                "format": "bestaudio/best", "outtmpl": str(MUSIC_DIRECTORY / Path(filename).stem) + ".%(ext)s", "noplaylist": True,
                "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
            }
            with yt_dlp.YoutubeDL(options) as ydl:
                ydl.download([video_url])
        except yt_dlp.utils.DownloadError as error:
            message = str(error).lower()
            reason = "Age-restricted or requires sign-in" if "confirm your age" in message or "sign in" in message else "Unavailable from YouTube"
            unavailable.append({"title": title, "reason": reason})
            continue

        artwork_filename = None
        thumbnail = video_info.get("thumbnail")
        if thumbnail:
            artwork_filename = f"{Path(filename).stem}.jpg"
            try:
                request = urllib.request.Request(thumbnail, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(request, timeout=30) as response:
                    (ARTWORK_DIRECTORY / artwork_filename).write_bytes(response.read())
            except OSError:
                artwork_filename = None

        with get_connection() as connection:
            cursor = connection.execute(
                """INSERT INTO songs (title, artist, album, file, artwork, youtube_id)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (title, video_info.get("uploader") or "Unknown Artist", "Unknown Album", filename,
                 f"/artwork/{urllib.parse.quote(artwork_filename)}" if artwork_filename else None, video_id),
            )
            song_id = cursor.lastrowid
        link_song_to_playlist(playlist_id, song_id)
        imported += 1
    return {
        "imported": imported,
        "skipped": skipped,
        "unavailable": unavailable,
        "playlist": playlist_title if playlist_id else None,
    }
