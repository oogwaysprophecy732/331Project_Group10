from mutagen.mp3 import MP3

audio = MP3("../music/test-song.mp3")

print("Metadata:")
print(audio.tags)

print("\nArtwork:")

if audio.tags:
    found = False

    for key in audio.tags.keys():
        if key.startswith("APIC"):
            print("Artwork found!")
            found = True

    if not found:
        print("No embedded artwork found.")
else:
    print("No metadata found.")
