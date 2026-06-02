# Quick Start Guide - Persistent Cache First Integration

## Step 1: Copy Service Files

Copy these files to your project:

```
src/services/
├── StorageService.js
├── AppStore.js
├── ApiService.js
├── BootstrapService.js
└── CrudService.js
```

## Step 2: Update Backend.gs

Replace with your Google Sheet configuration:

```javascript
// Backend.gs - Line 6-13
const SHEET_IDS = {
  products: "Your_Products_Sheet_Name",
  orders: "Your_Orders_Sheet_Name",
  tables: "Your_Tables_Sheet_Name",
  discounts: "Your_Discounts_Sheet_Name",
  settings: "Your_Settings_Sheet_Name",
  users: "Your_Users_Sheet_Name",
  categories: "Your_Categories_Sheet_Name",
  shifts: "Your_Shifts_Sheet_Name",
};
```

**Important**: Your sheets MUST have `id` as the first column:

```
| id        | name      | price | category |
|-----------|-----------|-------|----------|
| prod-001  | Coffee    | 25000 | Drinks   |
| prod-002  | Tea       | 20000 | Drinks   |
```

## Step 3: Initialize in App.jsx

```javascript
import { useEffect, useState } from "react";
import BootstrapService from "./services/BootstrapService.js";
import AppStore from "./services/AppStore.js";

function App() {
  const [state, setState] = useState(AppStore.getState());

  // Subscribe to state changes
  useEffect(() => {
    return AppStore.subscribe(setState);
  }, []);

  // Initialize on mount
  useEffect(() => {
    BootstrapService.init();
  }, []);

  // Use state normally
  return (
    <div>
      <h1>Products: {state.products.length}</h1>
    </div>
  );
}
```

## Step 4: Create Items

```javascript
import CrudService from "./services/CrudService.js";

async function handleCreateProduct() {
  const newProduct = {
    id: `prod-${Date.now()}`,
    name: "New Coffee",
    price: 30000,
    category: "Drinks",
  };

  // This is INSTANT - UI updates immediately
  await CrudService.create("products", newProduct);
  // Syncs to backend in background
}
```

## Step 5: Update Items

```javascript
async function handleUpdateProduct(productId, updatedData) {
  const updated = {
    ...updatedData,
    id: productId, // Must include id
  };

  // Instant UI update
  await CrudService.update("products", updated);
}
```

## Step 6: Delete Items

```javascript
async function handleDeleteProduct(productId) {
  // Instant UI update
  await CrudService.delete("products", productId);
}
```

## Step 7: Manual Refresh

```javascript
import BootstrapService from "./services/BootstrapService.js";

async function handleRefresh() {
  await BootstrapService.forceRefresh();
}
```

## Testing

### Test First Install

1. Open DevTools → Application → localStorage
2. Clear all storage
3. Refresh page
4. Wait for data to load (first install)
5. Check localStorage has cache

### Test Returning User

1. Refresh page
2. Data loads instantly (< 300ms)
3. No "Loading..." spinner

### Test Optimistic Update

1. Create a product
2. UI updates immediately
3. Check DevTools → Network → see google.script.run call in background
4. Verify sync succeeds

### Test Offline

1. Create a product
2. Disconnect network
3. Product still shows in UI
4. Check syncPending in AppStore
5. Reconnect network
6. Sync retries on next action or app refresh

## Troubleshooting

### Data not caching?

- Check `localStorage` in DevTools
- Ensure `StorageService.init()` is called before other services
- Check browser console for errors

### Always fetching on every open?

- Check `APP_CACHE_VERSION` in StorageService
- Ensure `lastDownload` is being set
- Check cache age: `StorageService.getAge()`

### Sync not working?

- Check `syncPending` in AppStore state
- Look for errors in console
- Verify Backend.gs is deployed
- Test with `debug_testSync()` in Backend.gs

### Products sheet not found?

- Check sheet name in `SHEET_IDS` matches exactly (case-sensitive)
- Verify first column is named `id`
- Run `debug_logData()` to see what Backend.gs reads

## Performance Tips

1. **First Open**
   - Should be 2-5 seconds
   - If slower: optimize sheet reads in Backend.gs
   - Consider filtering out old data (archive pattern)

2. **Second+ Opens**
   - Should be < 300ms
   - If slower: check localStorage size
   - Consider pagination for large datasets

3. **CRUD Operations**
   - Should be instant (< 50ms)
   - If UI delays: check AppStore subscribers
   - Verify components are using proper re-render patterns

4. **Sync Operations**
   - Should be < 2 seconds
   - If slower: optimize batchCRUD() in Backend.gs
   - Consider bulk insert/update limits

## Monitoring

Add to your app for visibility:

```javascript
const meta = StorageService.getMeta();
const pending = appStore.get("syncPending") || [];
const cacheAge = StorageService.getAge();

console.log("Cache age:", cacheAge, "minutes");
console.log("Pending syncs:", pending.length);
console.log("Cache version:", meta.version);
```

## Schema Changes

When you add/remove columns:

1. Update your Google Sheet
2. Increment `APP_CACHE_VERSION` in StorageService.js:
   ```javascript
   const APP_CACHE_VERSION = 2; // was 1
   ```
3. Deploy changes
4. Users' old cache auto-clears on next app open
5. Full data reload happens automatically

## Advanced: Custom Hooks

```javascript
// useProducts.js
import { useEffect, useState } from "react";
import AppStore from "./services/AppStore.js";

export function useProducts() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    // Subscribe to products changes
    return AppStore.subscribe((state) => {
      setProducts(state.products);
    });
  }, []);

  return products;
}

// Usage
function ProductList() {
  const products = useProducts();
  return <div>{products.length} products</div>;
}
```

## Next Steps

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for deep dive
2. Check [AppExample.jsx](./drinkhub/src/AppExample.jsx) for full example
3. Implement with your own data models
4. Test offline behavior
5. Monitor performance metrics
