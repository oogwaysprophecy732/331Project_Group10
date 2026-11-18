import sqlite3
import os
from mutagen.mp3 import MP3

connection = sqlite3.connect("music.db")
cursor = connection.cursor()

music_folder = "../music"
artwork_folder = "../artwork"

for filename in os.listdir(music_folder):

    if not filename.lower().endswith(".mp3"):
        continue

    filepath = os.path.join(music_folder, filename)

    title = filename[:-4]
    artist = "Unknown Artist"
    album = "Unknown Album"

    try:

        audio = MP3(filepath)

        if audio.tags:

            if audio.tags.get("TIT2"):
                title = str(audio.tags.get("TIT2"))

            if audio.tags.get("TPE1"):
                artist = str(audio.tags.get("TPE1"))

            if audio.tags.get("TALB"):
                album = str(audio.tags.get("TALB"))

    except Exception:

        pass

    artwork_filename = filename[:-4] + ".jpg"

    if os.path.exists(os.path.join(artwork_folder, artwork_filename)):
        artwork = "/artwork/" + artwork_filename
    else:
        artwork = None

    cursor.execute("""
        INSERT OR IGNORE INTO songs
        (title, artist, album, file, artwork)
        VALUES (?, ?, ?, ?, ?)
    """, (
        title,
        artist,
        album,
        filename,
        artwork
    ))

connection.commit()
connection.close()

print("Metadata updated!")
