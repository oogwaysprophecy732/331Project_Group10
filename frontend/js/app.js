const player = document.querySelector("#player");
const playerPanel = document.querySelector(".player");
const appHeader = document.querySelector("header");
const mainContent = document.querySelector("main");
const library = document.querySelector("#library");
const songSearch = document.querySelector("#song-search");
const songActionStatus = document.querySelector("#song-action-status");
const progress = document.querySelector("#progress");
const nowTitle = document.querySelector("#current-title");
const nowArtist = document.querySelector("#current-artist");
const mainPlayButton = document.querySelector("#main-play-button");
const previousSongButton = document.querySelector("#previous-song-button");
const nextSongButton = document.querySelector("#next-song-button");
const tripActions = document.querySelector("#trip-actions");
const tripStatus = document.querySelector("#trip-status");
const downloadPlaylistButton = document.querySelector("#download-playlist-button");
const playlistOfflineIcon = downloadPlaylistButton.querySelector(".playlist-offline-icon");
const playlistOfflineLabel = downloadPlaylistButton.querySelector(".playlist-offline-label");
const libraryMenu = document.querySelector("#library-menu");
const shuffleButton = document.querySelector("#shuffle-button");
const shuffleStatus = document.querySelector("#shuffle-status");
const playlistControls = document.querySelector("#playlist-controls");
const playPlaylistButton = document.querySelector("#play-playlist-button");
const playlistShuffleButton = document.querySelector("#playlist-shuffle-button");
const syncYoutubePlaylistButton = document.querySelector("#sync-youtube-playlist-button");
const playlistControlsStatus = document.querySelector("#playlist-controls-status");
const playlistFilters = document.querySelector("#playlist-filters");
const playlistFilterOptions = document.querySelector("#playlist-filter-options");
const playlistFiltersEmpty = document.querySelector("#playlist-filters-empty");
const createPlaylistForm = document.querySelector("#create-playlist-form");
const newPlaylistName = document.querySelector("#new-playlist-name");
const createPlaylistStatus = document.querySelector("#create-playlist-status");
const addToPlaylistDialog = document.querySelector("#add-to-playlist-dialog");
const addToPlaylistForm = document.querySelector("#add-to-playlist-form");
const addToPlaylistTitle = document.querySelector("#add-to-playlist-title");
const addToPlaylistSelect = document.querySelector("#add-to-playlist-select");
const addToPlaylistStatus = document.querySelector("#add-to-playlist-status");
const confirmAddToPlaylistButton = document.querySelector("#confirm-add-to-playlist-button");
const editPlaylistButton = document.querySelector("#edit-playlist-button");
const editPlaylistDialog = document.querySelector("#edit-playlist-dialog");
const editPlaylistForm = document.querySelector("#edit-playlist-form");
const editPlaylistName = document.querySelector("#edit-playlist-name");
const editPlaylistArtwork = document.querySelector("#edit-playlist-artwork");
const editPlaylistStatus = document.querySelector("#edit-playlist-status");
const sections = {songs: document.querySelector("#songs-section"), playlists: document.querySelector("#playlists-section"), add: document.querySelector("#add-section")};
function setMobileHeaderHidden(hidden) {
  if (!window.matchMedia("(max-width: 700px)").matches) hidden = false;
  appHeader.classList.toggle("logo-hidden", hidden);
}
let lastTouchY = null;
mainContent.addEventListener("touchstart", (event) => {
  lastTouchY = event.touches[0]?.clientY ?? null;
}, {passive: true});
mainContent.addEventListener("touchmove", (event) => {
  const currentY = event.touches[0]?.clientY;
  if (lastTouchY === null || currentY === undefined) return;
  const movement = lastTouchY - currentY;
  if (movement > 5) setMobileHeaderHidden(true);
  else if (movement < -5) setMobileHeaderHidden(false);
  if (Math.abs(movement) > 5) lastTouchY = currentY;
}, {passive: true});
mainContent.addEventListener("touchend", () => { lastTouchY = null; }, {passive: true});
mainContent.addEventListener("wheel", (event) => {
  if (event.deltaY > 4) setMobileHeaderHidden(true);
  else if (event.deltaY < -4) setMobileHeaderHidden(false);
}, {passive: true});
window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 700px)").matches) setMobileHeaderHidden(false);
});
let songs = [];
let librarySongs = [];
let currentSong = 0;
let activePlaylist = null;
let activePlaylistSongs = [];
let playlistMemberships = {};
let availablePlaylists = [];
let songToAddToPlaylist = null;
let excludedPlaylistIds = new Set(JSON.parse(localStorage.getItem("greymatter-hidden-playlists") || "[]"));
let shuffleMode = false;
let shuffleHistory = [];
let shuffleHistoryIndex = -1;
const LOCAL_SONGS_KEY = "greymatter-imported-files";
const LOCAL_MUSIC_CACHE = "greymatter-imported-music-v1";
const PLAYLISTS_CACHE_KEY = "greymatter-playlists";
const PLAYLIST_MEMBERSHIPS_CACHE_KEY = "greymatter-playlist-memberships";
const PLAYLIST_SONGS_CACHE_PREFIX = "greymatter-playlist-songs-";
let shuffleEligibleSongIndexes = [];

function getImportedSongs() {
  return JSON.parse(localStorage.getItem(LOCAL_SONGS_KEY) || "[]");
}

