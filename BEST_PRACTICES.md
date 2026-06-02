# Best Practices & Integration Patterns

## Architecture Principles

### 1. Never Call google.script.run Directly

❌ **WRONG** - Direct backend call

```javascript
function handleSave() {
  google.script.run.saveData(data); // ❌ Blocks UI, slow
}
```

✅ **RIGHT** - Use service abstraction

```javascript
async function handleSave() {
  await CrudService.update("products", data); // ✅ UI updates instantly
}
```

### 2. Never Access localStorage Directly

❌ **WRONG**

```javascript
const products = JSON.parse(localStorage.getItem("products"));
```

✅ **RIGHT**

```javascript
const products = StorageService.get("products");
// Or better: read from AppStore (already loaded)
const { products } = appStore.getState();
```

### 3. Never Mutate AppStore Directly from Components

❌ **WRONG**

```javascript
// In component
appStore.state.products.push(newProduct);
appStore._notify(); // ❌ Don't mutate directly
```

✅ **RIGHT**

```javascript
// In component
await CrudService.create("products", newProduct);
// CrudService handles AppStore update + localStorage sync
```

### 4. Always Subscribe to AppStore, Not Components

❌ **WRONG**

```javascript
// In component - fetch on every render
useEffect(() => {
  const products = StorageService.get("products");
  setProducts(products);
}, []);
```

✅ **RIGHT**

```javascript
// In component - subscribe to changes
useEffect(() => {
  return AppStore.subscribe((state) => {
    setProducts(state.products);
  });
}, []);
```

---

## Common Integration Patterns

### Pattern 1: Custom Hook for Entity

```javascript
// hooks/useProducts.js
import { useEffect, useState } from "react";
import AppStore from "../services/AppStore.js";

export function useProducts() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    // Initial load
    setProducts(AppStore.get("products") || []);

    // Subscribe to changes
    const unsubscribe = AppStore.subscribe((state) => {
      setProducts(state.products || []);
    });

    return unsubscribe;
  }, []);

  return products;
}

// In component
function ProductList() {
  const products = useProducts();
  return <div>{products.length} products</div>;
}
```

### Pattern 2: Custom Hook for Pending Syncs

```javascript
// hooks/usePendingSyncs.js
export function usePendingSyncs(entity) {
  const [pending, setPending] = useState([]);

  useEffect(() => {
    return AppStore.subscribe((state) => {
      const filtered = (state.syncPending || []).filter(
        (p) => p.entity === entity,
      );
      setPending(filtered);
    });
  }, [entity]);

  return pending;
}

// Usage
function ProductCard({ product }) {
  const pending = usePendingSyncs("products");
  const isSyncing = pending.some((p) => p.data.id === product.id);

  return (
    <div>
      {product.name}
      {isSyncing && <span>⏳ Syncing...</span>}
    </div>
  );
}
```

### Pattern 3: Reusable CRUD Buttons

```javascript
// components/CrudButton.jsx
function CrudButton({ entity, action, item, onSuccess, onError, children }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);

      if (action === "create") {
        await CrudService.create(entity, item);
      } else if (action === "update") {
        await CrudService.update(entity, item);
      } else if (action === "delete") {
        await CrudService.delete(entity, item.id);
      }

      onSuccess?.();
    } catch (error) {
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? "⏳" : children}
    </button>
  );
}

// Usage
<CrudButton
  entity="products"
  action="create"
  item={newProduct}
  onSuccess={() => alert("Created!")}
  onError={(e) => alert("Error: " + e.message)}
>
  Create
</CrudButton>;
```

### Pattern 4: Search with Caching

```javascript
// hooks/useSearch.js
export function useSearch(entity, searchFn) {
  const [results, setResults] = useState([]);
  const data = useEntity(entity); // Your custom hook

  useEffect(() => {
    const filtered = data.filter(searchFn);
    setResults(filtered);
  }, [data, searchFn]);

  return results;
}

// Usage
function ProductSearch() {
  const [query, setQuery] = useState("");

  const results = useSearch("products", (product) =>
    product.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products..."
      />
      <div>Found {results.length} products</div>
    </>
  );
}
```

### Pattern 5: Batch Operations

```javascript
// services/BatchService.js
export class BatchService {
  static async createMultiple(entity, items) {
    const results = [];
    for (const item of items) {
      try {
        const result = await CrudService.create(entity, item);
        results.push({ item, success: true, result });
      } catch (error) {
        results.push({ item, success: false, error });
      }
    }
    return results;
  }

  static async deleteMultiple(entity, ids) {
    const results = [];
    for (const id of ids) {
      try {
        await CrudService.delete(entity, id);
        results.push({ id, success: true });
      } catch (error) {
        results.push({ id, success: false, error });
      }
    }
    return results;
  }
}

// Usage
const results = await BatchService.deleteMultiple("products", [id1, id2, id3]);
const failed = results.filter((r) => !r.success);
if (failed.length > 0) {
  alert(`Failed to delete ${failed.length} products`);
}
```

---

## Performance Optimization

### 1. Memoize Derived Data

