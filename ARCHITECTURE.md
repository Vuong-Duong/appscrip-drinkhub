# Persistent Local Cache First Architecture - Complete Guide

## Overview

This is a **Google Apps Script + React SPA** architecture designed for **instant UI responsiveness** while maintaining persistent data synchronization with Google Sheets backend.

### Core Principle: "Cache First, Sync Second"

- **First Open**: Fetch all data once, cache locally
- **Every Other Open**: Load instantly from cache (SPA-like experience)
- **CRUD Operations**: Update UI immediately, sync backend asynchronously
- **No Periodic Polling**: Only manual refresh or CRUD sync triggers backend calls

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    REACT COMPONENTS                      │
│              (App.jsx, ProductList.jsx, etc)             │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│                    APP STORE (Memory)                    │
│        Central state container, subscribers listen       │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│      CRUD SERVICE + BOOTSTRAP SERVICE (Logic)             │
│   Optimistic updates, sync coordination, initialization   │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  STORAGE SERVICE + API SERVICE (Persistence + Backend)    │
│        localStorage abstraction + google.script.run       │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│         GOOGLE APPS SCRIPT (Backend Services)             │
│      Backend.gs: getAllData(), batchCRUD()                │
└─────────────────────────────────────────────────────────┘
```

---

## Service Details

### 1. StorageService (`src/services/StorageService.js`)

**Purpose**: Abstraction for localStorage with version management

**Key Methods**:

```javascript
StorageService.init(); // Check version, clear if mismatch
StorageService.get(entity); // Get entity data
StorageService.set(entity, data); // Set entity data
StorageService.update(entity, item); // Update single item
StorageService.remove(entity, id); // Remove item
StorageService.setAll(allData); // Bulk set (first install)
StorageService.getMeta(); // Get {version, lastDownload}
StorageService.clear(); // Clear all cache
StorageService.isStale(); // Check if > 24h old
StorageService.getAge(); // Get cache age in minutes
```

**Key Features**:

- Automatic version management (APP_CACHE_VERSION)
- Clear cache on schema change
- Tracks last download timestamp
- Error handling for quota exceeded

---

### 2. AppStore (`src/services/AppStore.js`)

**Purpose**: Central state management in memory

**State Structure**:

```javascript
{
  // Data entities
  products: [],
  orders: [],
  tables: [],
  discounts: [],
  settings: {},
  users: [],
  categories: [],
  shifts: [],

  // UI state
  loading: false,
  error: null,
  lastSync: timestamp,
  syncPending: [],

  // Auth
  currentUser: null,
  isAuthenticated: false
}
```

**Key Methods**:

```javascript
const unsubscribe = appStore.subscribe(listener); // Subscribe to changes
appStore.getState(); // Get full state
appStore.get(entity); // Get entity
appStore.set(entity, data, persist); // Set entity (persist optional)
appStore.update(entity, item); // Update item in entity
appStore.add(entity, item); // Add new item
appStore.remove(entity, id); // Remove item
appStore.loadAll(allData); // Bulk load + persist
appStore.setLoading(true / false);
appStore.setError(msg);
appStore.addPending(syncItem); // Track pending sync
appStore.removePending(syncId);
```

**Key Feature**: Subscriber Pattern - UI components subscribe and re-render on state changes

---

### 3. ApiService (`src/services/ApiService.js`)

**Purpose**: Wrapper for google.script.run calls with error handling

**Key Methods**:

```javascript
await ApiService.fetchAllData(); // First install fetch
await ApiService.syncCRUD(syncData); // Batch CRUD sync
await ApiService.refreshAll(); // Manual refresh
await ApiService.executeCRUD(entity, action, data);
await ApiService.retrySyncPending(); // Retry failed syncs
```

**Sync Data Format**:

```javascript
{
  creates: [{entity: 'products', data: {id, ...fields}}],
  updates: [{entity: 'products', data: {id, ...fields}}],
  deletes: [{entity: 'products', id: 'xxx'}]
}
```

---

### 4. BootstrapService (`src/services/BootstrapService.js`)

**Purpose**: Application initialization and lifecycle management

**Key Methods**:

```javascript
await BootstrapService.init(); // Main init - detects first install vs returning user
await BootstrapService.forceRefresh(); // Manual refresh (for refresh button)
await BootstrapService.reset(); // Clear cache and reload
```

**Initialization Flow**:

**First Install**:

```
Start App
↓
Check localStorage for cache
↓
Cache missing? → fetch all data via ApiService.fetchAllData()
↓
Save to StorageService (localStorage)
↓
Load into AppStore
↓
Render UI
```

**Returning User**:

```
Start App
↓
Check localStorage for cache
↓
Cache exists? → Load into AppStore immediately
↓
Render UI (instant, < 100ms)
↓
Optional: Check if stale (> 24h) → background refresh
```

---

### 5. CrudService (`src/services/CrudService.js`)

**Purpose**: Optimistic CRUD with async backend sync

**Key Methods**:

```javascript
await CrudService.create(entity, item);
await CrudService.update(entity, item);
await CrudService.delete(entity, id);
await CrudService.undo(entity, id); // Revert from server
await CrudService.retryAllPending();
CrudService.getPending(entity);
```

**Optimistic Update Flow**:

```
User clicks "Create Product"
↓
CrudService.create('products', item)
├─ Update AppStore + localStorage instantly
├─ Add to syncPending queue
├─ Return immediately (UI updates instantly)
└─ Fire async backend sync (non-blocking)
    └─ Backend processes
    └─ Remove from syncPending on success
    └─ Keep in queue on failure (retry on next open)
