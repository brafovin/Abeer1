Custom music for BLOOD MOON: ETERNAL NIGHT
1. Copy audio files you own into this folder (public/music/). Supported formats depend on the browser: mp3, ogg, wav and m4a usually work.
2. Edit playlist.json and map a track name to a file name inside "tracks", e.g. "tracks": { "menu": "my-menu.mp3", "boss": "fight.ogg" }.
3. Track names: menu, explore, cathedral, forest, castle, boss, boss2, sovereigns, victory. Use "all" to play one file for every track.
4. Files loop and crossfade like the built-in score; tracks without an entry keep the synthesized music.
5. Reload the game after editing. A missing or undecodable file falls back to the built-in track (a warning appears in the browser console).
6. The game can also use a file you pick at runtime for the current session (AudioManager.loadUserFile), without touching this folder.
