/**
 * FirestoreClient.gs
 *
 * DrinkHub architecture:
 *
 * React/Vite
 *    ↓
 * Google Apps Script
 *    ↓
 * Firestore REST API
 *
 * Authentication:
 * Service Account + OAuth 2.0 JWT
 *
 * Script Properties:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_SERVICE_ACCOUNT_EMAIL
 * - FIREBASE_PRIVATE_KEY
 */

const FIRESTORE_CONFIG = Object.freeze({
  API_BASE_URL: "https://firestore.googleapis.com/v1",
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  DATABASE_ID: "(default)",
  AUTH_SCOPE: "https://www.googleapis.com/auth/datastore",

  TOKEN_CACHE_KEY: "FIRESTORE_ACCESS_TOKEN",
  TOKEN_CACHE_SECONDS: 3000,
});


/* =========================================================
 * CONFIG
 * ========================================================= */

function getFirestoreConfig_() {
  const props = PropertiesService.getScriptProperties();

  const projectId = props.getProperty(
    "FIREBASE_PROJECT_ID"
  );

  const serviceAccountEmail = props.getProperty(
    "FIREBASE_SERVICE_ACCOUNT_EMAIL"
  );

  const privateKey = props.getProperty(
    "FIREBASE_PRIVATE_KEY"
  );

  if (!projectId) {
    throw new Error(
      "FIREBASE_PROJECT_ID_NOT_CONFIGURED"
    );
  }

  if (!serviceAccountEmail) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_EMAIL_NOT_CONFIGURED"
    );
  }

  if (!privateKey) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY_NOT_CONFIGURED"
    );
  }

  return {
    projectId: projectId.trim(),

    serviceAccountEmail:
      serviceAccountEmail.trim(),

    privateKey:
      privateKey.replace(/\\n/g, "\n"),
  };
}


/* =========================================================
 * OAUTH TOKEN
 * ========================================================= */

function getFirestoreAccessToken_() {
  const cache =
    CacheService.getScriptCache();

  const cachedToken = cache.get(
    FIRESTORE_CONFIG.TOKEN_CACHE_KEY
  );

  if (cachedToken) {
    return cachedToken;
  }

  const config =
    getFirestoreConfig_();

  const now =
    Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: config.serviceAccountEmail,

    scope:
      FIRESTORE_CONFIG.AUTH_SCOPE,

    aud:
      FIRESTORE_CONFIG.TOKEN_URL,

    iat: now,

    exp: now + 3600,
  };

  const encodedHeader =
    base64UrlEncode_(
      JSON.stringify(header)
    );

  const encodedPayload =
    base64UrlEncode_(
      JSON.stringify(payload)
    );

  const unsignedToken =
    encodedHeader +
    "." +
    encodedPayload;

  const signatureBytes =
    Utilities.computeRsaSha256Signature(
      unsignedToken,
      config.privateKey
    );

  const signature =
    base64UrlEncodeBytes_(
      signatureBytes
    );

  const jwt =
    unsignedToken +
    "." +
    signature;

  const response =
    UrlFetchApp.fetch(
      FIRESTORE_CONFIG.TOKEN_URL,
      {
        method: "post",

        contentType:
          "application/x-www-form-urlencoded",

        payload: {
          grant_type:
            "urn:ietf:params:oauth:grant-type:jwt-bearer",

          assertion: jwt,
        },

        muteHttpExceptions: true,
      }
    );

  const status =
    response.getResponseCode();

  const body =
    response.getContentText();

  if (
    status < 200 ||
    status >= 300
  ) {
    throw new Error(
      "FIRESTORE_OAUTH_FAILED: " +
      status +
      " " +
      body
    );
  }

  const result =
    JSON.parse(body);

  if (!result.access_token) {
    throw new Error(
      "FIRESTORE_ACCESS_TOKEN_MISSING"
    );
  }

  cache.put(
    FIRESTORE_CONFIG.TOKEN_CACHE_KEY,
    result.access_token,
    FIRESTORE_CONFIG.TOKEN_CACHE_SECONDS
  );

  return result.access_token;
}


