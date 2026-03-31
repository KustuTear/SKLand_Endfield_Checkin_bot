const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importAesKey(secret) {
  if (!secret || typeof secret !== "string") {
    throw new Error("ENCRYPTION_KEY is missing");
  }

  const secretDigest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", secretDigest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptJson(value, secret) {
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plainBytes = encoder.encode(JSON.stringify(value));

  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBytes);
  const cipherBytes = new Uint8Array(cipherBuffer);

  return JSON.stringify({
    v: 1,
    alg: "AES-GCM",
    iv: bytesToBase64(iv),
    data: bytesToBase64(cipherBytes)
  });
}

export async function decryptJson(encrypted, secret) {
  if (!encrypted || typeof encrypted !== "string") {
    throw new Error("Encrypted payload is empty");
  }

  let payload;
  try {
    payload = JSON.parse(encrypted);
  } catch {
    throw new Error("Encrypted payload format invalid");
  }

  if (!payload?.iv || !payload?.data) {
    throw new Error("Encrypted payload fields missing");
  }

  const key = await importAesKey(secret);
  const iv = base64ToBytes(payload.iv);
  const data = base64ToBytes(payload.data);

  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(decoder.decode(plainBuffer));
}