```javascript
// Bad: Recalculated every render
function StatsPanel() {
  const products = useProducts();
  const total = products.reduce((sum, p) => sum + p.price, 0);
  return <div>{total}</div>;
}

// Good: Memoized
import { useMemo } from "react";

function StatsPanel() {
  const products = useProducts();
  const total = useMemo(
    () => products.reduce((sum, p) => sum + p.price, 0),
    [products],
  );
  return <div>{total}</div>;
}
```

### 2. Virtualize Long Lists

```javascript
// For 1000+ items use react-window
import { FixedSizeList } from "react-window";

function ProductList() {
  const products = useProducts();

  const Row = ({ index, style }) => (
    <div style={style}>{products[index].name}</div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={products.length}
      itemSize={35}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

### 3. Debounce Search

```javascript
import { useEffect, useState } from "react";

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// Usage
function SearchProducts() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const results = useSearch("products", (p) => p.name.includes(debouncedQuery));

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <div>{results.length} found</div>
    </>
  );
}
```

---

## Error Handling

### Pattern: Error Boundary

```javascript
// components/ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>❌ Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>Reload App</button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Pattern: Safe CRUD with Feedback

```javascript
async function handleUpdate(product) {
  try {
    setLoading(true);
    await CrudService.update("products", product);
    setSuccess("Product updated!");
    setTimeout(() => setSuccess(null), 3000);
  } catch (error) {
    setError(error.message);
    // Don't auto-dismiss error - user should see it
  } finally {
    setLoading(false);
  }
}
```

---

## Testing

### Unit Test: StorageService

```javascript
// __tests__/StorageService.test.js
import StorageService from "../services/StorageService.js";

describe("StorageService", () => {
  beforeEach(() => {
    localStorage.clear();
    StorageService.init();
  });

  test("should set and get data", () => {
    const data = [{ id: 1, name: "Test" }];
    StorageService.set("products", data);

    expect(StorageService.get("products")).toEqual(data);
  });

  test("should update single item", () => {
    StorageService.set("products", [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);

    StorageService.update("products", { id: 1, name: "Updated" });

    const products = StorageService.get("products");
    expect(products[0].name).toBe("Updated");
  });

  test("should clear version mismatch", () => {
    StorageService.setAll({ products: [{ id: 1 }] });

    APP_CACHE_VERSION = 999; // Simulate version change
    StorageService.init();

    expect(StorageService.get("products")).toBeNull();
  });
});
```

### Component Test: With AppStore

```javascript
// __tests__/ProductCard.test.js
import { render, screen } from "@testing-library/react";
import AppStore from "../services/AppStore.js";
import ProductCard from "../components/ProductCard.jsx";

test("should render product and show syncing status", () => {
  const product = { id: "prod-1", name: "Coffee", price: 25000 };

  // Set up AppStore
  AppStore.set("products", [product], false);
  AppStore.addPending({
    entity: "products",
    action: "update",
    data: product,
  });

  render(<ProductCard product={product} />);

  expect(screen.getByText("Coffee")).toBeInTheDocument();
  expect(screen.getByText("⏳ Syncing...")).toBeInTheDocument();
});
```

---

## Migration Guide

### From Direct google.script.run to Persistent Cache

#### Before

```javascript
useEffect(() => {
  google.script.run
    .withSuccessHandler((products) => setProducts(products))
    .getProducts();
}, []); // Fetch every time component mounts!
```

#### After

```javascript
const products = useProducts(); // Custom hook using AppStore
// Automatic, subscribed, instant updates
```

#### Refactor Checklist

- [ ] Replace all `google.script.run` calls with service calls
- [ ] Create custom hooks for each entity
- [ ] Move initialization to `BootstrapService.init()`
- [ ] Update all CRUD to use `CrudService`
- [ ] Test cache persistence across page refresh
- [ ] Monitor performance (should be < 300ms second open)
- [ ] Test offline behavior (disconnect network after load)

---

## Debugging Tips

### Enable Debug Logging

```javascript
// In components during development
AppStore.debug(); // Logs entire state

StorageService.debug?.(); // Check storage contents

const pending = AppStore.get("syncPending");
console.log("Pending syncs:", pending);
```

### Monitor Cache

```javascript
// In browser console
const meta = StorageService.getMeta();
console.log("Cache age:", StorageService.getAge(), "minutes");
console.log("Cache version:", meta.version);
console.log("Last download:", new Date(meta.lastDownload));
```

### Check Network

```javascript
// DevTools → Network → filter by "google.script.run"
// Should see:
// - First open: 1 call (getAllData)
// - CRUD: 1 call per operation (syncCRUD)
// - Second open: 0 calls
```

---

## Troubleshooting Checklist

| Problem                | Check                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Data not loading       | ✓ BootstrapService.init() called? ✓ Backend.gs deployed? ✓ Sheet names correct?         |
| Always fetching        | ✓ StorageService.getMeta() returns data? ✓ Cache version correct?                       |
| Syncs failing silently | ✓ Check console errors ✓ Backend.gs has proper error handling ✓ Check syncPending queue |
| UI not updating        | ✓ Using CrudService? ✓ Subscribed to AppStore? ✓ Check listeners                        |
| Stale data             | ✓ Manual refresh? ✓ Check StorageService.isStale()? ✓ Increment cache version?          |
| localStorage quota     | ✓ Clear old cache? ✓ Reduce data size? ✓ Archive old records?                           |