function saveImportedSongs(importedSongs) {
  localStorage.setItem(LOCAL_SONGS_KEY, JSON.stringify(importedSongs));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function fetchWithTimeout(url, options = {}, timeout = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

function show(name, reload = true, activeNavigation = name) {
  Object.entries(sections).forEach(([key, section]) => section.style.display = key === name ? "block" : "none");
  const navigationButtons = {
    songs: document.querySelector("#songs-button"),
    playlists: document.querySelector("#playlists-button"),
    add: document.querySelector("#add-button"),
  };
  Object.entries(navigationButtons).forEach(([key, button]) => {
    const active = key === activeNavigation;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (name !== "songs") tripActions.hidden = true;
  if (name !== "songs") libraryMenu.hidden = true;
  if (name !== "songs") playlistControls.hidden = true;
  if (reload && name === "songs") loadSongs();
  if (reload && name === "playlists") loadPlaylists();
}

function closeOpenSongActions() {
  document.querySelectorAll(".song-actions-menu").forEach((menu) => {
    const panel = menu.querySelector(".song-actions-panel");
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    menu.classList.remove("opens-down");
    menu.querySelector(".song-actions-toggle")?.setAttribute("aria-expanded", "false");
    menu.closest(".song")?.classList.remove("has-open-actions");
  });
}

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".song-actions-menu")) return;
  closeOpenSongActions();
});

async function isCached(url) {
  return "caches" in window && Boolean(await caches.match(url));
}

async function updatePlaylistOfflineStatus(playlistSongs) {
  const allCached = playlistSongs.length > 0 &&
    (await Promise.all(playlistSongs.map((song) => isCached(song.file)))).every(Boolean);
  downloadPlaylistButton.classList.toggle("is-available-offline", allCached);
  playlistOfflineIcon.textContent = allCached ? "✓" : "↓";
  playlistOfflineLabel.textContent = allCached ? "Available offline" : "Make playlist available offline";
  downloadPlaylistButton.setAttribute("aria-label", allCached ? "Playlist available offline" : "Make playlist available offline");
  downloadPlaylistButton.setAttribute("aria-pressed", String(allCached));
  return allCached;
}

async function serverIsAvailable() {
  try {
    const response = await fetchWithTimeout("/api/health", {}, 1200);
    return response.ok;
  } catch (_) {
    return false;
  }
}

function sameTrack(source, file) {
  if (!source || !file) return false;
  try {
    return new URL(source, document.baseURI).href === new URL(file, document.baseURI).href;
  } catch (_) {
    return source === file;
  }
}

