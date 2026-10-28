/// <reference lib="webworker" />
import { sha256 } from "@noble/hashes/sha2.js";
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const hash = sha256.create();
    const file = event.data;
    for (let offset = 0; offset < file.size; offset += 1048576) {
      hash.update(
        new Uint8Array(
          await file.slice(offset, offset + 1048576).arrayBuffer(),
        ),
      );
    }
    const digest = hash.digest();
    self.postMessage({
      digest: Array.from(digest, (value) =>
        value.toString(16).padStart(2, "0"),
      ).join(""),
    });
  } catch {
    self.postMessage({ error: "Unable to fingerprint this file." });
  }
};