/* =========================================================
 * PATH
 * ========================================================= */

function getFirestoreDatabasePath_() {
  const config =
    getFirestoreConfig_();

  return (
    "projects/" +
    encodeURIComponent(config.projectId) +
    "/databases/" +
    encodeURIComponent(
      FIRESTORE_CONFIG.DATABASE_ID
    )
  );
}


function getFirestoreDocumentsPath_() {
  return (
    getFirestoreDatabasePath_() +
    "/documents"
  );
}


function getFirestoreDocumentPath_(
  collection,
  documentId
) {
  if (!collection) {
    throw new Error(
      "FIRESTORE_COLLECTION_REQUIRED"
    );
  }

  if (!documentId) {
    throw new Error(
      "FIRESTORE_DOCUMENT_ID_REQUIRED"
    );
  }

  return (
    getFirestoreDocumentsPath_() +
    "/" +
    encodeURIComponent(collection) +
    "/" +
    encodeURIComponent(documentId)
  );
}


/* =========================================================
 * HTTP REQUEST
 * ========================================================= */

function firestoreRequest_(
  method,
  path,
  body,
  retry = true
) {
  const token =
    getFirestoreAccessToken_();

  const url =
    FIRESTORE_CONFIG.API_BASE_URL +
    "/" +
    path;

  const params = {
    method: method,

    headers: {
      Authorization:
        "Bearer " + token,
    },

    muteHttpExceptions: true,
  };

  if (
    body !== undefined &&
    body !== null
  ) {
    params.contentType =
      "application/json";

    params.payload =
      JSON.stringify(body);
  }

  const response =
    UrlFetchApp.fetch(
      url,
      params
    );

  const status =
    response.getResponseCode();

  const text =
    response.getContentText();

  /*
   * Token expired.
   * Clear cache and retry once.
   */
  if (
    status === 401 &&
    retry
  ) {
    CacheService
      .getScriptCache()
      .remove(
        FIRESTORE_CONFIG.TOKEN_CACHE_KEY
      );

    return firestoreRequest_(
      method,
      path,
      body,
      false
    );
  }

  if (
    status < 200 ||
    status >= 300
  ) {
    throw new Error(
      "FIRESTORE_REQUEST_FAILED: " +
      status +
      " " +
      text
    );
  }

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}


/* =========================================================
 * GET DOCUMENT
 * ========================================================= */

function firestoreGet_(
  collection,
  documentId
) {
  const path =
    getFirestoreDocumentPath_(
      collection,
      documentId
    );

  try {
    const response =
      firestoreRequest_(
        "get",
        path
      );

    return firestoreDocumentToObject_(
      response
    );

  } catch (error) {

    if (
      String(error.message)
        .includes(
          "FIRESTORE_REQUEST_FAILED: 404"
        )
    ) {
      return null;
    }

    throw error;
  }
}


/* =========================================================
 * CREATE / REPLACE DOCUMENT
 * ========================================================= */

function firestoreSet_(
  collection,
  documentId,
  data
) {
  const path =
    getFirestoreDocumentPath_(
      collection,
      documentId
    );

  const body = {
    fields:
      objectToFirestoreFields_(data),
  };

  const response =
    firestoreRequest_(
      "patch",
      path,
      body
    );

  return firestoreDocumentToObject_(
    response
  );
}


/* =========================================================
 * UPDATE ONLY PROVIDED FIELDS
 * ========================================================= */

function firestoreUpdate_(
  collection,
  documentId,
  data
) {
  const fields =
    Object.keys(data || {});

  if (fields.length === 0) {
    return firestoreGet_(
      collection,
      documentId
    );
  }

  const fieldMasks =
    fields
      .map(
        field =>
          "updateMask.fieldPaths=" +
          encodeURIComponent(field)
      )
      .join("&");

  const path =
    getFirestoreDocumentPath_(
      collection,
      documentId
    ) +
    "?" +
    fieldMasks;

  const body = {
    fields:
      objectToFirestoreFields_(data),
  };

  const response =
    firestoreRequest_(
      "patch",
      path,
      body
    );

  return firestoreDocumentToObject_(
    response
  );
}