function updatePlaybackIndicators() {
  const isPlaying = Boolean(player.currentSrc || player.src) && !player.paused && !player.ended;
  const source = player.currentSrc || player.src;
  playerPanel.classList.toggle("is-playing", isPlaying);
  document.querySelectorAll(".song").forEach((row) => {
    const active = isPlaying && sameTrack(source, row.dataset.trackSrc);
    row.classList.toggle("is-playing", active);
    if (active) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
  });
  mainPlayButton.classList.toggle("is-playing", isPlaying);
  mainPlayButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function updateProgress() {
  const percentage = player.duration ? (player.currentTime / player.duration) * 100 : 0;
  progress.value = percentage;
  progress.style.setProperty("--progress", `${percentage}%`);
}

function playSong(index, {recordShuffle = false} = {}) {
  if (!songs[index]) return;
  currentSong = index;
  if (recordShuffle) {
    shuffleHistory = shuffleHistory.slice(0, shuffleHistoryIndex + 1);
    shuffleHistory.push(index);
    shuffleHistoryIndex = shuffleHistory.length - 1;
  }
  playerPanel.hidden = false;
  document.body.classList.add("has-player");
  player.src = songs[index].file;
  updateProgress();
  nowTitle.textContent = songs[index].title;
  nowArtist.textContent = songs[index].artist;
  player.play().catch(console.error);
  updatePlaybackIndicators();
}

async function makeSongRow(song, index) {
  const row = element("article", "song");
  row.dataset.trackSrc = song.file;
  row.tabIndex = 0;
  row.setAttribute("aria-label", `Play ${song.title}`);
  row.onclick = (event) => {
    if (event.target.closest("button, a, .song-actions-menu")) return;
    if (!player.paused && sameTrack(player.currentSrc || player.src, song.file)) player.pause();
    else playSong(index);
  };
  row.onkeydown = (event) => {
    if (event.target !== row || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (!player.paused && sameTrack(player.currentSrc || player.src, song.file)) player.pause();
    else playSong(index);
  };
  const art = element("div", "album-art", song.artwork ? undefined : "♫");
  if (song.artwork) {
    const image = document.createElement("img");
    image.src = song.artwork;
    image.alt = "";
    art.append(image);
  }
  const info = element("div", "song-info");
  const playlistNames = (playlistMemberships[String(song.id)] || [])
    .map((playlistId) => availablePlaylists.find((playlist) => String(playlist.id) === String(playlistId))?.name)
    .filter(Boolean);
  if (activePlaylist && activePlaylistSongs.some((playlistSong) => String(playlistSong.id) === String(song.id)) && !playlistNames.includes(activePlaylist.name)) {
    playlistNames.unshift(activePlaylist.name);
  }
  const title = element("h3", "song-title");
  title.append(element("span", "song-title-text", song.title));
  const bars = element("span", "playing-bars song-playing-bars");
  bars.setAttribute("aria-hidden", "true");
  bars.append(element("span"), element("span"), element("span"));
  title.append(bars);
  info.append(title, element("p", null, song.artist), element("small", null, playlistNames.join(", ")));
  const currentlyPlaying = !player.paused && !player.ended && sameTrack(player.currentSrc || player.src, song.file);
  row.classList.toggle("is-playing", currentlyPlaying);
  const actionsMenu = element("div", "song-actions-menu");
  const actionsToggle = element("button", "song-actions-toggle");
  actionsToggle.type = "button";
  actionsToggle.setAttribute("aria-label", `More actions for ${song.title}`);
  actionsToggle.setAttribute("aria-expanded", "false");
  actionsToggle.append(element("span"), element("span"), element("span"));
  const actionsPanel = element("div", "song-actions-panel");
  actionsPanel.hidden = true;
  actionsToggle.onclick = () => {
    const isOpening = actionsPanel.hidden;
    if (isOpening) {
      document.querySelectorAll(".song-actions-menu").forEach((menu) => {
        if (menu === actionsMenu) return;
        const openPanel = menu.querySelector(".song-actions-panel");
        if (!openPanel || openPanel.hidden) return;
        openPanel.hidden = true;
        menu.classList.remove("opens-down");
        menu.querySelector(".song-actions-toggle")?.setAttribute("aria-expanded", "false");
        menu.closest(".song")?.classList.remove("has-open-actions");
      });
    }
    actionsPanel.hidden = !isOpening;
    row.classList.toggle("has-open-actions", isOpening);
    if (isOpening) {
      const mainRect = document.querySelector("main").getBoundingClientRect();
      const toggleRect = actionsToggle.getBoundingClientRect();
      const panelRect = actionsPanel.getBoundingClientRect();
      const panelHeight = panelRect.height;
      const roomAbove = toggleRect.top - mainRect.top;
      const roomBelow = mainRect.bottom - toggleRect.bottom;
      actionsMenu.classList.toggle("opens-down", roomAbove < panelHeight + 6 && roomBelow > roomAbove);
    } else {
      actionsMenu.classList.remove("opens-down");
    }
    actionsToggle.setAttribute("aria-expanded", String(isOpening));
  };
  actionsPanel.addEventListener("click", (event) => {
    if (event.target.closest("button, a")) {
      actionsPanel.hidden = true;
      actionsToggle.setAttribute("aria-expanded", "false");
      row.classList.remove("has-open-actions");
    }
  });
  const offline = element("button", "download-button");
  offline.type = "button";
  offline.setAttribute("aria-label", `Make ${song.title} available offline`);
  const offlineIcon = element("span", "song-action-icon", await isCached(song.file) ? "✓" : "↓");
  offline.append(offlineIcon, document.createTextNode("Available offline"));
  offline.onclick = async () => {
    if (offlineIcon.textContent === "✓") return;
    offlineIcon.textContent = "…";
    try { await cacheSong(song.file); offlineIcon.textContent = "✓"; }
    catch (_) { offlineIcon.textContent = "✕"; }
  };
  const save = element("a", "save-button");
  save.href = song.file;
  save.download = `${song.title}.mp3`;
  save.setAttribute("aria-label", `Save ${song.title} as an MP3 file`);
  save.title = "Save MP3 to Files";
  const brainIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  brainIcon.classList.add("song-action-icon", "pixel-brain-icon");
  brainIcon.setAttribute("viewBox", "0 0 24 20");
  brainIcon.setAttribute("aria-hidden", "true");
  brainIcon.setAttribute("shape-rendering", "crispEdges");
  const brainHalf = document.createElementNS("http://www.w3.org/2000/svg", "path");
  brainHalf.setAttribute("d", "M11 2H8V4H6V6H4V9H6V11H4V14H6V16H8V18H11V16H10V14H11V12H10V10H11V8H10V6H11Z");
  const otherBrainHalf = brainHalf.cloneNode();
  otherBrainHalf.setAttribute("transform", "translate(24 0) scale(-1 1)");
  const brainCenter = document.createElementNS("http://www.w3.org/2000/svg", "path");
  brainCenter.setAttribute("d", "M11 3h2v2h-2z M11 7h2v2h-2z M11 11h2v2h-2z M11 15h2v1h-2z");
  brainIcon.append(brainHalf, otherBrainHalf, brainCenter);
  save.append(brainIcon, document.createTextNode("Save MP3"));
  actionsPanel.append(offline, save);
  if (activePlaylist && Number.isInteger(song.id)) {
    const removeFromPlaylist = element("button", "playlist-add-button remove-from-playlist-button");
    removeFromPlaylist.type = "button";
    removeFromPlaylist.setAttribute("aria-label", `Remove ${song.title} from ${activePlaylist.name}`);
    removeFromPlaylist.title = "Remove from this playlist";
    removeFromPlaylist.append(element("span", "song-action-icon", "−"), document.createTextNode("Remove from playlist"));
    removeFromPlaylist.onclick = () => removeSongFromActivePlaylist(song, removeFromPlaylist);
    actionsPanel.append(removeFromPlaylist);
  } else if (Number.isInteger(song.id)) {
    const addToPlaylist = element("button", "playlist-add-button");
    addToPlaylist.type = "button";
    addToPlaylist.setAttribute("aria-label", `Add ${song.title} to a playlist`);
    addToPlaylist.title = "Add to playlist";
    addToPlaylist.append(element("span", "song-action-icon", "+"), document.createTextNode("Add to playlist"));
    addToPlaylist.onclick = () => openAddToPlaylistDialog(song);
    actionsPanel.append(addToPlaylist);
  }
  if (!activePlaylist) {
    const removeFromLibrary = element("button", "remove-from-library-button");
    removeFromLibrary.type = "button";
    removeFromLibrary.setAttribute("aria-label", `Remove ${song.title} from library`);
    removeFromLibrary.title = "Remove from library";
    const trashIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    trashIcon.classList.add("song-action-icon", "pixel-trash-icon");
    trashIcon.setAttribute("viewBox", "0 0 16 16");
    trashIcon.setAttribute("aria-hidden", "true");
    trashIcon.setAttribute("shape-rendering", "crispEdges");
    trashIcon.innerHTML = '<path d="M5 1h6v2h3v2H2V3h3zM3 6h10v8H3z"/><path d="M5 7h2v6H5zM9 7h2v6H9z" fill="#111"/>';
    removeFromLibrary.append(trashIcon, document.createTextNode("Remove from library"));
    removeFromLibrary.onclick = () => removeSongFromLibrary(song, removeFromLibrary);
    actionsPanel.append(removeFromLibrary);
  }
  actionsMenu.append(actionsToggle, actionsPanel);
  row.append(art, info, actionsMenu);
  return row;
}

async function removeSongFromLibrary(song, button) {
  const songId = String(song.id);
  const removedIndex = songs.findIndex((item) => String(item.id) === songId);
  button.disabled = true;
  songActionStatus.textContent = "";
  songActionStatus.hidden = true;
  try {
    if (songId.startsWith("file-")) {
      saveImportedSongs(getImportedSongs().filter((item) => String(item.id) !== songId));
      const cache = await caches.open(LOCAL_MUSIC_CACHE);
      await cache.delete(song.file);
    } else {
      const response = await fetchWithTimeout(`/api/songs/${encodeURIComponent(song.id)}`, {method: "DELETE"});
      if (!response.ok) {
        let detail = "Could not remove the song from your library.";
        try { detail = (await response.json()).detail || detail; } catch (_) {}
        throw new Error(detail);
      }
      const savedSongs = JSON.parse(localStorage.getItem("greymatter-song-library") || "[]");
      localStorage.setItem("greymatter-song-library", JSON.stringify(savedSongs.filter((item) => String(item.id) !== songId)));
    }
    librarySongs = librarySongs.filter((item) => String(item.id) !== songId);
    songs = songs.filter((item) => String(item.id) !== songId);
    if (removedIndex >= 0 && currentSong >= removedIndex) currentSong = Math.max(-1, currentSong - 1);
    if (shuffleMode) stopShuffle();
    await displaySongs(songs);
    await loadLibraryFilters();
    await loadPlaylists();
    songActionStatus.textContent = `Removed “${song.title}” from your library.`;
    songActionStatus.hidden = false;
  } catch (error) {
    songActionStatus.textContent = error.message;
    songActionStatus.hidden = false;
    button.disabled = false;
  }
}

async function removeSongFromActivePlaylist(song, button) {
  if (!activePlaylist) return;
  const playlist = activePlaylist;
  const playlistId = playlist.id;
  const removedIndex = songs.findIndex((item) => String(item.id) === String(song.id));
  button.disabled = true;
  try {
    const response = await fetchWithTimeout(`/api/playlists/${playlistId}/songs/${song.id}`, {method: "DELETE"});
    if (!response.ok) {
      let detail = "Could not remove the song from this playlist.";
      try { detail = (await response.json()).detail || detail; } catch (_) {}
      throw new Error(detail);
    }
    activePlaylistSongs = activePlaylistSongs.filter((item) => String(item.id) !== String(song.id));
    songs = songs.filter((item) => String(item.id) !== String(song.id));
    localStorage.setItem(`${PLAYLIST_SONGS_CACHE_PREFIX}${playlistId}`, JSON.stringify(activePlaylistSongs));
    if (removedIndex >= 0 && currentSong >= removedIndex) currentSong = Math.max(-1, currentSong - 1);
    if (shuffleMode) stopShuffle();
    await displaySongs(songs);
    await loadLibraryFilters();
    await loadPlaylists();
    playlistControlsStatus.textContent = `Removed “${song.title}” from ${playlist.name}.`;
    playlistControlsStatus.hidden = false;
  } catch (error) {
    playlistControlsStatus.textContent = error.message;
    playlistControlsStatus.hidden = false;
    button.disabled = false;
  }
}

async function displaySongs(list) {
  library.replaceChildren();
  if (!list.length) {
    if (songSearch.value.trim()) library.textContent = "No songs match your search.";
    else if (activePlaylist) library.textContent = "This playlist has no songs.";
    else if (librarySongs.length) library.textContent = "No songs match your playlist filters.";
    else library.append(element("p", "empty-state-message", "No songs yet :/."));
    return;
  }
  for (let index = 0; index < list.length; index += 1) library.append(await makeSongRow(list[index], index));
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘'`]/g, "")
    .toLowerCase();
}

function songsMatchingSearch(list) {
  const query = normalizeSearchText(songSearch.value.trim());
  if (!query) return list;
  return list.filter((song) => [song.title, song.artist, song.album].some((value) => normalizeSearchText(value).includes(query)));
}

function filteredLibrarySongs() {
  return librarySongs.filter((song) => !(playlistMemberships[String(song.id)] || []).some((playlistId) => excludedPlaylistIds.has(playlistId)));
}

async function applyLibraryFilters() {
  songs = songsMatchingSearch(filteredLibrarySongs());
  await displaySongs(songs);
  if (shuffleMode && !songs.length) stopShuffle();
}

function renderPlaylistFilters(playlists) {
  playlistFilterOptions.replaceChildren();
  playlistFiltersEmpty.hidden = playlists.length > 0;
  playlists.forEach((playlist) => {
    const label = element("label", "playlist-filter-option");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = excludedPlaylistIds.has(playlist.id);
    checkbox.onchange = () => {
      if (checkbox.checked) excludedPlaylistIds.add(playlist.id);
      else excludedPlaylistIds.delete(playlist.id);
      localStorage.setItem("greymatter-hidden-playlists", JSON.stringify([...excludedPlaylistIds]));
      applyLibraryFilters();
    };
    label.append(checkbox, document.createTextNode(`${playlist.name} · ${playlist.song_count} songs`));
    playlistFilterOptions.append(label);
  });
}

async function cachePlaylistContents(playlists) {
  await Promise.all(playlists.map(async (playlist) => {
    try {
      const response = await fetchWithTimeout(`/api/playlists/${playlist.id}/songs`);
      if (!response.ok) return;
      localStorage.setItem(`${PLAYLIST_SONGS_CACHE_PREFIX}${playlist.id}`, JSON.stringify(await response.json()));
    } catch (_) {
      // The saved copy, if any, remains available for offline use.
    }
  }));
}

async function loadLibraryFilters() {
  try {
    const [playlistsResponse, membershipsResponse] = await Promise.all([fetchWithTimeout("/api/playlists"), fetchWithTimeout("/api/song-playlists")]);
    if (!playlistsResponse.ok || !membershipsResponse.ok) throw new Error();
    const playlists = await playlistsResponse.json();
    playlistMemberships = await membershipsResponse.json();
    availablePlaylists = playlists;
    localStorage.setItem(PLAYLISTS_CACHE_KEY, JSON.stringify(playlists));
    localStorage.setItem(PLAYLIST_MEMBERSHIPS_CACHE_KEY, JSON.stringify(playlistMemberships));
    const validPlaylistIds = new Set(playlists.map((playlist) => playlist.id));
    excludedPlaylistIds = new Set([...excludedPlaylistIds].filter((id) => validPlaylistIds.has(id)));
    renderPlaylistFilters(playlists);
    cachePlaylistContents(playlists);
  } catch (_) {
    playlistMemberships = JSON.parse(localStorage.getItem(PLAYLIST_MEMBERSHIPS_CACHE_KEY) || "{}");
    const cachedPlaylists = JSON.parse(localStorage.getItem(PLAYLISTS_CACHE_KEY) || "[]");
    availablePlaylists = cachedPlaylists;
    if (cachedPlaylists.length) renderPlaylistFilters(cachedPlaylists);
    else {
      playlistFilterOptions.replaceChildren();
      playlistFiltersEmpty.textContent = "Playlist filters require a connection to your server.";
      playlistFiltersEmpty.hidden = false;
    }
  }
}

async function loadSongs() {
  activePlaylist = null;
  activePlaylistSongs = [];
  songSearch.value = "";
  if (shuffleMode) stopShuffle();
  else shuffleButton.textContent = "Shuffle all visible songs";
  tripActions.hidden = true;
  libraryMenu.hidden = false;
  playlistControls.hidden = true;
  playlistControlsStatus.hidden = true;
  playlistFilters.hidden = false;
  document.querySelector("#songs-section h2").textContent = "Songs";
  editPlaylistButton.hidden = true;
  try {
    const response = await fetchWithTimeout("/api/songs");
    if (!response.ok) throw new Error();
    songs = await response.json();
    localStorage.setItem("greymatter-song-library", JSON.stringify(songs));
  } catch (_) {
    songs = JSON.parse(localStorage.getItem("greymatter-song-library") || "[]");
  }
  librarySongs = [...getImportedSongs(), ...songs];
  await applyLibraryFilters();
  loadLibraryFilters().then(applyLibraryFilters);
}

async function loadPlaylists() {
  const container = document.querySelector("#playlists");
  let playlists;
  try {
    const response = await fetchWithTimeout("/api/playlists");
    if (!response.ok) throw new Error();
    playlists = await response.json();
    localStorage.setItem(PLAYLISTS_CACHE_KEY, JSON.stringify(playlists));
  } catch (_) {
    playlists = JSON.parse(localStorage.getItem(PLAYLISTS_CACHE_KEY) || "[]");
    if (!playlists.length) { container.textContent = "No saved playlists are available offline yet."; return; }
  }
  availablePlaylists = playlists;
  container.replaceChildren();
  if (!playlists.length) container.append(element("p", "empty-state-message", "No playlists yet :/."));
  playlists.forEach((playlist) => {
    const row = element("button", "playlist-row");
    row.type = "button";
    row.setAttribute("aria-label", `Open playlist ${playlist.name}`);
    const art = element("div", "album-art", playlist.artwork ? undefined : "♫");
    if (playlist.artwork) {
      const image = document.createElement("img");
      image.src = playlist.artwork;
      image.alt = "";
      art.append(image);
    }
    const info = element("div", "playlist-info");
    info.append(element("h3", null, playlist.name), element("p", null, `${playlist.song_count} song${playlist.song_count === 1 ? "" : "s"}`));
    row.append(art, info, element("span", "playlist-arrow", "›"));
    row.onclick = () => loadPlaylist(playlist.id, playlist.name);
    container.append(row);
  });
}

function openEditPlaylistDialog() {
  if (!activePlaylist) return;
  editPlaylistName.value = activePlaylist.name;
  editPlaylistArtwork.value = "";
  editPlaylistStatus.textContent = "";
  editPlaylistDialog.showModal();
}

async function updatePlaylist(payload, closeDialog = true) {
  if (!activePlaylist) return;
  const response = await fetchWithTimeout(`/api/playlists/${activePlaylist.id}`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "Could not update the playlist.");
  activePlaylist.name = result.name;
  document.querySelector("#songs-section h2").textContent = result.name;
  if (closeDialog) editPlaylistDialog.close();
  await loadPlaylists();
  await loadLibraryFilters();
  return result;
}

function readArtworkFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

editPlaylistButton.onclick = openEditPlaylistDialog;
document.querySelector("#cancel-edit-playlist-button").onclick = () => editPlaylistDialog.close();
editPlaylistForm.onsubmit = async (event) => {
  event.preventDefault();
  editPlaylistStatus.textContent = "Saving…";
  try {
    const file = editPlaylistArtwork.files[0];
    if (file && file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
    const payload = {name: editPlaylistName.value.trim()};
    if (file) payload.artwork_data = await readArtworkFile(file);
    await updatePlaylist(payload);
  } catch (error) {
    editPlaylistStatus.textContent = error.message;
  }
};
document.querySelector("#reset-playlist-name-button").onclick = async () => {
  editPlaylistStatus.textContent = "Resetting name…";
  try {
    const result = await updatePlaylist({reset_name: true}, false);
    editPlaylistName.value = result.name;
    editPlaylistStatus.textContent = "Name reset.";
  } catch (error) {
    editPlaylistStatus.textContent = error.message;
  }
};
document.querySelector("#reset-playlist-artwork-button").onclick = async () => {
  editPlaylistStatus.textContent = "Resetting image…";
  try {
    await updatePlaylist({reset_artwork: true}, false);
    editPlaylistArtwork.value = "";
    editPlaylistStatus.textContent = "Image reset to the first song’s cover.";
  } catch (error) {
    editPlaylistStatus.textContent = error.message;
  }
};

function openAddToPlaylistDialog(song) {
  songToAddToPlaylist = song;
  addToPlaylistStatus.textContent = "";
  addToPlaylistTitle.textContent = `Add “${song.title}” to playlist`;
  addToPlaylistSelect.replaceChildren();
  confirmAddToPlaylistButton.disabled = !availablePlaylists.length;
  availablePlaylists.forEach((playlist) => {
    const option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = playlist.name;
    addToPlaylistSelect.append(option);
  });
  if (!availablePlaylists.length) {
    addToPlaylistStatus.textContent = "Create a playlist first.";
    addToPlaylistDialog.showModal();
    return;
  }
  addToPlaylistDialog.showModal();
}

document.querySelector("#close-add-to-playlist-button").onclick = () => addToPlaylistDialog.close();

addToPlaylistForm.onsubmit = async (event) => {
  event.preventDefault();
  if (!songToAddToPlaylist) return;
  const playlistId = addToPlaylistSelect.value;
  try {
    const response = await fetchWithTimeout(`/api/playlists/${playlistId}/songs/${songToAddToPlaylist.id}`, {method: "POST"});
    if (!response.ok) throw new Error((await response.json()).detail || "Could not add the song.");
    addToPlaylistDialog.close();
    await loadLibraryFilters();
    await loadPlaylists();
  } catch (error) {
    addToPlaylistStatus.textContent = error.message;
  }
};

createPlaylistForm.onsubmit = async (event) => {
  event.preventDefault();
  const name = newPlaylistName.value.trim();
  if (!name) return;
  try {
    const response = await fetchWithTimeout("/api/playlists", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name}),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Could not create the playlist.");
    newPlaylistName.value = "";
    createPlaylistStatus.textContent = `Created “${(await response.json()).name}”.`;
    await loadLibraryFilters();
    await loadPlaylists();
  } catch (error) {
    createPlaylistStatus.textContent = error.message;
  }
};

async function loadPlaylist(id, name) {
  let playlistSongs;
  try {
    const response = await fetchWithTimeout(`/api/playlists/${id}/songs`);
    if (!response.ok) throw new Error();
    playlistSongs = await response.json();
    localStorage.setItem(`${PLAYLIST_SONGS_CACHE_PREFIX}${id}`, JSON.stringify(playlistSongs));
  } catch (_) {
    const savedPlaylistSongs = localStorage.getItem(`${PLAYLIST_SONGS_CACHE_PREFIX}${id}`);
    if (!savedPlaylistSongs) {
      activePlaylist = {id, name};
      editPlaylistButton.hidden = false;
      activePlaylistSongs = [];
      songSearch.value = "";
      document.querySelector("#songs-section h2").textContent = name;
      show("songs", false, "playlists");
      libraryMenu.hidden = true;
      playlistControls.hidden = false;
      tripActions.hidden = true;
      library.textContent = "This playlist has not been saved on this phone yet. Open GreyMatter while your Mac is on, then try again.";
      return;
    }
    playlistSongs = JSON.parse(savedPlaylistSongs);
  }
  activePlaylistSongs = playlistSongs;
  const playlistDetails = availablePlaylists.find((playlist) => String(playlist.id) === String(id));
  activePlaylist = {id, name, original_name: playlistDetails?.original_name || name};
  editPlaylistButton.hidden = false;
  songSearch.value = "";
  if (shuffleMode) stopShuffle();
  else shuffleButton.textContent = "Shuffle all visible songs";
  document.querySelector("#songs-section h2").textContent = name;
  show("songs", false, "playlists");
  libraryMenu.hidden = true;
  playlistControls.hidden = false;
  playlistControlsStatus.hidden = true;
  playlistFilters.hidden = true;
  tripActions.hidden = false;
  tripStatus.textContent = "Download this playlist before leaving service. Keep GreyMatter open until it finishes.";
  songs = songsMatchingSearch(playlistSongs);
  await displaySongs(songs);
  await updatePlaylistOfflineStatus(playlistSongs);
}

syncYoutubePlaylistButton.onclick = async () => {
  if (!activePlaylist) return;
  const linkedPlaylist = availablePlaylists.find((playlist) => String(playlist.id) === String(activePlaylist.id));
  const url = linkedPlaylist?.youtube_playlist_id
    ? ""
    : (window.prompt("Paste the YouTube link for this playlist. GreyMatter will remember it for next time.") || "").trim();
  if (!linkedPlaylist?.youtube_playlist_id && !url) return;
  syncYoutubePlaylistButton.disabled = true;
  playlistControlsStatus.hidden = false;
  playlistControlsStatus.textContent = "Starting playlist update…";
  try {
    const response = await fetch(`/api/playlists/${encodeURIComponent(activePlaylist.id)}/sync-youtube`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({url}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Could not start playlist update.");
    watchPlaylistSync(result.job_id, activePlaylist.id, activePlaylist.name);
  } catch (error) {
    playlistControlsStatus.textContent = `Update failed: ${error.message}`;
    syncYoutubePlaylistButton.disabled = false;
  }
};

async function watchPlaylistSync(jobId, playlistId, playlistName) {
  try {
    const response = await fetch(`/api/import-youtube/${jobId}`);
    const job = await response.json();
    if (job.state === "queued") playlistControlsStatus.textContent = "Waiting to update playlist…";
    if (job.state === "importing") playlistControlsStatus.textContent = `Updating ${job.position}/${job.total}: ${job.title}`;
    if (job.state === "failed") {
      playlistControlsStatus.textContent = `Update failed: ${job.error}`;
      syncYoutubePlaylistButton.disabled = false;
      return;
    }
    if (job.state === "complete") {
      const {imported, skipped, unavailable = []} = job.result;
      await loadPlaylists();
      await loadPlaylist(playlistId, playlistName);
      playlistControlsStatus.hidden = false;
      playlistControlsStatus.textContent = `Playlist updated: ${imported} new song${imported === 1 ? "" : "s"} added${skipped ? `, ${skipped} already in your library` : ""}${unavailable.length ? `, ${unavailable.length} unavailable` : ""}.`;
      syncYoutubePlaylistButton.disabled = false;
      return;
    }
    setTimeout(() => watchPlaylistSync(jobId, playlistId, playlistName), 1000);
  } catch (error) {
    playlistControlsStatus.textContent = `Update failed: ${error.message}`;
    syncYoutubePlaylistButton.disabled = false;
  }
}

songSearch.oninput = async () => {
  if (activePlaylist) {
    songs = songsMatchingSearch(activePlaylistSongs);
    await displaySongs(songs);
    if (shuffleMode && !songs.length) stopShuffle();
    return;
  }
  await applyLibraryFilters();
};

function randomSongIndex() {
  const candidates = shuffleEligibleSongIndexes.length ? shuffleEligibleSongIndexes : songs.map((_, index) => index);
  if (!candidates.length) return -1;
  if (candidates.length === 1) return candidates[0];
  let index = currentSong;
  while (index === currentSong) index = candidates[Math.floor(Math.random() * candidates.length)];
  return index;
}

function playRandomSong() {
  const index = randomSongIndex();
  if (index >= 0) playSong(index, {recordShuffle: true});
}

function stopShuffle() {
  shuffleMode = false;
  shuffleHistory = [];
  shuffleHistoryIndex = -1;
  shuffleEligibleSongIndexes = [];
  shuffleButton.textContent = "Shuffle all visible songs";
  playlistShuffleButton.textContent = "Shuffle playlist";
  shuffleStatus.textContent = "";
  playlistControlsStatus.textContent = "";
  playlistControlsStatus.hidden = true;
}

async function startShuffle() {
  const status = activePlaylist ? playlistControlsStatus : shuffleStatus;
  const buttons = activePlaylist ? [playlistShuffleButton] : [shuffleButton];
  if (!songs.length) { status.textContent = activePlaylist ? "This playlist has no songs to shuffle." : "No visible songs to shuffle."; status.hidden = false; return; }
  buttons.forEach((button) => { button.disabled = true; });
  const macIsAvailable = await serverIsAvailable();
  shuffleEligibleSongIndexes = macIsAvailable
    ? songs.map((_, index) => index)
    : (await Promise.all(songs.map(async (song, index) => (await isCached(song.file)) ? index : null))).filter((index) => index !== null);
  buttons.forEach((button) => { button.disabled = false; });
  if (!shuffleEligibleSongIndexes.length) {
    status.textContent = "Download songs into GreyMatter before shuffling while your Mac is off.";
    status.hidden = false;
    return;
  }
  shuffleMode = true;
  shuffleHistory = [];
  shuffleHistoryIndex = -1;
  shuffleButton.textContent = "Shuffle all visible songs";
  playlistShuffleButton.textContent = "Shuffle playlist";
  const songCount = shuffleEligibleSongIndexes.length;
  status.textContent = `Shuffling ${songCount} ${macIsAvailable ? (activePlaylist ? "playlist " : "visible ") : "downloaded "}song${songCount === 1 ? "" : "s"}.`;
  status.hidden = false;
  playRandomSong();
}

shuffleButton.onclick = startShuffle;
playlistShuffleButton.onclick = startShuffle;
playPlaylistButton.onclick = () => {
  if (!songs.length) {
    playlistControlsStatus.textContent = "This playlist has no songs to play.";
    playlistControlsStatus.hidden = false;
    return;
  }
  if (shuffleMode) stopShuffle();
  currentSong = 0;
  playSong(0);
};

function cacheSong(url) {
  return new Promise(async (resolve, reject) => {
    const registration = await navigator.serviceWorker.ready;
    const worker = navigator.serviceWorker.controller || registration.active;
    if (!worker) return reject(new Error("Offline service is not ready."));
    const listener = (event) => {
      if (event.data?.url !== url) return;
      if (event.data.type === "DOWNLOAD_COMPLETE") { navigator.serviceWorker.removeEventListener("message", listener); resolve(); }
      if (event.data.type === "DOWNLOAD_FAILED") { navigator.serviceWorker.removeEventListener("message", listener); reject(new Error("Download failed.")); }
    };
    navigator.serviceWorker.addEventListener("message", listener);
    worker.postMessage({type: "DOWNLOAD_SONG", url});
  });
}

async function preparePersistentStorage() {
  if (!navigator.storage) return "Browser storage status is unavailable.";
  const wasGranted = navigator.storage.persisted && await navigator.storage.persisted();
  const granted = wasGranted || (navigator.storage.persist && await navigator.storage.persist());
  const estimate = await navigator.storage.estimate();
  const used = Math.round((estimate.usage || 0) / 1024 / 1024);
  const quota = Math.round((estimate.quota || 0) / 1024 / 1024);
  return `${granted ? "Persistent storage enabled" : "Persistent storage was not granted"} (${used} MB used of about ${quota} MB available).`;
}

downloadPlaylistButton.onclick = async () => {
  if (!activePlaylist || !activePlaylistSongs.length) return;
  const playlistSongs = activePlaylistSongs;
  if (await updatePlaylistOfflineStatus(playlistSongs)) {
    tripStatus.textContent = "All songs in this playlist are available offline.";
    return;
  }
  const button = downloadPlaylistButton;
  button.disabled = true;
  try {
    tripStatus.textContent = await preparePersistentStorage();
    let downloaded = 0;
    for (const song of playlistSongs) {
      if (!await isCached(song.file)) await cacheSong(song.file);
      downloaded += 1;
      tripStatus.textContent = `Saved ${downloaded} of ${playlistSongs.length}: ${song.title}`;
    }
    await updatePlaylistOfflineStatus(playlistSongs);
    tripStatus.textContent = `Trip playlist ready: all ${playlistSongs.length} tracks were verified offline. Test it in Airplane Mode before you leave.`;
    await displaySongs(songs);
  } catch (error) { tripStatus.textContent = `Stopped: ${error.message} Keep the app open and try again.`; }
  finally { button.disabled = false; }
};

mainPlayButton.onclick = () => {
  if (!player.src) return playSong(currentSong);
  if (player.paused) player.play().catch(console.error);
  else player.pause();
};
previousSongButton.onclick = () => {
  if (!songs.length) return;
  if (shuffleMode) {
    if (shuffleHistoryIndex > 0) {
      shuffleHistoryIndex -= 1;
      playSong(shuffleHistory[shuffleHistoryIndex]);
    }
    return;
  }
  if (currentSong > 0) playSong(currentSong - 1);
};
nextSongButton.onclick = () => {
  if (!songs.length) return;
  if (shuffleMode) { playRandomSong(); return; }
  if (currentSong < songs.length - 1) playSong(currentSong + 1);
};
player.ontimeupdate = updateProgress;
player.ondurationchange = updateProgress;
player.onplay = updatePlaybackIndicators;
player.onpause = updatePlaybackIndicators;
player.onended = () => {
  updatePlaybackIndicators();
  if (shuffleMode) playRandomSong();
  else if (currentSong < songs.length - 1) playSong(currentSong + 1);
};
player.onemptied = updatePlaybackIndicators;
progress.oninput = () => {
  progress.style.setProperty("--progress", `${progress.value}%`);
  if (player.duration) player.currentTime = progress.value / 100 * player.duration;
};

document.querySelector("#songs-button").onclick = () => { document.querySelector("#songs-section h2").textContent = "Songs"; show("songs"); };
document.querySelector("#playlists-button").onclick = () => show("playlists");
document.querySelector("#add-button").onclick = () => show("add");

const importStatus = document.querySelector("#import-status");
async function watchImport(jobId) {
  const response = await fetch(`/api/import-youtube/${jobId}`);
  const job = await response.json();
  if (job.state === "queued") importStatus.textContent = "Waiting to start import…";
  if (job.state === "importing") importStatus.textContent = `Importing ${job.position}/${job.total}: ${job.title}`;
  if (job.state === "failed") { importStatus.textContent = `Import failed: ${job.error}`; return; }
  if (job.state === "complete") {
    const {imported, skipped, unavailable = [], playlist} = job.result;
    const existing = skipped ? ` ${skipped} already in your library.` : "";
    const unavailableText = unavailable.length
      ? ` ${unavailable.length} unavailable: ${unavailable.map((song) => `${song.title} (${song.reason})`).join(", ")}.`
      : "";
    importStatus.textContent = `Done: ${imported} imported.${existing}${unavailableText}${playlist ? ` Playlist: ${playlist}.` : ""}`;
    loadSongs(); loadPlaylists(); return;
  }
  setTimeout(() => watchImport(jobId), 1000);
}
document.querySelector("#youtube-import-button").onclick = async () => {
  const input = document.querySelector("#youtube-url"), url = input.value.trim();
  if (!url) { importStatus.textContent = "Paste a YouTube video or playlist URL first."; return; }
  importStatus.textContent = "Starting import…";
  try {
    const response = await fetch("/api/import-youtube", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({url})});
    if (!response.ok) throw new Error((await response.json()).detail || "Could not start import.");
    input.value = "";
    watchImport((await response.json()).job_id);
  } catch (error) { importStatus.textContent = `Import failed: ${error.message}`; }
};

const filesInput = document.querySelector("#files-audio-input");
const filesImportStatus = document.querySelector("#files-import-status");
document.querySelector("#files-import-button").onclick = async () => {
  const files = [...filesInput.files];
  if (!files.length) { filesImportStatus.textContent = "Choose one or more MP3 files from Files first."; return; }
  const button = document.querySelector("#files-import-button");
  button.disabled = true;
  try {
    await navigator.serviceWorker.ready;
    const cache = await caches.open(LOCAL_MUSIC_CACHE);
    const importedSongs = getImportedSongs();
    let imported = 0;
    for (const file of files) {
      if (!file.type.startsWith("audio/") && !file.name.toLowerCase().endsWith(".mp3")) continue;
      const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${imported}`;
      const virtualPath = `/local-music/${id}`;
      await cache.put(virtualPath, new Response(file, {headers: {"Content-Type": file.type || "audio/mpeg"}}));
      importedSongs.unshift({
        id: `file-${id}`,
        title: file.name.replace(/\.mp3$/i, ""),
        artist: "Imported from Files",
        album: "Files backup",
        file: virtualPath,
        artwork: null,
      });
      imported += 1;
    }
    saveImportedSongs(importedSongs);
    filesInput.value = "";
    filesImportStatus.textContent = `${imported} file${imported === 1 ? "" : "s"} imported into GreyMatter. Your Files copies are unchanged.`;
    show("songs");
  } catch (error) {
    filesImportStatus.textContent = `Could not import files: ${error.message}`;
  } finally { button.disabled = false; }
};

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js"));
show("songs");
loadPlaylists();
