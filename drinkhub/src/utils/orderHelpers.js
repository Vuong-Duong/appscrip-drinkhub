/**
 * Order Helpers for Toppings, Notes, Item Pricing, and Item Merging
 */

/**
 * Calculates the unit price of a single item including its toppings.
 * @param {Object} item - Order item object
 * @returns {number} - Unit price including toppings
 */
export const calculateItemUnitPrice = (item) => {
  const basePrice = Number(item.unitPrice !== undefined ? item.unitPrice : (item.price || 0));
  const toppingsPrice = (item.toppings || []).reduce((sum, top) => {
    const p = Number(top.price || 0);
    const q = Number(top.quantity || 1);
    return sum + p * q;
  }, 0);
  return basePrice + toppingsPrice;
};

/**
 * Calculates the total price (subtotal) of an item (unit price including toppings * quantity).
 * @param {Object} item - Order item object
 * @returns {number} - Total subtotal for the item
 */
export const calculateItemSubtotal = (item) => {
  const unitPrice = calculateItemUnitPrice(item);
  const qty = Number(item.quantity || 1);
  return unitPrice * qty;
};

/**
 * Checks if two toppings arrays are identical in IDs and quantities.
 */
export const areToppingsEqual = (toppings1 = [], toppings2 = []) => {
  if (toppings1.length !== toppings2.length) return false;

  const sorted1 = [...toppings1].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const sorted2 = [...toppings2].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  for (let i = 0; i < sorted1.length; i++) {
    if (
      String(sorted1[i].id) !== String(sorted2[i].id) ||
      Number(sorted1[i].quantity || 1) !== Number(sorted2[i].quantity || 1)
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Checks if two notes arrays are identical.
 */
export const areNotesEqual = (notes1 = [], notes2 = []) => {
  if (notes1.length !== notes2.length) return false;
  const sorted1 = [...notes1].sort();
  const sorted2 = [...notes2].sort();
  return sorted1.every((val, index) => val === sorted2[index]);
};

/**
 * Checks if two OrderItems are completely identical across all 7 attributes for item merging:
 * 1. Product (productId / id)
 * 2. Size
 * 3. Sugar
 * 4. Ice
 * 5. Toppings
 * 6. Preset Notes
 * 7. Custom Note
 */
export const areItemsEqual = (item1, item2) => {
  const id1 = String(item1.productId || item1.id || "");
  const id2 = String(item2.productId || item2.id || "");
  if (id1 !== id2) return false;

  const size1 = String(item1.size || "").trim();
  const size2 = String(item2.size || "").trim();
  if (size1 !== size2) return false;

  const sugar1 = String(item1.sugar || "").trim();
  const sugar2 = String(item2.sugar || "").trim();
  if (sugar1 !== sugar2) return false;

  const ice1 = String(item1.ice || "").trim();
  const ice2 = String(item2.ice || "").trim();
  if (ice1 !== ice2) return false;

  const customNote1 = String(item1.customNote || "").trim();
  const customNote2 = String(item2.customNote || "").trim();
  if (customNote1 !== customNote2) return false;

  if (!areNotesEqual(item1.notes || [], item2.notes || [])) return false;
  if (!areToppingsEqual(item1.toppings || [], item2.toppings || [])) return false;

  return true;
};
