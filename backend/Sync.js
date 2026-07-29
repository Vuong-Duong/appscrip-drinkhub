/* =========================
 * Sync.gs - Delta Sync cho Frontend - Firestore
 * ========================= */

// syncVersionCounter persisted in CacheService, khong reset trong runtime ngan.
const SYNC_VERSION_CACHE_KEY = "sync_version_counter";

const nextSyncVersion = () => {
  const cache = CacheService.getScriptCache();
  let counter = toNumberSafe_(cache.get(SYNC_VERSION_CACHE_KEY), 0);
  counter++;
  cache.put(
    SYNC_VERSION_CACHE_KEY,
    String(counter),
    APP_CONFIG.CACHE_TTL_SEC * 10,
  );
  return counter;
};

const buildDelta = (entity, action, payload) => {
  const timestamp = toIsoString_(new Date());
  const delta = {
    version: nextSyncVersion(),
    entity: entity,
    action: action,
    timestamp: timestamp,
    payload: payload,
  };

  delta.checksum = calculateChecksum_(delta);
  return delta;
};

const pushDelta = (entity, action, payload) => {
  const delta = buildDelta(entity, action, payload);
  const logId = generateId_("delta");

  firestoreSet_("logs", logId, {
    id: logId,
    action: "DELTA",
    target: entity,
    account: "system",
    details: JSON.stringify(delta),
    timestamp: delta.timestamp,
  });

  return delta;
};

const pushDeltaSafe_ = (entity, action, payload) => {
  try {
    return pushDelta(entity, action, payload);
  } catch (err) {
    console.error(`[DELTA_ERROR] ${entity}.${action}: ${err.message}`);
    return null;
  }
};

// API cho Frontend polling.
const getDeltaSince = (clientVersion = 0) => {
  const docs = firestoreQuery_("logs", {
    filters: [{ field: "action", op: "EQUAL", value: "DELTA" }],
    limit: 100,
  });

  const allDeltas = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const delta = parseJsonSafe_(doc.details);

    if (delta && delta.version > clientVersion) {
      allDeltas.push(delta);
    }
  }

  const sortedDeltas = allDeltas.sort((a, b) => a.version - b.version);
  const limitedDeltas = sortedDeltas.slice(-APP_CONFIG.DELTA_LIMIT);

  return {
    success: true,
    latestVersion: limitedDeltas.length
      ? limitedDeltas[limitedDeltas.length - 1].version
      : clientVersion,
    deltas: limitedDeltas,
    serverTime: toIsoString_(new Date()),
    count: limitedDeltas.length,
  };
};

// Helper tinh checksum bang SHA-256.
const calculateChecksum_ = (obj) => {
  const str = JSON.stringify(obj || {});
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
  );
  return digest
    .map((b) => ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2))
    .join("");
};
