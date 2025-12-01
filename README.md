# backend
Backend for crypto style

## Task processor (one-shot helper)
- The task processor reads MultiPlace contracts and logs `getPlaceData` for a predefined list of addresses. Configure TON access with `TONCENTER_ENDPOINT` (or `TON_API_ENDPOINT` / `TON_ENDPOINT`) and `TONCENTER_API_KEY` (or `TON_API_KEY`) if needed.
- The processor runs once on server start; call `taskProcessor.run()` wherever you need if you want additional executions.