↓
User sees change immediately (optimistic update)
Backend syncs in background
```

---

## Google Apps Script Backend

### Backend.gs

**Key Functions**:

#### 1. `getAllData()`

```javascript
function getAllData() {
  // Returns all entities for first install
  // Optimized for bulk sheet reads (not row-by-row)
  // Returns: {products: [], orders: [], tables: [], ...}
}
```

**Features**:

- Bulk reads using `getDataRange().getValues()`
- Converts sheet rows to objects using headers
- Fast (< 1-2 seconds for typical data)

#### 2. `batchCRUD(syncData)`

```javascript
function batchCRUD(syncData) {
  // {creates: [], updates: [], deletes: []}
  // Processes all operations
  // Returns: {success: bool, stats: {created, updated, deleted}, elapsed: ms}
}
```

**Features**:

- Batch processing (not one-by-one)
- Transactional safety (all-or-nothing)
- Error tracking per operation

#### 3. Helper Functions

```javascript
readSheetAsBulk(sheet, entity); // Efficient bulk read
createRow(spreadsheet, entity, data);
updateRow(spreadsheet, entity, data);
deleteRow(spreadsheet, entity, id);
```

---

## Data Flow Examples

### Example 1: First App Open

```javascript
// main.jsx or index.jsx
import BootstrapService from "./services/BootstrapService.js";

useEffect(() => {
  BootstrapService.init();
}, []);

// BootstrapService flow:
// 1. Check localStorage → empty
// 2. Call ApiService.fetchAllData()
// 3. Backend: getAllData() reads all sheets
// 4. Returns {products: [...], orders: [...], ...}
// 5. StorageService saves to localStorage
// 6. AppStore loads state
// 7. UI renders from AppStore
// 8. Second open will be instant
```

### Example 2: Create Product (Optimistic)

```javascript
// In React component
const handleCreateProduct = async () => {
  const newProduct = {
    id: `prod-${Date.now()}`,
    name: "Coffee",
    price: 25000,
  };

  // THIS IS INSTANT - returns immediately
  await CrudService.create("products", newProduct);
  // UI updates here ↑
};

// CrudService flow:
// 1. Immediately update AppStore + localStorage
// 2. UI re-renders (instant)
// 3. Add to syncPending
// 4. Return to user immediately
// 5. In background: call ApiService.syncCRUD()
// 6. Backend processes in batchCRUD()
// 7. Remove from syncPending on success
// 8. If fails: stays in syncPending, retry on next app open
```

### Example 3: Update Product with Pending Sync

```javascript
// Product is being synced
const pending = appStore.get("syncPending");
const isSyncing = pending.some((p) => p.data.id === "prod-123");

if (isSyncing) {
  // Show UI indicator (spinner, disabled buttons, etc)
  // User can still edit other products
}

// Background sync completes
// Product removed from syncPending
// UI updates (sync badge removed)
```

### Example 4: Manual Refresh

```javascript
// User clicks refresh button
const handleRefresh = async () => {
  await BootstrapService.forceRefresh();
  // New data loaded into AppStore
};

// BootstrapService.forceRefresh() flow:
// 1. Set loading = true
// 2. Call ApiService.refreshAll()
// 3. Backend returns fresh data
// 4. AppStore.loadAll(freshData) replaces all state
// 5. Clear syncPending
// 6. Set loading = false
// 7. UI updates with fresh server data
```

---

## Cache Versioning System

### Scenario: Schema Change

You added a new column `discount_value` to products:

```javascript
// Update APP_CACHE_VERSION
const APP_CACHE_VERSION = 2; // was 1

