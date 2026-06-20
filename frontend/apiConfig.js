export const API_BASE_URL =
  import.meta.env?.VITE_API_URL ||
  "https://study-flow-pro.onrender.com";

// Full websocket URL for chat (rendered backend serves it at /ws/chat)
export const WS_BASE_URL =
  import.meta.env?.VITE_WS_URL ||
  "wss://study-flow-pro.onrender.com/ws/chat";