/* =========================================================
 * DELETE
 * ========================================================= */

function firestoreDelete_(
  collection,
  documentId
) {
  const path =
    getFirestoreDocumentPath_(
      collection,
      documentId
    );

  firestoreRequest_(
    "delete",
    path
  );

  return true;
}


/* =========================================================
 * QUERY
 * ========================================================= */

function firestoreQuery_(
  collection,
  options = {}
) {
  const structuredQuery = {
    from: [
      {
        collectionId:
          collection,
      },
    ],
  };

  /*
   * WHERE
   */
  if (
    Array.isArray(options.filters) &&
    options.filters.length > 0
  ) {
    const filters =
      options.filters.map(
        filter => ({
          fieldFilter: {
            field: {
              fieldPath:
                filter.field,
            },

            op:
              filter.op || "EQUAL",

            value:
              jsToFirestoreValue_(
                filter.value
              ),
          },
        })
      );

    if (filters.length === 1) {
      structuredQuery.where =
        filters[0];

    } else {
      structuredQuery.where = {
        compositeFilter: {
          op: "AND",
          filters,
        },
      };
    }
  }

  /*
   * ORDER BY
   */
  if (
    Array.isArray(options.orderBy) &&
    options.orderBy.length > 0
  ) {
    structuredQuery.orderBy =
      options.orderBy.map(
        order => ({
          field: {
            fieldPath:
              order.field,
          },

          direction:
            order.direction ||
            "ASCENDING",
        })
      );
  }

  /*
   * LIMIT
   */
  if (
    options.limit !== undefined
  ) {
    structuredQuery.limit =
      Number(options.limit);
  }

  const response =
    firestoreRequest_(
      "post",

      getFirestoreDocumentsPath_() +
        ":runQuery",

      {
        structuredQuery,
      }
    );

  if (!Array.isArray(response)) {
    return [];
  }

  return response
    .filter(
      item => item.document
    )
    .map(
      item =>
        firestoreDocumentToObject_(
          item.document
        )
    );
}


/* =========================================================
 * BATCH WRITE
 * ========================================================= */

function firestoreBatchWrite_(
  writes
) {
  if (!Array.isArray(writes)) {
    throw new Error(
      "FIRESTORE_WRITES_MUST_BE_ARRAY"
    );
  }

  const firestoreWrites =
    writes.map(write => {

      const documentName =
        getFirestoreDocumentName_(
          write.collection,
          write.id
        );

      switch (write.type) {

        case "set":
          return {
            update: {
              name: documentName,
              fields: objectToFirestoreFields_(write.data || {}),
            },
          };

        case "update":
          const updateFieldPaths = Object.keys(write.data || {});
          return {
            update: {
              name: documentName,
              fields: objectToFirestoreFields_(write.data || {}),
            },
            updateMask: {
              fieldPaths: updateFieldPaths,
            },
          };

        case "delete":
          return {
            delete:
              documentName,
          };

        default:
          throw new Error(
            "UNKNOWN_WRITE_TYPE: " +
            write.type
          );
      }
    });

  return firestoreRequest_(
    "post",

    getFirestoreDatabasePath_() +
      "/documents:commit",

    {
      writes:
        firestoreWrites,
    }
  );
}


/* =========================================================
 * DOCUMENT NAME
 * ========================================================= */

function getFirestoreDocumentName_(
  collection,
  documentId
) {
  return (
    getFirestoreDocumentsPath_() +
    "/" +
    encodeURIComponent(collection) +
    "/" +
    encodeURIComponent(documentId)
  );
}


/* =========================================================
 * JS → FIRESTORE
 * ========================================================= */