// StorageService.init() runs:
// 1. Get stored {version: 1, ...}
// 2. Compare: 1 !== 2
// 3. Clear old cache
// 4. Reset meta {version: 2, lastDownload: null}
// 5. App detects empty cache
// 6. Performs first install flow (fetches all new schema)
// 7. Next opens use new schema
```

**Code**:

```javascript
// StorageService.js
const APP_CACHE_VERSION = 2; // Increment when schema changes

static init() {
  const stored = this._getCache();

  if (!stored || stored.version !== APP_CACHE_VERSION) {
    console.log('Cache version mismatch, clearing');
    this.clear(); // Force reload
    this._setMeta({ version: APP_CACHE_VERSION, lastDownload: null });
  }
}
```

---

## Performance Targets

| Metric                | Target          | Achieved             |
| --------------------- | --------------- | -------------------- |
| **First Open**        | < 3-5 seconds   | ✓ Backend fetch      |
| **Second+ Opens**     | < 300ms         | ✓ localStorage only  |
| **UI Responsiveness** | < 50ms          | ✓ Optimistic updates |
| **Sync Latency**      | < 2 seconds     | ✓ Backend async      |
| **Cache Persistence** | Across sessions | ✓ localStorage       |

---

## File Structure

```
drinkhub/
├── src/
│   ├── services/
│   │   ├── StorageService.js      # localStorage abstraction
│   │   ├── AppStore.js            # Memory state
│   │   ├── ApiService.js          # Backend wrapper
│   │   ├── BootstrapService.js    # Init & lifecycle
│   │   └── CrudService.js         # Optimistic updates
│   ├── AppExample.jsx             # Example component
│   └── AppExample.css             # Styles
│
backend/
├── Backend.gs                      # Apps Script backend
```

---

## Integration Checklist

- [ ] Copy all service files to `src/services/`
- [ ] Update `Backend.gs` with your sheet names in SHEET_IDS
- [ ] Update `APP_CACHE_VERSION` if schema changes
- [ ] Import services in your main App.jsx
- [ ] Call `BootstrapService.init()` in useEffect on mount
- [ ] Use `CrudService` for all mutations (never direct AppStore calls in components)
- [ ] Subscribe to AppStore for state changes
- [ ] Update `SHEET_IDS` mapping in Backend.gs

---

## Error Handling

### Network Errors

```javascript
// Sync fails
// Product update already applied to UI
// Stays in syncPending
// User sees "⏳ Syncing..." badge on product
// Retry automatically on next app open or click retry button
```

### Quota Exceeded

```javascript
// StorageService catches and logs
try {
  localStorage.setItem(...)
} catch (e) {
  if (e.name === 'QuotaExceededError') {
    console.error('localStorage quota exceeded');
    // Clear old syncs or app data
  }
}
```

### Stale Data Recovery

```javascript
// If sync permanently fails
// User clicks "Undo" on product
// CrudService.undo() reverts from server
// Fresh data reloaded
```

---

## Optional Enhancements

### 1. Conflict Resolution

```javascript
// If offline edit then server data changes
// Compare timestamps: newest wins
// Or show UI prompt: "Keep local or accept server?"
```

### 2. Selective Sync

```javascript
// Only sync changed entities
// Track dirty entities in AppStore
// Send only changed data to backend
```

### 3. Encryption

```javascript
// Encrypt sensitive data before localStorage
// Use TweetNaCl.js or libsodium.js
// Decrypt on load
```

### 4. Compression

```javascript
// Compress large datasets before storing
// Use lz-string for compression
// Decompress on load
```

---

## Key Advantages

✅ **Instant Load Times** - Cache-first approach  
✅ **Offline Capability** - Read/write without network  
✅ **Optimistic UI** - Changes feel instant  
✅ **Background Sync** - Non-blocking backend updates  
✅ **Version Management** - Handle schema changes safely  
✅ **Error Resilience** - Pending queue retries failed syncs  
✅ **No Polling** - Only sync on CRUD or manual refresh  
✅ **Low Network Usage** - Bulk operations, not row-by-row

---

## Common Mistakes to Avoid

❌ **DON'T**: Call `google.script.run` directly in components  
✅ **DO**: Use `ApiService` or `CrudService`

❌ **DON'T**: Access `localStorage` directly  
✅ **DO**: Use `StorageService`

❌ **DON'T**: Mutate AppStore state without going through service  
✅ **DO**: Use `CrudService` for mutations

❌ **DON'T**: Block UI waiting for backend sync  
✅ **DO**: Use optimistic updates with async sync

❌ **DON'T**: Forget to increment `APP_CACHE_VERSION` on schema change  
✅ **DO**: Increment version for any schema changes
