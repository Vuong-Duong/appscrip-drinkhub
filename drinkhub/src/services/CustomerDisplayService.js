/**
 * CustomerDisplayService - Cross-tab communication for Customer Facing Display
 * Uses BroadcastChannel as main transport (0-latency real-time sync)
 * and localStorage as a reliable fallback/persistence layer
 */

const CHANNEL_NAME = "drinkhub_customer_display";
const LOCAL_STORAGE_KEY = "drinkhub_customer_display_state";

class CustomerDisplayService {
  constructor() {
    this.channel = typeof window !== "undefined" && window.BroadcastChannel
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;
  }

  /**
   * Broadcast message to customer screen
   * @param {string} type - Action type (RESET, ORDERING, CHECKOUT, SUCCESS)
   * @param {Object} payload - Associated data
   */
  broadcast(type, payload = {}) {
    const message = { type, payload, timestamp: Date.now() };
    
    // 1. Post to Broadcast Channel
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch (err) {
        console.error("[CustomerDisplayService] Broadcast error:", err);
      }
    }

    // 2. Write to localStorage for cross-browser/tab fallback and history preservation
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(message));
      } catch (err) {
        console.error("[CustomerDisplayService] LocalStorage set error:", err);
      }
    }
  }

  /**
   * Put customer screen to welcome standby state
   */
  sendReset() {
    this.broadcast("RESET");
  }

  /**
   * Broadcast order item changes (staff adding/updating items)
   */
  sendOrdering(data) {
    this.broadcast("ORDERING", data);
  }

  /**
   * Broadcast checkout state with order details and bank settings for QR code
   */
  sendCheckout(data) {
    this.broadcast("CHECKOUT", data);
  }

  /**
   * Broadcast success notification when payment is successfully confirmed
   */
  sendSuccess() {
    this.broadcast("SUCCESS");
  }
}

const customerDisplayService = new CustomerDisplayService();
export default customerDisplayService;
