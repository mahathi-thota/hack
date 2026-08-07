---
name: Offline citizen assistant
description: Durable product constraints for the PSI-2 offline form assistant.
---

The product is intentionally frontend-local for the first MVP: the uploaded PSI-2 corpus is served as a local static asset, parsed in the browser, and answered through a deterministic retrieval/reasoning boundary.

**Why:** The central judging requirement is visible no-network inference, so keeping the initial path local makes the claim demonstrable rather than implied by an unused backend.

**How to apply:** Future llama.cpp/GGUF and OCR work should replace adapters behind the existing local service shape, preserving source attribution, extraction/reasoning labels, and the real-versus-simulated limits surface.