function jsToFirestoreValue_(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return {
      nullValue: null,
    };
  }

  if (
    value instanceof Date
  ) {
    return {
      timestampValue:
        value.toISOString(),
    };
  }

  if (
    typeof value === "boolean"
  ) {
    return {
      booleanValue:
        value,
    };
  }

  if (
    typeof value === "number"
  ) {
    if (
      Number.isInteger(value)
    ) {
      return {
        integerValue:
          String(value),
      };
    }

    return {
      doubleValue:
        value,
    };
  }

  if (
    typeof value === "string"
  ) {
    return {
      stringValue:
        value,
    };
  }

  if (
    Array.isArray(value)
  ) {
    return {
      arrayValue: {
        values:
          value.map(
            jsToFirestoreValue_
          ),
      },
    };
  }

  if (
    typeof value === "object"
  ) {
    return {
      mapValue: {
        fields:
          objectToFirestoreFields_(
            value
          ),
      },
    };
  }

  return {
    stringValue:
      String(value),
  };
}


function objectToFirestoreFields_(
  object
) {
  const fields = {};

  Object.keys(
    object || {}
  ).forEach(key => {

    if (
      object[key] === undefined
    ) {
      return;
    }

    fields[key] =
      jsToFirestoreValue_(
        object[key]
      );
  });

  return fields;
}


/* =========================================================
 * FIRESTORE → JS
 * ========================================================= */

function firestoreValueToJs_(
  value
) {
  if (!value) {
    return null;
  }

  if (
    value.nullValue !== undefined
  ) {
    return null;
  }

  if (
    value.stringValue !== undefined
  ) {
    return value.stringValue;
  }

  if (
    value.integerValue !== undefined
  ) {
    return Number(
      value.integerValue
    );
  }

  if (
    value.doubleValue !== undefined
  ) {
    return Number(
      value.doubleValue
    );
  }

  if (
    value.booleanValue !== undefined
  ) {
    return Boolean(
      value.booleanValue
    );
  }

  if (
    value.timestampValue !== undefined
  ) {
    return value.timestampValue;
  }

  if (
    value.arrayValue !== undefined
  ) {
    return (
      value.arrayValue.values || []
    ).map(
      firestoreValueToJs_
    );
  }

  if (
    value.mapValue !== undefined
  ) {
    return firestoreFieldsToObject_(
      value.mapValue.fields || {}
    );
  }

  if (
    value.referenceValue !== undefined
  ) {
    return value.referenceValue;
  }

  if (
    value.geoPointValue !== undefined
  ) {
    return value.geoPointValue;
  }

  return null;
}


function firestoreFieldsToObject_(
  fields
) {
  const result = {};

  Object.keys(
    fields || {}
  ).forEach(key => {
    result[key] =
      firestoreValueToJs_(
        fields[key]
      );
  });

  return result;
}


function firestoreDocumentToObject_(
  document
) {
  if (!document) {
    return null;
  }

  const result =
    firestoreFieldsToObject_(
      document.fields || {}
    );

  /*
   * Document ID is returned as `id`
   * if the document itself doesn't
   * already contain an id field.
   */
  if (
    !result.id &&
    document.name
  ) {
    const parts =
      document.name.split("/");

    result.id =
      parts[parts.length - 1];
  }

  return result;
}


/* =========================================================
 * BASE64 URL
 * ========================================================= */

function base64UrlEncode_(
  text
) {
  return Utilities
    .base64EncodeWebSafe(
      Utilities
        .newBlob(text)
        .getBytes()
    )
    .replace(/=+$/, "");
}


function base64UrlEncodeBytes_(
  bytes
) {
  return Utilities
    .base64EncodeWebSafe(
      bytes
    )
    .replace(/=+$/, "");
}


/* =========================================================
 * CONNECTION TEST
 * ========================================================= */

function testFirestoreConnection() {
  const result =
    firestoreSet_(
      "_system",
      "connection_test",
      {
        app: "DrinkHub",

        message:
          "Firestore connection OK",

        timestamp:
          new Date().toISOString(),
      }
    );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/* =========================================================
 * READ TEST
 * ========================================================= */

function testFirestoreRead() {
  const result =
    firestoreGet_(
      "_system",
      "connection_test"
    );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/* =========================================================
 * DELETE TEST
 * ========================================================= */

function testFirestoreDelete() {
  return firestoreDelete_(
    "_system",
    "connection_test"
  );
}