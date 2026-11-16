# Online museum setup

The museum runs in solo mode without Firebase configuration. Online play uses Firebase Authentication (anonymous sign-in) and Realtime Database. Firebase web configuration is included in the client bundle by Vite; it identifies the Firebase project and is not a server secret. Keep Admin SDK credentials and service-account keys out of this project.

## Firebase project

1. Create a Firebase project and register a Web app.
2. Enable **Authentication → Sign-in method → Anonymous**.
3. Create a **Realtime Database** and copy its database URL.
4. Copy `.env.example` to `.env.local`, fill in the Web app config values, and restart Vite. Do not commit `.env.local`.
5. In **Realtime Database → Rules**, publish these rules:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        "players": {
          "$playerId": {
            ".write": "auth != null && ((!data.exists() && !newData.exists()) || (!data.exists() && newData.child('uid').val() == auth.uid && root.child('rooms').child($roomId).child('slots').child(newData.child('character').val()).child('playerId').val() == $playerId) || (data.child('uid').val() == auth.uid && (!newData.exists() || (newData.child('uid').val() == auth.uid && root.child('rooms').child($roomId).child('slots').child(newData.child('character').val()).child('playerId').val() == $playerId))) || (data.child('lastSeen').isNumber() && data.child('lastSeen').val() < now - 30000 && (!newData.exists() || (newData.child('uid').val() == auth.uid && root.child('rooms').child($roomId).child('slots').child(newData.child('character').val()).child('playerId').val() == $playerId))))",
            ".validate": "!newData.exists() || (newData.child('playerId').val() == $playerId && newData.child('uid').val() == auth.uid && (newData.child('character').val() == 'daveRey' || newData.child('character').val() == 'resha') && newData.child('lastSeen').isNumber() && newData.child('lastSeen').val() <= now + 10000)",
            "messages": {
              ".validate": "!newData.exists() || newData.numChildren() <= 60",
              "$messageIndex": {
                ".validate": "newData.child('id').isString() && newData.child('id').val().length <= 100 && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 200 && newData.child('sentAt').isNumber()"
              }
            }
          }
        },
        "slots": {
          "$character": {
            ".write": "auth != null && ((!data.exists() && !newData.exists()) || (!data.exists() && newData.child('uid').val() == auth.uid) || (data.child('uid').val() == auth.uid && (!newData.exists() || newData.child('uid').val() == auth.uid)) || (data.child('lastSeen').isNumber() && data.child('lastSeen').val() < now - 30000 && (!newData.exists() || newData.child('uid').val() == auth.uid)))",
            ".validate": "!newData.exists() || (newData.child('playerId').isString() && newData.child('uid').val() == auth.uid && newData.child('character').val() == $character && newData.child('lastSeen').isNumber() && newData.child('lastSeen').val() <= now + 10000)"
          }
        },
        "hearts": {
          "$heartId": {
            ".write": "auth != null",
            ".validate": "!newData.exists() || (newData.child('by').val() == 'daveRey' || newData.child('by').val() == 'resha') && newData.child('at').isNumber()"
          }
        },
        "jukebox": {
          ".write": "auth != null",
          ".validate": "!newData.exists() || (newData.child('index').isNumber() && newData.child('index').val() >= 0 && newData.child('index').val() < 1000 && newData.child('startedAt').isNumber() && newData.child('playing').isBoolean())"
        }
      }
    }
  }
}
```

The rules allow only an authenticated owner to update/remove a live player or slot. The empty-path delete clause authorizes registering `onDisconnect().remove()` before the first presence write; it cannot delete existing data. A different client can reclaim a slot only after its heartbeat is stale. Chat history is stored under each sender's player record, with at most 60 messages and 200 characters per message. Test rules in the Firebase Rules Simulator before publishing. Firebase web config values are public; database rules are the access boundary.

**Republish these rules in the Firebase console before using co-op hearts.** Otherwise heart writes and fresh-session resets will be rejected. Any signed-in player in a room can write or remove heart records; this is an intentional trade-off for a private couple's room. Fresh-session resets remove the heart child records individually, so the child-level rule above is sufficient.

**Republish the rules again after adding the jukebox rule.** Both signed-in room participants can update shared jukebox playback state.

## How to add music

Drop `.mp3`, `.m4a`, `.ogg`, or `.wav` files into `public/music/`. The playlist generator runs automatically before `npm run dev` and `npm run build`; run `npm run music` to refresh it manually. Track titles come from filenames (leading track numbers are removed), so no code changes are needed. The service worker passes `/music/` audio and playlist requests directly to the network for HTTP Range support.

## Run and deploy

```powershell
npm install
npm run dev
npm run test
npm run test:e2e
npm run qa:mobile
npm run build
```

Deploy the Vite `dist/` output to any HTTPS static host. Configure the same `VITE_FIREBASE_*` variables in the build environment. The invite link uses `?room=ourmuseum` by default; `?room=another-room` creates a separate shared room. Room IDs accept letters, numbers, `_`, and `-` (up to 48 characters).

## Mobile browser QA

Install Google Chrome before running the Playwright suites. `npm run test:e2e` exercises the configured landscape-first phone, tablet, and desktop profiles; `npm run qa:mobile` runs the mobile flow, frame viewer, and debug-panel checks. The headless browser uses SwiftShader, and screenshots are written to `qa-report/screenshots/`.

The service worker uses a versioned shell cache. Increment `CACHE_NAME` in `public/sw.js` when changing the offline shell. A waiting worker is activated only after the user selects **Update available · reload**.

## Multiplayer smoke checks

With Firebase configured and the app deployed over HTTPS, open the exact same invite URL in two separate browsers/devices. Verify both join the same room, same-character choices assign the newcomer the other character, and the debug view (`?debug=1`) reports two player IDs and ping. Then test refresh, close/reopen, transient network loss, Wi-Fi-to-mobile-data switching, and a late join. Real network/device verification requires a configured Firebase project.

## Chat and sitting

Chat history is synchronized through the sender's existing player record, so the rules above do not require a separate top-level database path. Messages are capped to the most recent 60 per sender; visible speech bubbles expire after a few seconds. Emotes and seat occupancy are included in the normal player-state updates. The `?debug=1` panel reports local and remote seat/emote state. For seating calibration, open `?debug=sit`; the scene starts beside a bench and shows the seat slots, approach points, pelvis attach point, and leg lines from a full-body side view. Verify both characters sit alone and side by side, stand into the open space in front, and release a seat after disconnect.
