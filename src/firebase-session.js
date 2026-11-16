import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getDatabase,
  get,
  onDisconnect,
  onValue,
  remove,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import {
  chooseAvailableCharacter,
  claimCharacterSlot,
  normalizeChatMessage,
  normalizePlayerMessages,
  normalizePlayerState,
} from "./online-state.js";
import { normalizeJukeboxState } from "./jukebox-state.js";
import { CHAT_CONFIG } from "./config.js";

function createPlayerId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function cleanState(state) {
  const normalized = normalizePlayerState(state);
  if (!normalized) throw new TypeError("Local player state contains invalid values.");
  return normalized;
}

export function createFirebaseSession(options) {
  const {
    config,
    roomId,
    preferredCharacter,
    getState,
    onStatus,
    onPlayers,
    onMessages,
    onHeartsChanged,
    onJukeboxJoin,
    onJukeboxChanged,
    onCharacter,
    onDiagnostics,
    onError,
    retryBaseMs = 1000,
    retryMaxMs = 30000,
    staleAfterMs = 30000,
    heartbeatMs = 10000,
    publishRate = 12.5,
  } = options;
  const playerId = createPlayerId();
  const roomPath = `rooms/${roomId}`;
  let database;
  let auth;
  let offsetUnsubscribe;
  let connectedUnsubscribe;
  let playersUnsubscribe;
  let heartsUnsubscribe;
  let jukeboxUnsubscribe;
  let connected = false;
  let joined = false;
  let joining = false;
  let heartJoinSnapshotProcessed = false;
  let heartsReady = false;
  let disposed = false;
  let character = preferredCharacter;
  let lastError = "";
  let pingMs = null;
  let playerCount = 0;
  let serverTimeOffset = 0;
  let retryCount = 0;
  let retryTimer = null;
  let heartbeatTimer = null;
  let publishTimer = null;
  let publishInFlight = false;
  let queuedState = null;
  let playerRef = null;
  let sentMessages = [];
  let joinGeneration = 0;
  const pendingHeartWrites = new Map();

  function reportDiagnostics(nextPlayerCount) {
    if (Number.isFinite(nextPlayerCount)) playerCount = nextPlayerCount;
    onDiagnostics?.({
      roomId,
      playerId,
      connectionState: connected ? (joined ? "connected" : "joining") : "disconnected",
      playerCount,
      lastError,
      pingMs,
    });
  }

  function reportStatus(text, kind) {
    onStatus?.({ text, kind });
  }

  function getErrorStatus(error) {
    const code = error?.code ?? "";
    if (/PERMISSION_DENIED|permission-denied/.test(code)) {
      return "Database permission denied · check Anonymous Auth and RTDB rules";
    }
    if (code === "auth/operation-not-allowed") {
      return "Anonymous sign-in is disabled · enable it in Firebase Authentication";
    }
    return `Online error · ${error?.message ?? "Could not connect."}`;
  }

  function recordError(error) {
    lastError = error?.code
      ? `${error.code}: ${error.message ?? "Realtime request failed."}`
      : error?.message ?? String(error);
    onError?.(error);
    reportDiagnostics();
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function unsubscribeHearts() {
    heartsUnsubscribe?.();
    heartsUnsubscribe = null;
    heartsReady = false;
  }

  function unsubscribeJukebox() {
    jukeboxUnsubscribe?.();
    jukeboxUnsubscribe = null;
  }

  function readServerTimeOffset() {
    return new Promise((resolve, reject) => {
      let receivedSnapshot = false;
      let unsubscribe = () => {};
      unsubscribe = onValue(
        ref(database, ".info/serverTimeOffset"),
        (snapshot) => {
          receivedSnapshot = true;
          serverTimeOffset = Number(snapshot.val()) || 0;
          unsubscribe();
          resolve();
        },
        (error) => {
          unsubscribe?.();
          reject(error);
        },
      );
      if (receivedSnapshot) unsubscribe();
    });
  }

  function isPermanentError(error) {
    return /room-full|permission-denied|PERMISSION_DENIED|auth\/operation-not-allowed|auth\/invalid-api-key|missing-config/.test(
      error?.code ?? "",
    );
  }

  function scheduleRetry(error) {
    recordError(error);
    if (disposed || !connected || isPermanentError(error) || retryTimer !== null) {
      reportStatus(getErrorStatus(error), "error");
      return;
    }
    joined = false;
    joinGeneration += 1;
    heartJoinSnapshotProcessed = false;
    if (playersUnsubscribe) {
      playersUnsubscribe();
      playersUnsubscribe = null;
    }
    unsubscribeHearts();
    unsubscribeJukebox();
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    if (publishTimer !== null) clearInterval(publishTimer);
    const delay = Math.min(retryBaseMs * 2 ** retryCount, retryMaxMs);
    retryCount += 1;
    reportStatus(`Connection interrupted · retrying in ${Math.ceil(delay / 1000)}s`, "connecting");
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void joinRoom();
    }, delay);
  }

  async function chooseRoomCharacter() {
    const now = Date.now() + serverTimeOffset;
    const candidateKinds = [
      preferredCharacter,
      chooseAvailableCharacter(preferredCharacter, new Set([preferredCharacter])),
    ];
    for (const candidate of candidateKinds) {
      const slotRef = ref(database, `${roomPath}/slots/${candidate}`);
      try {
        await onDisconnect(slotRef).remove();
      } catch (error) {
        const occupiedSlot = await get(slotRef);
        const current = occupiedSlot.val();
        const currentIsFresh = current &&
          Number.isFinite(current.lastSeen) &&
          Date.now() + serverTimeOffset - current.lastSeen <= staleAfterMs;
        if (currentIsFresh && current.playerId !== playerId) continue;
        throw error;
      }
      const transaction = await runTransaction(
        slotRef,
        (current) => {
          return claimCharacterSlot(
            current,
            playerId,
            auth.currentUser.uid,
            candidate,
            now,
            staleAfterMs,
          ) ?? undefined;
        },
        { applyLocally: false },
      );
      if (transaction.committed) {
        character = candidate;
        return { candidate, slotRef };
      }
      await onDisconnect(slotRef).cancel();
    }
    const error = new Error("This room already has two active players.");
    error.code = "room-full";
    throw error;
  }

  function publishPlayersSnapshot(snapshot) {
    const now = Date.now() + serverTimeOffset;
    const players = [];
    const messages = [];
    let hasLivePartner = false;
    snapshot.forEach((child) => {
      const player = child.val();
      if (!player || !Number.isFinite(player.lastSeen) || now - player.lastSeen > staleAfterMs) return;
      const characterName = player.character === "resha" ? "Resha" : "Dave Rey";
      messages.push(...normalizePlayerMessages(player.messages, child.key, characterName));
      if (child.key === playerId) return;
      hasLivePartner = true;
      const state = normalizePlayerState(player.state);
      if (!state || !["daveRey", "resha"].includes(player.character)) return;
      players.push({
        id: child.key,
        character: player.character,
        state,
      });
    });
    onMessages?.(messages
      .sort((first, second) => first.sentAt - second.sentAt)
      .slice(-CHAT_CONFIG.maxHistory));
    onPlayers?.(players);
    reportDiagnostics(Math.min(2, players.length + (joined ? 1 : 0)));
    if (joined && !heartJoinSnapshotProcessed) {
      heartJoinSnapshotProcessed = true;
      void initializeHearts(hasLivePartner, joinGeneration).catch(scheduleRetry);
      void initializeJukebox(hasLivePartner, joinGeneration).catch(scheduleRetry);
    }
    if (joined) {
      if (players.length) {
        const partner = players[0].character === "resha" ? "Resha" : "Dave Rey";
        reportStatus(`${partner} joined`, "partner");
      } else {
        reportStatus("Waiting for your partner…", "waiting");
      }
    }
  }

  async function resetHearts() {
    if (!database || !connected || !joined) {
      throw new Error("Cannot reset shared hearts before joining the room.");
    }
    const heartsRef = ref(database, `${roomPath}/hearts`);
    const snapshot = await get(heartsRef);
    const heartIds = Object.keys(snapshot.val() ?? {})
      .filter((heartId) => /^[a-zA-Z0-9_-]{1,48}$/.test(heartId));
    await Promise.all(heartIds.map((heartId) =>
      remove(ref(database, `${roomPath}/hearts/${heartId}`))));
  }

  async function writeHeart(heartId, by) {
    const heartRef = ref(database, `${roomPath}/hearts/${heartId}`);
    const transaction = await runTransaction(
      heartRef,
      (current) => current ?? { by, at: Date.now() + serverTimeOffset },
      { applyLocally: false },
    );
    if (pendingHeartWrites.get(heartId) === by) pendingHeartWrites.delete(heartId);
    return transaction.committed;
  }

  async function initializeHearts(hasLivePartner, generation) {
    if (!hasLivePartner) await resetHearts();
    if (disposed || !connected || !joined || generation !== joinGeneration) return;

    let firstSnapshot = true;
    heartsReady = true;
    heartsUnsubscribe = onValue(
      ref(database, `${roomPath}/hearts`),
      (snapshot) => {
        const initial = firstSnapshot;
        firstSnapshot = false;
        onHeartsChanged?.(snapshot.val() ?? {}, { initial });
      },
      scheduleRetry,
    );
    for (const [heartId, by] of [...pendingHeartWrites]) {
      if (disposed || !connected || !joined || !heartsReady) break;
      await writeHeart(heartId, by);
    }
  }

  function subscribeJukebox() {
    if (jukeboxUnsubscribe) return;
    let firstSnapshot = true;
    jukeboxUnsubscribe = onValue(
      ref(database, `${roomPath}/jukebox`),
      (snapshot) => {
        const initial = firstSnapshot;
        firstSnapshot = false;
        onJukeboxChanged?.(snapshot.val(), { initial });
      },
      scheduleRetry,
    );
  }

  async function initializeJukebox(hasLivePartner, generation) {
    const jukeboxRef = ref(database, `${roomPath}/jukebox`);
    const snapshot = await get(jukeboxRef);
    if (disposed || !connected || !joined || generation !== joinGeneration) return;
    const decision = onJukeboxJoin?.({
      hasLivePartner,
      currentState: snapshot.val(),
    });
    if (decision?.action === "restart") {
      const state = {
        ...decision.state,
        by: character,
        updatedAt: serverTimestamp(),
      };
      if (decision.overwrite) {
        await set(jukeboxRef, state);
      } else {
        await runTransaction(
          jukeboxRef,
          (current) => current ?? state,
          { applyLocally: false },
        );
      }
    }
    if (disposed || !connected || !joined || generation !== joinGeneration) return;
    subscribeJukebox();
  }

  async function joinRoom() {
    if (disposed || !connected || joining || joined) return;
    joining = true;
    joinGeneration += 1;
    heartJoinSnapshotProcessed = false;
    reportStatus("Connecting…", "connecting");
    try {
      await readServerTimeOffset();
      if (!auth.currentUser) await signInAnonymously(auth);
      playerRef = ref(database, `${roomPath}/players/${playerId}`);
      await onDisconnect(playerRef).remove();
      const { slotRef } = await chooseRoomCharacter();
      await set(playerRef, {
        playerId,
        uid: auth.currentUser.uid,
        character,
        state: cleanState(getState()),
        lastSeen: Date.now() + serverTimeOffset,
        messages: sentMessages,
      });
      joined = true;
      retryCount = 0;
      lastError = "";
      clearRetry();
      onCharacter?.(character);
      if (!playersUnsubscribe) {
        playersUnsubscribe = onValue(
          ref(database, `${roomPath}/players`),
          publishPlayersSnapshot,
          scheduleRetry,
        );
      }
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (!connected || !joined) return;
        update(slotRef, { lastSeen: Date.now() + serverTimeOffset }).catch(scheduleRetry);
      }, heartbeatMs);
      if (publishTimer !== null) clearInterval(publishTimer);
      publishTimer = setInterval(() => {
        if (!connected || !joined || publishInFlight || !queuedState) return;
        const state = queuedState;
        queuedState = null;
        publishInFlight = true;
        const startedAt = performance.now();
        update(playerRef, {
          character,
          state,
          lastSeen: Date.now() + serverTimeOffset,
        })
          .then(() => {
            pingMs = Math.max(0, Math.round(performance.now() - startedAt));
            reportDiagnostics();
          })
          .catch(scheduleRetry)
          .finally(() => {
            publishInFlight = false;
          });
      }, 1000 / publishRate);
      reportStatus("Waiting for your partner…", "waiting");
      reportDiagnostics(1);
    } catch (error) {
      joined = false;
      scheduleRetry(error);
    } finally {
      joining = false;
    }
  }

  function start() {
    if (!config) {
      const error = new Error("Firebase is not configured. Add the VITE_FIREBASE_* values and reload.");
      error.code = "missing-config";
      recordError(error);
      reportStatus("Online unavailable · Firebase is not configured", "error");
      return;
    }
    if (connectedUnsubscribe) {
      void retry();
      return;
    }
    const appName = `museum-${config.projectId}`;
    const app = getApps().some((candidate) => candidate.name === appName)
      ? getApp(appName)
      : initializeApp(config, appName);
    auth = getAuth(app);
    database = getDatabase(app);
    offsetUnsubscribe = onValue(ref(database, ".info/serverTimeOffset"), (snapshot) => {
      serverTimeOffset = Number(snapshot.val()) || 0;
    }, (error) => {
      scheduleRetry(error);
    });
    connectedUnsubscribe = onValue(
      ref(database, ".info/connected"),
      (snapshot) => {
        connected = snapshot.val() === true;
        if (!connected) {
          joined = false;
          joinGeneration += 1;
          heartJoinSnapshotProcessed = false;
          if (playersUnsubscribe) {
            playersUnsubscribe();
            playersUnsubscribe = null;
          }
          unsubscribeHearts();
          unsubscribeJukebox();
          onPlayers?.([]);
          reportStatus("Connection lost · reconnecting…", "connecting");
          reportDiagnostics();
          return;
        }
        clearRetry();
        void joinRoom();
      },
      scheduleRetry,
    );
    reportStatus("Connecting…", "connecting");
    reportDiagnostics();
  }

  async function retry() {
    clearRetry();
    retryCount = 0;
    if (!config) {
      start();
      return;
    }
    if (!connected) {
      reportStatus("Connecting…", "connecting");
      return;
    }
    joined = false;
    joinGeneration += 1;
    heartJoinSnapshotProcessed = false;
    playersUnsubscribe?.();
    playersUnsubscribe = null;
    unsubscribeHearts();
    unsubscribeJukebox();
    await joinRoom();
  }

  function publish(state) {
    try {
      queuedState = cleanState(state);
    } catch (error) {
      recordError(error);
    }
  }

  function publishHeart(heartId, by = character) {
    if (typeof heartId !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(heartId)) {
      throw new TypeError("Heart IDs must be valid room-safe identifiers.");
    }
    if (!["daveRey", "resha"].includes(by)) {
      throw new TypeError("A shared heart must identify a known character.");
    }
    pendingHeartWrites.set(heartId, by);
    if (!connected || !joined || !heartsReady) return Promise.resolve(false);
    return writeHeart(heartId, by).catch((error) => {
      scheduleRetry(error);
      throw error;
    });
  }

  async function publishJukebox(state) {
    if (!database || !connected || !joined) return false;
    const normalized = normalizeJukeboxState(state);
    if (!normalized) throw new TypeError("The jukebox state contains invalid values.");
    await set(ref(database, `${roomPath}/jukebox`), {
      ...normalized,
      by: character,
      updatedAt: serverTimestamp(),
    });
    return true;
  }

  async function ensureJukeboxState(state) {
    if (!database || !connected || !joined) return false;
    const normalized = normalizeJukeboxState(state);
    if (!normalized) throw new TypeError("The initial jukebox state contains invalid values.");
    const transaction = await runTransaction(
      ref(database, `${roomPath}/jukebox`),
      (current) => current ?? { ...normalized, by: character, updatedAt: serverTimestamp() },
      { applyLocally: false },
    );
    return transaction.committed;
  }

  async function advanceJukebox(expectedIndex, nextState) {
    if (!database || !connected || !joined) return false;
    const next = normalizeJukeboxState(nextState);
    if (!next || !Number.isInteger(expectedIndex)) {
      throw new TypeError("The jukebox advance request contains invalid values.");
    }
    const transaction = await runTransaction(
      ref(database, `${roomPath}/jukebox`),
      (current) => {
        if (!current || Number(current.index) !== expectedIndex || current.playing !== true) return;
        return { ...next, by: character, updatedAt: serverTimestamp() };
      },
      { applyLocally: false },
    );
    return transaction.committed;
  }

  async function sendMessage(message) {
    if (!connected || !joined || !playerRef) {
      throw new Error("Chat is not connected yet. Please wait for the online connection.");
    }
    const senderName = character === "resha" ? "Resha" : "Dave Rey";
    const normalized = normalizeChatMessage(message, playerId, senderName);
    if (!normalized) throw new TypeError("The chat message is empty or exceeds the message limit.");
    const previousMessages = sentMessages;
    sentMessages = [...sentMessages, {
      id: normalized.id,
      text: normalized.text,
      sentAt: normalized.sentAt,
    }].slice(-CHAT_CONFIG.maxHistory);
    try {
      await update(playerRef, { messages: sentMessages });
    } catch (error) {
      sentMessages = previousMessages;
      throw error;
    }
  }

  function dispose() {
    disposed = true;
    clearRetry();
    joinGeneration += 1;
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    if (publishTimer !== null) clearInterval(publishTimer);
    playersUnsubscribe?.();
    unsubscribeHearts();
    unsubscribeJukebox();
    offsetUnsubscribe?.();
    connectedUnsubscribe?.();
  }

  return {
    playerId,
    start,
    retry,
    publish,
    publishHeart,
    resetHearts,
    publishJukebox,
    ensureJukeboxState,
    advanceJukebox,
    sendMessage,
    dispose,
    getServerNow: () => Date.now() + serverTimeOffset,
  };
}
