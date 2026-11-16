# Adding museum content

The room plan, opening links, art metadata, prop placement, carpet placement, and lighting moods live in `museum.config.js`. Keep new content in that configuration; use the existing room and frame builders rather than adding one-off meshes.

## Add a room

1. Add a unique room to `architecture.chapters` or `architecture.sideRooms` with `id`, `title`, flat-floor `bounds`, `center`, `floorY: 0`, `floorType`, `height`, and `loadRadius`.
2. Set `floorType` to `wood`, `marble`, `carpet`, `grass`, or `stone`; the room builder selects a matching procedural finish and preserves the existing footstep mapping. Add the same room ID to `ROOM_THEMES` with wall/fog/light colors, four music frequencies, and an `ambience` (`chimes`, `fountain`, or `crickets`).
3. Add aligned openings to both rooms' shared boundaries and a matching record in `MUSEUM_CONFIG.archways`. Use the same `center` and a width of at least 3.2m; use `kind: "heart-gated"` only for the permanent reveal arch.
4. Keep the 3m main lane, 2m side lanes, archway keep-out zones, and at least 1.5m around seat slots clear. Add the room to `lanes`, `keepOutZones`, and `guideRoute` as needed.
5. Add the room's media and props in the config, then run `npm.cmd test` and `npm.cmd run build`. Check `?debug=layout` and `?debug=paths`.

## Add a frame

Add a record to `MUSEUM_CONFIG.frames` with a unique `id`, `roomId`, wall-mounted `position`, `rotationY`, `height`, `aspectRatio`, `sizeClass` (`small`, `medium`, `large`, or `hero`), `style` (`gold`, `wood`, `polaroid`, or `screen`), `mediaType`, `path`, `caption`, and `date`. The builder derives width from `height * aspectRatio`. Provide `thumbnailPath` for a small image loaded with the room; the full `path` loads when the player is within 7m. Video frames should use `posterPath` and only request/play the video when approached. Keep the viewing point about 4.5m from the artwork, with a clear route to it. Set `pictureLight: true` to add its warm picture light.

## Add a carpet

Add `{ type: "rug", position: [x, 0, z], width, depth }` to the room's `props`. Rugs are visual-only, rough, and have no movement collider. Their top is just above the floor; don't add a collider or raise them to avoid z-fighting. Keep them out of doorway and seat approach keep-out zones. Carpet footsteps are selected automatically when a player walks over configured rugs; otherwise `floorType` determines the sound.

## Add a table

Use `type: "table"`, `"cafeTable"`, or `"console"` in the room's `props`. Each receives the existing vase and instanced tulips automatically; do not add another vase/flower builder. For the guestbook console, keep its configured position aligned with `MUSEUM_CONFIG.guestbook.position`.

## Add a prop

Use an existing `createProp` type: `bench`, `chair`, `table`, `cafeTable`, `console`, `plant`, `rug`, `picnic`, `pond`, `telescope`, `jukebox`, `piano`, `photoBooth`, `memoryOrb`, `swing`, `blossoms`, `balloons`, `fireflies`, `lanterns`, `petals`, `stringLights`, `wallLights`, or `statue`. Props with solid geometry receive colliders from their builder; decorative rugs and particles do not. Place bulky props against a wall or in an alcove and use `?debug=paths` to check the resulting lane.

## Add a light

Set room mood lighting, fog, and its audio theme in `ROOM_THEMES`. `MUSEUM_LIGHTS` lists these configured room lights and the frame-mounted lights derived from `pictureLight`; keep the real-time scene-light count low. Hero frames with `pictureLight: true` receive a shared baked-looking wash, so do not add a per-frame spotlight. Quality behavior and dynamic resolution thresholds are in `LIGHTING_CONFIG` and `PERFORMANCE_CONFIG`; keep dust and bloom on the higher tiers.

## Add jukebox music

Drop `.mp3`, `.m4a`, `.ogg`, or `.wav` files into `public/music/`. `npm run music` regenerates `public/music/playlist.json`; the generator also runs automatically before `npm run dev` and `npm run build`. Edit `MUSEUM_CONFIG.jukebox.position` and `rotationY` to nudge the rotunda cabinet, and keep it outside archway keep-out zones and walking lanes. Shared playback uses the room's Firebase jukebox state; solo play works without Firebase.

`MUSEUM_ARCHWAYS`, `MUSEUM_PROPS`, `MUSEUM_CARPETS`, and `MUSEUM_LIGHTS` are derived indexes for validation/debug views; the room/frame records remain the source of truth.
